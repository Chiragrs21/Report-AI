// src/components/ChartRenderer.js
import React, { useRef, useEffect } from 'react';
import PieChart from '../charts/PieChart';
import LineChart from '../charts/LineChart';
import BarChart from '../charts/BarChart';
import AreaChart from '../charts/AreaChart';

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
                legend: { position: 'top' },
                tooltip: { enabled: true }
            }
        }
    };

    return (
        <div ref={containerRef} style={{ width: '100%', height: '100%' }}>
            {(() => {
                switch (visualization) {
                    case 'pie':
                        return <PieChart {...chartProps} />;
                    case 'line':
                        return <LineChart {...chartProps} />;
                    case 'bar':
                        return <BarChart {...chartProps} />;
                    case 'area':
                        return <AreaChart {...chartProps} />;
                    default:
                        return <p>Unsupported visualization type: {visualization}</p>;
                }
            })()}
        </div>
    );
};

export default ChartRenderer;