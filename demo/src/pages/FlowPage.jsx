import { useCallback, useEffect, useMemo, useState } from "react";
import { HResizer, Resizer, useInspectorWidth, useTerminalHeight } from "../components/Resizer.jsx";
import { Canvas } from "../components/Canvas.jsx";
import { EventLog, Messages, Payloads, StepHead } from "../components/Inspector.jsx";
import { Terminal } from "../components/Terminal.jsx";
import { replay, stepsFor, viewStep } from "../data/scenario.js";

const SPEEDS = [
	{ label: "0.5×", ms: 3400 },
	{ label: "1×", ms: 1700 },
	{ label: "2×", ms: 850 },
];

// The whole view is three values, so keep them in the URL hash — #tui/deny/18
// reopens exactly this frame of the run.
function readHash() {
	const [mode, answer, index] = (window.location.hash.slice(1) || "").split("/");
	return {
		mode: mode === "tui" ? "tui" : "print",
		answer: answer === "deny" ? "deny" : "allow",
		index: Number.isFinite(Number(index)) ? Math.max(0, Number(index)) : 0,
	};
}

export default function FlowPage({ nav }) {
	const [mode, setMode] = useState(() => readHash().mode); // print | tui
	const [answer, setAnswer] = useState(() => readHash().answer); // the permission decision
	const [index, setIndex] = useState(() => readHash().index);
	const [playing, setPlaying] = useState(false);
	const [speed, setSpeed] = useState(1);
	const [tab, setTab] = useState("payload");
	const [width, setWidth] = useInspectorWidth();
	const [termHeight, setTermHeight] = useTerminalHeight(300);

	const steps = useMemo(() => stepsFor(mode), [mode]);
	const step = useMemo(() => viewStep(steps[index] ?? steps[0], mode, answer), [steps, index, mode, answer]);
	const world = useMemo(() => replay(steps, index, mode, answer), [steps, index, mode, answer]);

	// Everything touched so far stays lit, so the canvas reads as a trace and not
	// just a spotlight.
	const { seenNodes, seenEdges } = useMemo(() => {
		const nodes = new Set();
		const edges = new Set();
		for (let i = 0; i <= index && i < steps.length; i++) {
			const s = viewStep(steps[i], mode, answer);
			for (const n of s.nodes) nodes.add(n);
			if (s.edge) edges.add(s.edge);
		}
		return { seenNodes: nodes, seenEdges: edges };
	}, [steps, index, mode, answer]);

	const atEnd = index >= steps.length - 1;

	useEffect(() => {
		if (!playing) return;
		if (atEnd) {
			setPlaying(false);
			return;
		}
		const t = setTimeout(() => setIndex((i) => Math.min(steps.length - 1, i + 1)), SPEEDS[speed].ms);
		return () => clearTimeout(t);
	}, [playing, index, atEnd, speed, steps.length]);

	// Switching mode changes the step list, so clamp rather than reset — you keep
	// your place in the run while the renderer swaps underneath.
	useEffect(() => {
		setIndex((i) => Math.min(i, steps.length - 1));
	}, [steps.length]);

	useEffect(() => {
		window.location.hash = `${mode}/${answer}/${index}`;
	}, [mode, answer, index]);

	const go = useCallback((delta) => {
		setPlaying(false);
		setIndex((i) => Math.max(0, Math.min(steps.length - 1, i + delta)));
	}, [steps.length]);

	useEffect(() => {
		const onKey = (e) => {
			if (e.key === "ArrowRight") go(1);
			else if (e.key === "ArrowLeft") go(-1);
			else if (e.key === " ") {
				e.preventDefault();
				setPlaying((p) => !p);
			} else if (e.key === "Home") {
				setPlaying(false);
				setIndex(0);
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [go]);

	return (
		<div className="app">
			<header className="header">
				<div className="brand">
					<b>cogent</b>
					<span>dataflow · main() → runAgent() → gemini.complete() → tools → your terminal</span>
				</div>
				{nav}
				<div className="spacer" />

				<div className="field">
					<span>mode</span>
					<div className="seg">
						<button type="button" className={mode === "print" ? "on" : ""} onClick={() => setMode("print")}>
							--print
						</button>
						<button type="button" className={mode === "tui" ? "on" : ""} onClick={() => setMode("tui")}>
							TUI
						</button>
					</div>
				</div>

				<div className="field">
					<span>Write permission</span>
					<div className="seg">
						<button type="button" className={answer === "allow" ? "on" : ""} onClick={() => setAnswer("allow")}>
							allow
						</button>
						<button type="button" className={answer === "deny" ? "on" : ""} onClick={() => setAnswer("deny")}>
							deny
						</button>
					</div>
				</div>

				<div className="field">
					<span>provider</span>
					<code style={{ color: "var(--tool)" }}>gemini / gemini-2.5-flash</code>
				</div>
			</header>

			<div className="body">
				<div className="left">
					<Canvas
						mode={mode}
						activeNodes={step.nodes}
						activeEdge={step.edge}
						seenNodes={seenNodes}
						seenEdges={seenEdges}
					/>

					<div className="controls">
						<button type="button" onClick={() => { setPlaying(false); setIndex(0); }}>
							⟲
						</button>
						<button type="button" onClick={() => go(-1)} disabled={index === 0}>
							◀
						</button>
						<button type="button" className="primary" onClick={() => setPlaying((p) => !p)} disabled={atEnd}>
							{playing ? "❚❚ pause" : "▶ play"}
						</button>
						<button type="button" onClick={() => go(1)} disabled={atEnd}>
							▶
						</button>
						<div className="seg">
							{SPEEDS.map((s, i) => (
								<button type="button" key={s.label} className={speed === i ? "on" : ""} onClick={() => setSpeed(i)}>
									{s.label}
								</button>
							))}
						</div>

						<div className="rail">
							{steps.map((s, i) => (
								<button
									type="button"
									key={s.id}
									title={`${s.phase} — ${typeof s.title === "string" ? s.title : s.title[mode]}`}
									className={`rail-tick ${i === index ? "now" : i < index ? "done" : ""} ${
										i > 0 && steps[i - 1].phase !== s.phase ? "phase-start" : ""
									}`}
									onClick={() => {
										setPlaying(false);
										setIndex(i);
									}}
								/>
							))}
						</div>
						<span className="counter">{step.phase}</span>
					</div>

					<HResizer height={termHeight} setHeight={setTermHeight} fallback={300} />

					<div className="term-wrap" style={{ height: termHeight }}>
						<div className="pane-head">
							<span>{mode === "print" ? "stdout — modes/print.ts" : "terminal — Ink TUI"}</span>
						</div>
						<Terminal lines={world.term} mode={mode} done={atEnd} />
					</div>
				</div>

				<Resizer setWidth={setWidth} />

				<div className="right" style={{ width }}>
					<StepHead step={step} index={index} total={steps.length} />
					<div className="pane-head">
						<span>inspector</span>
						<div className="tabs">
							<button type="button" className={tab === "payload" ? "on" : ""} onClick={() => setTab("payload")}>
								payload
							</button>
							<button type="button" className={tab === "messages" ? "on" : ""} onClick={() => setTab("messages")}>
								messages[{world.messages.length}]
							</button>
							<button type="button" className={tab === "events" ? "on" : ""} onClick={() => setTab("events")}>
								events[{world.events.length}]
							</button>
						</div>
					</div>
					<div className="inspect">
						{tab === "payload" ? <Payloads payloads={step.payloads} /> : null}
						{tab === "messages" ? <Messages messages={world.messages} /> : null}
						{tab === "events" ? <EventLog events={world.events} stepIndex={index} /> : null}
					</div>
				</div>
			</div>
		</div>
	);
}
