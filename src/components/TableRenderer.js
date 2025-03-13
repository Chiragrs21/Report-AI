import React from 'react';

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

export default TableRenderer;