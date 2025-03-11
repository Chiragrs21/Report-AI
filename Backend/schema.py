from flask import Flask, request, jsonify
import os
import mysql.connector
from mysql.connector import Error
import sqlite3
import uuid
import google.generativeai as genai
from langchain.agents import create_sql_agent
from langchain.agents.agent_types import AgentType
from langchain.sql_database import SQLDatabase
from langchain_google_genai import ChatGoogleGenerativeAI
from google.api_core import exceptions
from langchain.agents.agent_toolkits import SQLDatabaseToolkit
from dotenv import load_dotenv
import sqlalchemy
from sqlalchemy import create_engine
import traceback
from flask_cors import CORS
import json
import re
import logging
import time
from urllib.parse import quote

# Setup logging
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

# Load environment variables
load_dotenv()

app = Flask(__name__)
CORS(app)

# Configure Gemini API
gemini_api_key = os.getenv("GEMINI_API_KEY")
if not gemini_api_key:
    logger.error("GEMINI_API_KEY not set in environment")
    raise Exception("GEMINI_API_KEY not set in environment")
genai.configure(api_key=gemini_api_key, transport='grpc')

# Store active connections
active_connections = {}

# Connection timeout (in seconds)
CONNECTION_TIMEOUT = 3600  # 1 hour
MAX_HISTORY_LENGTH = 10  # Limit history to last 10 interactions

# Supported visualization types
VISUALIZATION_TYPES = {
    "as a pie chart": "pie",
    "as a line graph": "line",
    "as a bar chart": "bar",
    "as a area chart": "area"
}


def cleanup_stale_connections():
    """Remove connections inactive for too long"""
    current_time = time.time()
    for conn_id in list(active_connections.keys()):
        conn_data = active_connections[conn_id]
        last_used = conn_data.get('last_used', current_time)
        if current_time - last_used > CONNECTION_TIMEOUT:
            logger.info(f"Cleaning up stale connection: {conn_id}")
            disconnect_database({'connection_id': conn_id})


def detect_visualization_type(question: str) -> tuple[str, str]:
    """Detect visualization type and return type and cleaned question"""
    question_lower = question.lower()
    for viz_phrase, viz_type in VISUALIZATION_TYPES.items():
        if viz_phrase in question_lower:
            cleaned_question = re.sub(
                rf"\b{viz_phrase}\b", "", question_lower, flags=re.IGNORECASE).strip()
            return viz_type, cleaned_question
    return None, question  # No visualization detected


def format_for_visualization(sql_query: str, result: list, viz_type: str) -> dict:
    """Format query results for frontend visualization (Chart.js compatible)"""
    if not result or not viz_type:
        logger.debug("No result or viz_type, returning raw data")
        return {"data": result}

    logger.debug(f"Formatting result for {viz_type}: {result}")
    labels = [row.get("label") or row.get("category")
              or list(row.keys())[0] for row in result]
    values = [row.get("value") or list(row.values())[1] for row in result]

    if viz_type == "pie":
        return {
            "type": "pie",
            "data": {
                "labels": labels,
                "datasets": [{"data": values, "backgroundColor": ["#FF6384", "#36A2EB", "#FFCE56", "#4BC0C0"]}]
            }
        }
    elif viz_type == "line":
        return {
            "type": "line",
            "data": {
                "labels": labels,
                "datasets": [{"label": "Data", "data": values, "borderColor": "#36A2EB", "fill": False}]
            }
        }
    elif viz_type == "bar":
        return {
            "type": "bar",
            "data": {
                "labels": labels,
                "datasets": [{"label": "Count", "data": values, "backgroundColor": "#FF6384"}]
            }
        }
    elif viz_type == "area":
        return {
            "type": "area",
            "data": {
                "labels": labels,
                "datasets": [{"label": "Trend", "data": values, "backgroundColor": "#36A2EB", "fill": True}]
            }
        }
    return {"data": result}  # Fallback


@app.route('/connect', methods=['POST'])
def connect_to_database():
    # ... (unchanged from previous version)
    try:
        data = request.json
        if not isinstance(data, dict):
            return jsonify({'success': False, 'error': 'Invalid request format'}), 400

        db_type = data.get('type', 'mysql')
        connection_id = str(uuid.uuid4())
        db_info = {'type': db_type}

        if db_type == 'mysql':
            host = data.get('host', 'localhost')
            user = data.get('user', 'root')
            password = data.get('password', '')
            database = data.get('database', '')

            if not re.match(r'^[a-zA-Z0-9.-]+$', host):
                return jsonify({'success': False, 'error': 'Invalid host format'}), 400

            logger.debug(f"Connecting to MySQL at {host}")
            connection = mysql.connector.connect(
                host=host,
                user=user,
                password=password,
                database=database
            )
            encoded_password = quote(password)
            connection_string = f"mysql+mysqlconnector://{user}:{encoded_password}@{host}/{database}"
            engine = create_engine(connection_string)
            db_info.update({'database': database, 'host': host})

        elif db_type == 'sqlite':
            path = data.get('path', '')
            if not path:
                return jsonify({'success': False, 'error': 'SQLite path required'}), 400
            connection = sqlite3.connect(path, check_same_thread=False)
            connection_string = f"sqlite:///{path}"
            engine = create_engine(connection_string)
            db_info['path'] = path

        else:
            return jsonify({'success': False, 'error': f'Unsupported database type: {db_type}'}), 400

        sql_db = SQLDatabase(engine)
        schema_cache = sql_db.get_table_info()
        logger.debug("Database schema cached successfully")

        llm = ChatGoogleGenerativeAI(
            model="gemini-1.5-pro",
            temperature=0.1,
            google_api_key=gemini_api_key
        )
        logger.debug("Initialized Gemini model")

        toolkit = SQLDatabaseToolkit(db=sql_db, llm=llm)
        sql_agent = create_sql_agent(
            llm=llm,
            toolkit=toolkit,
            verbose=True,
            agent_type=AgentType.ZERO_SHOT_REACT_DESCRIPTION,
        )

        active_connections[connection_id] = {
            'connection': connection,
            'engine': engine,
            'sql_db': sql_db,
            'agent': sql_agent,
            'llm': llm,
            'type': db_type,
            'info': db_info,
            'schema_cache': schema_cache,
            'history': [],
            'last_used': time.time()
        }

        return jsonify({
            'success': True,
            'connection_id': connection_id,
            'database_info': db_info
        }), 200

    except mysql.connector.Error as e:
        logger.error(f"MySQL Error: {str(e)}")
        return jsonify({'success': False, 'error': f"MySQL Error: {str(e)}"}), 500
    except Exception as e:
        logger.error(f"Connection error: {str(e)}", exc_info=True)
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/disconnect', methods=['POST'])
def disconnect_database():
    # ... (unchanged from previous version)
    try:
        data = request.json
        connection_id = data.get('connection_id')
        if not connection_id or connection_id not in active_connections:
            return jsonify({'success': False, 'error': 'Invalid connection ID'}), 400

        connection_data = active_connections[connection_id]
        if connection_data['type'] == 'mysql' and connection_data['connection'].is_connected():
            connection_data['connection'].close()
        else:
            connection_data['connection'].close()
        connection_data['engine'].dispose()
        del active_connections[connection_id]
        logger.info(f"Disconnected: {connection_id}")
        return jsonify({'success': True}), 200

    except Exception as e:
        logger.error(f"Disconnect error: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/process', methods=['POST'])
def process_question():
    try:
        cleanup_stale_connections()

        data = request.json
        question = data.get('question')
        connection_id = data.get('connection_id')

        if not question:
            return jsonify({'success': False, 'error': 'Question is required'}), 400
        if not connection_id or connection_id not in active_connections:
            return jsonify({'success': False, 'error': 'Invalid connection ID'}), 400

        connection_data = active_connections[connection_id]
        llm = connection_data['llm']
        schema_cache = connection_data['schema_cache']
        history = connection_data['history']

        # Detect visualization based on "as a [chart type]" phrase
        viz_type, question_to_process = detect_visualization_type(question)
        if not viz_type and " as a " in question.lower():  # Default to line if "as a" is present but no match
            viz_type = "line"
            question_to_process = question.lower().split(" as a ")[0].strip()
        logger.debug(
            f"Detected: viz_type={viz_type}, question={question_to_process}")

        # Build history context
        history_context = "\n\nPrevious conversation:\n" + "\n".join(
            [f"Q: {entry['question']}\nSQL: {entry['sql']}" for entry in history]
        ) if history else ""

        # Prompt with visualization instruction
        prompt = (
            f"Given the following database schema:\n{schema_cache}\n"
            f"{history_context}\n"
            f"Generate a SQL query for this question: {question_to_process}\n"
            f"{'For a ' + viz_type + ' visualization, return exactly two columns: label (e.g., category, date) and value (e.g., count, sum). Use these exact aliases.' if viz_type else ''}\n"
            "Return only the SQL query inside ```sql``` tags.\n"
            "Important: For MySQL compatibility, do NOT use LIMIT inside IN, ALL, ANY, or SOME subqueries. "
            "For 'top N' or 'most' requests (e.g., user with most reviews), use ORDER BY with LIMIT at the outer query level."
        )
        logger.debug(f"Prompt: {prompt}")

        max_retries = 3
        for attempt in range(max_retries):
            try:
                agent_response = llm.invoke(prompt)
                logger.debug(f"LLM response: {agent_response.content}")
                break
            except exceptions.ResourceExhausted as e:
                if attempt == max_retries - 1:
                    logger.error(f"Gemini quota exhausted: {str(e)}")
                    return jsonify({'success': False, 'error': 'Gemini API quota exhausted'}), 429
                logger.info(f"Retrying in {2 ** attempt} seconds...")
                time.sleep(2 ** attempt)

        connection_data['last_used'] = time.time()

        sql_query = extract_sql_query(agent_response)
        if not sql_query:
            logger.error("No SQL query generated")
            return jsonify({'success': False, 'error': 'Failed to generate SQL query', 'agent_response': str(agent_response)}), 500

        result = execute_query(connection_data, sql_query)
        logger.debug(f"Raw result: {result}")

        # Format result for visualization if detected
        formatted_result = format_for_visualization(
            sql_query, result, viz_type) if viz_type else result
        logger.debug(f"Formatted result: {formatted_result}")

        # Update history
        history.append({'question': question, 'sql': sql_query})
        if len(history) > MAX_HISTORY_LENGTH:
            history.pop(0)
        connection_data['history'] = history

        return jsonify({
            'success': True,
            'question': question,
            'sql': sql_query,
            'result': formatted_result,
            'visualization': viz_type,
            'reasoning': f"Generated and executed SQL query {'for ' + viz_type + ' visualization' if viz_type else ''}"
        }), 200

    except Exception as e:
        logger.error(f"Process error: {str(e)}", exc_info=True)
        return jsonify({'success': False, 'error': str(e), 'traceback': traceback.format_exc()}), 500


def extract_sql_query(agent_response):
    """Extract SQL query from AIMessage response"""
    output = agent_response.content
    sql_pattern = r"```sql\s*([\s\S]*?)\s*```"
    match = re.search(sql_pattern, output, re.IGNORECASE)
    return match.group(1).strip() if match else None


def execute_query(connection_data, sql_query):
    """Execute SQL query based on database type"""
    connection = connection_data['connection']
    db_type = connection_data['type']
    try:
        logger.debug(f"Executing query: {sql_query}")
        if db_type == 'mysql':
            with connection.cursor(dictionary=True) as cursor:
                cursor.execute(sql_query)
                if sql_query.strip().upper().startswith(("SELECT", "SHOW", "DESCRIBE", "DESC")):
                    return json.loads(json.dumps(cursor.fetchall(), default=str))
                connection.commit()
                return {"affected_rows": cursor.rowcount}
        else:  # SQLite
            with connection:
                cursor = connection.cursor()
                cursor.execute(sql_query)
                if sql_query.strip().upper().startswith(("SELECT", "PRAGMA")):
                    column_names = [_DESC[0] for _DESC in cursor.description]
                    rows = cursor.fetchall()
                    return json.loads(json.dumps([dict(zip(column_names, row)) for row in rows], default=str))
                connection.commit()
                return {"affected_rows": cursor.rowcount}
    except Exception as e:
        logger.error(f"Query execution failed: {str(e)}")
        raise Exception(f"Query execution error: {str(e)}")


if __name__ == '__main__':
    app.run(debug=False, host='0.0.0.0', port=5000)
