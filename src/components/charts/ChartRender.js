// src/components/ChartRenderer.js
import React from 'react';
import PieChart from '../charts/PieChart';
import LineChart from '../charts/LineChart';
import BarChart from '../charts/BarChart';
import AreaChart from '../charts/AreaChart';

const ChartRenderer = ({ visualization, chartData }) => {
    if (!visualization || !chartData) {
        return <p>No visualization data available.</p>;
    }

    switch (visualization) {
        case 'pie':
            return <PieChart data={chartData} />;
        case 'line':
            return <LineChart data={chartData} />;
        case 'bar':
            return <BarChart data={chartData} />;
        case 'area':
            return <AreaChart data={chartData} />;
        default:
            return <p>Unsupported visualization type: {visualization}</p>;
    }
};

export default ChartRenderer;