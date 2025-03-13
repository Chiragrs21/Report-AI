// src/components/AreaChart.js
import React, { useEffect, useRef } from 'react';
import { Line } from 'react-chartjs-2';
import { Chart as ChartJS, LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Legend, Filler } from 'chart.js';

ChartJS.register(LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Legend, Filler);

const AreaChart = ({ data, containerRef, options }) => {
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

    const defaultOptions = {
        ...options,
        elements: {
            ...options?.elements,
            line: { fill: true } // Makes it an area chart
        }
    };

    return <Line ref={chartRef} data={data} options={defaultOptions} />;
};

export default AreaChart;