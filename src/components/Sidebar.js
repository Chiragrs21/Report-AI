import React, { useState, useEffect } from "react";
import { Boxes, FileText, LogOut } from "lucide-react";
import "../Styles/Sidebar.css";

export function Sidebar({ isDarkMode, connectionId, setChatSessionId, fetchChatHistory }) {
    const [isOpen, setIsOpen] = useState(true);
    const [chatSessions, setChatSessions] = useState([]);

    // Fetch chat history when connectionId changes
    useEffect(() => {
        console.log("Sidebar.js: connectionId changed to", connectionId);
        if (connectionId) {
            fetchChatSessions();
        } else {
            setChatSessions([]); // Clear sessions if disconnected
        }
    }, [connectionId]);

    const toggleSidebar = () => {
        setIsOpen(!isOpen);
    };

    const fetchChatSessions = async () => {
        try {
            console.log("Sidebar.js: Fetching chat history for connectionId", connectionId);
            const response = await fetch(`http://localhost:5000/chat_history?connection_id=${connectionId}`);
            const data = await response.json();
            console.log("Sidebar.js: Chat history response:", data);
            if (data.success) {
                setChatSessions(data.chat_sessions);
                if (fetchChatHistory) fetchChatHistory(data.chat_sessions);
            } else {
                console.error("Sidebar.js: Chat history fetch failed:", data.error);
            }
        } catch (error) {
            console.error("Sidebar.js: Fetch chat history error:", error);
        }
    };

    const startNewChat = async () => {
        if (!connectionId) return;

        // Prompt user for a chat name
        const chatName = prompt("Enter a name for this chat:", "New Chat");
        if (!chatName) return; // Cancelled or empty name

        try {
            const response = await fetch('http://localhost:5000/new_chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ connection_id: connectionId, name: chatName })
            });
            const data = await response.json();
            console.log("Sidebar.js: New chat response:", data);
            if (data.success) {
                setChatSessionId(data.chat_session_id); // Set new session
                fetchChatSessions(); // Refresh chat list
            } else {
                console.error("Sidebar.js: New chat failed:", data.error);
            }
        } catch (error) {
            console.error('New chat error:', error);
        }
    };

    const loadChatSession = (sessionId) => {
        setChatSessionId(sessionId); // Set selected session
    };

    return (
        <div className={`sidebar ${isOpen ? "open" : ""} ${isDarkMode ? "dark-mode" : ""}`}>
            <button className="sidebar-toggle" onClick={toggleSidebar}>
                {isOpen ? "Close" : "Open"} Sidebar
            </button>
            <div className="sidebar-content">
                <div className="sidebar-header">
                    <Boxes className="icon" />
                    <span>Report AI</span>
                </div>
                <nav className="sidebar-nav">
                    {connectionId && (
                        <>
                            <button className="nav-item" onClick={startNewChat}>
                                <FileText className="icon" />
                                <span>New Chat</span>
                            </button>
                            <div className="chat-history">
                                <h3>Previous Chats</h3>
                                <ul>
                                    {chatSessions.map((session, index) => (
                                        <React.Fragment key={session.chat_session_id}>
                                            <li
                                                onClick={() => loadChatSession(session.chat_session_id)}
                                                className="chat-session-item"
                                            >
                                                {!session.name ? "New chat" : session.name} ({new Date(session.start_time * 1000).toLocaleDateString()})
                                            </li>
                                            {index < chatSessions.length - 1 && <hr className="chat-separator" />}
                                        </React.Fragment>
                                    ))}
                                </ul>
                            </div>
                        </>
                    )}
                </nav>
            </div>
            <div className="user-profile">
                <img
                    src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/Untitled-vSUaWK4RimrmYxNTRggAT3c0y2qv7H.png"
                    alt="User"
                    className="avatar"
                />
                <span className="username">Chirag R S</span>
                <button className="logout-button">
                    <LogOut className="icon" />
                </button>
            </div>
        </div>
    );
}