import { useCallback, useEffect, useRef, useState } from "react";
import { EDGE_BY_ID, EDGES, GROUP_COLORS, LEGEND, NODE_H, NODE_W, NODES, WORLD } from "../data/graph.js";

const MODE_NODE = {
	print: { label: "runPrintMode()", sub: "src/modes/print.ts" },
	tui: { label: "<App/> · Ink TUI", sub: "src/tui/App.tsx" },
};

const FIT = { x: 8, y: 10, k: 0.62 };

export function Canvas({ mode, activeNodes, activeEdge, seenNodes, seenEdges }) {
	const wrapRef = useRef(null);
	const [size, setSize] = useState({ w: 900, h: 520 });
	const [view, setView] = useState(FIT);
	const drag = useRef(null);
	const [dragging, setDragging] = useState(false);

	useEffect(() => {
		const el = wrapRef.current;
		if (!el) return;
		const ro = new ResizeObserver(([entry]) => {
			const { width, height } = entry.contentRect;
			setSize({ w: width, h: height });
		});
		ro.observe(el);
		return () => ro.disconnect();
	}, []);

	// Fit the whole graph whenever the viewport changes shape.
	const fit = useCallback(() => {
		const pad = 28;
		const k = Math.min((size.w - pad * 2) / WORLD.width, (size.h - pad * 2) / WORLD.height, 1);
		setView({ k, x: (size.w - WORLD.width * k) / 2, y: (size.h - WORLD.height * k) / 2 });
	}, [size]);

	useEffect(() => {
		fit();
	}, [fit]);

	const onWheel = (e) => {
		const rect = wrapRef.current.getBoundingClientRect();
		const mx = e.clientX - rect.left;
		const my = e.clientY - rect.top;
		setView((v) => {
			const k = Math.min(2.2, Math.max(0.25, v.k * (e.deltaY < 0 ? 1.12 : 1 / 1.12)));
			// Keep the point under the cursor pinned while zooming.
			return { k, x: mx - ((mx - v.x) / v.k) * k, y: my - ((my - v.y) / v.k) * k };
		});
	};

	const onDown = (e) => {
		drag.current = { sx: e.clientX, sy: e.clientY, ox: view.x, oy: view.y };
		setDragging(true);
	};
	const onMove = (e) => {
		if (!drag.current) return;
		const { sx, sy, ox, oy } = drag.current;
		setView((v) => ({ ...v, x: ox + (e.clientX - sx), y: oy + (e.clientY - sy) }));
	};
	const onUp = () => {
		drag.current = null;
		setDragging(false);
	};

	return (
		<div className="canvas-wrap" ref={wrapRef}>
			<svg
				width={size.w}
				height={size.h}
				className={dragging ? "dragging" : ""}
				onWheel={onWheel}
				onPointerDown={onDown}
				onPointerMove={onMove}
				onPointerUp={onUp}
				onPointerLeave={onUp}
			>
				<defs>
					<marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
						<path d="M 0 0 L 10 5 L 0 10 z" fill="#453a32" />
					</marker>
					<marker id="arrow-on" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
						<path d="M 0 0 L 10 5 L 0 10 z" fill="#c96442" />
					</marker>
				</defs>

				<g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
					{EDGES.map((edge) => {
						const on = edge.id === activeEdge;
						const seen = seenEdges.has(edge.id);
						const cls = `e-path ${on ? "active" : seen ? "seen" : ""} ${edge.dashed ? "dashed" : ""}`;
						return (
							<g key={edge.id}>
								<path d={EDGE_BY_ID[edge.id].d} className={cls} markerEnd={on ? "url(#arrow-on)" : "url(#arrow)"} />
								{on ? (
									<>
										<circle r="4.5" className="pulse">
											<animateMotion dur="1.05s" repeatCount="indefinite" path={EDGE_BY_ID[edge.id].d} />
										</circle>
										<EdgeLabel edge={edge} />
									</>
								) : null}
							</g>
						);
					})}

					{NODES.map((node) => {
						const on = activeNodes.includes(node.id);
						const seen = seenNodes.has(node.id);
						const state = on ? "active" : seen ? "seen" : "";
						const dyn = node.dynamic === "mode" ? MODE_NODE[mode] : null;
						return (
							<g key={node.id}>
								<rect
									x={node.x}
									y={node.y}
									width={NODE_W}
									height={NODE_H}
									rx="9"
									className={`n-box ${state}`}
								/>
								<text x={node.x + 14} y={node.y + 23} className={`n-label ${state}`}>
									{dyn ? dyn.label : node.label}
								</text>
								<text x={node.x + 14} y={node.y + 40} className={`n-sub ${seen || on ? "seen" : ""}`}>
									{dyn ? dyn.sub : node.sub}
								</text>
								<rect
									x={node.x}
									y={node.y + 10}
									width="3"
									height={NODE_H - 20}
									rx="1.5"
									fill={GROUP_COLORS[node.group]}
									opacity={on ? 1 : seen ? 0.75 : 0.3}
								/>
							</g>
						);
					})}
				</g>
			</svg>

			<div className="canvas-tools">
				<button type="button" onClick={fit}>
					fit
				</button>
				<button type="button" onClick={() => setView((v) => ({ ...v, k: Math.min(2.2, v.k * 1.2) }))}>
					+
				</button>
				<button type="button" onClick={() => setView((v) => ({ ...v, k: Math.max(0.25, v.k / 1.2) }))}>
					−
				</button>
			</div>
			<div className="legend">
				{LEGEND.map(([group, label]) => (
					<span key={group}>
						<i style={{ background: GROUP_COLORS[group] }} />
						{label}
					</span>
				))}
			</div>
			<div className="canvas-hint">drag to pan · scroll to zoom · ←/→ to step · space to play</div>
		</div>
	);
}

// Park the edge's payload name at the midpoint of its curve.
function EdgeLabel({ edge }) {
	const ref = useRef(null);
	const [pt, setPt] = useState(null);
	useEffect(() => {
		const path = ref.current;
		if (!path) return;
		const p = path.getPointAtLength(path.getTotalLength() / 2);
		setPt({ x: p.x, y: p.y });
	}, []);
	return (
		<>
			<path ref={ref} d={EDGE_BY_ID[edge.id].d} fill="none" stroke="none" />
			{pt ? (
				<>
					<rect x={pt.x - edge.label.length * 3 - 6} y={pt.y - 18} width={edge.label.length * 6 + 12} height="15" rx="4" fill="#14100e" opacity="0.92" />
					<text x={pt.x} y={pt.y - 7} className="e-label" textAnchor="middle">
						{edge.label}
					</text>
				</>
			) : null}
		</>
	);
}
