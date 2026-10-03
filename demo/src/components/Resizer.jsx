// Drag handles: one between the main view and the inspector, one between the
// controls and the terminal below them. Both sizes live in localStorage so the
// panels stay where you put them across reloads.

import { useCallback, useEffect, useRef, useState } from "react";

const MIN = 260;
const MAX = 900;
const KEY = "cogent-demo:inspector-width";

export function useInspectorWidth() {
	const [width, setWidth] = useState(() => {
		const saved = Number(localStorage.getItem(KEY));
		return Number.isFinite(saved) && saved >= MIN ? Math.min(saved, MAX) : 430;
	});

	useEffect(() => {
		localStorage.setItem(KEY, String(width));
	}, [width]);

	return [width, setWidth];
}

export function Resizer({ setWidth }) {
	const [dragging, setDragging] = useState(false);

	// Width is measured from the right edge, so the inspector grows as you drag
	// left regardless of where the window edge is.
	const onMove = useCallback(
		(e) => setWidth(Math.max(MIN, Math.min(MAX, window.innerWidth - e.clientX))),
		[setWidth],
	);

	useEffect(() => {
		if (!dragging) return;
		const up = () => setDragging(false);
		window.addEventListener("pointermove", onMove);
		window.addEventListener("pointerup", up);
		document.body.style.cursor = "col-resize";
		document.body.style.userSelect = "none";
		return () => {
			window.removeEventListener("pointermove", onMove);
			window.removeEventListener("pointerup", up);
			document.body.style.cursor = "";
			document.body.style.userSelect = "";
		};
	}, [dragging, onMove]);

	return (
		<div
			className={`gutter ${dragging ? "dragging" : ""}`}
			onPointerDown={(e) => {
				e.preventDefault();
				setDragging(true);
			}}
			onDoubleClick={() => setWidth(430)}
			title="Drag to resize · double-click to reset"
		/>
	);
}

// ---- terminal height ----

const H_MIN = 0; // fully collapsed — the canvas takes the whole column
const H_KEY = "cogent-demo:term-height";

// Never let the terminal eat the whole window; the canvas is the point.
function hMax() {
	return Math.round(window.innerHeight * 0.7);
}

export function useTerminalHeight(fallback) {
	const [height, setHeight] = useState(() => {
		const saved = Number(localStorage.getItem(H_KEY));
		return Number.isFinite(saved) && saved >= H_MIN ? saved : fallback;
	});

	useEffect(() => {
		localStorage.setItem(H_KEY, String(height));
	}, [height]);

	return [height, setHeight];
}

// Horizontal handle above the terminal. Drag it down to give the canvas room,
// or use the chevron to collapse the terminal to its header and back.
export function HResizer({ height, setHeight, fallback }) {
	const [dragging, setDragging] = useState(false);
	const last = useRef(fallback);

	// The terminal is the last thing in the column, so its height is simply the
	// distance from the pointer to the bottom of the window.
	const onMove = useCallback(
		(e) => setHeight(Math.max(H_MIN, Math.min(hMax(), window.innerHeight - e.clientY))),
		[setHeight],
	);

	useEffect(() => {
		if (!dragging) return;
		const up = () => setDragging(false);
		window.addEventListener("pointermove", onMove);
		window.addEventListener("pointerup", up);
		document.body.style.cursor = "row-resize";
		document.body.style.userSelect = "none";
		return () => {
			window.removeEventListener("pointermove", onMove);
			window.removeEventListener("pointerup", up);
			document.body.style.cursor = "";
			document.body.style.userSelect = "";
		};
	}, [dragging, onMove]);

	const collapsed = height <= H_MIN;

	const toggle = () => {
		if (collapsed) {
			setHeight(last.current || fallback);
		} else {
			last.current = height;
			setHeight(H_MIN);
		}
	};

	return (
		<div
			className={`gutter horizontal ${dragging ? "dragging" : ""}`}
			onPointerDown={(e) => {
				if (e.target.closest("button")) return;
				e.preventDefault();
				setDragging(true);
			}}
			onDoubleClick={() => setHeight(fallback)}
			title="Drag to resize · double-click to reset"
		>
			<span className="grip" />
			<button
				type="button"
				className="collapse"
				onClick={toggle}
				title={collapsed ? "Show the terminal" : "Collapse the terminal"}
			>
				{collapsed ? "▲" : "▼"}
			</button>
		</div>
	);
}
