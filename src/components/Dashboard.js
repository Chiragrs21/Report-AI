import React, { useState, useEffect } from "react";
import { ArrowRight } from "lucide-react";
import { WidthProvider, Responsive } from "react-grid-layout";
import ChartRenderer from "../components/charts/ChartRender";
import "react-grid-layout/css/styles.css";
import "../Styles/Dashboard.css";

const ResponsiveGridLayout = WidthProvider(Responsive);

export function DashboardContent({
    connectionId,
    chatSessionId,
    isDarkMode,
    setMessages,
    showLoadingModal,
    setShowLoadingModal,
    currentStep,
    setCurrentStep,
}) {
    const [prompt, setPrompt] = useState("");
    const [selectedComponents, setSelectedComponents] = useState([]);
    const [dashboardData, setDashboardData] = useState(null);
    const [suggestions, setSuggestions] = useState([]);
    const availableComponents = ["pie", "bar", "line", "table"];

    useEffect(() => {
        console.log("dashboardData:", dashboardData);
        if (dashboardData && dashboardData.layout) {
            dashboardData.layout.forEach((component, index) => {
                console.log(`Component ${index}:`, component);
            });
        }
    }, [dashboardData]);

    const handleComponentChange = (component) => {
        setSelectedComponents((prev) =>
            prev.includes(component) ? prev.filter((c) => c !== component) : [...prev, component]
        );
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!prompt.trim() || selectedComponents.length === 0 || !chatSessionId || !connectionId) {
            setMessages((prev) => [
                ...prev,
                {
                    id: Date.now(),
                    text: "Please fill in the prompt and select at least one component.",
                    isUser: false,
                    isSystem: true,
                    isError: true,
                },
            ]);
            return;
        }

        setShowLoadingModal(true);
        setCurrentStep(1);

        try {
            const response = await fetch("http://localhost:5000/create_dashboard", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    prompt,
                    connection_id: connectionId,
                    chat_session_id: chatSessionId,
                    components: selectedComponents,
                }),
            });

            const data = await response.json();
            console.log("API Response:", data);

            if (data.success) {
                setDashboardData({ layout: data.layout || [], results: data.results || [] });
                setSuggestions(data.suggestions || []);
            } else {
                setMessages((prev) => [
                    ...prev,
                    { id: Date.now(), text: `Error creating dashboard: ${data.error}`, isUser: false, isSystem: true, isError: true },
                ]);
            }
        } catch (error) {
            setMessages((prev) => [
                ...prev,
                { id: Date.now(), text: `Error: ${error.message}`, isUser: false, isSystem: true, isError: true },
            ]);
            console.error("Fetch Error:", error);
        } finally {
            setShowLoadingModal(false);
        }
    };

    const saveLayout = async (layout) => {
        await fetch("http://localhost:5000/save_dashboard", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chat_session_id: chatSessionId, layout }),
        });
    };

    const TableRenderer = ({ data }) => {
        if (!data || !Array.isArray(data) || data.length === 0) {
            return <p>No data available</p>;
        }
        const headers = Object.keys(data[0]);
        return (
            <table className="dashboard-table">
                <thead>
                    <tr>
                        {headers.map((header) => (
                            <th key={header}>{header}</th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {data.map((row, index) => (
                        <tr key={index}>
                            {headers.map((header) => (
                                <td key={header}>{row[header] !== null ? row[header] : "NULL"}</td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        );
    };

    const layout = dashboardData?.layout?.map((comp) => ({
        i: comp.component_id || `comp-${Math.random()}`,
        x: comp.x !== undefined ? comp.x : 0,
        y: comp.y !== undefined ? comp.y : 0,
        w: comp.w !== undefined ? comp.w : 4,
        h: comp.h !== undefined ? comp.h : 4,
    })) || [];

    return (
        <div className="dashboard-content">
            {!dashboardData ? (
                <>
                    <div className="welcome-message">
                        <h2>Create Your Dashboard</h2>
                        <p>Select components and enter a prompt to generate your dashboard.</p>
                    </div>
                    <div className="component-selector">
                        <label>Select Components:</label>
                        {availableComponents.map((comp) => (
                            <div key={comp} className="checkbox-option">
                                <input
                                    type="checkbox"
                                    id={comp}
                                    checked={selectedComponents.includes(comp)}
                                    onChange={() => handleComponentChange(comp)}
                                />
                                <label htmlFor={comp}>{comp.charAt(0).toUpperCase() + comp.slice(1)}</label>
                            </div>
                        ))}
                    </div>
                    <div className="message-input-area">
                        <form onSubmit={handleSubmit} className="message-form">
                            <div className="input-container">
                                <input
                                    type="text"
                                    value={prompt}
                                    onChange={(e) => setPrompt(e.target.value)}
                                    placeholder="Enter your prompt (e.g., 'Show sales by region')"
                                    className="message-input"
                                    disabled={!connectionId || !chatSessionId}
                                />
                                <button
                                    type="submit"
                                    className="submit-button"
                                    disabled={!connectionId || !chatSessionId || !prompt.trim() || selectedComponents.length === 0}
                                >
                                    <ArrowRight className="submit-icon" />
                                </button>
                            </div>
                        </form>
                    </div>
                    {suggestions.length > 0 && (
                        <div className="suggestions">
                            <h3>Suggestions</h3>
                            {suggestions.map((sug) => (
                                <div key={sug.component_id} className="suggestion-item">
                                    <p>{`Component '${sug.original}' not suitable: ${sug.reasoning}`}</p>
                                    <button
                                        onClick={() => {
                                            setSelectedComponents((prev) =>
                                                prev.map((c) => (c === sug.original ? sug.suggestion : c))
                                            );
                                            setSuggestions((prev) =>
                                                prev.filter((s) => s.component_id !== sug.component_id)
                                            );
                                        }}
                                    >
                                        Use {sug.suggestion} Instead
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </>
            ) : (
                <div className="dashboard-display">
                    <h2>Your Dashboard</h2>
                    <button
                        onClick={() => {
                            window.location.href = `http://localhost:5000/export_dashboard?chat_session_id=${chatSessionId}`;
                        }}
                        className="export-button"
                    >
                        Export to Excel
                    </button>
                    {dashboardData?.layout?.length > 0 ? (
                        <ResponsiveGridLayout
                            className="dashboard-grid"
                            layouts={{ lg: layout }}
                            cols={{ lg: 12, md: 10, sm: 6, xs: 4, xxs: 2 }}
                            rowHeight={100}
                            isDraggable={true}
                            isResizable={true}
                            compactType="vertical"
                            preventCollision={false}
                            onLayoutChange={(layout) => {
                                console.log("New layout:", layout);
                                const updatedLayout = layout.map((item) => {
                                    const originalComp = dashboardData.layout.find(
                                        (comp) => comp.component_id === item.i
                                    );
                                    return originalComp
                                        ? {
                                            ...originalComp,
                                            x: item.x,
                                            y: item.y,
                                            w: item.w,
                                            h: item.h,
                                        }
                                        : item;
                                });
                                console.log("Updated layout:", updatedLayout);
                                setDashboardData((prev) => ({ ...prev, layout: updatedLayout }));
                                saveLayout(updatedLayout);
                            }}
                        >
                            {dashboardData.layout.map((component) => (
                                <div
                                    key={component.component_id}
                                    className="dashboard-component"
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    <h3>
                                        {typeof component.visualization === "string" && component.visualization
                                            ? component.visualization.charAt(0).toUpperCase() + component.visualization.slice(1)
                                            : "Unknown Component"}
                                    </h3>
                                    <div className="chart-wrapper">
                                        {component.visualization === "table" ? (
                                            <TableRenderer data={component.result || []} />
                                        ) : (
                                            <ChartRenderer
                                                visualization={component.visualization || "pie"}
                                                chartData={component.result?.data || component.result || {}}
                                            />
                                        )}
                                    </div>
                                    <p>{component.reasoning || "No reasoning provided"}</p>
                                </div>
                            ))}
                        </ResponsiveGridLayout>
                    ) : suggestions.length > 0 ? (
                        <div className="suggestions">
                            <h3>Component Suggestions</h3>
                            {suggestions.map((sug) => (
                                <div key={sug.component_id} className="suggestion-item">
                                    <p>{`Component '${sug.original}' not suitable: ${sug.reasoning}`}</p>
                                    <button
                                        onClick={() => {
                                            setSelectedComponents((prev) =>
                                                prev.map((c) => (c === sug.original ? sug.suggestion : c))
                                            );
                                            setSuggestions((prev) =>
                                                prev.filter((s) => s.component_id !== sug.component_id)
                                            );
                                        }}
                                    >
                                        Use {sug.suggestion} Instead
                                    </button>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p>No components available to display. Please try a different prompt or check your database schema.</p>
                    )}
                </div>
            )}
        </div>
    );
}