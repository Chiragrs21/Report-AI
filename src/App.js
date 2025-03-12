// App.js
import React, { useState, useEffect } from "react";
import { Routes, Route } from "react-router-dom";
import { Sidebar } from "./components/Sidebar";
import Signup from "./components/auth/Signup";
import { ChatInterface } from "./components/Chatinterface";
import Settings from "./components/Settings";
import "./Styles/Main.css";

const Layout = ({ children, isDarkMode, connectionId, setChatSessionId, fetchChatHistory }) => (
  <div className="app-container">
    <Sidebar
      isDarkMode={isDarkMode}
      connectionId={connectionId}
      setChatSessionId={setChatSessionId}
      fetchChatHistory={fetchChatHistory}
    />
    <main className="main-content">{children}</main>
  </div>
);

const App = () => {
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
    console.log("App.js: connectionId updated to", connectionId);
  }, [connectionId]);

  const handleFetchChatHistory = (sessions) => {
    console.log("App.js: Received chat sessions:", sessions);
    setChatSessions(sessions);
  };

  return (
    <div>
      <Routes>
        <Route path="/login" element={<Signup />} />
        <Route
          path="/"
          element={
            <Layout
              isDarkMode={isDarkMode}
              connectionId={connectionId}
              setChatSessionId={setChatSessionId}
              fetchChatHistory={handleFetchChatHistory}
            >
              <ChatInterface
                isDarkMode={isDarkMode}
                toggleDarkMode={toggleDarkMode}
                connectionId={connectionId}
                setConnectionId={setConnectionId}
                chatSessionId={chatSessionId}
                chatSessions={chatSessions}
              />
            </Layout>
          }
        />
        <Route
          path="/settings"
          element={
            <Layout
              isDarkMode={isDarkMode}
              connectionId={connectionId}
              setChatSessionId={setChatSessionId}
              fetchChatHistory={handleFetchChatHistory}
            >
              <Settings
                isDarkMode={isDarkMode}
                toggleDarkMode={toggleDarkMode}
                connectionId={connectionId}
                setConnectionId={setConnectionId}
                chatSessionId={chatSessionId}
                chatSessions={chatSessions}
              />
            </Layout>
          }
        />
      </Routes>
    </div>
  );
};

export default App;