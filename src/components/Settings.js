// SettingsPage.js
import React, { useState } from "react";
import { Bell, HelpCircle, Moon, Sun, LogOut, Database, FileSpreadsheet, ChevronDown, Zap, Settings, Brain } from "lucide-react";
import "../Styles/Chatinterface.css";
import { useNavigate } from 'react-router-dom';

function SettingsPage({ isDarkMode, toggleDarkMode, connectionId, setConnectionId }) {
    const [isProfileOpen, setIsProfileOpen] = useState(false);
    const [activeModel, setActiveModel] = useState("GPT-3.5");
    const [isConnectOpen, setIsConnectOpen] = useState(false);

    const [isConnected, setIsConnected] = useState(!!connectionId);
    const [dbInfo, setDbInfo] = useState(null);

    const navigate = useNavigate();

    const toggleProfile = () => setIsProfileOpen(!isProfileOpen);
    const handleModelClick = (model) => setActiveModel(model);
    const toggleConnect = () => setIsConnectOpen(!isConnectOpen);
    const handleSettingsClick = () => navigate('/');

    const disconnectFromDatabase = async () => {
        setIsConnected(false);
        setConnectionId(null);
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
                                    <button className="connect-option">
                                        <Database className="icon" /> MySQL
                                    </button>
                                    <button className="connect-option">
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
                    <button className="icon-button" onClick={handleSettingsClick}>
                        <Settings />
                    </button>
                    <button className="icon-button" onClick={toggleDarkMode}>
                        {isDarkMode ? <Sun /> : <Moon />}
                    </button>
                    <button className="icon-button"><HelpCircle /></button>
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
                                    <LogOut className="icon" /> Sign out
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
                        <Zap className="icon" /> Schema
                    </button>
                    <button
                        className={`model-button ${activeModel === "GPT-4" ? "active" : ""}`}
                        onClick={() => handleModelClick("GPT-4")}
                    >
                        <Brain className="icon" />
                        Memory
                    </button>
                </div>
            </div>
            <div className="settings-content">
                <h2>Settings</h2>
                <p>This is the settings page. Add your configuration options here.</p>
            </div>
        </div>
    );
}

export default SettingsPage; // Changed to default export