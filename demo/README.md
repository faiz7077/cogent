# cogent — dataflow canvas

An interactive React canvas that traces one real cogent run end to end:

```
main() → runPrintMode() / <App/> → runAgent() → gemini.complete() → StreamEvent
      → tool calls → permission gate → tool.execute() → tool_result → back into the loop
```

Every payload on screen is the shape the corresponding function in `../src`
actually passes — `CliArgs`, `Settings`, `AgentOptions`, `CompletionOptions`,
Gemini's raw chunks, `StreamEvent`, `ContentBlock[]`, `ToolResult`, the JSONL
session lines. Each step names the file and line it comes from. The provider is
pinned to **gemini / gemini-2.5-flash** throughout.

## Run it

```bash
cd demo
npm install
npm run dev      # http://localhost:5178
```

## The run being traced

```
$ cogent -p "how many tools does cogent register? write the answer to TOOLS.md"
```

Three turns: the model calls `Read` (read-only, no prompt), then `Write` (not
read-only, so the permission gate runs), then answers in prose and the loop
breaks because no `tool_use` block came back.

## Controls

| | |
|---|---|
| `space` | play / pause |
| `←` `→` | step |
| `Home` | back to the start |
| drag / scroll | pan / zoom the canvas |
| click a rail tick | jump to that step |

Two toggles change what you are watching:

- **mode** — `--print` (`src/modes/print.ts`) versus the Ink **TUI**
  (`src/tui/App.tsx`). They differ in three real ways: what lands on `argv`,
  who answers the permission gate (`allowAll` versus a dialog that suspends the
  loop mid-`await`), and how the same `AgentEvent` stream is rendered.
- **Write permission** — `allow` or `deny`. Denying shows the branch where
  `tool.execute()` is never reached and the deny message comes back as an
  `is_error` tool_result, so the model adapts instead of the run dying.

The URL hash carries all three: `#tui/deny/26` reopens exactly that frame.

## Panels

- **Canvas** — the call graph. Nodes light up as they are touched and stay lit,
  so it reads as a trace rather than a spotlight. The active edge carries the
  name of the data crossing it. Colour is the layer: entry, config, agent loop,
  provider, tools, permissions, renderer, session.
- **Inspector** — three tabs: `payload` (the data and the source line for this
  step), `messages[n]` (the live `Message[]` array, blocks and all), and
  `events[n]` (every `StreamEvent` and `AgentEvent` yielded so far).
- **Terminal** — what you would actually see, replaying `modes/print.ts`'s chalk
  output or the TUI's transcript rows.

## Layout

```
src/
├── main.jsx
├── App.jsx                 # state: mode · permission answer · step index
├── styles.css
├── data/
│   ├── graph.js            # nodes, edges, layout, bezier routing
│   ├── messages.js         # Message[] snapshots — real src/types.ts shapes
│   └── scenario.js         # the ~30-step timeline + replay()
└── components/
    ├── Canvas.jsx          # pan/zoom SVG graph
    ├── Inspector.jsx       # step header, payloads, events, messages
    └── Terminal.jsx
```

State is derived, never mutated: `replay(steps, index, mode, answer)` folds
steps `0..index` into `{ events, term, messages }`, which is why scrubbing
backwards and flipping a toggle mid-run both just work.

## Two pages

The header switches between them; both trace the same run and share the
allow/deny toggle.

### dataflow — `#print/allow/0`

The call graph on a pan/zoom canvas: `main()` down to `tool.execute()`, one step
at a time, with the exact payload crossing each edge.

### streaming — `#stream/allow/0`

One tick at a time from the SSE frame to the pixel, in four lanes:

| lane | what it is |
|------|-----------|
| 1 · SSE chunk | the raw object `generateContentStream()` yields |
| 2 · StreamEvent | what `gemini.ts` adapts each chunk's parts into |
| 3 · loop locals | live `assistantBlocks[]` and `pendingToolCalls{}` |
| 4 · AgentEvent | what `runAgent()` yields to whoever is rendering |

The transcript underneath is built **only** from lane 4, the same way the real
UI builds it.

Lane 3 and lane 4 are not scripted. `loopStep()` in `src/data/stream.js` is the
`for await (const event of stream)` body from `src/agent/loop.ts` transcribed
line-for-line, and every panel is a projection of `foldTo(ticks, index)` — so
text blocks concatenate, tool calls assemble through `pendingToolCalls`, and
`JSON.parse` happens on `tool_use_end` because that is where cogent does it.

Things the streaming page makes visible that the canvas cannot:

- a `functionCall` chunk fires `tool_use_start` / `input_delta` / `tool_use_end`
  back to back, because Gemini sends the whole args object at once — the loop
  still assembles it, since Anthropic streams the same call as fragments
- `usageMetadata` only shows up on the final chunk
- the loop suspends mid-turn on `await options.canUseTool(...)`; nothing streams
  while a human decides
- a denial is a `tool_end` with `isError: true`, not a throw, and turn 3 visibly
  adapts to it
- the run ends on `hasToolCalls === false`, not on the stop reason

## Resizing

The divider between the main view and the inspector drags; double-click resets
it to 430px. The width is remembered in `localStorage`.
