// Snapshots of the `messages: Message[]` array as the run progresses. Every
// shape here matches src/types.ts exactly — this is the data cogent actually
// passes around, not a simplification.

export const PROMPT = "how many tools does cogent register? write the answer to TOOLS.md";

export const SESSION_ID = "9f2c1b7e-0d4a-4c85-9d3f-1a6b8e5c2d10";
export const CREATED_AT = "2026-09-07T14:22:08.311Z";

// Gemini gives tool calls no id, so the adapter mints one with crypto.randomUUID().
export const READ_ID = "8f14e45f-ceea-467a-9f1a-2b0c1d3e4f50";
export const WRITE_ID = "b27a6d31-4c8e-4f02-9a55-7e1d0c9b3a44";

export const READ_RESULT = `1\timport type { ToolDefinition } from "../providers/types.js";
2\timport { bashTool } from "./bash.js";
3\timport { editTool } from "./edit.js";
4\timport { findTool } from "./find.js";
5\timport { GIT_TOOLS } from "./git.js";
6\timport { grepTool } from "./grep.js";
7\timport { lsTool } from "./ls.js";
8\timport { readTool } from "./read.js";
9\timport type { Tool } from "./types.js";
10\timport { writeTool } from "./write.js";
11\t
12\texport * from "./types.js";
13\t
14\t// All tools registered here — add new tools to this list
15\texport const ALL_TOOLS: Tool[] = [readTool, writeTool, editTool, bashTool, grepTool, findTool, lsTool, ...GIT_TOOLS];
… (14 more lines)`;

export const TOOLS_MD = `cogent registers 15 tools.

Core (7): Read, Write, Edit, Bash, Grep, Find, Ls
Git (8): GitStatus, GitLog, GitDiff, GitAdd, GitCommit, GitBranch, GitCheckout, GitReset
`;

export const ANSWER = `**15 tools.** Seven core file/shell tools — \`Read\`, \`Write\`, \`Edit\`, \`Bash\`, \`Grep\`, \`Find\`, \`Ls\` — plus the eight in \`GIT_TOOLS\`, all spread into \`ALL_TOOLS\` in \`src/tools/index.ts\`. Written to \`TOOLS.md\`.`;

export const M_USER = { role: "user", content: PROMPT };

export const M_ASSISTANT_1 = {
	role: "assistant",
	content: [
		{ type: "text", text: "Checking the tool registry." },
		{ type: "tool_use", id: READ_ID, name: "Read", input: { file_path: "src/tools/index.ts" } },
	],
};

export const M_RESULT_1 = {
	role: "user",
	content: [{ type: "tool_result", tool_use_id: READ_ID, content: READ_RESULT, is_error: false }],
};

export const M_ASSISTANT_2 = {
	role: "assistant",
	content: [{ type: "tool_use", id: WRITE_ID, name: "Write", input: { file_path: "TOOLS.md", content: TOOLS_MD } }],
};

export const M_RESULT_2 = {
	role: "user",
	content: [
		{
			type: "tool_result",
			tool_use_id: WRITE_ID,
			content: "File written: /home/you/cogent/TOOLS.md",
			is_error: false,
		},
	],
};

export const M_RESULT_2_DENIED = {
	role: "user",
	content: [
		{
			type: "tool_result",
			tool_use_id: WRITE_ID,
			content: "The user denied permission to run Write. Do not retry this call; ask what they'd like instead.",
			is_error: true,
		},
	],
};

export const M_ASSISTANT_3 = { role: "assistant", content: [{ type: "text", text: ANSWER }] };

export const M_ASSISTANT_3_DENIED = {
	role: "assistant",
	content: [
		{
			type: "text",
			text: "**15 tools** — 7 core plus 8 git tools. I did not write `TOOLS.md`; tell me where you'd like it instead.",
		},
	],
};
