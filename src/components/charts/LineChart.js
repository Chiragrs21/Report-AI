// src/components/LineChart.js
import React, { useEffect, useRef } from 'react';
import { Line } from 'react-chartjs-2';
import { Chart as ChartJS, LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Legend } from 'chart.js';

ChartJS.register(LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Legend);

const LineChart = ({ data, containerRef, options }) => {
    const chartRef = useRef(null);

    useEffect(() => {
        const resizeObserver = new ResizeObserver(() => {
            if (chartRef.current) {
                chartRef.current.resize();
            }
        });

        if (containerRef.current) {
            resizeObserver.observe(containerRef.current);
        }

        return () => {
            if (containerRef.current) {
                resizeObserver.unobserve(containerRef.current);
            }
        };
    }, [containerRef]);

    return <Line ref={chartRef} data={data} options={options} />;
};

export default LineChart;