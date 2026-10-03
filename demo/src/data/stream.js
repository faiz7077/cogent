// The streaming view's data. Instead of scripting what the loop "would" show,
// this file replays real Gemini chunks through a reducer that mirrors the
// `for await (const event of stream)` body in src/agent/loop.ts line-for-line —
// so assistantBlocks[], pendingToolCalls{} and the AgentEvents on screen are
// derived exactly the way cogent derives them.

import {
	ANSWER,
	M_ASSISTANT_1,
	M_ASSISTANT_2,
	M_ASSISTANT_3,
	M_ASSISTANT_3_DENIED,
	M_RESULT_1,
	M_RESULT_2,
	M_RESULT_2_DENIED,
	M_USER,
	READ_ID,
	READ_RESULT,
	TOOLS_MD,
	WRITE_ID,
} from "./messages.js";

const DENY_MESSAGE = "The user denied permission to run Write. Do not retry this call; ask what they'd like instead.";
const WRITE_OK = "File written: /home/you/cogent/TOOLS.md";

// ---------------------------------------------------------------------------
// chunks: what generateContentStream() actually yields, one object per tick
// ---------------------------------------------------------------------------

function chunk(parts, usage) {
	const raw = {
		candidates: [
			{
				content: { role: "model", parts },
				...(usage ? { finishReason: "STOP" } : {}),
				index: 0,
			},
		],
	};
	if (usage) raw.usageMetadata = { ...usage, totalTokenCount: usage.promptTokenCount + usage.candidatesTokenCount };
	return raw;
}

// src/providers/gemini.ts:88-110 — one chunk in, zero or more StreamEvents out.
// Gemini gives function calls no id, so the adapter mints one; we pin the uuids
// here so they match the ids in messages.js.
function adapt(parts, ids) {
	const out = [];
	let n = 0;
	for (const part of parts) {
		if (part.text) out.push({ type: "text_delta", delta: part.text });
		if (part.functionCall) {
			const id = ids[n++];
			out.push({ type: "tool_use_start", id, name: part.functionCall.name });
			out.push({ type: "tool_use_input_delta", id, delta: JSON.stringify(part.functionCall.args ?? {}) });
			out.push({ type: "tool_use_end", id });
		}
	}
	return out;
}

function chunkTick(turn, parts, opts = {}) {
	return {
		turn,
		lane: "chunk",
		title: opts.title ?? "chunk arrives",
		file: "src/providers/gemini.ts:88",
		note: opts.note,
		code: opts.code,
		chunk: chunk(parts, opts.usage),
		stream: adapt(parts, opts.ids ?? []),
	};
}

// ---------------------------------------------------------------------------
// the loop body — src/agent/loop.ts:55-82, transcribed
// ---------------------------------------------------------------------------

// Mutates `s` the way the loop mutates its locals, and returns the AgentEvents
// the loop yields for this one StreamEvent.
export function loopStep(s, event) {
	const yielded = [];

	if (event.type === "text_delta") {
		yielded.push({ type: "text_delta", delta: event.delta });
		const last = s.blocks.at(-1);
		if (last?.type === "text") last.text += event.delta;
		else s.blocks.push({ type: "text", text: event.delta });
	}

	if (event.type === "tool_use_start") {
		s.pending[event.id] = { name: event.name, inputJson: "" };
	}

	if (event.type === "tool_use_input_delta") {
		if (s.pending[event.id]) s.pending[event.id].inputJson += event.delta;
	}

	if (event.type === "tool_use_end") {
		const tc = s.pending[event.id];
		const parsedInput = JSON.parse(tc.inputJson || "{}");
		s.blocks.push({ type: "tool_use", id: event.id, name: tc.name, input: parsedInput });
		delete s.pending[event.id]; // the loop keeps it; we drop it so the panel reads as "assembled"
	}

	if (event.type === "message_end") {
		yielded.push({ type: "turn_end", stop_reason: event.stop_reason, usage: event.usage });
	}

	return yielded;
}

// ---------------------------------------------------------------------------
// the timeline
// ---------------------------------------------------------------------------

const OPTIONS_CODE = `provider.complete({
  model: "gemini-2.5-flash",
  system: buildSystemPrompt(),   // ~1.9k chars
  messages,                      // Message[] — grows every turn
  tools,                         // 15 ToolDefinition[]
  max_tokens: 8192,
})`;

const ADAPT_CODE = `for (const part of chunk.candidates?.[0]?.content?.parts ?? []) {
  if (part.text) yield { type: "text_delta", delta: part.text };

  if (part.functionCall) {
    const id = crypto.randomUUID();
    yield { type: "tool_use_start", id, name: part.functionCall.name };
    yield { type: "tool_use_input_delta", id,
            delta: JSON.stringify(part.functionCall.args ?? {}) };
    yield { type: "tool_use_end", id };
  }
}`;

const END_CODE = `// Gemini always reports "end_turn"; the loop decides from the
// blocks it received, not from the stop reason.
yield {
  type: "message_end",
  stop_reason: "end_turn",
  usage: { input_tokens: inputTokens, output_tokens: outputTokens },
};`;

const messageEnd = (turn, usage, note) => ({
	turn,
	lane: "stream",
	title: "stream exhausted → message_end",
	file: "src/providers/gemini.ts:112",
	note,
	code: END_CODE,
	stream: [{ type: "message_end", stop_reason: "end_turn", usage }],
});

function turnOpen(turn, note, messages) {
	return {
		turn,
		lane: "call",
		title: `turn ${turn} — await provider.complete()`,
		file: "src/agent/loop.ts:44",
		note,
		code: OPTIONS_CODE,
		open: true,
		snapshot: messages,
	};
}

export function buildTicks(answer) {
	const denied = answer === "deny";

	return [
		{
			turn: 1,
			lane: "call",
			title: "runAgent() starts",
			file: "src/agent/loop.ts:24",
			note: "Before any network call: resolve the provider, read GEMINI_API_KEY, collect the 15 tool definitions, then announce the run.",
			code: `const provider = createProvider("gemini", getApiKey("gemini"));
const tools = getToolDefinitions();          // 15 tools
let messages = [...options.messages];        // 1 user message
yield { type: "agent_start" };`,
			agent: [{ type: "agent_start" }],
			snapshot: [M_USER],
		},

		turnOpen(
			1,
			"complete() is an async generator — calling it runs nothing. The HTTP request only opens when the loop pulls the first value at `for await`.",
			[M_USER],
		),
		{
			turn: 1,
			lane: "chunk",
			title: "generateContentStream resolves",
			file: "src/providers/gemini.ts:76",
			note: "The response headers are back and the body is an open SSE stream. Nothing has been generated yet — the first chunk is still in flight.",
		},

		chunkTick(1, [{ text: "Checking the " }], {
			note: "First chunk. The adapter turns each text part into a text_delta and the loop appends it to the last text block — creating one if there isn't one yet.",
			code: ADAPT_CODE,
		}),
		chunkTick(1, [{ text: "tool registry." }], {
			note: "Second text_delta. `last?.type === \"text\"` is true now, so this concatenates onto the existing block instead of pushing a new one.",
		}),
		chunkTick(1, [{ functionCall: { name: "Read", args: { file_path: "src/tools/index.ts" } } }], {
			ids: [READ_ID],
			title: "chunk carries a functionCall",
			note: "Gemini sends the whole args object in one chunk and gives it no id — so the adapter mints a uuid and fires start / input / end back-to-back. The loop still assembles it through pendingToolCalls, because Anthropic streams the same call as dozens of fragments.",
			code: ADAPT_CODE,
		}),
		chunkTick(1, [], {
			usage: { promptTokenCount: 3812, candidatesTokenCount: 34 },
			title: "final chunk — usageMetadata",
			note: "Gemini only reports usage on the last chunk, as a running total. The adapter has been latching it on every chunk so it survives into message_end.",
		}),
		messageEnd(
			1,
			{ input_tokens: 3812, output_tokens: 34 },
			"The provider generator returns. `message_end` is the only StreamEvent the loop turns straight into an AgentEvent (`turn_end`) without touching state.",
		),

		{
			turn: 1,
			lane: "loop",
			title: "assistantBlocks → messages[]",
			file: "src/agent/loop.ts:84",
			note: "The for-await is over, so the streamed fragments become one assistant Message and get pushed to both `messages` (sent to the model next turn) and `newMessages` (appended to the session JSONL).",
			code: `const assistantMessage = { role: "assistant", content: assistantBlocks };
messages.push(assistantMessage);
newMessages.push(assistantMessage);`,
			push: M_ASSISTANT_1,
		},
		{
			turn: 1,
			lane: "loop",
			title: "hasToolCalls → true",
			file: "src/agent/loop.ts:90",
			note: "stop_reason said \"end_turn\", but a tool_use block is sitting in assistantBlocks — so the loop keeps going. This is the check that makes Gemini behave like the other providers.",
			code: `const hasToolCalls = assistantBlocks.some((b) => b.type === "tool_use");
if (!hasToolCalls) break;`,
		},
		{
			turn: 1,
			lane: "agent",
			title: "yield tool_start",
			file: "src/agent/loop.ts:98",
			note: "The UI draws the tool card before the tool runs, so a slow Read shows up as pending rather than as nothing.",
			agent: [{ type: "tool_start", id: READ_ID, name: "Read", input: { file_path: "src/tools/index.ts" } }],
		},
		{
			turn: 1,
			lane: "agent",
			title: "Read.readOnly → gate skipped",
			file: "src/agent/loop.ts:150",
			note: "runToolCall checks `tool.readOnly` before it ever touches canUseTool. Read observes without changing anything, so nothing is asked and execute() runs immediately.",
			code: `if (!tool.readOnly && options.canUseTool) {
  const decision = await options.canUseTool(toolCall.name, toolCall.input);
  if (decision.behavior === "deny") { ... }
}
return tool.execute(toolCall.input)`,
		},
		{
			turn: 1,
			lane: "agent",
			title: "yield tool_end",
			file: "src/agent/loop.ts:105",
			note: "29 numbered lines come back from the file. The same string goes to the UI as an event and into messages[] as a tool_result block.",
			agent: [{ type: "tool_end", id: READ_ID, name: "Read", result: READ_RESULT, isError: false }],
			push: M_RESULT_1,
		},

		// ---- turn 2 -------------------------------------------------------
		turnOpen(
			2,
			"Back to the top of the while loop with four messages now. The whole history is re-sent — the API is stateless, so every turn pays for every prior token.",
			[M_USER, M_ASSISTANT_1, M_RESULT_1],
		),
		chunkTick(
			2,
			[{ functionCall: { name: "Write", args: { file_path: "TOOLS.md", content: TOOLS_MD } } }],
			{
				ids: [WRITE_ID],
				title: "chunk is a functionCall only",
				note: "No text part this turn, so assistantBlocks holds a single tool_use block and the transcript shows only a tool card.",
				code: ADAPT_CODE,
			},
		),
		chunkTick(2, [], {
			usage: { promptTokenCount: 4671, candidatesTokenCount: 61 },
			title: "final chunk — usageMetadata",
			note: "promptTokenCount jumped ~860 tokens: that is the Read result now riding along in every request.",
		}),
		messageEnd(2, { input_tokens: 4671, output_tokens: 61 }, "Same terminator as turn 1 — end_turn, despite a pending tool call."),
		{
			turn: 2,
			lane: "loop",
			title: "assistantBlocks → messages[]",
			file: "src/agent/loop.ts:84",
			note: "One block this time. hasToolCalls is true again.",
			push: M_ASSISTANT_2,
		},
		{
			turn: 2,
			lane: "agent",
			title: "yield tool_start",
			file: "src/agent/loop.ts:98",
			agent: [{ type: "tool_start", id: WRITE_ID, name: "Write", input: { file_path: "TOOLS.md", content: TOOLS_MD } }],
			note: "Write is not readOnly, so this is the last event the UI gets before the loop suspends.",
		},
		{
			turn: 2,
			lane: "agent",
			title: denied ? "canUseTool → deny" : "canUseTool → allow",
			file: "src/agent/loop.ts:151",
			note: denied
				? "The loop is parked on `await options.canUseTool(...)`. Nothing streams while a human is deciding. Deny returns a message, not a throw — execute() is never called and TOOLS.md is never touched."
				: "The loop is parked on `await options.canUseTool(...)` — the generator is suspended mid-turn and no events flow until the promise resolves. Allow, and execute() runs.",
			code: denied
				? `const decision = await options.canUseTool("Write", input);
if (decision.behavior === "deny") {
  return { output: decision.message, isError: true, denied: true };
}`
				: `const decision = await options.canUseTool("Write", input);
// behavior === "allow" → fall through
return tool.execute(toolCall.input)`,
			agent: denied ? [{ type: "tool_denied", id: WRITE_ID, name: "Write", reason: DENY_MESSAGE }] : [],
		},
		{
			turn: 2,
			lane: "agent",
			title: "yield tool_end",
			file: "src/agent/loop.ts:105",
			note: denied
				? "A denial still comes back as a tool_end with isError: true. Every tool_use must be answered by a tool_result or the next request is malformed — so the refusal is fed to the model as data and it adapts."
				: "writeTool.execute() resolved. The result becomes a tool_result block in a fresh user message.",
			agent: [
				denied
					? { type: "tool_end", id: WRITE_ID, name: "Write", result: DENY_MESSAGE, isError: true }
					: { type: "tool_end", id: WRITE_ID, name: "Write", result: WRITE_OK, isError: false },
			],
			push: denied ? M_RESULT_2_DENIED : M_RESULT_2,
		},

		// ---- turn 3 -------------------------------------------------------
		turnOpen(3, "Sixth request of the run. The model has the tool output and can finally answer.", [
			M_USER,
			M_ASSISTANT_1,
			M_RESULT_1,
			M_ASSISTANT_2,
			denied ? M_RESULT_2_DENIED : M_RESULT_2,
		]),
		...(denied
			? [
					chunkTick(3, [{ text: "**15 tools** — 7 core plus 8 git tools. " }], {
						note: "The is_error tool_result steered the answer: it reports the count and offers an alternative rather than retrying Write.",
					}),
					chunkTick(3, [{ text: "I did not write `TOOLS.md`; tell me where you'd like it instead." }]),
				]
			: [
					chunkTick(3, [{ text: "**15 tools.** Seven core file/shell tools — " }], {
						note: "Prose only this turn. Each delta lands in the same text block and the UI paints it as it arrives.",
					}),
					chunkTick(3, [{ text: "`Read`, `Write`, `Edit`, `Bash`, `Grep`, `Find`, `Ls` — plus the eight in `GIT_TOOLS`, " }]),
					chunkTick(3, [{ text: "all spread into `ALL_TOOLS` in `src/tools/index.ts`. Written to `TOOLS.md`." }]),
				]),
		chunkTick(3, [], {
			usage: denied
				? { promptTokenCount: 4784, candidatesTokenCount: 39 }
				: { promptTokenCount: 4762, candidatesTokenCount: 72 },
			title: "final chunk — usageMetadata",
		}),
		messageEnd(
			3,
			denied ? { input_tokens: 4784, output_tokens: 39 } : { input_tokens: 4762, output_tokens: 72 },
			"Third and last turn_end. Same event as before — what changes is what the loop finds in assistantBlocks afterwards.",
		),
		{
			turn: 3,
			lane: "loop",
			title: "hasToolCalls → false → break",
			file: "src/agent/loop.ts:91",
			note: "assistantBlocks holds one text block and no tool_use, so the while loop exits. This — not the stop reason — is what ends a cogent run.",
			code: `const hasToolCalls = assistantBlocks.some((b) => b.type === "tool_use");
if (!hasToolCalls) break;`,
			push: denied ? M_ASSISTANT_3_DENIED : M_ASSISTANT_3,
		},
		{
			turn: 3,
			lane: "agent",
			title: "yield agent_end",
			file: "src/agent/loop.ts:121",
			note: "The final event carries both arrays: `messages` is the full history the loop ended with, `newMessages` is only what this run produced — which is what gets appended to .cogent/sessions/<id>.jsonl.",
			code: `yield { type: "agent_end", messages, newMessages };`,
			agent: [{ type: "agent_end", messages: "Message[7]", newMessages: "Message[6]" }],
			done: true,
		},
	];
}

// ---------------------------------------------------------------------------
// fold — every panel on the page is a projection of this
// ---------------------------------------------------------------------------

function pushTranscript(t, ev) {
	if (ev.type === "text_delta") {
		const last = t.at(-1);
		if (last?.kind === "text") last.text += ev.delta;
		else t.push({ kind: "text", text: ev.delta });
		return;
	}
	if (ev.type === "tool_start") t.push({ kind: "tool", id: ev.id, name: ev.name, input: ev.input, state: "running" });
	if (ev.type === "tool_denied") {
		const row = t.find((r) => r.id === ev.id);
		if (row) row.state = "denied";
	}
	if (ev.type === "tool_end") {
		const row = t.find((r) => r.id === ev.id);
		if (row) {
			row.result = ev.result;
			if (row.state !== "denied") row.state = ev.isError ? "error" : "done";
		}
	}
}

export function foldTo(ticks, index) {
	const s = {
		chunks: [],
		stream: [],
		agent: [],
		blocks: [],
		pending: {},
		messages: [],
		transcript: [],
		usage: null,
		open: false,
		done: false,
		turn: 1,
	};

	for (let i = 0; i <= index && i < ticks.length; i++) {
		const t = ticks[i];
		s.turn = t.turn;

		// A fresh turn resets the two locals the loop declares inside `while`.
		if (t.open) {
			s.blocks = [];
			s.pending = {};
			s.open = true;
		}
		if (t.snapshot) s.messages = [...t.snapshot];

		if (t.chunk) s.chunks.push({ raw: t.chunk, tick: i, turn: t.turn, n: s.chunks.length + 1 });

		for (const ev of t.stream ?? []) {
			s.stream.push({ ...ev, tick: i, turn: t.turn });
			for (const out of loopStep(s, ev)) {
				s.agent.push({ ...out, tick: i, turn: t.turn });
				pushTranscript(s.transcript, out);
				if (out.type === "turn_end") {
					s.usage = out.usage;
					s.open = false;
				}
			}
		}

		for (const ev of t.agent ?? []) {
			s.agent.push({ ...ev, tick: i, turn: t.turn });
			pushTranscript(s.transcript, ev);
		}

		if (t.push) s.messages = [...s.messages, t.push];
		if (t.done) s.done = true;
	}

	return s;
}
