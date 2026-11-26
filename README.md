# Dash Isometric

An isometric three.js view of a Dash workspace: orgs, projects, runners and their slots, and tasks.

## Architecture

```
 Browser (client/)  ──WebSocket──▶  Bridge (bridge/)  ──MCP──▶  Dash MCP server
 Vite + three.js                    Node + ws                    (source of truth)
```

- **`shared/`** – domain types (`Org`, `Project`, `Runner`, `Slot`, `Task`, `Goal`, `ChatMessage`)
  and the WebSocket protocol (`snapshot`, `delta`, `chat.send`, `chat.receive`) plus a pure
  `applyDelta` reducer. Consumed as TypeScript source by both other packages.
- **`bridge/`** – Node WebSocket server and MCP client. On connect it sends a `snapshot`; afterwards
  it pushes `delta`s. It talks to Dash through the `DashSource` interface (`bridge/src/source.ts`):
  `McpSource` polls the Dash MCP server, `MockSource` runs a simulator. See [Bridge](#bridge).
- **`client/`** – Vite + TypeScript app rendering the office as an isometric three.js scene (see
  below). Uses the `mockSnapshot()` fixture from `shared/` by default; open with `?live` to use
  bridge snapshots instead.

The browser never talks to MCP directly; the bridge is the only process holding Dash credentials.

### Client scene

- `client/src/world/` is scene building only, with no networking or UI. `World.update(state)` takes a
  `WorldState` and adds, restyles or removes one room per runner. Rooms keep their grid slot
  (`SlotAllocator`) as others come and go, and empty plots become small courtyards.
  - `layout.ts`: pure grid maths, slot allocation and wall cut-away rules
  - `instancing.ts`: growable `InstancedMesh` pools. Floor tiles, walls and every prop share
    about seven draw calls in total, however many rooms there are.
  - `room.ts`, `props.ts`, `palette.ts`, `textures.ts`: procedural rooms, low-poly props and
    canvas textures (tiles, grass, name plaques). There are no external assets.
- `camera.ts` (`IsoCameraRig`): orthographic isometric camera with pan, zoom to cursor and animated
  90° rotation. `input.ts` maps mouse and keys to it, and `panel.ts` is the HTML runner panel.
- Controls: drag or WASD/arrows to pan, wheel or `+`/`-` to zoom, Q/E to rotate, click a room to
  open its panel. With mock data, N adds a runner, X removes the last one and O toggles the
  selected runner online/offline.

## Scripts

| Command             | What it does                                        |
| ------------------- | --------------------------------------------------- |
| `npm install`       | Install all workspaces                              |
| `npm run dev`       | Run bridge (ws://localhost:8787) and client (:5173) |
| `npm run dev:mock`  | Same, with the bridge forced into `MOCK=1`          |
| `npm run build`     | Build client and bridge                             |
| `npm test`          | Run vitest across all packages                      |
| `npm run lint`      | ESLint + Prettier check                             |
| `npm run typecheck` | `tsc -b` for all packages                           |

Config: `BRIDGE_PORT` (bridge, default 8787), `VITE_BRIDGE_URL` (client, default `ws://localhost:8787`).
The bridge reads further settings from the environment or `bridge/.env`; see
[`bridge/.env.example`](bridge/.env.example).

## Bridge

```
             poll every DASH_POLL_MS          diffWorld(prev, next)
 Dash MCP ──list_projects/list_todos/──▶ mapping.ts ──▶ WorldState ──▶ delta[] ──▶ browsers
            list_goals (per project)       (tolerant)                    snapshot on connect
```

| File                        | Role                                                                  |
| --------------------------- | --------------------------------------------------------------------- |
| `bridge/src/config.ts`      | Env vars → `BridgeConfig`                                             |
| `bridge/src/mcp-source.ts`  | MCP client: transports, `listTools`, tool resolution, polling, chat   |
| `bridge/src/mapping.ts`     | Pure mapping of tool results onto `shared` domain types; runner/slots |
| `bridge/src/diff.ts`        | `diffWorld(prev, next)` → ordered `Delta[]` (upserts and removals)    |
| `bridge/src/source.ts`      | `DashSource` interface and `PollingSource` (poll → diff → emit)       |
| `bridge/src/mock-source.ts` | Simulator + canned chat (`MOCK=1`)                                    |
| `bridge/src/server.ts`      | WebSocket server; relays `chat.send` to the source                    |

### Connecting to Dash

Set **one** of:

- `DASH_MCP_URL` (+ `DASH_MCP_TOKEN`, sent as `Authorization: Bearer …`). With
  `DASH_MCP_TRANSPORT=auto` (default) the bridge tries streamable HTTP and falls back to the legacy
  SSE transport; force one with `http` or `sse`.
- `DASH_MCP_COMMAND` (+ `DASH_MCP_ARGS`) to spawn the server over stdio. The child inherits the
  bridge's environment.

Dash serves streamable-HTTP MCP with bearer tokens to its runners, and `/mcp` with OAuth on a hub's
`-public-url` (for claude.ai connectors). The bridge does **not** implement the OAuth flow, so use an
endpoint that accepts a bearer token.

On startup the bridge calls `listTools`, logs every tool, and logs which tool it uses for each
role (or `missing — stubbed`). Roles can be pointed at other tool names with `DASH_TOOL_<ROLE>`.

### What maps to what

| Domain        | Dash MCP tool      | Notes                                                                                                                                                        |
| ------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Project`     | `list_projects`    | Without it, projects come from `DASH_PROJECTS` (or one `default` project).                                                                                   |
| `Task`        | `list_todos`       | Called once per project if it takes a `project`/`project_id` argument. Dash statuses map onto `TaskStatus` (`running`→`in_progress`, `stopped`→`failed`, …). |
| `Goal`        | `list_goals`       | Per project, like tasks. `todo_ids`/`task_ids`/`todos` become `taskIds`.                                                                                     |
| `Runner/Slot` | _none_ (see below) | Inferred from tasks' `runner_name`/`runner` (+ `slot`) fields.                                                                                               |
| `ChatMessage` | _none_ (see below) | Relayed to a chat tool if one is configured.                                                                                                                 |
| `Org`         | _none_             | Name from `DASH_ORG_NAME`.                                                                                                                                   |

Results are read from `structuredContent` or from JSON in the text content. Field names are matched
leniently (`id`/`todo_id`, `title`/`name`/first line of `prompt`, …) because Dash publishes no
output schemas. A tool that returns plain text instead of JSON is reported once in the log and treated
as empty. Each poll builds a full `WorldState`, `diffWorld` compares it with the previous one, and
only changed entities are sent as `*.upsert` / `*.remove` / `org.update` deltas.

### Missing from the Dash MCP server (stubbed)

Checked against Dash 0.26: its board tools are `list_projects`, `get_project`, `update_project`,
`list_todos`, `get_todo`, `create_todo`, `update_todo`, `queue_todo`, `stop_todo`, `restart_todo`,
`delete_todo`, `approve_todo`, `send_back`, `get_diff`, `get_log`, `add_log`, `list_goals`,
`get_goal`, `create_goal`, `update_goal`, `stop_goal`, `delete_goal`, `list_cards`, `get_card`,
`create_card`, `update_card`, `list_deploys`, `create_release`, `report_issue`, `active_work`,
`run_tests`, `run_command`, `show_image`, `read_try_terminal`, `ask_user`. Missing for this app:

- **Runners and slots.** There is no `list_runners`. Runners are inferred from the runner named on
  running/merging tasks; slot count is the most tasks seen running on that runner at once, and
  online status is assumed. Idle runners that never ran a task are invisible, and runners that
  disappear are not removed until the bridge restarts. Active tasks without a runner sit on a
  synthetic `unassigned` runner. If a runner tool appears, set `DASH_TOOL_RUNNERS` (or name it
  `list_runners`) and its `slots`/`capacity` and `online`/`status` fields are used instead.
- **Org-level chat / project manager.** There is no chat tool, so `chat.send` gets a `system`
  reply saying chat isn't available. If one appears, set `DASH_TOOL_CHAT`; the bridge passes the
  text as its `message`/`text`/`prompt` argument and replies with the tool's text output.
- **Change notifications.** Dash pushes nothing over MCP, so the bridge polls (`DASH_POLL_MS`).
- **Org identity.** No tool returns the org; its name comes from `DASH_ORG_NAME`.

### Mock mode

`MOCK=1` (or `npm run dev:mock`) replaces Dash with a simulator, so the client can be developed
without a Dash server. It is also used automatically when neither `DASH_MCP_URL` nor
`DASH_MCP_COMMAND` is set (`MOCK=0` turns that off).

- Two projects, one goal each, and four runners with 1, 2, 4 and 3 slots.
- Tasks are created `queued`, picked up by free slots (`in_progress`), then go to `review` and
  `merged`; about 1 in 8 fails while running and a few fail in review. Finished tasks are removed
  after a while. Runner `delta` occasionally goes offline, failing its running tasks.
- A canned project manager answers chat: try "status", "how are the runners?", "what failed?".
- `MOCK_TICK_MS` sets the simulation speed (default 1500 ms).
