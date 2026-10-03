// The run being traced, step by step.
//
//   $ cogent -p "how many tools does cogent register? write the answer to TOOLS.md"
//
// Provider is pinned to gemini/gemini-2.5-flash. Every payload below is the real
// shape the corresponding function in src/ passes or returns; file refs point at
// the line that does it. `mode` switches between print mode (modes/print.ts) and
// the Ink TUI (tui/App.tsx) — the two differ in argv, in who answers the
// permission gate, and in how the same AgentEvent stream is rendered.

import {
	ANSWER,
	CREATED_AT,
	M_ASSISTANT_1,
	M_ASSISTANT_2,
	M_ASSISTANT_3,
	M_ASSISTANT_3_DENIED,
	M_RESULT_1,
	M_RESULT_2,
	M_RESULT_2_DENIED,
	M_USER,
	PROMPT,
	READ_ID,
	READ_RESULT,
	SESSION_ID,
	TOOLS_MD,
	WRITE_ID,
} from "./messages.js";

const d = (label, text) => ({ kind: "data", label, text });
const code = (label, text) => ({ kind: "code", label, text });

const TOOL_NAMES =
	"Read, Write, Edit, Bash, Grep, Find, Ls, GitStatus, GitLog, GitDiff, GitAdd, GitCommit, GitBranch, GitCheckout, GitReset";

export const STEPS = [
	{
		id: "argv",
		phase: "startup",
		title: "the command",
		note: {
			print: "Print mode: the prompt rides in on argv and the process exits when the answer is done.",
			tui: "No message argument, stdout is a TTY — main() ends up in the Ink TUI and waits for you to type.",
		},
		file: "src/index.ts:4",
		nodes: ["argv"],
		edge: "argv->main",
		payloads: {
			print: [
				d("process.argv.slice(2)", `["-p", "how many tools does cogent register? write the answer to TOOLS.md"]`),
				code("src/index.ts", `main(process.argv.slice(2)).catch((err) => {\n\tconsole.error("Fatal error:", …);\n\tprocess.exit(1);\n});`),
			],
			tui: [
				d("process.argv.slice(2)", `[]`),
				code("src/index.ts", `main(process.argv.slice(2)).catch((err) => {\n\tconsole.error("Fatal error:", …);\n\tprocess.exit(1);\n});`),
			],
		},
		term: { print: [{ tone: "cmd", text: `$ cogent -p "${PROMPT}"` }], tui: [{ tone: "cmd", text: "$ cogent" }] },
	},
	{
		id: "parseArgs",
		phase: "startup",
		title: "parseArgs(argv)",
		note: "A hand-rolled switch over argv. Unknown flags are ignored; anything not starting with '-' joins the positional message.",
		file: "src/cli/args.ts:16",
		nodes: ["main", "parseArgs"],
		edge: "main->parseArgs",
		payloads: {
			print: [
				d(
					"CliArgs",
					`{\n  print: true,\n  yolo: false,\n  classic: false,\n  listModels: false,\n  listSessions: false,\n  version: false,\n  help: false,\n  message: "${PROMPT}"\n}`,
				),
			],
			tui: [
				d(
					"CliArgs",
					`{\n  print: false,\n  yolo: false,\n  classic: false,\n  listModels: false,\n  listSessions: false,\n  version: false,\n  help: false\n}`,
				),
			],
		},
	},
	{
		id: "settings",
		phase: "startup",
		title: "loadSettings()",
		note: "Three sources merge lowest → highest: ~/.cogent/settings.json, then ./.cogent/settings.json, then COGENT_* env vars.",
		file: "src/config/settings.ts:19",
		nodes: ["main", "loadSettings"],
		edge: "main->loadSettings",
		payloads: [
			d("global ~/.cogent/settings.json", `{}`),
			d(".cogent/settings.json", `{\n  "systemPromptExtra": "Prefer functional style. Keep diffs small."\n}`),
			d("merged Settings", `{\n  systemPromptExtra: "Prefer functional style. Keep diffs small."\n}`),
		],
	},
	{
		id: "resolve",
		phase: "startup",
		title: "resolve provider + model",
		note: "A ?? chain, in priority order. Nothing set one, so the built-in default wins — provider gemini, and getDefaultModel picks the fast model rather than the first in MODELS.",
		file: "src/main.ts:47",
		nodes: ["main"],
		payloads: [
			code(
				"src/main.ts",
				`const providerName =\n\targs.provider ?? resumed?.provider ?? settings.provider\n\t?? process.env.COGENT_PROVIDER ?? "gemini";\nconst model =\n\targs.model ?? resumed?.model ?? settings.model\n\t?? process.env.COGENT_MODEL ?? getDefaultModel(providerName);`,
			),
			d("resolved", `providerName = "gemini"\nmodel        = "gemini-2.5-flash"   // DEFAULT_MODELS.gemini`),
			d("ModelInfo (providers/index.ts)", `{\n  id: "gemini-2.5-flash",\n  name: "Gemini 2.5 Flash",\n  provider: "gemini",\n  contextWindow: 1048576,\n  maxOutputTokens: 65536\n}`),
		],
	},
	{
		id: "opening",
		phase: "startup",
		title: "the opening message",
		note: {
			print: "The positional arg becomes the first user turn. If stdin were a pipe instead, readStdin() would supply it.",
			tui: "Nothing on argv and stdin is a TTY, so messages starts empty — the first user turn arrives from the input box.",
		},
		file: "src/main.ts:59",
		nodes: ["main"],
		payloads: {
			print: [d("messages: Message[]", `[\n  { role: "user", content: "${PROMPT}" }\n]`)],
			tui: [d("messages: Message[]", `[]`)],
		},
		messages: { print: [M_USER], tui: [] },
	},
	{
		id: "systemPrompt",
		phase: "startup",
		title: "buildSystemPrompt(extra)",
		note: "Base instructions + the live tool list (generated from ALL_TOOLS, so a new tool needs no prompt edit) + any AGENTS.md / CLAUDE.md / .context / .cogent/context.md + settings.systemPromptExtra.",
		file: "src/config/system-prompt.ts:12",
		nodes: ["main", "systemPrompt"],
		edge: "main->systemPrompt",
		payloads: [
			d(
				"system: string  (~1.4 KB)",
				`You are cogent, an autonomous coding assistant.\nYou are running in: /home/you/cogent\nToday: Monday, September 7, 2026\n\nYou have access to tools to read files, write files, run shell\ncommands, and search code.\nUse tools proactively to understand the codebase before making changes.\nAlways read a file before editing it. Verify your changes work.\nBe concise. No sycophantic openers. No unnecessary explanation.\n\nAvailable tools:\n- Read: Read the contents of a file. …\n- Write: Write content to a file, …\n- Edit: Replace an exact string in a file …\n… 12 more …\n\nPrefer functional style. Keep diffs small.`,
			),
		],
	},
	{
		id: "session",
		phase: "startup",
		title: "createSession(model, provider)",
		note: "A uuid, then one JSONL line appended before anything else. The log is append-only: compaction never rewrites it.",
		file: "src/session/manager.ts:9",
		nodes: ["main", "sessionCreate", "sessionStore"],
		edge: "sessionCreate->sessionStore",
		payloads: [
			d("Session", `{\n  id: "${SESSION_ID}",\n  created_at: "${CREATED_AT}",\n  model: "gemini-2.5-flash",\n  provider: "gemini",\n  messages: []\n}`),
			d(".cogent/sessions/9f2c1b7e….jsonl", `{"type":"session_info","id":"${SESSION_ID}","created_at":"${CREATED_AT}","model":"gemini-2.5-flash","provider":"gemini"}`),
		],
	},
	{
		id: "dispatch",
		phase: "startup",
		title: {
			print: "branch → runPrintMode()",
			tui: "branch → runTui() → <App/>",
		},
		note: {
			print: "`if (args.print || opening)` — note that a positional message alone is enough. Nobody is there to answer a prompt, so canUseTool is allowAll: tools run unattended.",
			tui: "stdout is a TTY and no message was given, so main() dynamically imports the Ink UI. The App owns messages in a ref and answers the permission gate from a dialog.",
		},
		file: { print: "src/main.ts:78", tui: "src/main.ts:107" },
		nodes: ["main", "mode"],
		edge: "main->mode",
		payloads: {
			print: [
				code(
					"src/main.ts",
					`await runPrintMode({\n\tproviderName, model, system, messages,\n\tmaxTurns: 20,\n\tcontextLimit: args.contextLimit,\n\tcanUseTool: allowAll,      // nobody to ask\n\tsessionId: session.id,\n});`,
				),
			],
			tui: [
				code(
					"src/tui/App.tsx",
					`const canUseTool = useCallback(async (name, toolInput) => {\n\tif (props.yolo || alwaysAllowed.current.has(name))\n\t\treturn { behavior: "allow" };\n\tconst answer = await new Promise((resolve) => {\n\t\tsetPending({ name, summary: describeTool(name, toolInput), resolve });\n\t});\n\t…\n}, [props.yolo]);`,
				),
			],
		},
	},
	{
		id: "typed",
		phase: "startup",
		only: "tui",
		title: "you type, App.runTurn() starts",
		note: "submit() pushes a user row into the transcript, appends the Message to the ref, and writes it to the session log before the model ever sees it.",
		file: "src/tui/App.tsx:105",
		nodes: ["mode", "sessionStore"],
		edge: "mode->sessionStore",
		payloads: [
			d("userMessage", `{ role: "user", content: "${PROMPT}" }`),
			code("src/tui/App.tsx", `messages.current.push(userMessage);\nawait saveMessage(props.sessionId, userMessage);\nsetBusy(true);`),
		],
		messages: [M_USER],
		term: { tui: [{ tone: "user", text: `› ${PROMPT}` }] },
	},
	{
		id: "runAgent",
		phase: "turn 1",
		title: "runAgent(options)",
		note: "An async generator. Nothing runs until the caller starts iterating, and every UI is just a for-await over the same event stream.",
		file: "src/agent/loop.ts:13",
		nodes: ["mode", "runAgent"],
		edge: "mode->runAgent",
		payloads: [
			d(
				"AgentOptions",
				`{\n  providerName: "gemini",\n  model: "gemini-2.5-flash",\n  system: "You are cogent, …",\n  messages: [ { role: "user", content: "how many tools…" } ],\n  maxTurns: 20,\n  contextLimit: undefined,\n  canUseTool: ${"$MODE_GATE$"}\n}`,
			),
		],
		events: [{ bus: "agent", type: "agent_start", detail: "" }],
	},
	{
		id: "provider",
		phase: "turn 1",
		title: "createProvider(name, getApiKey(name))",
		note: "getApiKey maps the provider name to its env var and throws early if it is missing. The factory returns the gemini adapter — the loop never learns which SDK is underneath.",
		file: "src/agent/loop.ts:15",
		nodes: ["runAgent", "createProvider", "gemini"],
		edge: "runAgent->createProvider",
		payloads: [
			d("getApiKey('gemini')", `API_KEY_ENV.gemini === "GEMINI_API_KEY"\nprocess.env.GEMINI_API_KEY → "AIza…9pQ"`),
			d("Provider", `{ name: "gemini", complete: AsyncGenerator<StreamEvent> }`),
		],
	},
	{
		id: "toolDefs",
		phase: "turn 1",
		title: "getToolDefinitions()",
		note: "ALL_TOOLS mapped to JSON-Schema. This array is what the model actually sees — 7 core tools plus the 8 in GIT_TOOLS.",
		file: "src/tools/index.ts:20",
		nodes: ["runAgent", "toolDefs"],
		edge: "runAgent->toolDefs",
		payloads: [
			d(
				"ToolDefinition[15]",
				`[\n  {\n    name: "Read",\n    description: "Read the contents of a file. Returns…",\n    input_schema: {\n      type: "object",\n      properties: {\n        file_path: { type: "string", … },\n        offset:    { type: "number", … },\n        limit:     { type: "number", … }\n      },\n      required: ["file_path"]\n    }\n  },\n  … 14 more: ${TOOL_NAMES.slice(6)}\n]`,
			),
		],
	},
	{
		id: "compact",
		phase: "turn 1",
		title: "shouldCompact(messages, model)",
		note: "Checked before every request, not after. ~4 chars per token is deliberately rough — it only has to decide a threshold.",
		file: "src/agent/compaction.ts:41",
		nodes: ["runAgent", "compaction"],
		edge: "runAgent->compaction",
		payloads: [
			d(
				"estimate",
				`estimateTokens(messages)  =    17\ncontextWindow             = 1048576\nthreshold (0.75)          =  786432\n\n17 > 786432 → false   // no compaction`,
			),
		],
	},
	{
		id: "complete",
		phase: "turn 1",
		title: "provider.complete(CompletionOptions)",
		note: "The one call the loop makes into a provider. max_tokens is hard-coded to 8192 in the loop; temperature is left undefined.",
		file: "src/agent/loop.ts:44",
		nodes: ["runAgent", "gemini"],
		edge: "runAgent->gemini",
		payloads: [
			d(
				"CompletionOptions",
				`{\n  model: "gemini-2.5-flash",\n  system: "You are cogent, …",\n  messages: [ { role: "user", content: "how many tools…" } ],\n  tools: ToolDefinition[15],\n  max_tokens: 8192\n}`,
			),
		],
	},
	{
		id: "toGemini",
		phase: "turn 1",
		title: "toGeminiContents(messages)",
		note: "The adapter's whole job. system messages are dropped (Gemini takes systemInstruction separately), assistant → model, and tools get wrapped in functionDeclarations.",
		file: "src/providers/gemini.ts:19",
		nodes: ["gemini"],
		payloads: [
			d("contents", `[\n  { role: "user", parts: [ { text: "how many tools does cogent register? …" } ] }\n]`),
			d(
				"config",
				`{\n  systemInstruction: "You are cogent, …",\n  tools: [ { functionDeclarations: [ …15… ] } ],\n  maxOutputTokens: 8192,\n  temperature: undefined\n}`,
			),
		],
	},
	{
		id: "http",
		phase: "turn 1",
		title: "client.models.generateContentStream(…)",
		note: "One streaming HTTP request. Everything downstream of here is chunks arriving over the wire.",
		file: "src/providers/gemini.ts:76",
		nodes: ["gemini", "api"],
		edge: "gemini->api",
		payloads: [
			d("request", `POST /v1beta/models/gemini-2.5-flash:streamGenerateContent\nalt=sse   ·   x-goog-api-key: AIza…9pQ\n\n1 content · 15 functionDeclarations · maxOutputTokens 8192`),
		],
	},
	{
		id: "chunk-text",
		phase: "turn 1",
		title: "chunk → text part → text_delta",
		note: "Gemini streams prose in candidates[0].content.parts[].text. The adapter re-emits each one as a text_delta; the loop both yields it to the UI and appends it to the trailing text block.",
		file: "src/providers/gemini.ts:95",
		nodes: ["api", "streamBus", "assembler"],
		edge: "api->streamBus",
		payloads: [
			d("raw chunk", `{\n  candidates: [ { content: { role: "model",\n      parts: [ { text: "Checking the tool registry." } ] } } ]\n}`),
			d("StreamEvent", `{ type: "text_delta", delta: "Checking the tool registry." }`),
		],
		events: [
			{ bus: "stream", type: "text_delta", detail: '"Checking the tool registry."' },
			{ bus: "agent", type: "text_delta", detail: '"Checking the tool registry."' },
		],
		term: {
			print: [{ tone: "assistant", text: "Checking the tool registry." }],
			tui: [{ tone: "assistant", text: "Checking the tool registry." }],
		},
	},
	{
		id: "chunk-call",
		phase: "turn 1",
		title: "chunk → functionCall → tool_use_start / _input_delta / _end",
		note: "Gemini sends the whole args object at once and gives it no id, so the adapter mints a uuid and fires all three events back to back. Anthropic's index-keyed deltas and Groq's string fragments both collapse onto the same three events.",
		file: "src/providers/gemini.ts:101",
		nodes: ["api", "streamBus", "assembler"],
		edge: "streamBus->assembler",
		payloads: [
			d("raw chunk", `{ parts: [ { functionCall: {\n    name: "Read",\n    args: { file_path: "src/tools/index.ts" }\n} } ] }`),
			code(
				"src/providers/gemini.ts",
				`const id = crypto.randomUUID();\nyield { type: "tool_use_start", id, name: part.functionCall.name };\nyield { type: "tool_use_input_delta", id,\n\tdelta: JSON.stringify(part.functionCall.args ?? {}) };\nyield { type: "tool_use_end", id };`,
			),
			d("pendingToolCalls (in the loop)", `{\n  "${READ_ID}": {\n    name: "Read",\n    inputJson: '{"file_path":"src/tools/index.ts"}'\n  }\n}`),
		],
		events: [
			{ bus: "stream", type: "tool_use_start", detail: `id ${READ_ID.slice(0, 8)}… · Read` },
			{ bus: "stream", type: "tool_use_input_delta", detail: `{"file_path":"src/tools/index.ts"}` },
			{ bus: "stream", type: "tool_use_end", detail: `id ${READ_ID.slice(0, 8)}…` },
		],
	},
	{
		id: "message-end-1",
		phase: "turn 1",
		title: "final chunk → message_end → turn_end",
		note: "Gemini reports usage only on the last chunk, and always says end_turn even when it called a tool — which is exactly why the loop decides from the blocks it collected instead of trusting stop_reason.",
		file: "src/providers/gemini.ts:118",
		nodes: ["streamBus", "runAgent"],
		edge: "assembler->runAgent",
		payloads: [
			d("StreamEvent", `{\n  type: "message_end",\n  stop_reason: "end_turn",          // gemini always\n  usage: { input_tokens: 2214, output_tokens: 38 }\n}`),
			d("assistantBlocks", `[\n  { type: "text", text: "Checking the tool registry." },\n  { type: "tool_use", id: "${READ_ID.slice(0, 8)}…",\n    name: "Read", input: { file_path: "src/tools/index.ts" } }\n]`),
		],
		events: [
			{ bus: "stream", type: "message_end", detail: "end_turn · in=2214 out=38" },
			{ bus: "agent", type: "turn_end", detail: "end_turn · in=2214 out=38" },
		],
		messages: { print: [M_USER, M_ASSISTANT_1], tui: [M_USER, M_ASSISTANT_1] },
		term: { print: [{ tone: "dim", text: "[tokens: in=2214 out=38]" }], tui: [] },
	},
	{
		id: "has-tools",
		phase: "tool",
		title: "hasToolCalls → keep going",
		note: "`assistantBlocks.some(b => b.type === 'tool_use')`. If this were false the loop would break here and the run would be one turn long.",
		file: "src/agent/loop.ts:103",
		nodes: ["runAgent", "toolRegistry"],
		edge: "runAgent->toolRegistry",
		payloads: [
			code(
				"src/agent/loop.ts",
				`// Gemini reports "end_turn" even when it calls tools, so decide based\n// on the blocks we actually received rather than on the stop reason.\nconst hasToolCalls = assistantBlocks.some((b) => b.type === "tool_use");\nif (!hasToolCalls) break;`,
			),
			d("getTool('Read')", `{\n  name: "Read",\n  readOnly: true,      // ← skips the permission gate\n  inputSchema: { … },\n  execute: async (input) => ToolResult\n}`),
		],
		events: [{ bus: "agent", type: "tool_start", detail: `Read {"file_path":"src/tools/index.ts"}` }],
		term: {
			print: [
				{ tone: "tool", text: "[Tool: Read]" },
				{ tone: "dim", text: '{\n  "file_path": "src/tools/index.ts"\n}' },
			],
			tui: [{ tone: "toolrow", text: "⏺ Read  src/tools/index.ts" }],
		},
	},
	{
		id: "readonly",
		phase: "tool",
		title: "permission gate — skipped",
		note: "readOnly tools observe without changing anything, so runToolCall never calls canUseTool for them. Read, Grep, Find, Ls, GitStatus, GitLog and GitDiff all take this path.",
		file: "src/agent/loop.ts:152",
		nodes: ["toolRegistry", "permissions"],
		edge: "toolRegistry->permissions",
		payloads: [
			code(
				"src/agent/loop.ts",
				`// Read-only tools observe without changing anything, so they never prompt.\nif (!tool.readOnly && options.canUseTool) {\n\tconst decision = await options.canUseTool(toolCall.name, toolCall.input);\n\tif (decision.behavior === "deny") {\n\t\treturn { output: decision.message, isError: true, denied: true };\n\t}\n}`,
			),
		],
	},
	{
		id: "read-exec",
		phase: "tool",
		title: "readTool.execute(input)",
		note: "Plain fs. The 1-indexed line-number gutter is added here, which is why the TUI strips it again when it previews a result.",
		file: "src/tools/read.ts:36",
		nodes: ["permissions", "toolExec"],
		edge: "permissions->toolExec",
		payloads: [
			d("input", `{ file_path: "src/tools/index.ts" }`),
			d("ToolResult", `{\n  isError: false,\n  output:\n${READ_RESULT.split("\n").slice(0, 6).map((l) => `    ${l}`).join("\n")}\n    …\n}`),
		],
		events: [{ bus: "agent", type: "tool_end", detail: "Read · 29 lines · isError=false" }],
		term: {
			print: [
				{ tone: "ok", text: "[Result: Read]" },
				{ tone: "dim", text: READ_RESULT.split("\n").slice(0, 4).join("\n") + "\n…" },
			],
			tui: [{ tone: "result", text: '  ✓ import type { ToolDefinition } from "../providers/types.js";  +14 lines' }],
		},
	},
	{
		id: "tool-result",
		phase: "tool",
		title: "tool results become a user turn",
		note: "Every tool_use block gets exactly one tool_result block, and they all land in a single user message. That pairing is what compaction's findSafeSplit protects.",
		file: "src/agent/loop.ts:126",
		nodes: ["toolExec", "assembler", "runAgent"],
		edge: "toolExec->assembler",
		payloads: [
			d(
				"toolResultMessage",
				`{\n  role: "user",\n  content: [\n    {\n      type: "tool_result",\n      tool_use_id: "${READ_ID.slice(0, 8)}…",\n      content: "1\\timport type { ToolDefinition } …",\n      is_error: false\n    }\n  ]\n}`,
			),
		],
		messages: [M_USER, M_ASSISTANT_1, M_RESULT_1],
	},
	{
		id: "turn2",
		phase: "turn 2",
		title: "loop back → complete() with 3 messages",
		note: "Same call, longer history. In Gemini's format the tool_result becomes a functionResponse part whose `name` is the tool-use id, since Gemini has no id field of its own.",
		file: "src/providers/gemini.ts:35",
		nodes: ["runAgent", "gemini", "api"],
		edge: "runAgent->gemini",
		payloads: [
			d(
				"contents (3)",
				`[\n  { role: "user",  parts: [ { text: "how many tools…" } ] },\n  { role: "model", parts: [ { text: "Checking the tool registry." },\n                            { functionCall: { name: "Read", args: {…} } } ] },\n  { role: "user",  parts: [ { functionResponse: {\n      name: "${READ_ID.slice(0, 8)}…",\n      response: { output: "1\\timport type …", is_error: false }\n  } } ] }\n]`,
			),
		],
	},
	{
		id: "chunk-write",
		phase: "turn 2",
		title: "chunk → functionCall Write",
		note: "The model read the registry, counted, and now wants to write the file. A fresh uuid is minted for this call.",
		file: "src/providers/gemini.ts:101",
		nodes: ["api", "streamBus", "assembler"],
		edge: "api->streamBus",
		payloads: [
			d(
				"raw chunk",
				`{ parts: [ { functionCall: {\n    name: "Write",\n    args: {\n      file_path: "TOOLS.md",\n      content: "cogent registers 15 tools.\\n\\nCore (7): …"\n    }\n} } ] }`,
			),
			d("StreamEvent × 3", `tool_use_start      id ${WRITE_ID.slice(0, 8)}… · Write\ntool_use_input_delta {"file_path":"TOOLS.md","content":"cogent registers 15 …"}\ntool_use_end        id ${WRITE_ID.slice(0, 8)}…`),
		],
		events: [
			{ bus: "stream", type: "tool_use_start", detail: `id ${WRITE_ID.slice(0, 8)}… · Write` },
			{ bus: "stream", type: "tool_use_input_delta", detail: `{"file_path":"TOOLS.md","content":"…"}` },
			{ bus: "stream", type: "tool_use_end", detail: `id ${WRITE_ID.slice(0, 8)}…` },
			{ bus: "stream", type: "message_end", detail: "end_turn · in=2890 out=126" },
			{ bus: "agent", type: "turn_end", detail: "end_turn · in=2890 out=126" },
			{ bus: "agent", type: "tool_start", detail: "Write TOOLS.md" },
		],
		messages: [M_USER, M_ASSISTANT_1, M_RESULT_1, M_ASSISTANT_2],
		term: {
			print: [
				{ tone: "dim", text: "[tokens: in=2890 out=126]" },
				{ tone: "tool", text: "[Tool: Write]" },
				{ tone: "dim", text: '{\n  "file_path": "TOOLS.md",\n  "content": "cogent registers 15 tools.\\n\\nCore (7): …"\n}' },
			],
			tui: [],
		},
	},
	{
		id: "gate",
		phase: "permission",
		title: {
			print: "permission gate — allowAll",
			tui: "permission gate — the dialog blocks the loop",
		},
		note: {
			print: "Write is not readOnly, so the gate runs — but print mode passed allowAll, because there is nobody at the keyboard to answer. This is the whole reason -p and the REPL differ.",
			tui: "canUseTool parks a promise, the App renders PermissionDialog, and the agent loop is suspended mid-await until a keypress resolves it. Choosing 'always' adds Write to alwaysAllowed for the session.",
		},
		file: { print: "src/permissions/types.ts:11", tui: "src/tui/App.tsx:74" },
		nodes: ["toolRegistry", "permissions"],
		edge: "toolRegistry->permissions",
		payloads: {
			print: [code("src/permissions/types.ts", `export const allowAll: CanUseTool = async () => ({ behavior: "allow" });`)],
			tui: [
				d("PendingPermission", `{\n  name: "Write",\n  summary: "TOOLS.md",        // describeTool(name, input)\n  resolve: (choice) => void   // ← the loop is awaiting this\n}`),
				d("PermissionDecision", `{ behavior: "allow" }   // or\n{ behavior: "deny", message: "The user denied permission to run Write. …" }`),
			],
		},
		term: {
			tui: {
				allow: [
					{ tone: "dialog", text: "╭─────────────────────────────────────────────╮" },
					{ tone: "dialog", text: "│ Write wants to run                          │" },
					{ tone: "dialog", text: "│ TOOLS.md                                    │" },
					{ tone: "dialog", text: "│ ❯ Yes, run it once                          │" },
					{ tone: "dialog", text: "│   Yes, and don't ask again for this tool    │" },
					{ tone: "dialog", text: "│   No, tell the model to stop                │" },
					{ tone: "dialog", text: "╰─────────────────────────────────────────────╯" },
				],
				deny: [
					{ tone: "dialog", text: "╭─────────────────────────────────────────────╮" },
					{ tone: "dialog", text: "│ Write wants to run                          │" },
					{ tone: "dialog", text: "│ TOOLS.md                                    │" },
					{ tone: "dialog", text: "│   Yes, run it once                          │" },
					{ tone: "dialog", text: "│   Yes, and don't ask again for this tool    │" },
					{ tone: "dialog", text: "│ ❯ No, tell the model to stop                │" },
					{ tone: "dialog", text: "╰─────────────────────────────────────────────╯" },
				],
			},
		},
	},
	{
		id: "write-exec",
		phase: "permission",
		title: {
			allow: "writeTool.execute(input)",
			deny: "denied — execute() is never reached",
		},
		note: {
			allow: "mkdir -p on the parent, then writeFile. The ToolResult goes back as a tool_result block like any other.",
			deny: "runToolCall returns before touching the tool. The deny message becomes an is_error tool_result, so the model sees a normal (failed) tool outcome and can adapt — the run does not die.",
		},
		file: { allow: "src/tools/write.ts:28", deny: "src/agent/loop.ts:155" },
		nodes: { allow: ["permissions", "toolExec", "assembler"], deny: ["permissions", "assembler"] },
		edge: { allow: "permissions->toolExec", deny: "toolExec->assembler" },
		payloads: {
			allow: [
				d("TOOLS.md (written)", TOOLS_MD),
				d("ToolResult", `{ output: "File written: /home/you/cogent/TOOLS.md", isError: false }`),
			],
			deny: [
				d("PermissionDecision", `{\n  behavior: "deny",\n  message: "The user denied permission to run Write. Do not retry\n            this call; ask what they'd like instead."\n}`),
				d("ToolCallOutcome", `{ output: <that message>, isError: true, denied: true }`),
			],
		},
		events: {
			allow: [{ bus: "agent", type: "tool_end", detail: "Write · isError=false" }],
			deny: [
				{ bus: "agent", type: "tool_denied", detail: "Write · user said no" },
				{ bus: "agent", type: "tool_end", detail: "Write · isError=true" },
			],
		},
		messages: {
			allow: [M_USER, M_ASSISTANT_1, M_RESULT_1, M_ASSISTANT_2, M_RESULT_2],
			deny: [M_USER, M_ASSISTANT_1, M_RESULT_1, M_ASSISTANT_2, M_RESULT_2_DENIED],
		},
		term: {
			print: {
				allow: [
					{ tone: "ok", text: "[Result: Write]" },
					{ tone: "dim", text: "File written: /home/you/cogent/TOOLS.md" },
				],
				deny: [{ tone: "err", text: "[Denied: Write] The user denied permission to run Write." }],
			},
			tui: {
				allow: [
					{ tone: "toolrow", text: "⏺ Write  TOOLS.md" },
					{ tone: "result", text: "  ✓ File written: /home/you/cogent/TOOLS.md" },
				],
				deny: [
					{ tone: "toolrow", text: "⏺ Write  TOOLS.md" },
					{ tone: "err", text: "  ✗ The user denied permission to run Write.  +1 lines" },
				],
			},
		},
	},
	{
		id: "turn3",
		phase: "turn 3",
		title: "third pass → text only",
		note: "Five messages go up, prose comes back, no functionCall part appears. hasToolCalls is false, so the while loop breaks.",
		file: "src/agent/loop.ts:104",
		nodes: ["runAgent", "gemini", "api", "streamBus"],
		edge: "api->streamBus",
		payloads: {
			allow: [d("StreamEvent stream", `text_delta  "**15 tools.** Seven core file/shell tools — "\ntext_delta  "\`Read\`, \`Write\`, \`Edit\`, \`Bash\`, \`Grep\`, \`Find\`, \`Ls\`"\ntext_delta  " — plus the eight in \`GIT_TOOLS\` …"\nmessage_end end_turn · in=3105 out=74`)],
			deny: [d("StreamEvent stream", `text_delta  "**15 tools** — 7 core plus 8 git tools. I did not "\ntext_delta  "write \`TOOLS.md\`; tell me where you'd like it instead."\nmessage_end end_turn · in=3120 out=41`)],
		},
		events: [
			{ bus: "stream", type: "text_delta", detail: "× 12 chunks" },
			{ bus: "stream", type: "message_end", detail: "end_turn · in=3105 out=74" },
			{ bus: "agent", type: "turn_end", detail: "end_turn · in=3105 out=74" },
		],
		messages: {
			allow: [M_USER, M_ASSISTANT_1, M_RESULT_1, M_ASSISTANT_2, M_RESULT_2, M_ASSISTANT_3],
			deny: [M_USER, M_ASSISTANT_1, M_RESULT_1, M_ASSISTANT_2, M_RESULT_2_DENIED, M_ASSISTANT_3_DENIED],
		},
		term: {
			print: {
				allow: [
					{ tone: "assistant", text: ANSWER },
					{ tone: "dim", text: "[tokens: in=3105 out=74]" },
				],
				deny: [
					{ tone: "assistant", text: M_ASSISTANT_3_DENIED.content[0].text },
					{ tone: "dim", text: "[tokens: in=3120 out=41]" },
				],
			},
			tui: {
				allow: [{ tone: "assistant", text: ANSWER }],
				deny: [{ tone: "assistant", text: M_ASSISTANT_3_DENIED.content[0].text }],
			},
		},
	},
	{
		id: "agent-end",
		phase: "finish",
		title: "agent_end { messages, newMessages }",
		note: "Two arrays, on purpose: `messages` is the history the loop ended with (possibly compacted), `newMessages` is only what this run produced — so the append-only JSONL never gets a duplicate.",
		file: "src/agent/loop.ts:135",
		nodes: ["runAgent", "mode"],
		edge: "runAgent->mode",
		payloads: [
			d("AgentEvent", `{\n  type: "agent_end",\n  messages:    Message[6],   // full history\n  newMessages: Message[5]    // everything after the user turn\n}`),
		],
		events: [{ bus: "agent", type: "agent_end", detail: "messages=6 newMessages=5" }],
	},
	{
		id: "persist",
		phase: "finish",
		title: "saveMessages(sessionId, newMessages)",
		note: "One JSONL line per message, appended. Resuming with --session replays these lines back into messages[] and the conversation continues on any provider you like.",
		file: "src/session/manager.ts:26",
		nodes: ["mode", "sessionStore"],
		edge: "mode->sessionStore",
		payloads: [
			d(
				".cogent/sessions/9f2c1b7e….jsonl",
				`{"type":"session_info","id":"9f2c1b7e…","model":"gemini-2.5-flash",…}\n{"type":"message","message":{"role":"user","content":"how many tools…"}}\n{"type":"message","message":{"role":"assistant","content":[{"type":"text",…},{"type":"tool_use",…}]}}\n{"type":"message","message":{"role":"user","content":[{"type":"tool_result",…}]}}\n{"type":"message","message":{"role":"assistant","content":[{"type":"tool_use",…}]}}\n{"type":"message","message":{"role":"user","content":[{"type":"tool_result",…}]}}\n{"type":"message","message":{"role":"assistant","content":[{"type":"text",…}]}}`,
			),
		],
	},
	{
		id: "done",
		phase: "finish",
		title: {
			print: "process exits",
			tui: "back to the prompt",
		},
		note: {
			print: "runPrintMode's for-await drains, main() returns, node exits. The session id is on disk if you want to pick it up again.",
			tui: "setBusy(false), the input box takes focus again, and messages.current is already the compacted-or-not history for the next turn.",
		},
		file: { print: "src/modes/print.ts:12", tui: "src/tui/App.tsx:170" },
		nodes: ["mode", "screen"],
		edge: "mode->screen",
		payloads: [d("resume", `$ cogent --session ${SESSION_ID}`)],
		term: {
			print: [{ tone: "dim", text: "" }],
			tui: [{ tone: "dim", text: "gemini/gemini-2.5-flash · context 0% · /help for commands" }],
		},
	},
];

// --- resolution helpers -----------------------------------------------------
// Fields may be a plain value, or an object keyed by mode ("print" / "tui")
// and/or by the permission answer ("allow" / "deny"). Resolve outside-in.

function resolve(value, mode, answer) {
	if (value && !Array.isArray(value) && typeof value === "object") {
		if ("print" in value || "tui" in value) return resolve(value[mode], mode, answer);
		if ("allow" in value || "deny" in value) return resolve(value[answer], mode, answer);
	}
	return value;
}

export function stepsFor(mode) {
	return STEPS.filter((s) => !s.only || s.only === mode);
}

export function viewStep(step, mode, answer) {
	const gate = mode === "print" ? "allowAll" : "TUI dialog";
	const payloads = (resolve(step.payloads, mode, answer) ?? []).map((p) => ({
		...p,
		text: p.text.replace("$MODE_GATE$", gate),
	}));
	return {
		...step,
		title: resolve(step.title, mode, answer),
		nodes: resolve(step.nodes, mode, answer) ?? [],
		edge: resolve(step.edge, mode, answer),
		note: resolve(step.note, mode, answer),
		file: resolve(step.file, mode, answer),
		payloads,
		events: resolve(step.events, mode, answer) ?? [],
		term: resolve(step.term, mode, answer) ?? [],
		messages: resolve(step.messages, mode, answer),
	};
}

// Replay steps 0..index to derive the whole world: what is on screen, which
// events have fired, and what messages[] currently holds.
export function replay(steps, index, mode, answer) {
	const events = [];
	const term = [];
	let messages = [];
	for (let i = 0; i <= index && i < steps.length; i++) {
		const s = viewStep(steps[i], mode, answer);
		for (const e of s.events) events.push({ ...e, step: i });
		for (const t of s.term) term.push({ ...t, step: i });
		if (s.messages) messages = s.messages;
	}
	return { events, term, messages };
}
