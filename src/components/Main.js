import React, { useState, useEffect } from "react";
import { Sidebar } from "../components/Sidebar";
import { ChatInterface } from "../components/Chatinterface";
import "../Styles/Main.css";

export default function Page() {
    const [isDarkMode, setIsDarkMode] = useState(false);
    const [connectionId, setConnectionId] = useState(null);
    const [chatSessionId, setChatSessionId] = useState(null);
    const [chatSessions, setChatSessions] = useState([]);

    const toggleDarkMode = () => {
        setIsDarkMode(!isDarkMode);
    };

    useEffect(() => {
        if (isDarkMode) {
            document.body.classList.add("dark-mode");
        } else {
            document.body.classList.remove("dark-mode");
        }
    }, [isDarkMode]);

    useEffect(() => {
        console.log("Main.js: connectionId updated to", connectionId);
    }, [connectionId]);

    const handleFetchChatHistory = (sessions) => {
        console.log("Main.js: Received chat sessions:", sessions);
        setChatSessions(sessions);
    };

    return (
        <div className="app-container">
            <Sidebar
                isDarkMode={isDarkMode}
                connectionId={connectionId}
                setChatSessionId={setChatSessionId}
                fetchChatHistory={handleFetchChatHistory}
            />
            <main className="main-content">
                <ChatInterface
                    isDarkMode={isDarkMode}
                    toggleDarkMode={toggleDarkMode}
                    connectionId={connectionId}
                    setConnectionId={setConnectionId}
                    chatSessionId={chatSessionId}
                    chatSessions={chatSessions}
                />
            </main>
        </div>
    );
}