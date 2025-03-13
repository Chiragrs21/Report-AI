// src/components/Dashboard.js
import React, { useState, useEffect } from "react";
import { ArrowRight, ChevronRight, ChevronLeft, ShoppingCart, Clock } from "lucide-react";
import { WidthProvider, Responsive } from "react-grid-layout";
import ChartRenderer from "../components/charts/ChartRender";
import "react-grid-layout/css/styles.css";
import "../Styles/Dashboard.css";

const ResponsiveGridLayout = WidthProvider(Responsive);

const calculateLayout = (components, containerWidth) => {
    const layout = components.map((comp, index) => ({
        i: comp.component_id || `comp-${index}`,
        x: comp.x || (index % 2) * 6,
        y: comp.y || Math.floor(index / 2) * 3,
        w: comp.w || (comp.visualization === "card" ? 3 : 6),
        h: comp.h || (comp.visualization === "card" ? 2 : 3),
        minW: comp.visualization === "card" ? 3 : 3,
        minH: comp.visualization === "card" ? 2 : 3,
    }));
    return layout;
};

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
    const [cartComponents, setCartComponents] = useState([]);
    const [dashboardData, setDashboardData] = useState(null);
    const [dashboardHistory, setDashboardHistory] = useState([]);
    const [selectedComponents, setSelectedComponents] = useState([]);
    const [suggestions, setSuggestions] = useState([]);
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);

    const availableComponents = [
        { id: "card", label: "Metric Card", icon: "📊" },
        { id: "pie", label: "Pie Chart", icon: "📊" },
        { id: "bar", label: "Bar Chart", icon: "📈" },
        { id: "line", label: "Line Chart", icon: "📉" },
        { id: "table", label: "Table", icon: "📋" },
    ];

    // Fetch dashboard history
    useEffect(() => {
        const fetchDashboardHistory = async () => {
            if (!chatSessionId) return;

            try {
                const response = await fetch(
                    `http://localhost:5000/get_dashboard_history?chat_session_id=${chatSessionId}`
                );
                const data = await response.json();
                console.log("API Response:", data); // Debug log
                if (data.success) {
                    setDashboardHistory(data.history || []);
                    // Handle both old flat array and new wrapped structure
                    if (data.history && data.history.length > 0) {
                        const latestDashboard = Array.isArray(data.history[0])
                            ? data.history[0] // Old flat array
                            : data.history[0]?.components || []; // New wrapped structure
                        setDashboardData({
                            layout: latestDashboard,
                            results: latestDashboard,
                        });
                    } else {
                        setDashboardData(null);
                    }
                } else {
                    console.error("Failed to fetch dashboard history:", data.error);
                    setDashboardHistory([]);
                    setDashboardData(null);
                }
            } catch (error) {
                console.error("Error fetching dashboard history:", error);
                setDashboardHistory([]);
                setDashboardData(null);
            }
        };

        fetchDashboardHistory();
    }, [chatSessionId]);

    // Update history after creating a new dashboard
    useEffect(() => {
        if (dashboardData && chatSessionId) {
            const fetchUpdatedHistory = async () => {
                try {
                    const response = await fetch(
                        `http://localhost:5000/get_dashboard_history?chat_session_id=${chatSessionId}`
                    );
                    const data = await response.json();
                    console.log("Updated API Response:", data); // Debug log
                    if (data.success) {
                        setDashboardHistory(data.history || []);
                    } else {
                        console.error("Failed to fetch updated history:", data.error);
                        setDashboardHistory([]);
                    }
                } catch (error) {
                    console.error("Error fetching updated history:", error);
                    setDashboardHistory([]);
                }
            };
            fetchUpdatedHistory();
        }
    }, [dashboardData, chatSessionId]);

    const handleAddToCart = (componentId) => {
        setCartComponents((prev) => {
            const existing = prev.find((c) => c.id === componentId);
            if (existing) {
                return prev.map((c) =>
                    c.id === componentId ? { ...c, quantity: c.quantity + 1 } : c
                );
            }
            return [...prev, { id: componentId, quantity: 1 }];
        });
    };

    const handleRemoveFromCart = (componentId) => {
        setCartComponents((prev) => {
            const existing = prev.find((c) => c.id === componentId);
            if (existing.quantity > 1) {
                return prev.map((c) =>
                    c.id === componentId ? { ...c, quantity: c.quantity - 1 } : c
                );
            }
            return prev.filter((c) => c.id !== componentId);
        });
    };

    const handleQuantityChange = (componentId, newQuantity) => {
        setCartComponents((prev) => {
            if (newQuantity <= 0) {
                return prev.filter((c) => c.id !== componentId);
            }
            return prev.map((c) =>
                c.id === componentId ? { ...c, quantity: newQuantity } : c
            );
        });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (cartComponents.length === 0) {
            setIsSidebarOpen(true);
            setMessages((prev) => [
                ...prev,
                {
                    id: Date.now(),
                    text: "Please select at least one component from the sidebar before creating a dashboard.",
                    isUser: false,
                    isSystem: true,
                    isError: true,
                },
            ]);
            return;
        }

        if (!prompt.trim() || !chatSessionId || !connectionId) {
            setMessages((prev) => [
                ...prev,
                {
                    id: Date.now(),
                    text: "Please fill in the prompt and ensure you're connected.",
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
            const componentsToSend = cartComponents.flatMap((comp) =>
                Array(comp.quantity).fill(comp.id)
            );

            const response = await fetch("http://localhost:5000/create_dashboard", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    prompt,
                    connection_id: connectionId,
                    chat_session_id: chatSessionId,
                    components: componentsToSend,
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
                    {
                        id: Date.now(),
                        text: `Error creating dashboard: ${data.error}`,
                        isUser: false,
                        isSystem: true,
                        isError: true,
                    },
                ]);
            }
        } catch (error) {
            setMessages((prev) => [
                ...prev,
                {
                    id: Date.now(),
                    text: `Error: ${error.message}`,
                    isUser: false,
                    isSystem: true,
                    isError: true,
                },
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

    const totalComponentCount = cartComponents.reduce(
        (sum, comp) => sum + comp.quantity,
        0
    );

    const handleSelectHistory = (historyItem) => {
        const components = Array.isArray(historyItem) ? historyItem : historyItem?.components || [];
        setDashboardData({
            layout: components,
            results: components,
        });
    };

    return (
        <div className="dashboard-layout">
            <div className={`dashboard-main ${!isSidebarOpen ? "expanded" : ""}`}>
                <div className="dashboard-history">
                    <h3>Recent Dashboards</h3>
                    {dashboardHistory.length > 0 ? (
                        <div className="history-list">
                            {dashboardHistory.map((item, index) => (
                                <div
                                    key={index}
                                    className="history-item"
                                    onClick={() => handleSelectHistory(item)}
                                >
                                    {/* <Clock className="history-icon" /> */}
                                    {/* <span className="history-prompt">
                                        {Array.isArray(item)
                                            ? item[0]?.question || "Untitled Dashboard"
                                            : item.prompt || item?.components[0]?.question || "Untitled Dashboard"}
                                    </span> */}
                                    {/* <span className="history-timestamp">
                                        {Array.isArray(item)
                                            ? item[0]?.timestamp
                                                ? new Date(item[0].timestamp * 1000).toLocaleString()
                                                : new Date().toLocaleString()
                                            : item.timestamp
                                                ? new Date(item.timestamp * 1000).toLocaleString()
                                                : new Date().toLocaleString()}
                                    </span> */}
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p>No recent dashboards available.</p>
                    )}
                </div>

                {!dashboardData ? (
                    <>
                        <div className="welcome-message">
                            <h2>Create Your Dashboard</h2>
                            <p>Add components from the sidebar and enter a prompt to generate your dashboard.</p>
                        </div>
                        <div className="message-input-area">
                            <form onSubmit={handleSubmit} className="message-form">
                                <div className="input-container">
                                    <input
                                        type="text"
                                        value={prompt}
                                        onChange={(e) => setPrompt(e.target.value)}
                                        placeholder="Ask a question or use /create for visualizations..."
                                        className="message-input"
                                        disabled={!connectionId || !chatSessionId || cartComponents.length === 0}
                                    />
                                    <button
                                        type="submit"
                                        className="submit-button"
                                        disabled={
                                            !connectionId ||
                                            !chatSessionId ||
                                            !prompt.trim() ||
                                            cartComponents.length === 0
                                        }
                                    >
                                        <ArrowRight className="submit-icon" />
                                    </button>
                                </div>
                            </form>
                        </div>
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
                        <div style={{ width: "100%", height: "auto" }}>
                            <ResponsiveGridLayout
                                className="dashboard-grid"
                                layouts={{
                                    lg: calculateLayout(dashboardData.layout, 1200),
                                    md: calculateLayout(dashboardData.layout, 996),
                                    sm: calculateLayout(dashboardData.layout, 768),
                                    xs: calculateLayout(dashboardData.layout, 480),
                                    xxs: calculateLayout(dashboardData.layout, 0),
                                }}
                                breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
                                cols={{ lg: 12, md: 9, sm: 6, xs: 4, xxs: 2 }}
                                rowHeight={100}
                                isDraggable={true}
                                isResizable={true}
                                compactType="vertical"
                                margin={[20, 20]}
                                containerPadding={[20, 20]}
                                onLayoutChange={(newLayout) => {
                                    const updatedLayout = dashboardData.layout.map((comp) => {
                                        const layoutItem = newLayout.find(
                                            (item) => item.i === comp.component_id
                                        );
                                        return layoutItem
                                            ? { ...comp, x: layoutItem.x, y: layoutItem.y, w: layoutItem.w, h: layoutItem.h }
                                            : comp;
                                    });
                                    setDashboardData((prev) => ({ ...prev, layout: updatedLayout }));
                                    saveLayout(updatedLayout);
                                }}
                                useCSSTransforms={true}
                                autoSize={true}
                            >
                                {dashboardData.layout.map((component) => (
                                    <div
                                        key={component.component_id}
                                        className="dashboard-component"
                                        data-grid={{
                                            x: component.x || 0,
                                            y: component.y || 0,
                                            w: component.w || 4,
                                            h: component.h || 4,
                                            minW: 3,
                                            minH: 3,
                                        }}
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
                                    </div>
                                ))}
                            </ResponsiveGridLayout>
                        </div>
                    </div>
                )}
            </div>

            <div className={`components-sidebar ${isSidebarOpen ? "open" : "closed"}`}>
                <button className="sidebar-toggle" onClick={() => setIsSidebarOpen(!isSidebarOpen)}>
                    {isSidebarOpen ? <ChevronRight /> : <ChevronLeft />}
                </button>

                <div className="cart-counter">
                    <ShoppingCart />
                    <span className="counter">{totalComponentCount}</span>
                </div>

                <div className="sidebar-content">
                    <h3>Available Components</h3>
                    <div className="component-list">
                        {availableComponents.map((comp) => {
                            const inCart = cartComponents.find((c) => c.id === comp.id);
                            return (
                                <div
                                    key={comp.id}
                                    className={`component-item ${inCart ? "selected" : ""}`}
                                    onClick={() => (inCart ? null : handleAddToCart(comp.id))}
                                >
                                    <span className="component-icon">{comp.icon}</span>
                                    <span className="component-label">{comp.label}</span>
                                    {inCart ? (
                                        <span className="added-badge">Added</span>
                                    ) : (
                                        <span className="add-badge">+ Add</span>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    {cartComponents.length > 0 && (
                        <div className="component-cart">
                            <h3>Selected Components</h3>
                            <div className="cart-items">
                                {cartComponents.map((comp) => {
                                    const compInfo = availableComponents.find((c) => c.id === comp.id);
                                    return (
                                        <div key={comp.id} className="cart-item">
                                            <span className="item-info">
                                                <span className="item-icon">{compInfo.icon}</span>
                                                <span className="item-label">{compInfo.label}</span>
                                            </span>
                                            <div className="quantity-selector">
                                                <button
                                                    onClick={() => handleRemoveFromCart(comp.id)}
                                                    className="quantity-button"
                                                >
                                                    -
                                                </button>
                                                <input
                                                    type="number"
                                                    value={comp.quantity}
                                                    onChange={(e) =>
                                                        handleQuantityChange(comp.id, parseInt(e.target.value) || 0)
                                                    }
                                                    min="0"
                                                    className="quantity-input"
                                                />
                                                <button
                                                    onClick={() => handleAddToCart(comp.id)}
                                                    className="quantity-button"
                                                >
                                                    +
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}