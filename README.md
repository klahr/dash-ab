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
- **`bridge/`** – Node WebSocket server. On connect it sends a `snapshot`; afterwards it pushes
  `delta`s. It talks to Dash through the `DashSource` interface (`bridge/src/source.ts`). Only a
  `MockSource` exists today; a real implementation should be an MCP client against the Dash MCP server.
- **`client/`** – Vite + TypeScript app. Renders a placeholder scene with an orthographic isometric
  camera and mirrors world state received from the bridge.

The browser never talks to MCP directly; the bridge is the only process holding Dash credentials.

## Scripts

| Command             | What it does                                        |
| ------------------- | --------------------------------------------------- |
| `npm install`       | Install all workspaces                              |
| `npm run dev`       | Run bridge (ws://localhost:8787) and client (:5173) |
| `npm run build`     | Build client and bridge                             |
| `npm test`          | Run vitest across all packages                      |
| `npm run lint`      | ESLint + Prettier check                             |
| `npm run typecheck` | `tsc -b` for all packages                           |

Config: `BRIDGE_PORT` (bridge, default 8787), `VITE_BRIDGE_URL` (client, default `ws://localhost:8787`).
