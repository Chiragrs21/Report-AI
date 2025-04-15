// src/components/ChartRenderer.js
import React, { useRef } from "react";
import PieChart from "../charts/PieChart";
import LineChart from "../charts/LineChart";
import BarChart from "../charts/BarChart";
import AreaChart from "../charts/AreaChart";
import "../../Styles/work.css" // Ensure this is imported

const ChartRenderer = ({ visualization, chartData }) => {
    const containerRef = useRef(null);

    if (!visualization || !chartData) {
        return <p>No visualization data available.</p>;
    }

    const chartProps = {
        data: chartData,
        containerRef: containerRef,
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: "top" },
                tooltip: { enabled: true },
            },
        },
    };

    return (
        <div ref={containerRef} style={{ width: "100%", height: "100%" }}>
            {(() => {
                switch (visualization) {
                    case "pie":
                        return <PieChart {...chartProps} />;
                    case "line":
                        return <LineChart {...chartProps} />;
                    case "bar":
                        return <BarChart {...chartProps} />;
                    case "area":
                        return <AreaChart {...chartProps} />;
                    case "card":
                        return (
                            <div className="metric-card">
                                {Array.isArray(chartData) && chartData.length > 0 && chartData[0] ? (
                                    <div className="metric-content">
                                        <div className="metric-value-wrapper">
                                            <span className="metric-value">
                                                {chartData[0].value || "N/A"}
                                            </span>
                                            <span className="metric-icon">{chartData[0].icon || "📊"}</span>
                                        </div>
                                        <div className="metric-title">{chartData[0].title || "No Title"}</div>
                                        <div
                                            className={`metric-change ${typeof chartData[0].change === "string" &&
                                                chartData[0].change.startsWith("-")
                                                ? "negative"
                                                : "positive"
                                                }`}
                                        >
                                            {chartData[0].change || ""}
                                        </div>
                                    </div>
                                ) : (
                                    <p>No card data available</p>
                                )}
                            </div>
                        );
                    default:
                        return <p>Unsupported visualization type: {visualization}</p>;
                }
            })()}
        </div>
    );
};

export default ChartRenderer;