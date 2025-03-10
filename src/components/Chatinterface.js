import React, { useState, useEffect } from "react";
import { Bell, HelpCircle, Moon, Search, ArrowRight, Sun, LogOut, Database, FileSpreadsheet, ChevronDown, Zap } from "lucide-react";
import "../Styles/Chatinterface.css";

export function ChatInterface({ isDarkMode, toggleDarkMode }) {
    const [message, setMessage] = useState("");
    const [isProfileOpen, setIsProfileOpen] = useState(false);
    const [activeModel, setActiveModel] = useState("GPT-3.5");
    const [isConnectOpen, setIsConnectOpen] = useState(false);
    const [messages, setMessages] = useState([]);
    const [showLoadingModal, setShowLoadingModal] = useState(false);
    const [currentStep, setCurrentStep] = useState(1);

    // Database connection state
    const [isConnected, setIsConnected] = useState(false);
    const [connectionId, setConnectionId] = useState(null);
    const [dbInfo, setDbInfo] = useState(null);
    const [connectionError, setConnectionError] = useState(null);

    // Database credentials state (for connection modal)
    const [dbType, setDbType] = useState("mysql");
    const [dbHost, setDbHost] = useState("localhost");
    const [dbUser, setDbUser] = useState("root");
    const [dbPassword, setDbPassword] = useState("");
    const [dbName, setDbName] = useState("ecommerce");
    const [dbPath, setDbPath] = useState("");
    const [showConnectionForm, setShowConnectionForm] = useState(false);

    useEffect(() => {
        if (showLoadingModal && !showConnectionForm) {
            const timer = setInterval(() => {
                setCurrentStep((prev) => {
                    if (prev >= 4) {
                        clearInterval(timer);
                        setTimeout(() => {
                            setShowLoadingModal(false);
                            if (!connectionError) {
                                setIsConnected(true);
                                // Add a system message to indicate successful connection
                                setMessages(prevMessages => [...prevMessages, {
                                    id: Date.now(),
                                    text: `Successfully connected to ${dbInfo ? dbInfo.type : ''} database${dbInfo && dbInfo.database ? ` '${dbInfo.database}'` : ''}. You can now ask questions about your data.`,
                                    isUser: false,
                                    isSystem: true
                                }]);
                            }
                        }, 1000);
                        return 4;
                    }
                    return prev + 1;
                });
            }, 1000);

            return () => clearInterval(timer);
        }
    }, [showLoadingModal, connectionError, dbInfo, showConnectionForm]);

    const connectToDatabase = async (e) => {
        if (e) e.preventDefault();

        setShowConnectionForm(false);
        setShowLoadingModal(true);
        setCurrentStep(1);
        setConnectionError(null);

        const connectionData = {
            type: dbType
        };

        if (dbType === "mysql") {
            connectionData.host = dbHost;
            connectionData.user = dbUser;
            connectionData.password = dbPassword;
            connectionData.database = dbName;
        } else if (dbType === "sqlite") {
            connectionData.path = dbPath;
        }

        try {
            const response = await fetch('http://localhost:5000/connect', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(connectionData)
            });

            const data = await response.json();

            if (data.success) {
                setConnectionId(data.connection_id);
                setDbInfo(data.database_info);
                // Let the loading modal complete its animation
            } else {
                setConnectionError(data.error);
                setCurrentStep(4); // Force completion of loading modal
                setTimeout(() => {
                    setShowLoadingModal(false);
                    setMessages(prevMessages => [...prevMessages, {
                        id: Date.now(),
                        text: `Error connecting to database: ${data.error}`,
                        isUser: false,
                        isSystem: true,
                        isError: true
                    }]);
                }, 1000);
            }
        } catch (error) {
            setConnectionError(error.message);
            setCurrentStep(4); // Force completion of loading modal
            setTimeout(() => {
                setShowLoadingModal(false);
                setMessages(prevMessages => [...prevMessages, {
                    id: Date.now(),
                    text: `Error connecting to database: ${error.message}`,
                    isUser: false,
                    isSystem: true,
                    isError: true
                }]);
            }, 1000);
        }
    };

    const disconnectFromDatabase = async () => {
        if (!connectionId) return;

        try {
            const response = await fetch('http://localhost:5000/disconnect', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ connection_id: connectionId })
            });

            const data = await response.json();

            if (data.success) {
                setIsConnected(false);
                setConnectionId(null);
                setDbInfo(null);
                setMessages(prevMessages => [...prevMessages, {
                    id: Date.now(),
                    text: "Disconnected from database.",
                    isUser: false,
                    isSystem: true
                }]);
            } else {
                setMessages(prevMessages => [...prevMessages, {
                    id: Date.now(),
                    text: `Error disconnecting: ${data.error}`,
                    isUser: false,
                    isSystem: true,
                    isError: true
                }]);
            }
        } catch (error) {
            setMessages(prevMessages => [...prevMessages, {
                id: Date.now(),
                text: `Error disconnecting: ${error.message}`,
                isUser: false,
                isSystem: true,
                isError: true
            }]);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!message.trim()) return;

        // Add user message to chat
        setMessages([...messages, {
            id: Date.now(),
            text: message,
            isUser: true
        }]);

        const userQuestion = message;
        setMessage(""); // Clear input

        // If not connected to a database, show error
        if (!isConnected) {
            setMessages(prevMessages => [...prevMessages, {
                id: Date.now(),
                text: "Please connect to a database first before asking questions.",
                isUser: false,
                isSystem: true,
                isError: true
            }]);
            return;
        }

        try {
            // Show loading state
            setShowLoadingModal(true);
            setCurrentStep(1);

            // Use the /process endpoint instead of / for better integration
            const response = await fetch('http://localhost:5000/process', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    question: userQuestion,
                    model: activeModel === "GPT-3.5" ? "gemini-1.5-pro" : "gemini-1.5-flash",
                    connection_id: connectionId
                })
            });

            const data = await response.json();

            // Hide loading modal
            setShowLoadingModal(false);

            if (data.success) {
                // Format the response nicely
                let formattedResponse = `**Query**: ${data.question}\n\n`;
                formattedResponse += `**SQL**:\n\`\`\`sql\n${data.sql}\n\`\`\`\n\n`;

                // Format the results
                formattedResponse += "**Results**:\n";
                if (Array.isArray(data.result)) {
                    if (data.result.length > 0) {
                        // Create a markdown table for results
                        const columns = Object.keys(data.result[0]);
                        formattedResponse += "| " + columns.join(" | ") + " |\n";
                        formattedResponse += "| " + columns.map(() => "---").join(" | ") + " |\n";

                        // Limit to first 10 rows for large results
                        const rowsToShow = data.result.length > 10 ? data.result.slice(0, 10) : data.result;
                        rowsToShow.forEach(row => {
                            formattedResponse += "| " + columns.map(col => row[col] !== null ? row[col] : "NULL").join(" | ") + " |\n";
                        });

                        if (data.result.length > 10) {
                            formattedResponse += `\n*Showing 10 of ${data.result.length} rows*`;
                        }
                    } else {
                        formattedResponse += "No results found for this query.";
                    }
                } else {
                    formattedResponse += JSON.stringify(data.result, null, 2);
                }

                // Add reasoning from AI
                formattedResponse += `\n\n**AI Analysis**:\n${data.reasoning}`;

                setMessages(prevMessages => [...prevMessages, {
                    id: Date.now(),
                    text: formattedResponse,
                    isUser: false
                }]);
            } else {
                setMessages(prevMessages => [...prevMessages, {
                    id: Date.now(),
                    text: `Error: ${data.error}`,
                    isUser: false,
                    isError: true
                }]);
            }
        } catch (error) {
            setShowLoadingModal(false);
            setMessages(prevMessages => [...prevMessages, {
                id: Date.now(),
                text: `Error: ${error.message}`,
                isUser: false,
                isError: true
            }]);
        }
    };

    const toggleProfile = () => {
        setIsProfileOpen(!isProfileOpen);
    };

    const handleModelClick = (model) => {
        setActiveModel(model);
    };

    const toggleConnect = () => {
        setIsConnectOpen(!isConnectOpen);
    };

    const handleConnectOption = (type) => {
        setDbType(type);
        setShowConnectionForm(true);
        setIsConnectOpen(false);
    };

    return (
        <div className={`chat-interface ${isDarkMode ? "dark-mode" : ""}`}>
            <header className="main-header">
                <h1>Report AI</h1>
                <div className="connect-dropdown">
                    {!isConnected ? (
                        <>
                            <button onClick={toggleConnect} className="connect-button">
                                Connect <ChevronDown className="icon" />
                            </button>
                            {isConnectOpen && (
                                <div className="connect-options">
                                    <button
                                        className="connect-option"
                                        onClick={() => handleConnectOption("mysql")}
                                    >
                                        <Database className="icon" /> MySQL
                                    </button>
                                    <button
                                        className="connect-option"
                                        onClick={() => handleConnectOption("sqlite")}
                                    >
                                        <Database className="icon" /> SQLite
                                    </button>
                                    <button className="connect-option" disabled>
                                        <FileSpreadsheet className="icon" /> Excel (Coming Soon)
                                    </button>
                                </div>
                            )}
                        </>
                    ) : (
                        <div className="connection-info">
                            <span>Connected: {dbInfo?.type} {dbInfo?.database || dbInfo?.path}</span>
                            <button onClick={disconnectFromDatabase} className="disconnect-button">
                                Disconnect
                            </button>
                        </div>
                    )}
                </div>
                <div className="header-actions">
                    <button className="icon-button">
                        <Bell />
                    </button>
                    <button className="icon-button" onClick={toggleDarkMode}>
                        {isDarkMode ? <Sun /> : <Moon />}
                    </button>
                    <button className="icon-button">
                        <HelpCircle />
                    </button>
                    <div className="relative">
                        <button onClick={toggleProfile} className="avatar-button">
                            <img
                                src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/Untitled-vSUaWK4RimrmYxNTRggAT3c0y2qv7H.png"
                                alt="User"
                                className="avatar"
                            />
                        </button>
                        {isProfileOpen && (
                            <div className="profile-dropdown">
                                <div className="user-info">
                                    <p className="user-name">John Doe</p>
                                    <p className="user-email">john.doe@example.com</p>
                                </div>
                                <button className="sign-out-button">
                                    <LogOut className="icon" />
                                    Sign out
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </header>
            <div className="model-selector flex justify-center">
                <div className="model-buttons relative">
                    <button
                        className={`model-button ${activeModel === "GPT-3.5" ? "active" : ""}`}
                        onClick={() => handleModelClick("GPT-3.5")}
                    >
                        <Zap className="icon" />
                        Insights
                    </button>
                    <button
                        className={`model-button ${activeModel === "GPT-4" ? "active" : ""}`}
                        onClick={() => handleModelClick("GPT-4")}
                    >
                        Reports
                    </button>
                </div>
            </div>
            <div className="chat-area">
                {messages.length === 0 && (
                    <div className="welcome-message">
                        <h2>Welcome to Report AI</h2>
                        <p>Connect to your database to get started. Ask questions about your data in natural language.</p>
                    </div>
                )}
                {messages.map((msg) => (
                    <div key={msg.id} className={`message-container ${msg.isUser ? 'user-message' : 'ai-message'} ${msg.isSystem ? 'system-message' : ''} ${msg.isError ? 'error-message' : ''}`}>
                        <img
                            src={msg.isUser ? "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/Untitled-vSUaWK4RimrmYxNTRggAT3c0y2qv7H.png" : "https://ui-avatars.com/api/?name=AI&background=4F46E5&color=fff"}
                            alt={msg.isUser ? "User" : "AI"}
                            className="message-avatar"
                        />
                        <div className="message-bubble">
                            {msg.isSystem ? (
                                <div className="system-message-content">{msg.text}</div>
                            ) : (
                                // Use a simple markdown rendering for code blocks and formatting
                                <div
                                    className="message-content"
                                    dangerouslySetInnerHTML={{
                                        __html: msg.text
                                            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                                            .replace(/```sql\n([\s\S]*?)\n```/g, '<pre class="sql-block"><code>$1</code></pre>')
                                            .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
                                            .replace(/\n/g, '<br/>')
                                    }}
                                />
                            )}
                        </div>
                    </div>
                ))}
            </div>
            <div className="message-input-area">
                <form onSubmit={handleSubmit} className="message-form">
                    <div className="input-container">
                        <input
                            type="text"
                            className="message-input"
                            placeholder={isConnected ? "Ask a question about your data..." : "Connect to a database first..."}
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                            disabled={!isConnected}
                        />
                        <button type="submit" className="submit-button" disabled={!isConnected}>
                            <ArrowRight className="submit-icon" />
                        </button>
                    </div>
                </form>
            </div>

            {/* Loading Modal */}
            {showLoadingModal && !showConnectionForm && (
                <div className="loading-modal-overlay">
                    <div className={`loading-modal ${isDarkMode ? 'dark' : ''}`}>
                        <div className="spinner-container">
                            <div className={`spinner ${currentStep === 4 ? (connectionError ? 'error' : 'complete') : ''}`}>
                                <div className="progress-text">
                                    {currentStep === 4 ? (
                                        connectionError ? (
                                            <svg viewBox="0 0 24 24" className="error-mark">
                                                <path fill="currentColor" d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                                            </svg>
                                        ) : (
                                            <svg viewBox="0 0 24 24" className="checkmark">
                                                <path fill="currentColor" d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                                            </svg>
                                        )
                                    ) : (
                                        <>{currentStep}/4</>
                                    )}
                                </div>
                            </div>
                        </div>
                        <div className="loading-content">
                            <h3>{connectionId ? "Processing Query" : "Connecting to Database"}</h3>
                            <p className="status-text">
                                {connectionId ? (
                                    // Processing query steps
                                    <>
                                        {currentStep === 1 && "Analyzing your question..."}
                                        {currentStep === 2 && "Generating SQL query..."}
                                        {currentStep === 3 && "Executing query..."}
                                        {currentStep === 4 && (connectionError ? "Error: " + connectionError : "Query complete!")}
                                    </>
                                ) : (
                                    // Connection steps
                                    <>
                                        {currentStep === 1 && "Authenticating credentials..."}
                                        {currentStep === 2 && "Establishing secure link..."}
                                        {currentStep === 3 && "Synchronizing database..."}
                                        {currentStep === 4 && (connectionError ? "Error: " + connectionError : "Connection successful!")}
                                    </>
                                )}
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* Connection Form Modal */}
            {showConnectionForm && (
                <div className="loading-modal-overlay">
                    <div className={`connection-form-modal ${isDarkMode ? 'dark' : ''}`}>
                        <h3>Connect to {dbType === "mysql" ? "MySQL" : "SQLite"} Database</h3>
                        <form onSubmit={connectToDatabase}>
                            {dbType === "mysql" ? (
                                <>
                                    <div className="form-group">
                                        <label>Host:</label>
                                        <input
                                            type="text"
                                            value={dbHost}
                                            onChange={(e) => setDbHost(e.target.value)}
                                            required
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label>Database:</label>
                                        <input
                                            type="text"
                                            value={dbName}
                                            onChange={(e) => setDbName(e.target.value)}
                                            required
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label>Username:</label>
                                        <input
                                            type="text"
                                            value={dbUser}
                                            onChange={(e) => setDbUser(e.target.value)}
                                            required
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label>Password:</label>
                                        <input
                                            type="password"
                                            value={dbPassword}
                                            onChange={(e) => setDbPassword(e.target.value)}
                                        />
                                    </div>
                                </>
                            ) : (
                                <div className="form-group">
                                    <label>Database File Path:</label>
                                    <input
                                        type="text"
                                        value={dbPath}
                                        onChange={(e) => setDbPath(e.target.value)}
                                        placeholder="/path/to/database.db"
                                        required
                                    />
                                </div>
                            )}
                            <div className="form-actions">
                                <button
                                    type="button"
                                    className="cancel-button"
                                    onClick={() => setShowConnectionForm(false)}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="connect-submit-button"
                                >
                                    Connect
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}