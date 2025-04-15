import React, { useEffect, useRef } from 'react';
import { Bar } from 'react-chartjs-2';
import { Chart as ChartJS, BarElement, CategoryScale, LinearScale, Tooltip, Legend } from 'chart.js';
import ChartDataLabels from 'chartjs-plugin-datalabels'; // Import datalabels plugin

// Register Chart.js components and the datalabels plugin
ChartJS.register(BarElement, CategoryScale, LinearScale, Tooltip, Legend, ChartDataLabels);

const BarChart = ({ data, containerRef, options }) => {
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

    // Modify the incoming data to assign a unique color to each bar
    const modifiedData = {
        labels: data.labels, // Use labels from props
        datasets: data.datasets.map(dataset => ({
            ...dataset,
            backgroundColor: dataset.data.map((_, index) => {
                // Array of colors for each bar
                const colors = [
                    '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF',
                    '#FF9F40', '#C9CBCF', '#7BC225', '#FF5733', '#00C4B4'
                ];
                return colors[index % colors.length]; // Cycle through colors
            }),
        })),
    };

    // Chart options to display values above bars
    const chartOptions = {
        maintainAspectRatio: false,
        plugins: {
            legend: {
                display: true, // Show legend if needed
            },
            tooltip: {
                enabled: true,
            },
            datalabels: {
                anchor: 'end',        // Anchor at the end (top) of the bar
                align: 'end',         // Align the label above the bar (outside)
                offset: 4,            // Add a small offset to push it above the bar
                color: '#000',        // Label color
                font: {
                    weight: 'bold',
                },
                formatter: (value) => value, // Display the raw value
            },
        },
        scales: {
            y: {
                beginAtZero: true, // Start Y-axis at 0
            },
        },
        ...options, // Merge with any custom options passed as props
    };

    return <Bar ref={chartRef} data={modifiedData} options={chartOptions} />;
};

export default BarChart;