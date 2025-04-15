import React, { useState, useEffect, useRef } from "react";
import { Bell, HelpCircle, Moon, Sun, LogOut, Database, FileSpreadsheet, ChevronDown, Zap, Settings } from "lucide-react";
import "../Styles/Chatinterface.css";
import { useNavigate } from 'react-router-dom';
import * as d3 from 'd3';

export default function SettingsPage({ isDarkMode, toggleDarkMode, connectionId, setConnectionId, chatSessionId, chatSessions }) {
    const [isProfileOpen, setIsProfileOpen] = useState(false);
    const [activeModel, setActiveModel] = useState("GPT-3.5");
    const [isConnectOpen, setIsConnectOpen] = useState(false);
    const [isConnected, setIsConnected] = useState(!!connectionId);
    const [dbInfo, setDbInfo] = useState(null);
    const [schema, setSchema] = useState(null);
    const svgRef = useRef();

    const navigate = useNavigate();

    useEffect(() => {
        if (connectionId) {
            fetchSchema();
        }
    }, [connectionId]);

    const fetchSchema = async () => {
        try {
            const response = await fetch(`http://localhost:5000/schema?connection_id=${connectionId}`);
            const data = await response.json();
            if (data.success) {
                console.log("Schema:", JSON.stringify(data.schema, null, 2));
                setSchema(data.schema);
                renderSchema(data.schema);
            } else {
                console.error("Failed to fetch schema:", data.error);
            }
        } catch (error) {
            console.error("Error fetching schema:", error);
        }
    };

    const renderSchema = (schemaData) => {
        if (!schemaData || !svgRef.current) return;

        const svg = d3.select(svgRef.current);
        svg.selectAll("*").remove();

        const width = 1500;
        const height = 1500;
        svg.attr("width", width).attr("height", height);

        // Enhanced zoom behavior
        const zoom = d3.zoom()
            .scaleExtent([0.3, 2])
            .on("zoom", (event) => {
                g.attr("transform", event.transform);
            });

        svg.call(zoom);

        const g = svg.append("g");

        // Prepare tables with enhanced layout calculation
        const tables = Object.entries(schemaData.tables).map(([name, details]) => ({
            id: name,
            name,
            columns: details.columns,
            foreign_keys: details.foreign_keys
        }));

        // Calculate table dimensions
        const tableWidth = 280; // Slightly wider tables
        const headerHeight = 40;
        const rowHeight = 25;
        const tablePadding = 20;

        // Calculate table heights
        tables.forEach(table => {
            table.height = headerHeight + (table.columns.length * rowHeight) + tablePadding;
        });

        // Enhanced table positioning
        const horizontalSpacing = 400; // Increased spacing
        const verticalSpacing = 200;   // Increased vertical spacing
        const maxTablesPerRow = 3;

        // Sort tables by their relationships
        const getRelationshipWeight = (table) => {
            const incomingRefs = tables.filter(t =>
                t.foreign_keys.some(fk => fk.ref_table === table.id)
            ).length;
            const outgoingRefs = table.foreign_keys.length;
            return incomingRefs + outgoingRefs;
        };

        tables.sort((a, b) => getRelationshipWeight(b) - getRelationshipWeight(a));

        // Position tables in a grid layout
        let currentX = 100;
        let currentY = 100;
        let maxRowHeight = 0;
        let tableCount = 0;

        tables.forEach(table => {
            if (tableCount % maxTablesPerRow === 0 && tableCount > 0) {
                currentX = 100;
                currentY += maxRowHeight + verticalSpacing;
                maxRowHeight = 0;
            }

            table.x = currentX;
            table.y = currentY;

            maxRowHeight = Math.max(maxRowHeight, table.height);
            currentX += horizontalSpacing;
            tableCount++;
        });

        // Enhanced arrow routing function
        const drawPath = (source, target, sourceColumn, targetColumn) => {
            const sourceColumnIdx = source.columns.findIndex(c => c.name === sourceColumn);
            const targetColumnIdx = target.columns.findIndex(c => c.name === targetColumn);

            if (sourceColumnIdx === -1 || targetColumnIdx === -1) return "";

            const sourceRight = source.x + tableWidth;
            const sourceY = source.y + headerHeight + (sourceColumnIdx + 0.5) * rowHeight;
            const targetLeft = target.x;
            const targetY = target.y + headerHeight + (targetColumnIdx + 0.5) * rowHeight;

            // Calculate path based on relative positions
            const isSourceLeftOfTarget = sourceRight < targetLeft;
            const verticalDistance = Math.abs(targetY - sourceY);
            const horizontalDistance = Math.abs(targetLeft - sourceRight);

            let path = "";

            if (isSourceLeftOfTarget) {
                // Direct path with smooth curve
                const controlPointOffset = Math.min(80, horizontalDistance * 0.4);
                path = `
                    M ${sourceRight} ${sourceY}
                    C ${sourceRight + controlPointOffset} ${sourceY},
                      ${targetLeft - controlPointOffset} ${targetY},
                      ${targetLeft} ${targetY}
                `;
            } else {
                // Complex path for overlapping tables
                const midX = Math.max(sourceRight, targetLeft) + 100;
                const sourceControlY = sourceY + (targetY > sourceY ? 50 : -50);
                const targetControlY = targetY + (targetY > sourceY ? -50 : 50);

                path = `
                    M ${sourceRight} ${sourceY}
                    C ${sourceRight + 50} ${sourceY},
                      ${midX - 50} ${sourceControlY},
                      ${midX} ${sourceControlY}
                    L ${midX} ${targetControlY}
                    C ${midX - 50} ${targetControlY},
                      ${targetLeft + 50} ${targetY},
                      ${targetLeft} ${targetY}
                `;
            }

            return path;
        };

        // Draw tables with enhanced styling
        const tableGroups = g.selectAll(".table")
            .data(tables)
            .enter()
            .append("g")
            .attr("class", "table")
            .attr("transform", d => `translate(${d.x},${d.y})`);

        // Add drop shadow filter
        const defs = svg.append("defs");
        const dropShadow = defs.append("filter")
            .attr("id", "drop-shadow")
            .attr("height", "130%");

        dropShadow.append("feGaussianBlur")
            .attr("in", "SourceAlpha")
            .attr("stdDeviation", 3)
            .attr("result", "blur");

        dropShadow.append("feOffset")
            .attr("in", "blur")
            .attr("dx", 0)
            .attr("dy", 3)
            .attr("result", "offsetBlur");

        const feMerge = dropShadow.append("feMerge");
        feMerge.append("feMergeNode")
            .attr("in", "offsetBlur");
        feMerge.append("feMergeNode")
            .attr("in", "SourceGraphic");

        // Table background
        tableGroups.append("rect")
            .attr("width", tableWidth)
            .attr("height", d => d.height)
            .attr("rx", 8)
            .attr("fill", isDarkMode ? "#2d2d2d" : "#ffffff")
            .attr("stroke", isDarkMode ? "#404040" : "#e2e8f0")
            .attr("stroke-width", 1.5)
            .attr("filter", "url(#drop-shadow)");

        // Table header gradient
        const headerGradient = defs.append("linearGradient")
            .attr("id", "header-gradient")
            .attr("x1", "0%")
            .attr("y1", "0%")
            .attr("x2", "0%")
            .attr("y2", "100%");

        headerGradient.append("stop")
            .attr("offset", "0%")
            .attr("stop-color", isDarkMode ? "#3d3d3d" : "#f8fafc");

        headerGradient.append("stop")
            .attr("offset", "100%")
            .attr("stop-color", isDarkMode ? "#2d2d2d" : "#f1f5f9");

        // Table headers
        tableGroups.append("rect")
            .attr("width", tableWidth)
            .attr("height", headerHeight)
            .attr("rx", 8)
            .attr("fill", "url(#header-gradient)")
            .attr("stroke", isDarkMode ? "#404040" : "#e2e8f0")
            .attr("stroke-width", 1.5);

        // Table titles
        tableGroups.append("text")
            .attr("x", 15)
            .attr("y", 25)
            .text(d => d.name)
            .attr("fill", isDarkMode ? "#ffffff" : "#1e293b")
            .attr("font-weight", "600")
            .attr("font-size", "14px")
            .attr("font-family", "system-ui, -apple-system, sans-serif");

        // Draw columns
        const columnGroups = tableGroups.selectAll(".column")
            .data(d => d.columns)
            .enter()
            .append("g")
            .attr("class", "column")
            .attr("transform", (d, i) => `translate(15, ${headerHeight + 5 + i * rowHeight})`);

        columnGroups.append("text")
            .text(d => `${d.name} (${d.type})${d.key ? ` [${d.key}]` : ''}`)
            .attr("fill", d => {
                if (d.key === "PRI") return "#f43f5e";
                if (d.key === "MUL") return "#3b82f6";
                return isDarkMode ? "#94a3b8" : "#64748b";
            })
            .attr("font-size", "12px")
            .attr("font-family", "ui-monospace, monospace")
            .attr("dy", "1em");

        // Prepare relationship lines
        const links = [];
        tables.forEach(table => {
            table.foreign_keys.forEach(fk => {
                const targetTable = tables.find(t => t.id === fk.ref_table);
                if (targetTable) {
                    links.push({
                        source: table,
                        target: targetTable,
                        sourceColumn: fk.column,
                        targetColumn: fk.ref_column
                    });
                }
            });
        });

        // Arrow marker definition
        defs.append("marker")
            .attr("id", "arrow")
            .attr("viewBox", "0 -5 10 10")
            .attr("refX", 8)
            .attr("refY", 0)
            .attr("markerWidth", 6)
            .attr("markerHeight", 6)
            .attr("orient", "auto")
            .append("path")
            .attr("d", "M0,-5L10,0L0,5")
            .attr("fill", "#3b82f6");

        // Draw relationship lines with enhanced styling
        const link = g.selectAll(".link")
            .data(links)
            .enter()
            .append("path")
            .attr("class", "link")
            .attr("d", d => drawPath(d.source, d.target, d.sourceColumn, d.targetColumn))
            .attr("stroke", "#3b82f6")
            .attr("stroke-width", 1.5)
            .attr("fill", "none")
            .attr("marker-end", "url(#arrow)")
            .attr("opacity", 0.6)
            .style("pointer-events", "all")
            .on("mouseover", function (event, d) {
                d3.select(this)
                    .attr("stroke-width", 2.5)
                    .attr("opacity", 1);

                // Show relationship tooltip
                const tooltip = d3.select("body").append("div")
                    .attr("class", "relationship-tooltip")
                    .style("opacity", 0);

                tooltip.html(`${d.source.name}.${d.sourceColumn} → ${d.target.name}.${d.targetColumn}`)
                    .style("left", (event.pageX + 10) + "px")
                    .style("top", (event.pageY - 10) + "px")
                    .transition()
                    .duration(200)
                    .style("opacity", 1);
            })
            .on("mouseout", function () {
                d3.select(this)
                    .attr("stroke-width", 1.5)
                    .attr("opacity", 0.6);

                // Remove tooltip
                d3.selectAll(".relationship-tooltip").remove();
            });

        // Add tooltips for columns
        const tooltip = d3.select("body").append("div")
            .attr("class", "tooltip")
            .style("opacity", 0);

        columnGroups
            .on("mouseover", function (event, d) {
                tooltip.transition()
                    .duration(200)
                    .style("opacity", .9);
                tooltip.html(`
                    <strong>${d.name}</strong><br/>
                    Type: ${d.type}<br/>
                    ${d.key ? `Key: ${d.key}` : ''}
                `)
                    .style("left", (event.pageX + 10) + "px")
                    .style("top", (event.pageY - 28) + "px");
            })
            .on("mouseout", function () {
                tooltip.transition()
                    .duration(500)
                    .style("opacity", 0);
            });

        // Initial zoom to fit
        const padding = 100; // Increased padding
        const bounds = g.node().getBBox();
        const fullWidth = bounds.width + padding * 2;
        const fullHeight = bounds.height + padding * 2;
        const scale = Math.min(width / fullWidth, height / fullHeight);
        const translateX = (width - bounds.width * scale) / 2 - bounds.x * scale;
        const translateY = (height - bounds.height * scale) / 2 - bounds.y * scale;

        svg.transition()
            .duration(750)
            .call(zoom.transform, d3.zoomIdentity
                .translate(translateX, translateY)
                .scale(scale));
    };
    const toggleProfile = () => setIsProfileOpen(!isProfileOpen);
    const handleModelClick = (model) => setActiveModel(model);
    const toggleConnect = () => setIsConnectOpen(!isConnectOpen);
    const handleSettingsClick = () => navigate('/');

    const disconnectFromDatabase = async () => {
        setIsConnected(false);
        setConnectionId(null);
    };

    return (
        <div className={`chat-interface ${isDarkMode ? "dark-mode" : ""}`}>
            <header className="main-header">
                <h1>Report AI</h1>
                <div className="connect-dropdown">
                    {!isConnected ? (
                        <>
                            <button onClick={toggleConnect} className="connect-button">
                                Connect <ChevronDown className="icon" />
                            </button>
                            {isConnectOpen && (
                                <div className="connect-options">
                                    <button className="connect-option">
                                        <Database className="icon" /> MySQL
                                    </button>
                                    <button className="connect-option">
                                        <Database className="icon" /> SQLite
                                    </button>
                                    <button className="connect-option" disabled>
                                        <FileSpreadsheet className="icon" /> Excel (Coming Soon)
                                    </button>
                                </div>
                            )}
                        </>
                    ) : (
                        <div className="connection-info">
                            <span>Connected: {dbInfo?.type} {dbInfo?.database || dbInfo?.path}</span>
                            <button onClick={disconnectFromDatabase} className="disconnect-button">
                                Disconnect
                            </button>
                        </div>
                    )}
                </div>
                <div className="header-actions">
                    <button className="icon-button settings-button" onClick={handleSettingsClick}>
                        <Settings className="icon" />
                    </button>
                    <button className="icon-button" onClick={toggleDarkMode}>
                        {isDarkMode ? <Sun /> : <Moon />}
                    </button>
                    <button className="icon-button"><HelpCircle /></button>

                    <div className="relative">
                        <button onClick={toggleProfile} className="avatar-button">
                            <img
                                src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/Untitled-vSUaWK4RimrmYxNTRggAT3c0y2qv7H.png"
                                alt="User"
                                className="avatar"
                            />
                        </button>
                        {isProfileOpen && (
                            <div className="profile-dropdown">
                                <div className="user-info">
                                    <p className="user-name">John Doe</p>
                                    <p className="user-email">john.doe@example.com</p>
                                </div>
                                <button className="sign-out-button">
                                    <LogOut className="icon" /> Sign out
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </header>
            <div className="model-selector flex justify-center">
                <div className="model-buttons relative">
                    <button
                        className={`model-button ${activeModel === "GPT-3.5" ? "active" : ""}`}
                        onClick={() => handleModelClick("GPT-3.5")}
                    >
                        <Zap className="icon" /> Schema
                    </button>

                </div>
            </div>
            {activeModel === "GPT-3.5" && (
                <div className="settings-content">
                    <h2>Database Schema</h2>
                    {schema ? (
                        <svg ref={svgRef}></svg>
                    ) : (
                        <p>No schema available. Please connect to a database.</p>
                    )}
                </div>
            )}
            {activeModel === "GPT-4" && (
                <div className="settings-content">
                    <h2>Reports Settings</h2>
                    <p>Reports settings placeholder.</p>
                </div>
            )}
        </div>
    );
}