from flask import Flask, request, jsonify
import mysql.connector
import pandas as pd
import json
import os
import logging
import time
from flask_cors import CORS
from dotenv import load_dotenv
from langchain.agents import create_sql_agent
from langchain.agents.agent_toolkits import SQLDatabaseToolkit
from langchain.sql_database import SQLDatabase
from langchain_core.prompts import PromptTemplate
from langchain_core.output_parsers import StrOutputParser
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain.chains import LLMChain
from langchain_core.runnables import RunnablePassthrough

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO,
                    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Initialize Flask app
app = Flask(__name__)
CORS(app)  # Enable CORS for all routes

# Check for required environment variables
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if not GEMINI_API_KEY:
    logger.error("GEMINI_API_KEY environment variable is missing")
    raise ValueError("GEMINI_API_KEY environment variable is required")

# Class to handle database connections and analysis


class DatabaseHandler:
    def __init__(self):
        self.connections = {}
        self.active_connection = None
        self.schema_cache = {}
        self.agents = {}
        self.db_connections = {}

    def connect_to_mysql(self, host, user, password, database):
        try:
            from urllib.parse import quote_plus
            encoded_password = quote_plus(password)
            connection_string = f"mysql+mysqlconnector://{user}:{encoded_password}@{host}/{database}"

            # Establish a direct MySQL connection
            direct_conn = mysql.connector.connect(
                host=host,
                user=user,
                password=password,
                database=database
            )

            connection_id = f"mysql_{host}_{database}"

            # Store connection info
            self.connections[connection_id] = {
                "connection": direct_conn,
                "type": "mysql",
                "host": host,
                "database": database,
                "user": user,
                "connection_string": connection_string
            }

            # Log the connections stored
            logger.info(f"Database connected with ID: {connection_id}")
            # Should show the connection ID
            print(f"Stored connections: {self.connections.keys()}")

            self.active_connection = connection_id

            # Create LangChain SQL Database object and store it in db_connections
            try:
                db = SQLDatabase.from_uri(connection_string)
                # Ensure the connection is stored
                self.db_connections[connection_id] = db
                logger.info(
                    f"LangChain SQL Database created for {connection_id}")
                # Debugging line
                print(f"Stored DB connections: {self.db_connections.keys()}")
            except Exception as e:
                logger.error(
                    f"Error creating LangChain SQL Database: {str(e)}")
                return None, False, f"Failed to create SQL Database: {str(e)}"

            # Create SQL agent for this connection
            self._create_sql_agent(connection_id)

            self._cache_schema(connection_id)

            return connection_id, True, "Successfully connected to MySQL database"

        except Exception as e:
            logger.error(f"MySQL connection error: {str(e)}")
            return None, False, f"Failed to connect to MySQL: {str(e)}"

    def _create_sql_agent(self, connection_id):
        connection_info = self.connections.get(connection_id)
        if not connection_info:
            logger.error(f"No connection info found for {connection_id}")
            return

        try:
            db = self.db_connections.get(connection_id)
            if not db:
                logger.error(
                    f"No database connection found for {connection_id}")
                logger.error(
                    f"Available DB connections: {list(self.db_connections.keys())}")
                return

            llm = ChatGoogleGenerativeAI(
                model="gemini-1.5-pro",
                google_api_key=GEMINI_API_KEY,
                temperature=0.1,
                top_p=0.95,
                max_output_tokens=2048
            )

            toolkit = SQLDatabaseToolkit(db=db, llm=llm)

            agent = create_sql_agent(
                llm=llm,
                toolkit=toolkit,
                verbose=True,
                agent_type="openai-tools",
                handle_parsing_errors=True
            )

            self.agents[connection_id] = agent
            logger.info(f"SQL agent created for {connection_id}")
            print(f"Stored agents: {self.agents.keys()}")  # Debug line

        except Exception as e:
            logger.error(f"Error creating SQL agent: {str(e)}")

    def _cache_schema(self, connection_id):
        """Cache the database schema for future reference"""
        connection_info = self.connections.get(connection_id)
        if not connection_info:
            return

        schema = {"tables": []}
        try:
            if connection_info["type"] == "mysql":
                conn = connection_info["connection"]
                cursor = conn.cursor(dictionary=True)
                database = connection_info["database"]

                # Get all tables
                cursor.execute(f"SHOW TABLES FROM {database};")
                tables = [list(table.values())[0]
                          for table in cursor.fetchall()]

                # Get table details and relationships
                for table in tables:
                    # Get column info
                    cursor.execute(f"DESCRIBE {table};")
                    columns = cursor.fetchall()
                    column_details = [
                        {"name": col["Field"], "type": col["Type"],
                            "primary_key": col["Key"] == "PRI"}
                        for col in columns
                    ]

                    # Get foreign key relationships
                    cursor.execute(f"""
                        SELECT
                            COLUMN_NAME,
                            REFERENCED_TABLE_NAME,
                            REFERENCED_COLUMN_NAME
                        FROM
                            INFORMATION_SCHEMA.KEY_COLUMN_USAGE
                        WHERE
                            TABLE_SCHEMA = '{database}' AND
                            TABLE_NAME = '{table}' AND
                            REFERENCED_TABLE_NAME IS NOT NULL;
                    """)

                    foreign_keys = []
                    for fk in cursor.fetchall():
                        foreign_keys.append({
                            "column": fk["COLUMN_NAME"],
                            "referenced_table": fk["REFERENCED_TABLE_NAME"],
                            "referenced_column": fk["REFERENCED_COLUMN_NAME"]
                        })

                    # Get index info
                    cursor.execute(f"SHOW INDEX FROM {table};")
                    indexes = cursor.fetchall()
                    index_details = {}
                    for idx in indexes:
                        index_name = idx["Key_name"]
                        if index_name not in index_details:
                            index_details[index_name] = {
                                "name": index_name,
                                "columns": [],
                                "unique": not idx["Non_unique"]
                            }
                        index_details[index_name]["columns"].append(
                            idx["Column_name"])

                    # Get sample data
                    try:
                        cursor.execute(f"SELECT * FROM {table} LIMIT 5;")
                        sample_data = cursor.fetchall()
                        formatted_samples = [row for row in sample_data]
                    except Exception as e:
                        logger.warning(
                            f"Could not fetch sample data for table {table}: {str(e)}")
                        formatted_samples = []

                    # Add all table info to schema
                    schema["tables"].append({
                        "name": table,
                        "columns": column_details,
                        "foreign_keys": foreign_keys,
                        "indexes": list(index_details.values()),
                        "sample_data": formatted_samples
                    })

                cursor.close()

                # Add relationships between tables
                schema["relationships"] = []
                for table in schema["tables"]:
                    for fk in table.get("foreign_keys", []):
                        schema["relationships"].append({
                            "source_table": table["name"],
                            "source_column": fk["column"],
                            "target_table": fk["referenced_table"],
                            "target_column": fk["referenced_column"]
                        })

                self.schema_cache[connection_id] = schema
                logger.info(
                    f"Cached schema for {connection_id}: {len(schema['tables'])} tables")

        except Exception as e:
            logger.error(f"Error caching schema: {str(e)}")

    def get_schema(self, connection_id=None):
        """Get the schema for the specified or active connection"""
        if connection_id is None:
            connection_id = self.active_connection
        return self.schema_cache.get(connection_id, {"tables": []})

    def execute_query(self, sql, connection_id=None):
        """Execute a SQL query on the specified connection"""
        if connection_id is None:
            connection_id = self.active_connection

        if not connection_id or connection_id not in self.connections:
            return False, "No active database connection."

        if not sql or not sql.strip():
            return False, "Empty SQL query provided."

        connection_info = self.connections[connection_id]
        logger.info(f"Executing SQL: {sql}")

        print(connection_info)

        try:
            if connection_info["type"] == "mysql":
                conn = connection_info["connection"]
                cursor = conn.cursor(dictionary=True)
                try:
                    cursor.execute(sql)
                    if sql.strip().upper().startswith(("SELECT", "SHOW", "DESCRIBE", "EXPLAIN")):
                        result = cursor.fetchall()
                        return True, result
                    else:
                        conn.commit()
                        affected_rows = cursor.rowcount
                        return True, {"affected_rows": affected_rows, "message": f"Query executed successfully. Rows affected: {affected_rows}"}
                finally:
                    cursor.close()
            return False, "Unsupported database type."
        except Exception as e:
            logger.error(f"Query execution error: {str(e)}")
            return False, f"Query execution failed: {str(e)}"

    def process_natural_language(self, question, connection_id=None, model_name="gemini-1.5-pro"):
        """Process a natural language question using LangChain agents"""
        if connection_id is None:
            connection_id = self.active_connection

        if not connection_id or connection_id not in self.connections:
            return False, "No active database connection.", None, None

        agent = self.agents.get(connection_id)
        if not agent:
            logger.error(
                f"No SQL agent available for connection {connection_id}")
            self._create_sql_agent(connection_id)  # Try to recreate the agent
            agent = self.agents.get(connection_id)
            if not agent:
                return False, "No SQL agent available for this connection.", "", "SQL agent creation failed"

        try:
            # First, we'll use a dedicated chain to generate an SQL query with reasoning
            sql_generator = self._create_sql_generator(
                connection_id, model_name)

            # Log the question for debugging
            logger.info(f"Processing question: {question}")

            # Generate SQL using the chain
            sql_generation_result = sql_generator.invoke(
                {"question": question})

            # Log the generation result for debugging
            logger.info(f"SQL generation result: {sql_generation_result}")

            # Extract reasoning and SQL from the result
            reasoning = sql_generation_result.get("reasoning", "")
            sql = sql_generation_result.get("sql", "")

            # Log the extracted SQL
            logger.info(f"Extracted SQL: {sql}")

            # If SQL is empty or doesn't look valid, try with the agent directly
            if not sql or "SELECT" not in sql.upper():
                logger.info("Initial SQL generation failed, trying with agent")

                try:
                    agent_result = agent.invoke(
                        {"input": f"Convert this question to SQL: {question}"})

                    # Debug log the agent result
                    logger.info(f"Agent result type: {type(agent_result)}")
                    logger.info(f"Agent result: {agent_result}")

                    if isinstance(agent_result, dict) and "output" in agent_result:
                        full_response = agent_result["output"]
                        logger.info(f"Agent output: {full_response}")

                        # Extract SQL from the agent response
                        import re

                        # Try to find SQL code block
                        sql_match = re.search(
                            r"```sql\s+([\s\S]*?)```", full_response, re.IGNORECASE)
                        if sql_match:
                            sql = sql_match.group(1).strip()
                            logger.info(
                                f"Extracted SQL from code block: {sql}")
                        else:
                            # Try to find SELECT statement
                            select_match = re.search(
                                r"(SELECT[\s\S]+?;)", full_response, re.IGNORECASE)
                            if select_match:
                                sql = select_match.group(1).strip()
                                logger.info(
                                    f"Extracted SQL from SELECT pattern: {sql}")

                        # Use the full agent response as reasoning
                        reasoning = full_response
                except Exception as agent_error:
                    logger.error(
                        f"Error using agent fallback: {str(agent_error)}")
                    # Continue with whatever SQL we have so far

            # If we still don't have valid SQL, return an error
            if not sql or not sql.strip():
                logger.error("Failed to generate SQL query")
                return False, reasoning, "", "Failed to generate a valid SQL query"

            # Log the final SQL query
            logger.info(f"Final SQL query: {sql}")

            # Execute the SQL query
            exec_success, exec_result = self.execute_query(sql, connection_id)

            if exec_success:
                return True, reasoning, sql, exec_result
            else:
                # If execution fails, try to fix the SQL
                error_msg = str(exec_result)
                logger.error(f"SQL execution failed: {error_msg}")

                fixed_sql = self._fix_sql_query(sql, error_msg, connection_id)
                if fixed_sql and fixed_sql != sql:
                    logger.info(f"Attempting with fixed SQL: {fixed_sql}")
                    exec_success, exec_result = self.execute_query(
                        fixed_sql, connection_id)
                    if exec_success:
                        return True, reasoning, fixed_sql, exec_result

                return False, reasoning, sql, f"SQL execution failed: {error_msg}"

        except Exception as e:
            import traceback
            error_msg = f"Error processing question: {str(e)}"
            logger.error(error_msg)
            logger.error(traceback.format_exc())
            return False, f"Error processing question: {str(e)}", "", error_msg

    def _create_sql_generator(self, connection_id, model_name="gemini-1.5-pro"):
        """Create a chain specifically for SQL generation with reasoning"""
        schema = self.get_schema(connection_id)

        # Create a formatted schema text
        schema_text = self._format_schema_for_prompt(schema)

        # Create LLM
        llm = ChatGoogleGenerativeAI(
            model=model_name,
            google_api_key=GEMINI_API_KEY,
            temperature=0.1,
            top_p=0.95,
            max_output_tokens=2048
        )

        # Create prompt with clearer instructions
        prompt = PromptTemplate.from_template("""
            You are an advanced text-to-SQL AI assistant for MySQL. Convert the following natural language question into a valid MySQL query using the provided schema.

            {schema}

            User question: {question}

            Follow these steps:
            1. Analyze which tables and columns are relevant to the question.
            2. Understand the relationships between tables using the foreign key information.
            3. Develop a clear reasoning process for your SQL query.
            4. Generate a SQL query that addresses the question accurately.
            5. Ensure the query is valid MySQL syntax.

            YOUR RESPONSE MUST FOLLOW THIS EXACT FORMAT:
            Reasoning: <your detailed reasoning process>

            SQL_QUERY:
            SELECT column1, column2
            FROM table
            WHERE condition;

            Make sure the SQL query is fully executable. Always include a semicolon at the end of your query.
            Only use tables and columns that exist in the schema provided.
            Use appropriate JOIN conditions based on the foreign keys provided.
            Do not include any explanation or markdown formatting around the SQL query.
            """)

        # Improved parsing function
        def parse_output(output):
            try:
                # First try to extract using explicit markers
                if "SQL_QUERY:" in output:
                    parts = output.split("SQL_QUERY:")
                    reasoning = parts[0].replace("Reasoning:", "").strip()
                    sql = parts[1].strip()

                    # Clean up the SQL query
                    if "```" in sql:
                        # Extract content between markdown code blocks if present
                        sql_parts = sql.split("```")
                        if len(sql_parts) >= 3:  # Has opening and closing ticks
                            sql = sql_parts[1].replace("sql", "").strip()
                        else:
                            sql = sql_parts[0].strip()

                    return {"reasoning": reasoning, "sql": sql}

                # Try to find the SQL query using regex patterns
                import re

                # Look for SQL code blocks
                sql_match = re.search(
                    r"```(?:sql)?\s+([\s\S]*?)```", output, re.IGNORECASE)
                if sql_match:
                    sql = sql_match.group(1).strip()
                    # Remove the SQL block from output to get reasoning
                    reasoning = re.sub(
                        r"```(?:sql)?\s+[\s\S]*?```", "", output, flags=re.DOTALL).strip()
                    reasoning = reasoning.replace("Reasoning:", "").strip()
                    return {"reasoning": reasoning, "sql": sql}

                # Look for SELECT statements
                select_match = re.search(
                    r"(SELECT[\s\S]+?;)", output, re.IGNORECASE)
                if select_match:
                    sql = select_match.group(1).strip()
                    select_idx = output.upper().find("SELECT")
                    reasoning = output[:select_idx].strip(
                    ) if select_idx > 0 else output
                    return {"reasoning": reasoning, "sql": sql}

                # Last resort: look for any SQL keywords
                sql_keywords = ["SELECT", "WITH", "INSERT",
                                "UPDATE", "DELETE", "CREATE", "ALTER"]
                for keyword in sql_keywords:
                    if keyword in output.upper():
                        lines = output.split("\n")
                        start_idx = -1
                        for i, line in enumerate(lines):
                            if keyword in line.upper():
                                start_idx = i
                                break

                        if start_idx >= 0:
                            # Collect all lines that might be SQL
                            sql_lines = []
                            for i in range(start_idx, len(lines)):
                                if lines[i].strip() and not lines[i].startswith("This SQL"):
                                    sql_lines.append(lines[i])
                                    if ";" in lines[i]:
                                        break

                            if sql_lines:
                                sql = "\n".join(sql_lines)
                                reasoning_lines = lines[:start_idx]
                                reasoning = "\n".join(reasoning_lines).strip()
                                return {"reasoning": reasoning, "sql": sql}

                # If we can't find any SQL, log it and return empty SQL
                logger.warning(
                    f"Could not extract SQL from LLM output: {output[:100]}...")
                return {"reasoning": output, "sql": ""}

            except Exception as e:
                logger.error(f"Error parsing LLM output: {str(e)}")
                return {"reasoning": "Error parsing response", "sql": ""}

        chain = (
            {"schema": lambda _: schema_text, "question": RunnablePassthrough()}
            | prompt
            | llm
            | StrOutputParser()
            | parse_output
        )

        return chain

    def _format_schema_for_prompt(self, schema):
        """Format the schema for inclusion in the prompt"""
        schema_text = "Database Schema:\n"

        # Add tables and columns
        for table in schema["tables"]:
            schema_text += f"Table: {table['name']}\nColumns:\n"
            for col in table["columns"]:
                pk_str = " (Primary Key)" if col["primary_key"] else ""
                schema_text += f"  - {col['name']} ({col['type']}){pk_str}\n"

            # Add foreign keys
            if table.get("foreign_keys") and len(table["foreign_keys"]) > 0:
                schema_text += "Foreign Keys:\n"
                for fk in table["foreign_keys"]:
                    schema_text += f"  - {fk['column']} references {fk['referenced_table']}({fk['referenced_column']})\n"

            # Add sample data (limited)
            if table.get("sample_data") and len(table["sample_data"]) > 0:
                schema_text += "Sample Data (first 2 rows):\n"
                for sample in table["sample_data"][:2]:
                    schema_text += f"  {json.dumps(sample)}\n"

            schema_text += "\n"

        # Add relationship information
        if schema.get("relationships") and len(schema["relationships"]) > 0:
            schema_text += "Relationships between tables:\n"
            for rel in schema["relationships"]:
                schema_text += f"  - {rel['source_table']}.{rel['source_column']} → {rel['target_table']}.{rel['target_column']}\n"

        return schema_text

    def _fix_sql_query(self, sql, error_message, connection_id):
        """Try to fix SQL query if execution fails"""
        try:
            # Create a model for SQL fixing
            llm = ChatGoogleGenerativeAI(
                model="gemini-1.5-pro",
                google_api_key=GEMINI_API_KEY,
                temperature=0.1,
                max_output_tokens=1024
            )

            # Get schema
            schema = self.get_schema(connection_id)
            schema_text = self._format_schema_for_prompt(schema)

            # Create prompt
            prompt = f"""
            I have an SQL query that is failing with the following error:
            Error: {error_message}
            
            Original SQL Query:
            ```sql
            {sql}
            ```
            
            Database Schema:
            {schema_text}
            
            Please fix the SQL query to make it work correctly with this schema.
            Return only the fixed SQL query, nothing else.
            """

            # Generate the fixed query
            response = llm.invoke(prompt)
            fixed_sql = response.content.strip()

            # Extract SQL from markdown blocks if present
            if "```sql" in fixed_sql:
                fixed_sql = fixed_sql.split(
                    "```sql")[1].split("```")[0].strip()
            elif "```" in fixed_sql:
                fixed_sql = fixed_sql.split("```")[1].split("```")[0].strip()

            return fixed_sql
        except Exception as e:
            logger.error(f"Error fixing SQL query: {str(e)}")
            return None

    def close_connection(self, connection_id=None):
        """Close the specified or active connection"""
        if connection_id is None:
            connection_id = self.active_connection

        if not connection_id or connection_id not in self.connections:
            return False, "No active database connection."

        try:
            connection_info = self.connections[connection_id]
            connection_info["connection"].close()

            # Remove from all collections
            del self.connections[connection_id]
            if connection_id in self.agents:
                del self.agents[connection_id]
            if connection_id in self.db_connections:
                del self.db_connections[connection_id]
            if connection_id in self.schema_cache:
                del self.schema_cache[connection_id]

            if self.active_connection == connection_id:
                self.active_connection = None

            return True, "Connection closed successfully."
        except Exception as e:
            logger.error(f"Error closing connection: {str(e)}")
            return False, f"Failed to close connection: {str(e)}"

    def close_all_connections(self):
        """Close all open database connections"""
        for connection_id in list(self.connections.keys()):
            self.close_connection(connection_id)

        self.connections = {}
        self.active_connection = None
        self.schema_cache = {}
        self.agents = {}
        self.db_connections = {}

        return True, "All connections closed."


# Initialize the database handler
db_handler = DatabaseHandler()

# Routes


@app.route('/connect', methods=['POST'])
def connect_database():
    """Endpoint to connect to a database"""
    try:
        data = request.json
        db_type = data.get('type', '').lower()

        if db_type == 'mysql':
            host = data.get('host', 'localhost')
            user = data.get('user', 'root')
            password = data.get('password', 'chirag@1234')
            database = data.get('database', 'ecommerce')

            # Validate required fields
            if not all([host, user, database]):
                return jsonify({
                    "success": False,
                    "error": "Missing required connection parameters"
                })

            conn_id, success, message = db_handler.connect_to_mysql(
                host, user, password, database)

            if success:
                return jsonify({
                    "success": True,
                    "connection_id": conn_id,
                    "message": message,
                    "database_info": {
                        "type": "mysql",
                        "host": host,
                        "database": database
                    }
                })
            else:
                return jsonify({
                    "success": False,
                    "error": message
                })

        else:
            return jsonify({
                "success": False,
                "error": f"Unsupported database type: {db_type}"
            })

    except Exception as e:
        logger.error(f"Connect error: {str(e)}")
        return jsonify({
            "success": False,
            "error": f"Connection failed: {str(e)}"
        })


@app.route('/schema', methods=['GET'])
def get_schema():
    """Endpoint to get the database schema"""
    try:
        connection_id = request.args.get('connection_id')
        schema = db_handler.get_schema(connection_id)

        return jsonify({
            "success": True,
            "schema": schema
        })

    except Exception as e:
        logger.error(f"Schema fetch error: {str(e)}")
        return jsonify({
            "success": False,
            "error": f"Failed to fetch schema: {str(e)}"
        })


@app.route('/query', methods=['POST'])
def execute_query():
    """Endpoint to execute a raw SQL query"""
    try:
        data = request.json
        sql = data.get('sql', '')
        connection_id = data.get('connection_id')

        if not sql:
            return jsonify({
                "success": False,
                "error": "No SQL query provided."
            })

        success, result = db_handler.execute_query(sql, connection_id)

        if success:
            return jsonify({
                "success": True,
                "result": result
            })
        else:
            return jsonify({
                "success": False,
                "error": result
            })

    except Exception as e:
        logger.error(f"Query execution error: {str(e)}")
        return jsonify({
            "success": False,
            "error": f"Query execution failed: {str(e)}"
        })


@app.route('/process', methods=['POST'])
def process_natural_language():
    """Endpoint to process natural language queries"""
    try:
        data = request.json
        question = data.get('question', '')
        model = data.get('model', 'Gemini-1.5-Pro')  # Default model
        connection_id = data.get('connection_id')

        if not question:
            return jsonify({
                "success": False,
                "error": "No question provided."
            })

        # Map model choice to Gemini models
        gemini_model = "gemini-1.5-pro"  # Default
        if model == "Gemini-Pro" or model == "GPT-3.5":
            gemini_model = "gemini-pro"
        elif model == "Gemini-1.5-Flash" or model == "GPT-4":
            gemini_model = "gemini-1.5-flash"

        # Process the question
        success, reasoning, sql_query, result = db_handler.process_natural_language(
            question,
            connection_id,
            model_name=gemini_model
        )

        print(sql_query)

        # Always return a valid SQL string (empty string if null)
        sql_query = sql_query or ""

        if not sql_query and success:
            # If we succeeded but have no SQL, something went wrong
            success = False
            result = "Failed to generate SQL query from natural language"

        if success:
            return jsonify({
                "success": True,
                "question": question,
                "reasoning": reasoning,
                "sql": sql_query,
                "result": result
            })
        else:
            error_message = result if result else "Failed to process query"
            return jsonify({
                "success": False,
                "question": question,
                "reasoning": reasoning,
                "sql": sql_query,
                "error": error_message
            })

    except Exception as e:
        import traceback
        logger.error(f"Natural language processing error: {str(e)}")
        logger.error(traceback.format_exc())
        return jsonify({
            "success": False,
            "error": f"Processing failed: {str(e)}",
            "sql": "",
            "reasoning": ""
        })


@app.route('/disconnect', methods=['POST'])
def disconnect():
    """Endpoint to disconnect from a database"""
    try:
        data = request.json
        connection_id = data.get('connection_id')

        success, message = db_handler.close_connection(connection_id)

        return jsonify({
            "success": success,
            "message": message
        })

    except Exception as e:
        logger.error(f"Disconnect error: {str(e)}")
        return jsonify({
            "success": False,
            "error": f"Disconnect failed: {str(e)}"
        })


@app.route('/', methods=['POST'])
def main_endpoint():
    """Main endpoint that processes natural language queries (for compatibility with frontend)"""
    try:
        data = request.json
        question = data.get('question', '')
        model = data.get('model', 'Gemini-1.5-Pro')

        # If no active connection, return error
        if not db_handler.active_connection:
            return jsonify({
                "success": False,
                "error": "No active database connection. Please connect to a database first."
            })

        # Map model choice to Gemini models
        gemini_model = "gemini-1.5-pro"  # Default
        if model == "Gemini-Pro" or model == "GPT-3.5":
            gemini_model = "gemini-pro"
        elif model == "Gemini-1.5-Flash" or model == "GPT-4":
            gemini_model = "gemini-1.5-flash"

        # Process the question
        success, reasoning, sql_query, result = db_handler.process_natural_language(
            question,
            model_name=gemini_model
        )

        if success:
            # Format the response to match what the frontend expects
            response_text = f"Here's what I found based on your question:\n\n"
            response_text += f"SQL Query:\n```sql\n{sql_query}\n```\n\n"

            # Format the result data
            if isinstance(result, list):
                if len(result) > 0:
                    # Convert to DataFrame for better formatting
                    df = pd.DataFrame(result)
                    response_text += f"Results ({len(result)} rows):\n"
                    response_text += df.to_markdown(index=False) if len(df) < 20 else df.head(
                        10).to_markdown(index=False) + "\n\n(showing first 10 rows)"
                else:
                    response_text += "The query returned no results."
            else:
                response_text += f"Result: {json.dumps(result, indent=2)}"

            return jsonify({
                "success": True,
                "result": response_text
            })
        else:
            error_message = result if result else "Unknown error occurred"
            logger.error(f"Processing failed: {error_message}")
            return jsonify({
                "success": False,
                "error": error_message
            })

    except Exception as e:
        logger.error(f"Main endpoint error: {str(e)}")
        return jsonify({
            "success": False,
            "error": f"Processing failed: {str(e)}"
        })


# Gracefully handle application teardown
@app.teardown_appcontext
def shutdown_session(exception=None):
    db_handler.close_all_connections()


if __name__ == '__main__':
    app.run(debug=False, host='0.0.0.0', port=5000)
