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
  below). Connects to the bridge by default; open with `?fixture` to use the static
  `mockSnapshot()` fixture from `shared/` instead.

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
- Desks and workers (`world/desks.ts`, `worker-fsm.ts`, `character.ts`, `worker.ts`,
  `effects.ts`): each room has one desk with a computer and one worker per runner slot. Workers
  are procedural low-poly people (colours, hair, glasses, names seeded from runner id and slot).
  `WorkerBrain` is a pure state machine: `idle` (wandering, at the water cooler, chatting) →
  `toDesk` → `sittingDown` → `typing` (monitor glows, speech bubble with task title and project)
  → `gettingUp` when the slot frees up; `leaving` → `gone` when a slot is removed (new slots walk
  in from the door). `syncSlot` maps slot changes onto it and reads the outcome from the task's
  final status: a green tick with confetti for `review`/`merging`/`merged`, a red puff of smoke
  for `failed`. Animation is procedural (walk cycle, bobbing, typing arms).
- The north wing (`world/wing.ts` lays it out; each feature is its own module) sits in a row
  north of the grid beside the PM's office, and is fed from the same store:
  - `world/reception.ts`: the waiting room. One visitor per queued task (`planSeats` keeps seats
    stable), an LED sign with the full count, and the walk from the bench to the runner's room
    when Dash picks the task up.
  - `world/review.ts`: the review office (inbox tray, outbox, trophy shelf, repair bin).
  - `world/noticeboard.ts`: the goals board, drawn to a canvas texture; `goalProgress` is pure.
  - `world/projects.ts`: project colours (`projectHex`/`projectCss`) and the lobby banners.
    Workers wear a badge and armband in their task's project colour (`world/worker.ts`).
  - `world/features.ts`: click targets. `World.pickFeature` and `World.featureAt` resolve a
    click to `{ kind: 'queue' | 'review' | 'goals' | 'project', … }`.
- `hud.ts` + `events.ts`: the bottom HUD bar. `EventLog` diffs snapshots into ticker events and
  counts merges since local midnight. It uses the task's `updatedAt` when Dash reports one
  (`merged_at`/`updated_at`/…) and otherwise counts only merges it saw happen.
- `panels/`: details overlays. `overlay.ts` is the shell, and each feature has its own view
  module (`queue-panel`, `review-panel`, `goals-panel`, `project-panel`, `activity-panel`).
- `store.ts` mirrors the bridge's world from `snapshot`/`delta` messages; `socket.ts`
  (`BridgeConnection`) feeds it and reconnects with exponential backoff (0.5 s up to 10 s). The
  scene is re-synced at most once per frame.
- `worker-panel.ts`: clicking a worker opens an overlay with its task (title, project, status,
  id, goals), or its last task and outcome when idle.
- `camera.ts` (`IsoCameraRig`): orthographic isometric camera with pan, zoom to cursor and animated
  90° rotation. `input.ts` maps mouse and keys to it, and `panel.ts` is the HTML runner panel.
- Controls: drag or WASD/arrows to pan, wheel or `+`/`-` to zoom, Q/E to rotate, click a room or
  a worker to open its panel. Click anything in the legend below (or a HUD counter, or the
  ticker) to open its overlay, and press Esc to close it. With `?fixture`, N adds a runner, X removes the last one, O toggles
  the selected runner online/offline, T starts a task on (or finishes one in) the selected room,
  and Y / Shift+Y add or remove a slot.

### Legend

| In the office                               | Means                                                                                                                                  | Click opens                        |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| Room with a brass plaque                    | A runner. Lights out (grey, dim) when it is offline.                                                                                   | Runner panel                       |
| Worker at a desk, speech bubble             | A slot working on a task. The bubble shows the title and project.                                                                      | Worker panel                       |
| Badge and armband on a worker               | The colour of the project the worker's task belongs to.                                                                                | Worker panel                       |
| Green tick and confetti / red puff of smoke | A task left a slot for review or merge / failed.                                                                                       | –                                  |
| **Reception**: visitor on a bench           | A queued task (one visitor per task, shirt in the project colour). Up to 16 sit and the rest stand. The LED sign shows the full count. | Queue, with that task highlighted  |
| Visitor walking out of reception            | Dash picked the task up. The visitor walks to the runner's room (or out of the door if the task left the queue some other way).        | Queue                              |
| **Noticeboard** card in reception           | A goal: project stripe, title, progress bar (merged / linked tasks).                                                                   | That goal, or all goals            |
| **Banner** on a brass pole in reception     | A project, in its colour. Furled grey when the HUD filter hides that project.                                                          | Project overview (+ filter button) |
| **Review**: folders in the inbox tray       | Tasks in review, one coloured folder each (up to 12).                                                                                  | In review                          |
| Folders in the outbox tray                  | Tasks merging.                                                                                                                         | Merging                            |
| Gold cups on the trophy shelf               | Merged tasks Dash still lists, on project-coloured plinths (up to 18).                                                                 | Merged                             |
| Crumpled paper in the red repair bin        | Failed tasks (up to 10).                                                                                                               | Repair                             |
| Project manager                             | Org-wide chat.                                                                                                                         | Chat                               |

The **HUD bar** at the bottom has counters (🏃 running = in progress or merging, 🪑 queued, 📂 in
review, 🏆 merged today, 🔧 failed), a project filter, and a ticker of recent events. Each
counter opens the matching overlay, and the ticker opens the event log. The filter narrows the
counters, the ticker, the overlays, the visitors, the folders, the trophies and the noticeboard
to one project.

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

Run `npm run dev:mock` and open http://localhost:5173 to watch the simulator drive the office.

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

| Domain        | Dash MCP tool      | Notes                                                                                                                                                                                                                             |
| ------------- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Project`     | `list_projects`    | Without it, projects come from `DASH_PROJECTS` (or one `default` project).                                                                                                                                                        |
| `Task`        | `list_todos`       | Called once per project if it takes a `project`/`project_id` argument. Dash statuses map onto `TaskStatus` (`running`→`in_progress`, `stopped`→`failed`, …). `merged_at`/`finished_at`/`completed_at`/`updated_at` → `updatedAt`. |
| `Goal`        | `list_goals`       | Per project, like tasks. `todo_ids`/`task_ids`/`todos` become `taskIds`.                                                                                                                                                          |
| `Runner/Slot` | _none_ (see below) | Inferred from tasks' `runner_name`/`runner` (+ `slot`) fields.                                                                                                                                                                    |
| `ChatMessage` | _none_ (see below) | Relayed to a chat tool if one is configured.                                                                                                                                                                                      |
| `Org`         | _none_             | Name from `DASH_ORG_NAME`.                                                                                                                                                                                                        |

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
- Tasks are created `queued` (the simulator keeps up to 8 waiting and picks them up slowly, so
  reception has visitors), picked up by free slots (`in_progress`), then go to `review` and
  `merged`, with an `updatedAt` stamp on each change; about 1 in 8 fails while running and a few fail in review. Finished tasks are removed
  after a while. Runner `delta` occasionally goes offline, failing its running tasks.
- A canned project manager answers chat: try "status", "how are the runners?", "what failed?".
- `MOCK_TICK_MS` sets the simulation speed (default 1500 ms).
