from flask import Flask, request, jsonify, send_file
import os
import mysql.connector
import sqlite3
import uuid
import time
import logging
from pymongo import MongoClient
from flask_cors import CORS
import re
import json
import traceback
from langchain.sql_database import SQLDatabase
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain.agents import create_sql_agent
from langchain.agents.agent_types import AgentType
from langchain.agents.agent_toolkits import SQLDatabaseToolkit
from dotenv import load_dotenv
from urllib.parse import quote
from sqlalchemy import create_engine
from sqlalchemy import text
import io
import xlsxwriter

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

# MongoDB setup
mongo_client = MongoClient('mongodb://localhost:27017/')
mongo_db = mongo_client['report_ai']
chat_sessions_collection = mongo_db['chat_sessions']
connections_collection = mongo_db['connections']

# Store active connections
active_connections = {}

# Connection timeout (in seconds)
CONNECTION_TIMEOUT = 3600  # 1 hour

# Supported visualization types
VISUALIZATION_TYPES = {
    "as a pie chart": "pie",
    "as a line graph": "line",
    "as a bar chart": "bar",
    "as a area chart": "area"
}

AVAILABLE_COMPONENTS = ["pie", "bar", "line", "table"]


def cleanup_stale_connections():
    """Remove connections inactive for too long"""
    current_time = time.time()
    for conn_id in list(active_connections.keys()):
        conn_data = active_connections[conn_id]
        last_used = conn_data.get('last_used', current_time)
        if current_time - last_used > CONNECTION_TIMEOUT:
            logger.info(f"Cleaning up stale connection: {conn_id}")
            if conn_data['type'] == 'mysql' and conn_data['connection'].is_connected():
                conn_data['connection'].close()
            else:
                conn_data['connection'].close()
            conn_data['engine'].dispose()
            del active_connections[conn_id]


def detect_visualization_type(question: str) -> tuple[str, str]:
    """Detect visualization type and return type and cleaned question"""
    question_lower = question.lower()
    for viz_phrase, viz_type in VISUALIZATION_TYPES.items():
        if viz_phrase in question_lower:
            cleaned_question = re.sub(
                rf"\b{viz_phrase}\b", "", question_lower, flags=re.IGNORECASE).strip()
            return viz_type, cleaned_question
    return None, question


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
    return {"data": result}


@app.route('/create_dashboard', methods=['POST'])
def create_dashboard():
    try:
        data = request.get_json()
        prompt = data.get('prompt')
        connection_id = data.get('connection_id')
        chat_session_id = data.get('chat_session_id')
        selected_components = data.get('components', [])

        if not all([prompt, connection_id, chat_session_id, selected_components]):
            return jsonify({'success': False, 'error': 'Missing required fields'}), 400
        if connection_id not in active_connections:
            return jsonify({'success': False, 'error': 'Invalid connection ID'}), 400
        if not all(comp in AVAILABLE_COMPONENTS for comp in selected_components):
            return jsonify({'success': False, 'error': 'Invalid component selected'}), 400

        connection_data = active_connections[connection_id]
        llm = connection_data['llm']
        schema_cache = connection_data['schema_cache']

        ai_prompt = (
            f"Given the database schema:\n{schema_cache}\n"
            f"For the user prompt: '{prompt}'\n"
            f"User selected components: {', '.join(selected_components)}\n"
            "For each selected component:\n"
            "1. Confirm if the component is suitable for the prompt and data.\n"
            "2. If suitable, generate a SQL query with 'label' and 'value' aliases where applicable.\n"
            "3. If not suitable, suggest an alternative component from {', '.join(AVAILABLE_COMPONENTS)} with reasoning.\n"
            "Return the response in this JSON format:\n"
            "```json\n"
            "{\n"
            "  \"components\": [\n"
            "    {\"component_id\": \"comp1\", \"type\": \"<type>\", \"sql_query\": \"<query>\", \"reasoning\": \"<reason>\", \"suggestion\": \"<alt_type>\" (if unsuitable)},\n"
            "    ...\n"
            "  ]\n"
            "}\n"
            "```"
        )

        agent_response = llm.invoke(ai_prompt)
        # logger.debug(f"Raw Gemini response: {agent_response.content}")
        json_match = re.search(
            r"```json\s*([\s\S]*?)\s*```", agent_response.content, re.IGNORECASE)
        if not json_match:
            logger.error("No JSON found in Gemini response")
            return jsonify({'success': False, 'error': 'Failed to parse AI response: No JSON found'}), 500

        json_str = json_match.group(1).strip()
        json_str = re.sub(r'\}\s*[^}]*$', '}', json_str)
        # logger.debug(f"Extracted JSON string: {json_str}")

        try:
            ai_result = json.loads(json_str)
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse JSON: {json_str}, Error: {str(e)}")
            return jsonify({'success': False, 'error': f'Failed to parse AI response: Invalid JSON - {str(e)}'}), 500

        # logger.debug(f"Parsed AI result: {ai_result}")
        components = ai_result.get('components', [])

        if not components:
            return jsonify({
                'success': False,
                'error': 'No components generated by AI. The prompt may not match the database schema.',
                'layout': [],
                'results': [],
                'suggestions': []
            }), 200

        for i, comp in enumerate(components):
            if 'type' not in comp:
                comp['type'] = 'table'
                comp['reasoning'] = (
                    comp.get('reasoning', '') + " (Defaulted to table due to missing type)")
            comp.update({
                "x": (i % 2) * 2,
                "y": (i // 2) * 2,
                "w": 2,
                "h": 2
            })

        results = []
        suggestions = []
        for comp in components:
            # logger.debug(f"Processing component: {comp}")
            component_id = comp['component_id']
            viz_type = comp['type']
            sql_query = comp.get('sql_query')
            reasoning = comp['reasoning']
            # logger.debug(f"Executing query for {component_id}: {sql_query}")
            try:
                result = execute_query(connection_data, sql_query)
                logger.debug(f"Query result for {component_id}: {result}")
                formatted_result = format_for_visualization(
                    sql_query, result, viz_type) if viz_type != 'table' else result
                if not result or (isinstance(result, list) and len(result) == 0):
                    formatted_result = {
                        "data": {"labels": [], "datasets": []}} if viz_type != 'table' else []
                    reasoning += " (No data returned; displaying empty component)"
            except Exception as e:
                logger.error(
                    f"Query execution failed for {component_id}: {str(e)}", exc_info=True)
                formatted_result = {
                    "data": {"labels": [], "datasets": []}} if viz_type != 'table' else []
                reasoning += f" (Query failed: {str(e)})"
            full_response = {
                'question': prompt,
                'sql': sql_query,
                'result': formatted_result,
                'visualization': viz_type,
                'component_id': component_id,
                'reasoning': reasoning,
                'timestamp': time.time()
            }
            results.append(full_response)
            if 'suggestion' in comp or 'exception' in locals():
                suggestions.append({
                    'component_id': component_id,
                    'original': viz_type,
                    'suggestion': comp.get('suggestion', 'table'),
                    'reasoning': reasoning
                })
        # logger.debug(f"Final results: {results}")
        # logger.debug(f"Final suggestions: {suggestions}")

        chat_sessions_collection.update_one(
            {'chat_session_id': chat_session_id},
            {
                '$set': {'dashboard_layout': results},
                '$push': {'messages': {'$each': results}}
            },
            upsert=True
        )

        return jsonify({
            'success': True,
            'layout': results,
            'results': results,
            'suggestions': suggestions
        }), 200
    except Exception as e:
        logger.error(f"Create dashboard error: {str(e)}", exc_info=True)
        return jsonify({'success': False, 'error': str(e), 'traceback': traceback.format_exc()}), 500


@app.route('/save_dashboard', methods=['POST'])
def save_dashboard():
    try:
        data = request.get_json()
        chat_session_id = data.get('chat_session_id')
        # e.g., [{"component_id": "comp1", "x": 0, "y": 0, "w": 2, "h": 2}, ...]
        layout = data.get('layout')

        if not chat_session_id or not layout:
            return jsonify({'success': False, 'error': 'Missing required fields'}), 400

        # Validate layout components
        session = chat_sessions_collection.find_one(
            {'chat_session_id': chat_session_id})
        if not session:
            return jsonify({'success': False, 'error': 'Chat session not found'}), 404

        # Update layout with new positions
        chat_sessions_collection.update_one(
            {'chat_session_id': chat_session_id},
            {'$set': {'dashboard_layout': layout}},
            upsert=True
        )
        logger.info(
            f"Saved dashboard layout for chat_session_id: {chat_session_id}")
        return jsonify({'success': True}), 200
    except Exception as e:
        logger.error(f"Save dashboard error: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/export_dashboard', methods=['GET'])
def export_dashboard():
    try:
        chat_session_id = request.args.get('chat_session_id')
        if not chat_session_id:
            return jsonify({'success': False, 'error': 'Missing chat_session_id'}), 400

        session = chat_sessions_collection.find_one(
            {'chat_session_id': chat_session_id})
        if not session:
            return jsonify({'success': False, 'error': 'Chat session not found'}), 404

        messages = session.get('messages', [])
        if not messages:
            return jsonify({'success': False, 'error': 'No messages found in session'}), 404

        output = io.BytesIO()
        workbook = xlsxwriter.Workbook(output, {'in_memory': True})

        # Track used sheet names to avoid duplicates
        used_sheet_names = {}

        for i, msg in enumerate(messages):
            # Base sheet name
            base_name = f"{msg.get('visualization', 'unknown')}_{msg.get('component_id', str(i))}"[
                :31]
            sheet_name = base_name
            suffix = 1
            while sheet_name in used_sheet_names:
                suffix_str = f"_{suffix}"
                max_base_len = 31 - len(suffix_str)
                sheet_name = f"{base_name[:max_base_len]}{suffix_str}"
                suffix += 1
            used_sheet_names[sheet_name] = True

            worksheet = workbook.add_worksheet(sheet_name)

            # Write headers and data
            result = msg.get('result', {})
            if isinstance(result, dict) and 'data' in result:  # Visualization (bar/pie)
                labels = result['data'].get('labels', [])
                datasets = result['data'].get('datasets', [{}])[
                    0].get('data', [])
                worksheet.write_row(0, 0, ['Label', msg.get(
                    'visualization', 'unknown').capitalize()])
                for row_idx, label in enumerate(labels, 1):
                    worksheet.write(row_idx, 0, label)
                    dataset_value = datasets[row_idx -
                                             1] if row_idx - 1 < len(datasets) else ''
                    worksheet.write(row_idx, 1, dataset_value)

                # Add chart based on visualization type
                if msg.get('visualization') == 'bar':
                    chart = workbook.add_chart({'type': 'column'})
                    chart.add_series({
                        'categories': [sheet_name, 1, 0, len(labels), 0],
                        'values': [sheet_name, 1, 1, len(labels), 1],
                        'name': 'Data'
                    })
                    chart.set_title(
                        {'name': f'{msg.get("visualization", "unknown").capitalize()} Chart'})
                    # Place chart to the right of data
                    worksheet.insert_chart('D2', chart)
                elif msg.get('visualization') == 'pie':
                    chart = workbook.add_chart({'type': 'pie'})
                    chart.add_series({
                        'categories': [sheet_name, 1, 0, len(labels), 0],
                        'values': [sheet_name, 1, 1, len(labels), 1],
                        'name': 'Data'
                    })
                    chart.set_title(
                        {'name': f'{msg.get("visualization", "unknown").capitalize()} Chart'})
                    # Place chart to the right of data
                    worksheet.insert_chart('D2', chart)
            else:  # Table or raw data
                if isinstance(result, list) and result:
                    headers = list(result[0].keys()) if result else [
                        'No Headers']
                    worksheet.write_row(0, 0, headers)
                    for row_idx, row in enumerate(result, 1):
                        row_data = [row.get(h, '') for h in headers]
                        worksheet.write_row(row_idx, 0, row_data)
                else:
                    worksheet.write(0, 0, "No data available")

        workbook.close()
        output.seek(0)
        logger.info(
            f"Exported dashboard for chat_session_id: {chat_session_id}")
        return send_file(
            output,
            as_attachment=True,
            download_name=f"dashboard_{chat_session_id}.xlsx",
            mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        )

    except Exception as e:
        logger.error(f"Export error: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/connect', methods=['POST'])
def connect_to_database():
    try:
        data = request.get_json()
        logger.info(f"Received connection data: {data}")
        db_type = data.get('type', 'mysql')

        connection_key = f"{db_type}:{data.get('host', '')}:{data.get('database', '')}:{data.get('user', '')}:{data.get('path', '')}"
        logger.info(f"Generated connection key: {connection_key}")

        existing_conn = connections_collection.find_one(
            {'connection_key': connection_key})
        if existing_conn:
            connection_id = existing_conn['connection_id']
            logger.info(f"Reusing existing connection_id: {connection_id}")
            db_info = existing_conn['info']
        else:
            connection_id = str(uuid.uuid4())
            db_info = {'type': db_type}

        if db_type == 'mysql':
            host = data.get('host', 'localhost')
            user = data.get('user', 'root')
            password = data.get('password', '')
            database = data.get('database', '')
            connection = mysql.connector.connect(
                host=host,
                user=user,
                password=password,
                database=database
            )
            encoded_password = quote(password)
            connection_string = f"mysql+mysqlconnector://{user}:{encoded_password}@{host}/{database}"
            engine = create_engine(connection_string)
            db_info.update({'host': host, 'database': database, 'user': user})
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
            'last_used': time.time()
        }

        if not existing_conn:
            connections_collection.insert_one({
                'connection_id': connection_id,
                'connection_key': connection_key,
                'type': db_type,
                'info': db_info,
                'created_at': time.time()
            })
            logger.info(f"Created new connection_id: {connection_id}")

        return jsonify({
            'success': True,
            'connection_id': connection_id,
            'database_info': db_info
        }), 200
    except mysql.connector.Error as e:
        logger.error(f"MySQL Error: {str(e)}")
        return jsonify({'success': False, 'error': f"MySQL Error: {str(e)}"}), 500
    except Exception as e:
        logger.error(f"Connect error: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/schema', methods=['GET'])
def get_schema():
    try:
        connection_id = request.args.get('connection_id')
        if not connection_id or connection_id not in active_connections:
            return jsonify({'success': False, 'error': 'Invalid connection ID'}), 400

        connection_data = active_connections[connection_id]
        db_type = connection_data['type']
        engine = connection_data['engine']

        schema_data = {'tables': {}}

        with engine.connect() as conn:
            if db_type == 'mysql':
                # Fetch tables
                tables_result = conn.execute(text("SHOW TABLES")).fetchall()
                tables = [row[0] for row in tables_result]

                for table in tables:
                    # Fetch columns (DESCRIBE returns a result set with named columns)
                    columns_result = conn.execute(
                        text(f"DESCRIBE {table}")).mappings().fetchall()
                    columns = [
                        {'name': row['Field'],
                            'type': row['Type'], 'key': row['Key']}
                        for row in columns_result
                    ]

                    # Fetch foreign keys
                    fk_result = conn.execute(text(f"""
                        SELECT COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
                        FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
                        WHERE TABLE_NAME = '{table}' AND REFERENCED_TABLE_NAME IS NOT NULL
                    """)).mappings().fetchall()
                    foreign_keys = [
                        {
                            'column': row['COLUMN_NAME'],
                            'ref_table': row['REFERENCED_TABLE_NAME'],
                            'ref_column': row['REFERENCED_COLUMN_NAME']
                        }
                        for row in fk_result
                    ]

                    schema_data['tables'][table] = {
                        'columns': columns,
                        'foreign_keys': foreign_keys
                    }

            elif db_type == 'sqlite':
                # Fetch tables
                tables_result = conn.execute(
                    text("SELECT name FROM sqlite_master WHERE type='table'")).fetchall()
                tables = [row[0]
                          for row in tables_result if row[0] != 'sqlite_sequence']

                for table in tables:
                    # Fetch columns
                    columns_result = conn.execute(
                        text(f"PRAGMA table_info({table})")).mappings().fetchall()
                    columns = [
                        {'name': row['name'], 'type': row['type'],
                            'key': 'PRI' if row['pk'] else ''}
                        for row in columns_result
                    ]

                    # Fetch foreign keys
                    fk_result = conn.execute(
                        text(f"PRAGMA foreign_key_list({table})")).mappings().fetchall()
                    foreign_keys = [
                        {
                            'column': row['from'],
                            'ref_table': row['table'],
                            'ref_column': row['to']
                        }
                        for row in fk_result
                    ]

                    schema_data['tables'][table] = {
                        'columns': columns,
                        'foreign_keys': foreign_keys
                    }

        connection_data['last_used'] = time.time()
        logger.info(f"Schema fetched for connection_id: {connection_id}")
        return jsonify({'success': True, 'schema': schema_data}), 200

    except Exception as e:
        logger.error(f"Schema fetch error: {str(e)}", exc_info=True)
        return jsonify({'success': False, 'error': str(e), 'traceback': traceback.format_exc()}), 500


@app.route('/disconnect', methods=['POST'])
def disconnect_database():
    try:
        data = request.get_json()
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
        logger.info(f"Disconnected connection_id: {connection_id}")
        return jsonify({'success': True}), 200
    except Exception as e:
        logger.error(f"Disconnect error: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/new_chat', methods=['POST'])
def new_chat():
    try:
        data = request.get_json()
        connection_id = data.get('connection_id')
        name = data.get('name', 'Unnamed Chat')  # Default name if not provided
        if not connection_id or not connections_collection.find_one({'connection_id': connection_id}):
            return jsonify({'success': False, 'error': 'Invalid connection ID'}), 400

        chat_session_id = str(uuid.uuid4())
        chat_session = {
            'connection_id': connection_id,
            'chat_session_id': chat_session_id,
            'name': name,  # Store the chat session name
            'start_time': time.time(),
            'messages': []
        }
        chat_sessions_collection.insert_one(chat_session)
        logger.info(
            f"New chat created with connection_id: {connection_id}, chat_session_id: {chat_session_id}, name: {name}")
        return jsonify({'success': True, 'chat_session_id': chat_session_id, 'name': name}), 200
    except Exception as e:
        logger.error(f"New chat error: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/chat_history', methods=['GET'])
def get_chat_history():
    try:
        connection_id = request.args.get('connection_id')
        if not connection_id or not connections_collection.find_one({'connection_id': connection_id}):
            return jsonify({'success': False, 'error': 'Invalid connection ID'}), 400

        logger.info(
            f"Fetching chat history for connection_id: {connection_id}")
        sessions = list(chat_sessions_collection.find(
            {'connection_id': connection_id},
            {'chat_session_id': 1, 'name': 1, 'start_time': 1,
                'messages': {'$slice': -1}}  # Include name
        ).sort('start_time', -1))

        logger.info(
            f"Found {len(sessions)} chat sessions for connection_id: {connection_id}")
        for session in sessions:
            session['_id'] = str(session['_id'])
        return jsonify({'success': True, 'chat_sessions': sessions}), 200
    except Exception as e:
        logger.error(f"Chat history error: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/chat_session', methods=['GET'])
def get_chat_session():
    try:
        connection_id = request.args.get('connection_id')
        chat_session_id = request.args.get('chat_session_id')
        if not connection_id or not connections_collection.find_one({'connection_id': connection_id}):
            return jsonify({'success': False, 'error': 'Invalid connection ID'}), 400
        if not chat_session_id:
            return jsonify({'success': False, 'error': 'Missing chat session ID'}), 400

        session = chat_sessions_collection.find_one(
            {'connection_id': connection_id, 'chat_session_id': chat_session_id}
        )
        if not session:
            return jsonify({'success': False, 'error': 'Chat session not found'}), 404

        session['_id'] = str(session['_id'])
        return jsonify({'success': True, 'messages': session['messages']}), 200
    except Exception as e:
        logger.error(f"Chat session error: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/process', methods=['POST'])
def process_question():
    try:
        cleanup_stale_connections()

        data = request.get_json()
        question = data.get('question')
        connection_id = data.get('connection_id')
        chat_session_id = data.get('chat_session_id')

        if not question or not connection_id or not chat_session_id:
            return jsonify({'success': False, 'error': 'Missing question, connection ID, or chat session ID'}), 400
        if connection_id not in active_connections:
            return jsonify({'success': False, 'error': 'Invalid connection ID'}), 400

        connection_data = active_connections[connection_id]
        llm = connection_data['llm']
        schema_cache = connection_data['schema_cache']

        session = chat_sessions_collection.find_one(
            {'connection_id': connection_id, 'chat_session_id': chat_session_id}
        )
        if not session:
            return jsonify({'success': False, 'error': 'Chat session not found'}), 404
        history = session['messages']

        viz_type, question_to_process = detect_visualization_type(question)
        if not viz_type and " as a " in question.lower():
            viz_type = "line"
            question_to_process = question.lower().split(" as a ")[0].strip()
        logger.debug(
            f"Detected: viz_type={viz_type}, question={question_to_process}")

        history_context = "\n\nPrevious conversation:\n" + "\n".join(
            [f"Q: {msg['question']}\nSQL: {msg['sql']}" for msg in history]
        ) if history else ""
        logger.debug(f"History context: {history_context}")

        prompt = (
            f"Given the following database schema:\n{schema_cache}\n"
            f"{history_context}\n"
            f"Generate a SQL query for this question: {question_to_process}\n"
            f"{'For a ' + viz_type + ' visualization, return exactly two columns: label (e.g., category, date) and value (e.g., count, sum). Use these exact aliases.' if viz_type else ''}\n"
            "Return only the SQL query inside ```sql``` tags.\n"
            "Note: Do not use LIMIT inside IN, ALL, ANY, or SOME subqueries."
        )
        logger.debug(f"Prompt: {prompt}")

        max_retries = 3
        for attempt in range(max_retries):
            try:
                agent_response = llm.invoke(prompt)
                logger.debug(f"LLM response: {agent_response.content}")
                break
            except Exception as e:
                if attempt == max_retries - 1:
                    logger.error(f"LLM invocation failed: {str(e)}")
                    return jsonify({'success': False, 'error': 'LLM processing failed'}), 500
                logger.info(f"Retrying in {2 ** attempt} seconds...")
                time.sleep(2 ** attempt)

        connection_data['last_used'] = time.time()

        sql_query = extract_sql_query(agent_response)
        if not sql_query:
            logger.error("No SQL query generated")
            return jsonify({'success': False, 'error': 'Failed to generate SQL query', 'agent_response': str(agent_response)}), 500

        result = execute_query(connection_data, sql_query)

        formatted_result = format_for_visualization(
            sql_query, result, viz_type) if viz_type else result

        full_response = {
            'question': question,
            'sql': sql_query,
            'result': formatted_result,
            'visualization': viz_type,
            'reasoning': f"Generated and executed SQL query {'for ' + viz_type + ' visualization' if viz_type else ''}",
            'timestamp': time.time()
        }

        chat_sessions_collection.update_one(
            {'connection_id': connection_id, 'chat_session_id': chat_session_id},
            {'$push': {'messages': full_response}}
        )
        logger.debug(
            f"Updated chat session {chat_session_id} with new message")

        return jsonify({'success': True, **full_response}), 200
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
                    column_names = [desc[0] for desc in cursor.description]
                    rows = cursor.fetchall()
                    return json.loads(json.dumps([dict(zip(column_names, row)) for row in rows], default=str))
                connection.commit()
                return {"affected_rows": cursor.rowcount}
    except Exception as e:
        logger.error(f"Query execution failed: {str(e)}")
        raise Exception(f"Query execution error: {str(e)}")


if __name__ == '__main__':
    app.run(debug=False, host='0.0.0.0', port=5000)
