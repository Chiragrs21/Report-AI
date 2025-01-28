import React, { useState } from "react"
import { Bell, HelpCircle, Moon, Search, Zap, Sun, LogOut, Database, FileSpreadsheet, ChevronDown } from "lucide-react"
import "../Styles/Chatinterface.css"

export function ChatInterface({ isDarkMode, toggleDarkMode }) {
    const [message, setMessage] = useState("")
    const [isProfileOpen, setIsProfileOpen] = useState(false)
    const [activeModel, setActiveModel] = useState("GPT-3.5")
    const [isConnectOpen, setIsConnectOpen] = useState(false)

    const handleSubmit = (e) => {
        e.preventDefault()
        // Handle message submission
        console.log("Message submitted:", message)
        setMessage("")
    }

    const toggleProfile = () => {
        setIsProfileOpen(!isProfileOpen)
    }

    const handleModelClick = (model) => {
        setActiveModel(model)
    }

    const toggleConnect = () => {
        setIsConnectOpen(!isConnectOpen)
    }

    return (
        <div className={`chat-interface ${isDarkMode ? "dark-mode" : ""}`}>
            <header className="main-header">
                <h1>Report AI</h1>
                <div className="connect-dropdown">
                    <button onClick={toggleConnect} className="connect-button">
                        Connect <ChevronDown className="icon" />
                    </button>
                    {isConnectOpen && (
                        <div className="connect-options">
                            <button className="connect-option">
                                <Database className="icon" /> SQL
                            </button>
                            <button className="connect-option">
                                <FileSpreadsheet className="icon" /> Excel
                            </button>
                        </div>
                    )}
                </div>
                <div className="header-actions">
                    <div className="search-container">
                        <Search className="search-icon" />
                        <input type="search" placeholder="Search" className="search-input" />
                    </div>
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
            <div className="chat-area">{/* Chat messages would go here */}</div>
            <div className="message-input-area">
                <form onSubmit={handleSubmit} className="message-form">
                    <input
                        type="text"
                        className="message-input"
                        placeholder="Send a message"
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                    />
                    <button type="submit" className="submit-button">
                        Submit
                    </button>
                </form>
                <p className="disclaimer">
                    Free Research Preview. ChatGPT may produce inaccurate information about people, places, or facts.{" "}
                    <a href="#" className="link">
                        ChatGPT May 12 Version
                    </a>
                </p>
                <div className="footer">
                    <p>© 2023 Horizon UI AI Template. All Rights Reserved.</p>
                    <nav className="footer-nav">
                        <a href="#" className="footer-link">
                            Homepage
                        </a>
                        <a href="#" className="footer-link">
                            License
                        </a>
                        <a href="#" className="footer-link">
                            Terms of Use
                        </a>
                        <a href="#" className="footer-link">
                            Privacy Policy
                        </a>
                    </nav>
                </div>
            </div>
        </div>
    )
}
; <style jsx>{`
  .main-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .connect-dropdown {
    position: relative;
  }
  .connect-button {
    display: flex;
    align-items: center;
    gap: 4px;
    background: none;
    border: none;
    cursor: pointer;
    font-size: 16px;
    color: #1b2559;
  }
  .connect-options {
    position: absolute;
    top: 100%;
    left: 0;
    background-color: white;
    border: 1px solid #e9edf7;
    border-radius: 4px;
    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    z-index: 10;
  }
  .connect-option {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 16px;
    width: 100%;
    border: none;
    background: none;
    cursor: pointer;
    text-align: left;
  }
  .connect-option:hover {
    background-color: #f4f7fe;
  }
  .icon {
    width: 16px;
    height: 16px;
  }
  :global(.dark-mode) .connect-button,
  :global(.dark-mode) .connect-option {
    color: #e2e8f0;
  }
  :global(.dark-mode) .connect-options {
    background-color: #2d3748;
    border-color: #4a5568;
  }
  :global(.dark-mode) .connect-option:hover {
    background-color: #4a5568;
  }
`}</style>

