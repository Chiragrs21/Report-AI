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

    // New state variables for database connection
    const [isConnected, setIsConnected] = useState(false);
    const [connectionId, setConnectionId] = useState(null);
    const [dbInfo, setDbInfo] = useState(null);
    const [showConnectionForm, setShowConnectionForm] = useState(false);
    const [connectionType, setConnectionType] = useState("");
    const [connectionForm, setConnectionForm] = useState({
        host: "localhost",
        user: "root",
        password: "",
        database: "",
        path: ""
    });

    useEffect(() => {
        if (showLoadingModal) {
            const timer = setInterval(() => {
                setCurrentStep((prev) => {
                    if (prev >= 4) {
                        clearInterval(timer);
                        setTimeout(() => setShowLoadingModal(false), 1000);
                        return 4;
                    }
                    return prev + 1;
                });
            }, 1000);

            return () => clearInterval(timer);
        }
    }, [showLoadingModal]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (message.trim()) {
            // Add the user message to the chat
            setMessages([...messages, {
                id: Date.now(),
                text: message,
                isUser: true
            }]);

            setMessage("");

            // Don't proceed if not connected to a database
            if (!isConnected) {
                setMessages(prevMessages => [...prevMessages, {
                    id: Date.now(),
                    text: "Please connect to a database first using the Connect button.",
                    isUser: false
                }]);
                return;
            }

            try {
                // Show loading state
                setShowLoadingModal(true);

                // Send the request to the backend
                const response = await fetch('http://localhost:5000/', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        question: message,
                        model: activeModel,
                        connection_id: connectionId
                    })
                });

                const data = await response.json();

                if (data.error) {
                    // Handle error
                    setMessages((prevMessages) => [...prevMessages, {
                        id: Date.now(),
                        text: "Error: " + data.error,
                        isUser: false
                    }]);
                } else {
                    // Add response message from the server
                    setMessages((prevMessages) => [...prevMessages, {
                        id: Date.now(),
                        text: data.result,
                        isUser: false
                    }]);
                }
            } catch (err) {
                console.error("Error during fetch:", err);
                setMessages((prevMessages) => [...prevMessages, {
                    id: Date.now(),
                    text: "Error: " + err.message,
                    isUser: false
                }]);
            } finally {
                setShowLoadingModal(false);
            }
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

    // Handle database connection type selection
    const handleConnectionTypeSelect = (type) => {
        setConnectionType(type);
        setShowConnectionForm(true);
        setIsConnectOpen(false);
    };

    // Handle connection form input changes
    const handleConnectionFormChange = (e) => {
        const { name, value } = e.target;
        setConnectionForm({
            ...connectionForm,
            [name]: value
        });
    };

    // Connect to database
    const connectToDatabase = async (e) => {
        e.preventDefault();

        setShowLoadingModal(true);
        setCurrentStep(1);

        try {
            const payload = {
                type: connectionType
            };

            if (connectionType === "mysql") {
                payload.host = connectionForm.host;
                payload.user = connectionForm.user;
                payload.password = connectionForm.password;
                payload.database = connectionForm.database;
            } else if (connectionType === "sqlite") {
                payload.path = connectionForm.path;
            }

            const response = await fetch('http://localhost:5000/connect', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            const data = await response.json();

            if (data.success) {
                setIsConnected(true);
                setConnectionId(data.connection_id);
                setDbInfo(data.database_info);
                setShowConnectionForm(false);

                // Add a system message
                setMessages(prevMessages => [...prevMessages, {
                    id: Date.now(),
                    text: `Connected to ${connectionType} database${connectionType === 'mysql' ? ` (${connectionForm.database} on ${connectionForm.host})` : connectionType === 'sqlite' ? ` (${connectionForm.path})` : ''}. You can now ask questions about your data.`,
                    isUser: false
                }]);
            } else {
                // Handle connection error
                setMessages(prevMessages => [...prevMessages, {
                    id: Date.now(),
                    text: `Error connecting to database: ${data.error}`,
                    isUser: false
                }]);
            }
        } catch (err) {
            console.error("Connection error:", err);
            setMessages(prevMessages => [...prevMessages, {
                id: Date.now(),
                text: `Error: ${err.message}`,
                isUser: false
            }]);
        } finally {
            setTimeout(() => {
                setShowLoadingModal(false);
            }, 3000); // Give some time for the animation to complete
        }
    };

    // Disconnect from database
    const disconnectDatabase = async () => {
        if (!connectionId) return;

        try {
            const response = await fetch('http://localhost:5000/disconnect', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    connection_id: connectionId
                })
            });

            const data = await response.json();

            if (data.success) {
                setIsConnected(false);
                setConnectionId(null);
                setDbInfo(null);

                // Add a system message
                setMessages(prevMessages => [...prevMessages, {
                    id: Date.now(),
                    text: "Disconnected from database. You'll need to connect again to ask questions.",
                    isUser: false
                }]);
            } else {
                // Handle disconnect error
                setMessages(prevMessages => [...prevMessages, {
                    id: Date.now(),
                    text: `Error disconnecting: ${data.error}`,
                    isUser: false
                }]);
            }
        } catch (err) {
            console.error("Disconnect error:", err);
        }
    };

    return (
        <div className={`chat-interface ${isDarkMode ? "dark-mode" : ""}`}>
            <header className="main-header">
                <h1>Report AI</h1>
                <div className="connect-dropdown">
                    <button
                        onClick={isConnected ? disconnectDatabase : toggleConnect}
                        className={`connect-button ${isConnected ? 'connected' : ''}`}
                    >
                        {isConnected ? 'Disconnect' : 'Connect'} {!isConnected && <ChevronDown className="icon" />}
                    </button>
                    {isConnectOpen && !isConnected && (
                        <div className="connect-options">
                            <button
                                className="connect-option"
                                onClick={() => handleConnectionTypeSelect('sqlite')}
                            >
                                <Database className="icon" /> SQLite
                            </button>
                            <button
                                className="connect-option"
                                onClick={() => handleConnectionTypeSelect('mysql')}
                            >
                                <Database className="icon" /> MySQL
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

            {/* Connection Form */}
            {showConnectionForm && (
                <div className="connection-form-container">
                    <h2>Connect to {connectionType === 'mysql' ? 'MySQL' : 'SQLite'} Database</h2>
                    <form onSubmit={connectToDatabase}>
                        {connectionType === 'mysql' && (
                            <>
                                <div className="form-group">
                                    <label>Host:</label>
                                    <input
                                        type="text"
                                        name="host"
                                        value={connectionForm.host}
                                        onChange={handleConnectionFormChange}
                                        required
                                    />
                                </div>
                                <div className="form-group">
                                    <label>User:</label>
                                    <input
                                        type="text"
                                        name="user"
                                        value={connectionForm.user}
                                        onChange={handleConnectionFormChange}
                                        required
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Password:</label>
                                    <input
                                        type="password"
                                        name="password"
                                        value={connectionForm.password}
                                        onChange={handleConnectionFormChange}
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Database:</label>
                                    <input
                                        type="text"
                                        name="database"
                                        value={connectionForm.database}
                                        onChange={handleConnectionFormChange}
                                        required
                                    />
                                </div>
                            </>
                        )}
                        {connectionType === 'sqlite' && (
                            <div className="form-group">
                                <label>Database Path:</label>
                                <input
                                    type="text"
                                    name="path"
                                    value={connectionForm.path}
                                    onChange={handleConnectionFormChange}
                                    placeholder="/path/to/your/database.db"
                                    required
                                />
                            </div>
                        )}
                        <div className="form-actions">
                            <button type="button" onClick={() => setShowConnectionForm(false)} className="cancel-button">
                                Cancel
                            </button>
                            <button type="submit" className="connect-submit-button">
                                Connect
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* Chat Messages */}
            <div className="chat-messages">
                {messages.length === 0 ? (
                    <div className="welcome-message">
                        <div className="welcome-icon">
                            <Zap size={40} />
                        </div>
                        <h2>Welcome to Report AI</h2>
                        <p>Connect to a database and ask questions in natural language to get insights from your data.</p>
                    </div>
                ) : (
                    messages.map((msg) => (
                        <div key={msg.id} className={`message ${msg.isUser ? 'user-message' : 'ai-message'}`}>
                            <div className="message-avatar">
                                {msg.isUser ? (
                                    <img src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/Untitled-vSUaWK4RimrmYxNTRggAT3c0y2qv7H.png" alt="User" />
                                ) : (
                                    <div className="ai-avatar">AI</div>
                                )}
                            </div>
                            <div className="message-content">
                                <div className="message-text">{msg.text}</div>
                                <div className="message-time">{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Model Selection */}
            <div className="model-selection">
                <div className="model-options">
                    <button
                        className={`model-option ${activeModel === 'GPT-3.5' ? 'active' : ''}`}
                        onClick={() => handleModelClick('GPT-3.5')}
                    >
                        GPT-3.5
                    </button>
                    <button
                        className={`model-option ${activeModel === 'GPT-4' ? 'active' : ''}`}
                        onClick={() => handleModelClick('GPT-4')}
                    >
                        GPT-4
                    </button>
                </div>
            </div>

            {/* Input Area */}
            <form onSubmit={handleSubmit} className="chat-input-area">
                <input
                    type="text"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Ask a question about your data..."
                    className="chat-input"
                    disabled={!isConnected}
                />
                <button
                    type="submit"
                    className="send-button"
                    disabled={!message.trim() || !isConnected}
                >
                    <ArrowRight />
                </button>
            </form>

            {/* Connection Status */}
            {isConnected && dbInfo && (
                <div className="connection-status">
                    <Database size={16} className="connection-icon" />
                    <span>
                        Connected to {dbInfo.type === 'mysql'
                            ? `MySQL (${dbInfo.database} on ${dbInfo.host})`
                            : `SQLite (${dbInfo.path})`
                        }
                    </span>
                </div>
            )}

            {/* Loading Modal */}
            {showLoadingModal && (
                <div className="loading-modal">
                    <div className="loading-content">
                        <h3>Processing your query...</h3>
                        <div className="loading-steps">
                            <div className={`loading-step ${currentStep >= 1 ? 'active' : ''}`}>
                                <div className="step-number">1</div>
                                <div className="step-text">Analyzing question</div>
                            </div>
                            <div className={`loading-step ${currentStep >= 2 ? 'active' : ''}`}>
                                <div className="step-number">2</div>
                                <div className="step-text">Generating SQL</div>
                            </div>
                            <div className={`loading-step ${currentStep >= 3 ? 'active' : ''}`}>
                                <div className="step-number">3</div>
                                <div className="step-text">Querying database</div>
                            </div>
                            <div className={`loading-step ${currentStep >= 4 ? 'active' : ''}`}>
                                <div className="step-number">4</div>
                                <div className="step-text">Preparing results</div>
                            </div>
                        </div>
                        <div className="loading-spinner"></div>
                    </div>
                </div>
            )}

            {/* Footer information */}
            <footer className="chat-footer">
                <div className="footer-info">
                    <span>© 2023 Report AI</span>
                    <span>•</span>
                    <a href="#">Terms of Service</a>
                    <span>•</span>
                    <a href="#">Privacy Policy</a>
                </div>
            </footer>
        </div>
    );
}