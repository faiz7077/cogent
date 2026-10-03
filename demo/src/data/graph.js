// The call graph drawn on the canvas. Coordinates are hand-placed in a fixed
// world space; the canvas pans/zooms over it, so nothing here has to know about
// the viewport. Node ids are referenced by every step in scenario.js.

export const NODE_W = 196;
export const NODE_H = 56;

export const WORLD = { width: 1960, height: 520 };

// One colour per layer of the system, used for the stripe down a node's left edge
// and for the legend — the same seams the src/ tree is organised by.
export const GROUP_COLORS = {
	io: "#8d8078",
	core: "#c96442",
	config: "#e0af68",
	ui: "#7aa2f7",
	store: "#9ece6a",
	agent: "#c96442",
	tools: "#7dcfff",
	provider: "#bb9af7",
	net: "#5e7c8a",
	perm: "#f7768e",
};

export const LEGEND = [
	["core", "entry"],
	["config", "config"],
	["agent", "agent loop"],
	["provider", "provider"],
	["tools", "tools"],
	["perm", "permissions"],
	["ui", "renderer"],
	["store", "session"],
];

export const NODES = [
	{ id: "argv", label: "shell", sub: "process.argv", x: 20, y: 240, group: "io" },
	{ id: "main", label: "main()", sub: "src/main.ts", x: 248, y: 240, group: "core" },

	{ id: "parseArgs", label: "parseArgs()", sub: "src/cli/args.ts", x: 486, y: 20, group: "config" },
	{ id: "loadSettings", label: "loadSettings()", sub: "src/config/settings.ts", x: 486, y: 92, group: "config" },
	{ id: "systemPrompt", label: "buildSystemPrompt()", sub: "src/config/system-prompt.ts", x: 486, y: 164, group: "config" },
	{ id: "sessionCreate", label: "createSession()", sub: "src/session/manager.ts", x: 486, y: 236, group: "config" },

	{ id: "mode", label: "MODE", sub: "renderer", x: 486, y: 340, group: "ui", dynamic: "mode" },
	{ id: "screen", label: "your terminal", sub: "AgentEvent → pixels", x: 248, y: 420, group: "io" },
	{ id: "sessionStore", label: "appendEntry()", sub: ".cogent/sessions/<id>.jsonl", x: 486, y: 440, group: "store" },

	{ id: "runAgent", label: "runAgent()", sub: "src/agent/loop.ts", x: 760, y: 240, group: "agent" },
	{ id: "assembler", label: "assemble blocks", sub: "loop.ts · pendingToolCalls", x: 760, y: 356, group: "agent" },

	{ id: "compaction", label: "shouldCompact()", sub: "src/agent/compaction.ts", x: 1020, y: 20, group: "agent" },
	{ id: "toolDefs", label: "getToolDefinitions()", sub: "src/tools/index.ts", x: 1020, y: 96, group: "tools" },
	{ id: "createProvider", label: "createProvider()", sub: "src/providers/index.ts", x: 1020, y: 240, group: "provider" },

	{ id: "gemini", label: "gemini.complete()", sub: "src/providers/gemini.ts", x: 1290, y: 240, group: "provider" },
	{ id: "api", label: "Gemini API", sub: "generateContentStream", x: 1560, y: 240, group: "net" },
	{ id: "streamBus", label: "StreamEvent", sub: "text_delta · tool_use_* · end", x: 1290, y: 356, group: "provider" },

	{ id: "toolRegistry", label: "getTool(name)", sub: "src/tools/index.ts", x: 1020, y: 440, group: "tools" },
	{ id: "permissions", label: "canUseTool()", sub: "src/permissions/*", x: 1290, y: 440, group: "perm" },
	{ id: "toolExec", label: "tool.execute()", sub: "filesystem · shell", x: 1560, y: 440, group: "tools" },
];

// dir: "fwd" curves right-to-left of the next node; "back" loops underneath.
export const EDGES = [
	{ id: "argv->main", from: "argv", to: "main", label: "argv.slice(2)" },
	{ id: "main->parseArgs", from: "main", to: "parseArgs", label: "argv" },
	{ id: "main->loadSettings", from: "main", to: "loadSettings", label: "—" },
	{ id: "main->systemPrompt", from: "main", to: "systemPrompt", label: "settings.systemPromptExtra" },
	{ id: "main->sessionCreate", from: "main", to: "sessionCreate", label: "model, provider" },
	{ id: "sessionCreate->sessionStore", from: "sessionCreate", to: "sessionStore", label: "session_info" },
	{ id: "main->mode", from: "main", to: "mode", label: "options" },
	{ id: "mode->runAgent", from: "mode", to: "runAgent", label: "AgentOptions" },
	{ id: "runAgent->compaction", from: "runAgent", to: "compaction", label: "messages" },
	{ id: "runAgent->toolDefs", from: "runAgent", to: "toolDefs", label: "—" },
	{ id: "runAgent->createProvider", from: "runAgent", to: "createProvider", label: 'name + apiKey' },
	{ id: "createProvider->gemini", from: "createProvider", to: "gemini", label: "Provider" },
	{ id: "runAgent->gemini", from: "runAgent", to: "gemini", label: "CompletionOptions", dashed: true },
	{ id: "gemini->api", from: "gemini", to: "api", label: "contents[] + config" },
	{ id: "api->streamBus", from: "api", to: "streamBus", label: "chunks", dir: "back" },
	{ id: "streamBus->assembler", from: "streamBus", to: "assembler", label: "StreamEvent", dir: "back" },
	{ id: "assembler->runAgent", from: "assembler", to: "runAgent", label: "ContentBlock[]" },
	{ id: "runAgent->toolRegistry", from: "runAgent", to: "toolRegistry", label: "tool_use block" },
	{ id: "toolRegistry->permissions", from: "toolRegistry", to: "permissions", label: "name, input" },
	{ id: "permissions->toolExec", from: "permissions", to: "toolExec", label: "allow" },
	{ id: "toolExec->assembler", from: "toolExec", to: "assembler", label: "ToolResult", dir: "back" },
	{ id: "runAgent->mode", from: "runAgent", to: "mode", label: "AgentEvent", dir: "back" },
	{ id: "mode->screen", from: "mode", to: "screen", label: "rendered rows" },
	{ id: "mode->sessionStore", from: "mode", to: "sessionStore", label: "newMessages" },
];

export const NODE_BY_ID = Object.fromEntries(NODES.map((n) => [n.id, n]));

// Anchor picking: leave from the side that actually faces the target, so edges
// never cut back across their own node.
function anchors(a, b) {
	const ac = { x: a.x + NODE_W / 2, y: a.y + NODE_H / 2 };
	const bc = { x: b.x + NODE_W / 2, y: b.y + NODE_H / 2 };
	const dx = bc.x - ac.x;
	const dy = bc.y - ac.y;

	if (Math.abs(dx) > 40) {
		const right = dx > 0;
		return {
			s: { x: right ? a.x + NODE_W : a.x, y: ac.y },
			e: { x: right ? b.x : b.x + NODE_W, y: bc.y },
			horizontal: true,
		};
	}
	const down = dy > 0;
	return {
		s: { x: ac.x, y: down ? a.y + NODE_H : a.y },
		e: { x: bc.x, y: down ? b.y : b.y + NODE_H },
		horizontal: false,
	};
}

export function edgePath(edge) {
	const a = NODE_BY_ID[edge.from];
	const b = NODE_BY_ID[edge.to];
	const { s, e, horizontal } = anchors(a, b);

	if (horizontal) {
		const bend = Math.max(40, Math.abs(e.x - s.x) * 0.45);
		const dir = e.x > s.x ? 1 : -1;
		return `M ${s.x} ${s.y} C ${s.x + bend * dir} ${s.y}, ${e.x - bend * dir} ${e.y}, ${e.x} ${e.y}`;
	}
	const bend = Math.max(30, Math.abs(e.y - s.y) * 0.5);
	const dir = e.y > s.y ? 1 : -1;
	return `M ${s.x} ${s.y} C ${s.x} ${s.y + bend * dir}, ${e.x} ${e.y - bend * dir}, ${e.x} ${e.y}`;
}

export const EDGE_BY_ID = Object.fromEntries(EDGES.map((e) => [e.id, { ...e, d: edgePath(e) }]));
