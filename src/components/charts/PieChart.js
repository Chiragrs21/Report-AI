// src/components/PieChart.js
import React from 'react';
import { Pie } from 'react-chartjs-2';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';

ChartJS.register(ArcElement, Tooltip, Legend);

const PieChart = ({ data }) => {
    const options = {
        responsive: true,
        plugins: {
            legend: { position: 'top' },
            tooltip: { enabled: true },
        },
    };


    return (
        <div style={{ width: '100%', maxWidth: '600px', margin: '0 auto' }}>
            <Pie data={data} options={options} />
        </div>
    );
};

export default PieChart;