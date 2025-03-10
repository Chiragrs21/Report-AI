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
    exit(1)
genai.configure(api_key=gemini_api_key, transport='grpc')

# Store active connections with schema cache and LLM
active_connections = {}

# Connection timeout (in seconds)
CONNECTION_TIMEOUT = 3600  # 1 hour


def cleanup_stale_connections():
    """Remove connections inactive for too long"""
    current_time = time.time()
    for conn_id in list(active_connections.keys()):
        conn_data = active_connections[conn_id]
        last_used = conn_data.get('last_used', current_time)
        if current_time - last_used > CONNECTION_TIMEOUT:
            logger.info(f"Cleaning up stale connection: {conn_id}")
            disconnect_database({'connection_id': conn_id})


@app.route('/connect', methods=['POST'])
def connect_to_database():
    """Connect to a database (MySQL or SQLite) and return connection ID"""
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
        # Avoid logging full schema
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
    """Disconnect from a database using connection ID"""
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
    """Process a natural language question, generate SQL and execute it"""
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

        # Custom prompt to generate SQL query only (schema kept internal)
        prompt = (
            f"Given the following database schema:\n{schema_cache}\n"
            f"Generate a SQL query for this question: {question}\n"
            "Return only the SQL query inside ```sql``` tags."
        )

        max_retries = 3
        for attempt in range(max_retries):
            try:
                agent_response = llm.invoke(prompt)
                break
            except exceptions.ResourceExhausted as e:
                if attempt == max_retries - 1:
                    logger.error(
                        f"Gemini quota exhausted after {max_retries} attempts: {str(e)}")
                    return jsonify({
                        'success': False,
                        'error': 'Gemini API quota exhausted. Please try again later or check your quota limits.',
                        'details': str(e)
                    }), 429
                logger.info(
                    f"Resource exhausted, retrying in {2 ** attempt} seconds... Attempt {attempt + 1}/{max_retries}")
                time.sleep(2 ** attempt)

        connection_data['last_used'] = time.time()

        sql_query = extract_sql_query(agent_response)
        if not sql_query:
            return jsonify({
                'success': False,
                'error': 'Failed to generate SQL query',
                'agent_response': str(agent_response)
            }), 500

        result = execute_query(connection_data, sql_query)

        return jsonify({
            'success': True,
            'question': question,
            'sql': sql_query,
            'result': result,
            'reasoning': "Generated and executed SQL query based on the database schema"
        }), 200

    except Exception as e:
        logger.error(f"Process error: {str(e)}", exc_info=True)
        traceback_str = traceback.format_exc()
        return jsonify({
            'success': False,
            'error': str(e),
            'traceback': traceback_str
        }), 500


def extract_sql_query(agent_response):
    """Extract SQL query from AIMessage response"""
    output = agent_response.content  # Directly access content attribute of AIMessage
    sql_pattern = r"```sql\s*([\s\S]*?)\s*```"
    match = re.search(sql_pattern, output, re.IGNORECASE)
    return match.group(1).strip() if match else None


def execute_query(connection_data, sql_query):
    """Execute SQL query based on database type"""
    connection = connection_data['connection']
    db_type = connection_data['type']
    try:
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
                    column_names = [desc[0] for desc in cursor.description]
                    rows = cursor.fetchall()
                    return json.loads(json.dumps([dict(zip(column_names, row)) for row in rows], default=str))
                connection.commit()
                return {"affected_rows": cursor.rowcount}
    except Exception as e:
        raise Exception(f"Query execution error: {str(e)}")


if __name__ == '__main__':
    app.run(debug=False, host='0.0.0.0', port=5000)
