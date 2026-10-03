// Right-hand panel: what this step is, the exact data it moves, and two tabs
// onto the state the run has accumulated so far.

export function StepHead({ step, index, total }) {
	return (
		<div className="step-head">
			<span className="phase">{step.phase}</span>
			<span className="counter" style={{ float: "right" }}>
				{index + 1} / {total}
			</span>
			<div className="step-title">{step.title}</div>
			<div className="step-file">{step.file}</div>
			<div className="step-note">{step.note}</div>
		</div>
	);
}

export function Payloads({ payloads }) {
	if (payloads.length === 0) {
		return <div className="empty">No data crosses a boundary on this step — it is a decision inside the loop.</div>;
	}
	return (
		<>
			{payloads.map((p) => (
				<div className={`card ${p.kind}`} key={p.label}>
					<div className="card-head">
						<span className={`kind ${p.kind}`}>{p.kind === "code" ? "source" : "data"}</span>
						<span>{p.label}</span>
					</div>
					<pre>{p.text}</pre>
				</div>
			))}
		</>
	);
}

export function EventLog({ events, stepIndex }) {
	if (events.length === 0) return <div className="empty">No events yielded yet.</div>;
	return (
		<>
			{events.map((e, i) => (
				<div className={`evt ${e.step === stepIndex ? "fresh" : ""}`} key={`${e.type}-${i}`}>
					<span className={`bus ${e.bus}`}>{e.bus === "stream" ? "Stream" : "Agent"}</span>
					<span className="type">{e.type}</span>
					<span className="detail">{e.detail}</span>
				</div>
			))}
		</>
	);
}

function short(text, max = 180) {
	const s = String(text);
	return s.length > max ? `${s.slice(0, max)}…  (+${s.length - max} chars)` : s;
}

export function Messages({ messages }) {
	if (messages.length === 0) {
		return <div className="empty">messages[] is still empty — nothing has been sent to the model.</div>;
	}
	return (
		<>
			{messages.map((m, i) => (
				<div className="msg" key={`${m.role}-${i}`}>
					<div className={`msg-role ${m.role}`}>
						[{i}] {m.role}
					</div>
					{typeof m.content === "string" ? (
						<pre>{short(m.content)}</pre>
					) : (
						m.content.map((b, j) => (
							<div className="blk" key={`${b.type}-${j}`}>
								<div className={`blk-type ${b.type} ${b.is_error ? "err" : ""}`}>
									{b.type}
									{b.name ? ` · ${b.name}` : ""}
									{b.id ? ` · ${b.id.slice(0, 8)}…` : ""}
									{b.tool_use_id ? ` · ${b.tool_use_id.slice(0, 8)}…` : ""}
									{b.is_error ? " · is_error" : ""}
								</div>
								<pre>{short(b.text ?? (b.input ? JSON.stringify(b.input, null, 2) : b.content))}</pre>
							</div>
						))
					)}
				</div>
			))}
		</>
	);
}
