// Streaming view — one tick at a time from the SSE chunk to the pixel.
//
// Four lanes, left to right: the raw chunks generateContentStream() yields, the
// StreamEvents gemini.ts adapts them into, the loop locals those events mutate,
// and the AgentEvents runAgent() yields to whoever is rendering. The transcript
// underneath is built only from lane 4, exactly like the real UI.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Messages } from "../components/Inspector.jsx";
import { HResizer, Resizer, useInspectorWidth, useTerminalHeight } from "../components/Resizer.jsx";
import { buildTicks, foldTo } from "../data/stream.js";

const SPEEDS = [
	{ label: "0.5×", ms: 1600 },
	{ label: "1×", ms: 800 },
	{ label: "2×", ms: 380 },
];

const STREAM_COLOR = {
	text_delta: "ok",
	tool_use_start: "tool",
	tool_use_input_delta: "tool",
	tool_use_end: "tool",
	message_end: "warn",
};

const AGENT_COLOR = {
	agent_start: "accent",
	text_delta: "ok",
	tool_start: "tool",
	tool_end: "tool",
	tool_denied: "err",
	turn_end: "warn",
	agent_end: "accent",
};

function clip(text, max = 90) {
	const s = String(text).replace(/\n/g, "\\n");
	return s.length > max ? `${s.slice(0, max)}…` : s;
}

// One line of Read output is worth showing; twenty-nine are not.
function resultSummary(result) {
	const lines = String(result).split("\n");
	return lines.length === 1 ? clip(lines[0], 70) : `${lines.length} lines`;
}

function streamDetail(e) {
	if (e.type === "text_delta") return JSON.stringify(e.delta);
	if (e.type === "tool_use_start") return `${e.name} · ${e.id.slice(0, 8)}…`;
	if (e.type === "tool_use_input_delta") return clip(e.delta, 70);
	if (e.type === "tool_use_end") return `${e.id.slice(0, 8)}…`;
	return `${e.stop_reason} · in ${e.usage.input_tokens} / out ${e.usage.output_tokens}`;
}

function agentDetail(e) {
	if (e.type === "text_delta") return JSON.stringify(e.delta);
	if (e.type === "tool_start") return `${e.name}(${clip(JSON.stringify(e.input), 60)})`;
	if (e.type === "tool_end") return `${e.name} → ${e.isError ? "is_error " : ""}${clip(e.result, 50)}`;
	if (e.type === "tool_denied") return `${e.name} · never executed`;
	if (e.type === "turn_end") return `${e.stop_reason} · ${e.usage.input_tokens} in / ${e.usage.output_tokens} out`;
	if (e.type === "agent_end") return `${e.messages} · new ${e.newMessages}`;
	return "";
}

// Follow the newest row, but only while the reader is already at the bottom —
// otherwise scrolling back to an earlier chunk would be yanked away on every tick.
function useFollow(deps) {
	const ref = useRef(null);
	const pinned = useRef(true);

	const onScroll = useCallback(() => {
		const el = ref.current;
		if (el) pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
	}, []);

	// biome-ignore lint/correctness/useExhaustiveDependencies: caller passes the deps
	useEffect(() => {
		if (ref.current && pinned.current) ref.current.scrollTop = ref.current.scrollHeight;
	}, deps);

	return { ref, onScroll };
}

function Lane({ title, sub, count, children, live }) {
	const { ref, onScroll } = useFollow([count]);

	return (
		<div className={`lane ${live ? "live" : ""}`}>
			<div className="lane-head">
				<span>{title}</span>
				<code>{sub}</code>
				{live ? <i className="dot" /> : null}
			</div>
			<div className="lane-body" ref={ref} onScroll={onScroll}>
				{children}
			</div>
		</div>
	);
}

function LoopState({ blocks, pending, open, usage }) {
	const pendingIds = Object.keys(pending);
	return (
		<>
			<div className="state-head">
				assistantBlocks<span>[{blocks.length}]</span>
			</div>
			{blocks.length === 0 ? <div className="state-empty">empty — declared at the top of the turn</div> : null}
			{blocks.map((b, i) => (
				<div className={`state-blk ${b.type}`} key={`${b.type}-${i}`}>
					<div className="state-blk-head">
						{b.type}
						{b.name ? ` · ${b.name}` : ""}
						{b.type === "text" ? ` · ${b.text.length} chars` : ""}
					</div>
					<pre>{b.type === "text" ? b.text : JSON.stringify(b.input, null, 2)}</pre>
				</div>
			))}

			<div className="state-head">
				pendingToolCalls<span>{`{${pendingIds.length}}`}</span>
			</div>
			{pendingIds.length === 0 ? (
				<div className="state-empty">
					{open ? "nothing half-assembled right now" : "drained — every call became a tool_use block"}
				</div>
			) : null}
			{pendingIds.map((id) => (
				<div className="state-blk pending" key={id}>
					<div className="state-blk-head">
						{id.slice(0, 8)}… · {pending[id].name}
					</div>
					<pre>inputJson: {pending[id].inputJson || '""'}</pre>
				</div>
			))}

			{usage ? (
				<>
					<div className="state-head">last usage</div>
					<div className="state-empty">
						in {usage.input_tokens} · out {usage.output_tokens}
					</div>
				</>
			) : null}
		</>
	);
}

function Transcript({ transcript, done, streaming }) {
	const { ref, onScroll } = useFollow([transcript, done]);

	return (
		<div className="term" ref={ref} onScroll={onScroll}>
			{transcript.length === 0 ? <div className="dim">waiting for the first text_delta…</div> : null}
			{transcript.map((row, i) =>
				row.kind === "text" ? (
					<div className="row assistant" key={i}>
						<span className="caret">⏺ </span>
						{row.text}
						{streaming && i === transcript.length - 1 ? <span className="cursor">▊</span> : null}
					</div>
				) : (
					<div className="row" key={i}>
						<div className="toolrow">
							⏺ {row.name}({Object.values(row.input)[0]})
						</div>
						<div className={row.state === "denied" || row.state === "error" ? "err" : "result"}>
							{"  ⎿ "}
							{row.state === "running"
								? "running…"
								: row.state === "denied"
									? "denied — execute() never ran"
									: resultSummary(row.result)}
						</div>
					</div>
				),
			)}
			{done ? <div className="dim">— agent_end · run complete —</div> : null}
		</div>
	);
}

export default function StreamPage({ nav, answer, setAnswer }) {
	const [index, setIndex] = useState(() => {
		const n = Number(window.location.hash.slice(1).split("/")[2]);
		return Number.isFinite(n) ? Math.max(0, n) : 0;
	});
	const [playing, setPlaying] = useState(false);
	const [speed, setSpeed] = useState(1);
	const [tab, setTab] = useState("source");
	const [width, setWidth] = useInspectorWidth();
	const [termHeight, setTermHeight] = useTerminalHeight(210);

	const ticks = useMemo(() => buildTicks(answer), [answer]);
	const tick = ticks[Math.min(index, ticks.length - 1)];
	const s = useMemo(() => foldTo(ticks, index), [ticks, index]);

	const atEnd = index >= ticks.length - 1;

	useEffect(() => {
		setIndex((i) => Math.min(i, ticks.length - 1));
	}, [ticks.length]);

	useEffect(() => {
		window.location.hash = `stream/${answer}/${index}`;
	}, [answer, index]);

	useEffect(() => {
		if (!playing) return;
		if (atEnd) {
			setPlaying(false);
			return;
		}
		const t = setTimeout(() => setIndex((i) => Math.min(ticks.length - 1, i + 1)), SPEEDS[speed].ms);
		return () => clearTimeout(t);
	}, [playing, index, atEnd, speed, ticks.length]);

	const go = useCallback(
		(d) => {
			setPlaying(false);
			setIndex((i) => Math.max(0, Math.min(ticks.length - 1, i + d)));
		},
		[ticks.length],
	);

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
					<span>streaming · generateContentStream → StreamEvent → loop → AgentEvent → your screen</span>
				</div>
				{nav}
				<div className="spacer" />

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
					<span>turn</span>
					<code style={{ color: "var(--accent)" }}>{s.turn} / 3</code>
				</div>
			</header>

			<div className="body">
				<div className="left">
					<div className="lanes">
						<Lane title="1 · SSE chunk" sub="@google/genai" count={s.chunks.length} live={s.open}>
							{s.chunks.length === 0 ? <div className="state-empty">no chunk has arrived yet</div> : null}
							{s.chunks.map((c) => (
								<div className={`chunk ${c.tick === index ? "fresh" : ""}`} key={c.tick}>
									<div className="chunk-head">
										turn {c.turn} · chunk {c.n}
									</div>
									<pre>{JSON.stringify(c.raw)}</pre>
								</div>
							))}
						</Lane>

						<Lane title="2 · StreamEvent" sub="providers/gemini.ts" count={s.stream.length} live={s.open}>
							{s.stream.length === 0 ? <div className="state-empty">complete() has yielded nothing</div> : null}
							{s.stream.map((e, i) => (
								<div className={`ev ${e.tick === index ? "fresh" : ""}`} key={i}>
									<span className={`ev-type ${STREAM_COLOR[e.type]}`}>{e.type}</span>
									<span className="ev-detail">{streamDetail(e)}</span>
								</div>
							))}
						</Lane>

						<Lane title="3 · loop locals" sub="agent/loop.ts:55" count={s.blocks.length}>
							<LoopState blocks={s.blocks} pending={s.pending} open={s.open} usage={s.usage} />
						</Lane>

						<Lane title="4 · AgentEvent" sub="runAgent() yields" count={s.agent.length} live={s.open}>
							{s.agent.map((e, i) => (
								<div className={`ev ${e.tick === index ? "fresh" : ""}`} key={i}>
									<span className={`ev-type ${AGENT_COLOR[e.type]}`}>{e.type}</span>
									<span className="ev-detail">{agentDetail(e)}</span>
								</div>
							))}
						</Lane>
					</div>

					<div className="controls">
						<button
							type="button"
							onClick={() => {
								setPlaying(false);
								setIndex(0);
							}}
						>
							⟲
						</button>
						<button type="button" onClick={() => go(-1)} disabled={index === 0}>
							◀
						</button>
						<button type="button" className="primary" onClick={() => setPlaying((p) => !p)} disabled={atEnd}>
							{playing ? "❚❚ pause" : "▶ stream"}
						</button>
						<button type="button" onClick={() => go(1)} disabled={atEnd}>
							▶
						</button>
						<div className="seg">
							{SPEEDS.map((sp, i) => (
								<button type="button" key={sp.label} className={speed === i ? "on" : ""} onClick={() => setSpeed(i)}>
									{sp.label}
								</button>
							))}
						</div>

						<div className="rail">
							{ticks.map((t, i) => (
								<button
									type="button"
									key={`${t.title}-${i}`}
									title={`turn ${t.turn} — ${t.title}`}
									className={`rail-tick ${i === index ? "now" : i < index ? "done" : ""} ${
										i > 0 && ticks[i - 1].turn !== t.turn ? "phase-start" : ""
									}`}
									onClick={() => {
										setPlaying(false);
										setIndex(i);
									}}
								/>
							))}
						</div>
						<span className="counter">
							{index + 1} / {ticks.length}
						</span>
					</div>

					<HResizer height={termHeight} setHeight={setTermHeight} fallback={210} />

					<div className="term-wrap stream-term" style={{ height: termHeight }}>
						<div className="pane-head">
							<span>rendered from AgentEvents — what you actually see</span>
						</div>
						<Transcript transcript={s.transcript} done={s.done} streaming={s.open && !playing ? false : s.open} />
					</div>
				</div>

				<Resizer setWidth={setWidth} />

				<div className="right" style={{ width }}>
					<div className="step-head">
						<span className="phase">turn {tick.turn}</span>
						<span className="counter" style={{ float: "right" }}>
							{index + 1} / {ticks.length}
						</span>
						<div className="step-title">{tick.title}</div>
						<div className="step-file">{tick.file}</div>
						{tick.note ? <div className="step-note">{tick.note}</div> : null}
					</div>

					<div className="pane-head">
						<span>inspector</span>
						<div className="tabs">
							<button type="button" className={tab === "source" ? "on" : ""} onClick={() => setTab("source")}>
								source
							</button>
							<button type="button" className={tab === "messages" ? "on" : ""} onClick={() => setTab("messages")}>
								messages[{s.messages.length}]
							</button>
						</div>
					</div>

					<div className="inspect">
						{tab === "source" ? (
							tick.code ? (
								<div className="card code">
									<div className="card-head">
										<span className="kind code">source</span>
										<span>{tick.file}</span>
									</div>
									<pre>{tick.code}</pre>
								</div>
							) : (
								<div className="empty">
									No new source on this tick — it is the same chunk loop running again. Step to a tick that changes
									control flow to see the code.
								</div>
							)
						) : (
							<Messages messages={s.messages} />
						)}
					</div>
				</div>
			</div>
		</div>
	);
}
