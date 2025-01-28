import React, { useState } from "react"
import { Boxes, FileText, Home, LockKeyhole, LogOut } from "lucide-react"
import "../Styles/Sidebar.css"

export function Sidebar({ isDarkMode }) {
    const [isOpen, setIsOpen] = useState(true)

    const toggleSidebar = () => {
        setIsOpen(!isOpen)
    }

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
                    <button className="nav-item">
                        <FileText className="icon" />
                        <span>My Projects</span>
                        <span className="pro-badge">PRO</span>
                    </button>
                    <button className="nav-item">
                        <FileText className="icon" />
                        <span>My Projects</span>
                        <span className="pro-badge">PRO</span>
                    </button>
                    <button className="nav-item">
                        <FileText className="icon" />
                        <span>My Projects</span>
                        <span className="pro-badge">PRO</span>
                    </button>
                    <button className="nav-item">
                        <FileText className="icon" />
                        <span>My Projects</span>
                        <span className="pro-badge">PRO</span>
                    </button>
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
    )
}

