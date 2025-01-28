import React, { useState, useEffect } from "react"
import { Sidebar } from "../components/Sidebar"
import { ChatInterface } from "../components/Chatinterface"
import "../Styles/Main.css"

export default function Page() {
    const [isDarkMode, setIsDarkMode] = useState(false)

    const toggleDarkMode = () => {
        setIsDarkMode(!isDarkMode)
    }

    useEffect(() => {
        if (isDarkMode) {
            document.body.classList.add("dark-mode")
        } else {
            document.body.classList.remove("dark-mode")
        }
    }, [isDarkMode])

    return (
        <div className="app-container">
            <Sidebar isDarkMode={isDarkMode} />
            <main className="main-content">
                <ChatInterface isDarkMode={isDarkMode} toggleDarkMode={toggleDarkMode} />
            </main>
        </div>
    )
}

