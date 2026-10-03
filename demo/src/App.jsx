// Two views onto the same run. The hash decides which one opens:
//   #print/allow/12   the dataflow canvas
//   #stream/allow     the streaming timeline

import { useEffect, useState } from "react";
import FlowPage from "./pages/FlowPage.jsx";
import StreamPage from "./pages/StreamPage.jsx";

function readRoute() {
	const [head, second] = (window.location.hash.slice(1) || "").split("/");
	return {
		page: head === "stream" ? "stream" : "flow",
		answer: head === "stream" && second === "deny" ? "deny" : "allow",
	};
}

export default function App() {
	const initial = readRoute();
	const [page, setPage] = useState(initial.page);
	const [answer, setAnswer] = useState(initial.answer);

	// The flow page owns the hash while it is up, so only write ours on the
	// streaming page.
	useEffect(() => {
		if (page === "stream" && !window.location.hash.startsWith("#stream"))
			window.location.hash = `stream/${answer}/0`;
	}, [page, answer]);

	const nav = (
		<div className="seg nav">
			<button type="button" className={page === "flow" ? "on" : ""} onClick={() => setPage("flow")}>
				dataflow
			</button>
			<button type="button" className={page === "stream" ? "on" : ""} onClick={() => setPage("stream")}>
				streaming
			</button>
		</div>
	);

	return page === "stream" ? (
		<StreamPage nav={nav} answer={answer} setAnswer={setAnswer} />
	) : (
		<FlowPage nav={nav} />
	);
}
