// What the user actually sees. Print mode replays modes/print.ts's chalk output;
// the TUI replays the transcript rows tui/components.tsx renders.

import { useEffect, useRef } from "react";

export function Terminal({ lines, mode, done }) {
	const ref = useRef(null);
	useEffect(() => {
		if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
	}, [lines.length]);

	return (
		<div className="term" ref={ref}>
			{lines.map((l, i) => (
				<div className={`row ${l.tone}`} key={`${i}-${l.text.slice(0, 12)}`}>
					{l.text}
				</div>
			))}
			{mode === "tui" && done ? (
				<div className="row caret">{"╭───────────────────────────────────────────╮\n│ › ▏                                       │\n╰───────────────────────────────────────────╯"}</div>
			) : null}
		</div>
	);
}
