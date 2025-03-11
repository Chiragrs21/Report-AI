// src/components/LineChart.js
import React from 'react';
import { Line } from 'react-chartjs-2';
import { Chart as ChartJS, LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Legend } from 'chart.js';

ChartJS.register(LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Legend);

const LineChart = ({ data }) => {
    const options = {
        responsive: true,
        plugins: {
            legend: { position: 'top' },
            tooltip: { enabled: true },
        },
        scales: {
            x: { title: { display: true, text: 'Time/Date' } },
            y: { title: { display: true, text: 'Value' } },
        },
    };

    return (
        <div style={{ width: '100%', maxWidth: '800px', margin: '0 auto' }}>
            <Line data={data} options={options} />
        </div>
    );
};

export default LineChart;