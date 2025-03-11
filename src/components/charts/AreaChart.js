// src/components/AreaChart.js
import React from 'react';
import { Line } from 'react-chartjs-2'; // Area chart is a filled line chart in Chart.js
import { Chart as ChartJS, LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Legend, Filler } from 'chart.js';

ChartJS.register(LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Legend, Filler);

const AreaChart = ({ data }) => {
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
        elements: {
            line: { fill: true }, // Makes it an area chart
        },
    };

    return (
        <div style={{ width: '100%', maxWidth: '800px', margin: '0 auto' }}>
            <Line data={data} options={options} />
        </div>
    );
};

export default AreaChart;