# Spacienta — OpenAI WebMCP Challenge

**Collaborative Spatial Accessibility Planning**

> Human and AI build, understand and improve real living spaces together.

Spacienta is a client-side 3D accessibility-planning web app built for the **OpenAI WebMCP Challenge**. Users can recreate a real room with parametrized furniture and fixed room features, then work with an AI agent on the **same live spatial state**. The agent can inspect the room, analyze accessibility, safely simulate alternatives, compare them, apply a selected layout, and verify the result.

This is an accessibility planning and exploration tool, **not** a building-code certification, architectural service or medical assessment tool.

## What the project does

Spacienta provides two entry paths:

- **Explore Guided Scenario** — a prepared evaluation-ready room with a visible accessibility problem and the complete inspect → analyze → simulate → compare → apply → verify workflow.
- **Create Your Room** — build a custom room with dimensions, doors, windows, radiators and a compact furniture library. Custom rooms support autosave and named local saved projects.

Humans can drag, rotate, add and remove furniture directly. WebMCP actions modify the same authoritative room state, so manual and agent changes remain synchronized in the 3D interface, accessibility score, history and activity timeline.

### Quick controls

- **Select furniture:** Click a furniture object.
- **Move furniture:** Drag the selected object directly in the room.
- **Rotate interactively:** Drag the blue rotation ring around the selected object. Rotation snaps to 90° steps when released.
- **Rotate precisely:** Use **↶ / ↷** in the Selected Furniture controls to rotate exactly 90° left or right.
- **Orbit camera:** Drag an empty area of the 3D scene.
- **Zoom:** Use the mouse wheel.
- **Reset camera:** Double-click the 3D scene.
- **Show accessibility routes:** Click **Analyze & show paths**.

A central use case is allowing users to explore possible accessibility improvements **before physically moving heavy furniture in the real world**.

## Why WebMCP is essential

Without WebMCP, an agent would have to infer a 3D room from screenshots or manipulate UI controls indirectly. Spacienta instead exposes the spatial environment as structured browser-native tools.

WebMCP gives the agent reliable access to:

- exact room dimensions and fixed features
- stable furniture IDs, positions, sizes and rotations
- accessibility-analysis results and route geometry
- safe non-mutating layout simulations
- shared undo/redo state
- validated state-changing operations

The 3D scene is therefore a **shared human-agent workspace**, not merely a visual output.

## How WebMCP is implemented

The app uses the imperative WebMCP API through `document.modelContext.registerTool(...)`.

The surface is intentionally concise: **10 grouped tools, 5 read-only and 5 state-changing**. Related UI actions are grouped by domain rather than exposed as one tool per button.

### Read-only tools

| Tool | Responsibility |
| --- | --- |
| `inspect_room` | Read the complete shared room, catalogs, fixed features and history |
| `analyze_accessibility` | Return the explainable accessibility score, issues and route geometry |
| `simulate_layout` | Test one furniture-layout candidate without mutating live state |
| `compare_layouts` | Rank 2–3 candidates against the same live state |
| `verify_layout` | Validate the current room after changes |

### State-changing tools

| Tool | Responsibility |
| --- | --- |
| `configure_room` | Create, resize, clear, reset or load the prepared guided scenario |
| `manage_furniture` | Add, move, rotate or remove furniture |
| `manage_room_feature` | Add, update or remove doors, windows and radiators |
| `apply_layout` | Atomically commit a validated simulated furniture plan |
| `manage_history` | Undo or redo shared room history |

Read-only tools use `readOnlyHint: true`. All tool results may include user- or agent-authored room labels/names, so the tools also use the WebMCP `untrustedContentHint` annotation. Dynamic browser UI output is rendered through DOM properties such as `textContent`, not interpolated HTML.

## Main human-agent workflow

1. **Inspect** — the agent reads the exact room the human currently sees.
2. **Analyze** — Spacienta evaluates path clearance, doors, maneuvering space, conflicts and fixed-feature access.
3. **Simulate** — candidate furniture changes appear as a translucent ghost layout while the live state remains unchanged.
4. **Compare** — the agent can evaluate multiple candidates against the same starting state.
5. **Apply** — only the chosen validated candidate changes the live room.
6. **Verify** — the agent checks the committed shared state and updated score.
7. **Collaborate** — the human can manually change the room, then ask the agent to inspect it again or use shared undo/redo.

The simulation banner explicitly states:

> **AGENT SIMULATION · LIVE ROOM UNCHANGED**

## Accessibility score

When a room contains accessibility targets, Spacienta computes a deterministic 100-point comparative planning score:

| Component | Max |
| --- | ---: |
| Accessible Routes | 30 |
| Target Approach | 20 |
| Entrance Access | 20 |
| Reachable Maneuvering | 20 |
| Fixed Feature Access | 10 |

Functional furniture is evaluated through object-specific modeled use zones rather than a single substitute point. Beds use their long sides, sofas/armchairs/desks/storage use their visible front, chairs allow front or side access, and tables can be approached from any open edge. Routes originate at one primary entrance, keep the target furniture itself as an obstacle, and prefer routes with comfortable clearance when multiple valid paths exist. Maneuvering space and modeled radiator access count only when connected to the same usable entrance network.

Optional fixed-feature categories are shown as **N/A** when absent and are excluded from normalization. Rooms without any accessibility targets are reported as **Not assessed** rather than receiving automatic points. Physical overlaps are treated as invalid conditions, and critical failures such as an unusable primary entrance or an unreachable required target cap the overall rating.

The UI exposes the planning assumptions, including rounded metric references for route width, modeled door opening and circular turning space. The score is comparative guidance only and does not claim regulatory compliance.

## Local run and test

Requirements: Node.js 20.19+ or 22.12+ and npm.

```bash
npm install
npm run check
npm run dev
```

`npm run check` runs the complete Node test suite followed by the Vite production build.

Open the local Vite URL shown in the terminal, normally:

```text
http://localhost:5173
```

For local WebMCP testing in a compatible Chrome build, enable the WebMCP testing feature and reload the page. A successful registration shows:

```text
WebMCP ready · 10 tools
```

## Production build

```bash
npm run build
npm run preview
```

The generated `dist/` directory is a static site and can be deployed to Vercel without a backend, account system, database, API key or external AI API.

## Recommended evaluation flow

Open **Explore Guided Scenario** and ask the WebMCP-capable agent:

> Inspect the current room and improve both its accessibility and its realism. Do not reset or switch scenarios, remove furniture, or move fixed wall features. Simulate at least three collision-free alternatives, arranging and rotating furniture naturally, with large furniture near appropriate walls when practical. Compare the alternatives, choose the best balance of accessibility and realistic room design, apply it, then verify the final layout.

For the product path, use **Create Your Room** or ask the agent to create one, for example:

> Create a 4.5 by 4 meter bedroom with a door, a window, a radiator, a double bed, a desk and a wardrobe. Place everything collision-free, then inspect the finished room.

## Project structure

```text
.
├── index.html
├── LICENSE
├── THIRD_PARTY_NOTICES.md
├── README.md
├── package.json
├── package-lock.json
├── tests/
└── src/
    ├── accessibility.js
    ├── main.js
    ├── roomState.js
    ├── scene.js
    ├── styles.css
    └── webmcp.js
```

## Privacy and persistence

The project has no account system, analytics integration, cloud database or external API key. Custom-room autosave and named projects use browser-local `localStorage` only and do not sync across devices.

## Third-party software

See [`THIRD_PARTY_NOTICES.md`](./THIRD_PARTY_NOTICES.md). The direct runtime dependency is Three.js; Vite is used as build tooling. Exact locked versions and dependency metadata are recorded in `package-lock.json`.

## License

MIT — Copyright (c) 2026 CRUSZO. See [`LICENSE`](./LICENSE).
