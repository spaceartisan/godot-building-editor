# Building Studio 1.5.0 — quickstart

If the local server reports that its port is already in use, stop the existing server or launch with `PORT=5174 node server.mjs` on Linux. `PORT=0 node server.mjs` selects an available port and prints the URL. Without `PORT`, the default is 5173.

Save JSON now shows a download-request status or a failure message. Check your browser downloads to confirm the file was saved; the editor cannot confirm completion of the browser's save dialog.

Loading cleanup: wait for file/example loading to complete before editing the imported building. Another load, committed edit, New/preset or Undo/Redo supersedes a pending load so its late result cannot replace your work. Failed loads preserve the current building. UTF-8 JSON with a leading BOM is accepted in the web builder and CLI.

Automating with an LLM? Read [AGENTS.md](AGENTS.md) and [LLM_GUIDE.md](LLM_GUIDE.md) for a verified CLI workflow and the limits of each authoring route.

Build reusable houses, interiors and other structures in the web editor; use the Linux CLI for repeatable edits and exports. The output is a building `.tscn` and its relative door scenes. It does not include a game project or runtime geometry generator.

## Web builder

1. Extract the ZIP, open a terminal inside `building-editor`, and run `npm run dev` with Node 20 or newer. Open the local address printed by the server. No npm install is needed for the editor.
2. Pick an **Example**, or use **Project files → Load JSON** for an existing blueprint. Drawing and selection controls are in the side panels. Shift-click or drag a selection box to select multiple objects; use **Move selection** or exact offsets to move them together.
3. Use **Floors** to add above/below, duplicate, reorder or delete floors. The active floor carries its own contents. Changed stair connections can block a stack edit. Top-floor deletion also removes incoming stairs; other affected connections require **Remove affected stairs**. Undo restores the complete edit. Independent manual roofs/floors/ceilings keep their authored absolute heights.
4. Use **3D Preview** and its floor/roof views to inspect geometry. The preview uses illustrative colors; exported material slots are empty by default.
5. The **Checks** button near Export shows errors or authoring warnings. Click it or **Check building** to focus the results in Godot Export. Errors block export; warnings allow export and remain visible for review. Use an issue’s **Show…** buttons to select and center its object, or open the affected floor. These inspection actions cancel unfinished drawing without adding undo steps. Ordinary background updates do not move keyboard focus. Invalid numeric building settings roll back without adding an undo step.
6. Save **Project files → Save JSON** to keep your editable source. Then use **Export .tscn ZIP**. The exported scene is not a replacement for your editable blueprint; this tool does not reimport edited TSCNs.

## Bring the asset into Godot

Extract the asset ZIP inside a folder in your Godot project, keeping the building scene and `doors/` in their relative locations. Open or instance the main `.tscn`. Geometry and collision are baked and visible in the editor. Assign your materials to the named mesh surfaces.

Exterior walls retain **OutsideFaces**, **InsideFaces**, and **EdgeFaces**. Interior walls retain **SideAFaces**, **SideBFaces**, and **EdgeFaces**, organized per story. Keep those intentional lighting boundaries when integrating the scene. Custom shaped doors expose a **Panel** pivot with matching collision; add movement in Godot. Marker names and positions export as Marker3D nodes; their notes remain in JSON. No furniture or gameplay implementation is generated.

## CLI loop

Run these commands from the extracted `building-editor` folder, choosing output paths that do not already exist:

```bash
node cli.mjs examples --check
node cli.mjs inspect examples/stair_ramp_north.building.json --entities
node cli.mjs edit examples/stair_ramp_north.building.json --ops examples/transactions/add-third-floor.edit.json --dry-run --json
node cli.mjs edit examples/stair_ramp_north.building.json --ops examples/transactions/add-third-floor.edit.json --out ../third-floor.building.json --warnings-as-errors
node cli.mjs export ../third-floor.building.json --out ../third-floor-assets --warnings-as-errors
node cli.mjs godot-check --assets ../third-floor-assets --godot /absolute/path/to/godot --require-collision
```

The engine command needs an existing Godot 4 executable; replace the placeholder path. PNG previews need the optional canvas dependency described in [CLI.md](CLI.md). Neither is needed for basic CLI editing/exporting. Input files are never rewritten and existing outputs are never silently overwritten.

The CLI creates/removes **top floors only**. Basement/middle insertion, floor duplication and reordering remain web controls. Saved doorway shapes can be assigned through transactions; use the web shape editor or JSON to define the shapes. Read [TRANSACTIONS.md](TRANSACTIONS.md) for operation fields, limits and report meanings.

## Shipped recipe index

All recipes are in `examples/transactions/`. Removal recipes must use the output of their matching addition recipe, not the untouched source example.

| Recipe | Starting input | Result |
| --- | --- | --- |
| `porch-entry.edit.json` | `examples/roof_attachment.building.json` | Extend the layout, add a partition, doors, window and named region; adjust roofs. |
| `twostory-levels.edit.json` | `examples/twostory.building.json` | Change labels and floor dimensions with derived stair-rise reporting. |
| `stair-refresh.edit.json` | `examples/stair_ramp_north.building.json` | Edit an existing flight. |
| `add-second-stair.edit.json` | `examples/stair_ramp_north.building.json` | Add a second flight. |
| `remove-second-stair.edit.json` | Output of `add-second-stair` | Restore the original scene. |
| `east-deck.edit.json` | `examples/roof_junctions.building.json` | Resize and change an existing platform to a deck. |
| `add-west-deck.edit.json` | `examples/roof_attachment.building.json` | Add an independent west deck. |
| `remove-west-deck.edit.json` | Output of `add-west-deck` | Restore the original scene. |
| `add-third-floor.edit.json` | `examples/stair_ramp_north.building.json` | Add a story, walls, passage, region and connecting stair. |
| `remove-third-floor.edit.json` | Output of `add-third-floor` | Restore the original scene, explicitly removing contents and incoming stairs. |
| `ineffective-attachment.edit.json` | `examples/roof_attachment.building.json` | Deliberately produce a roof-attachment warning for review. Strict mode rejects it. |

`examples --check` checks all 33 catalog entries against their documented expectations. The original farmhouse preset has a known stair/wall-clearance warning; the supplied `examples/farmhouse.building.json` is a different plan. A deliberate warning example is not a promise of playable geometry.

## Verification and limits

The v1 audit exercises every recipe through CLI authoring, web reload and exact scene export comparison. Fresh engine exports cover 27 scenes and 524 collision shapes; this resource check is separate from the fixture-specific physics-ray suites in the release report. It does not certify your character's headroom, slope handling or gameplay movement.

The tested environment is Linux, Node 24.19.0 and Godot 4.5.1 Compatibility. Godot 4.7, live browser CSS/layout and other OS/runtime combinations remain unverified here. Playwright is available but its Chromium executable is missing. The included software previews are not browser or Godot screenshots. Run `npm run test:browser` on a machine with Playwright/Chromium and test the exported building with your game's character and lights.

The v1 scope is complete for the available checks. Remaining expansion includes CLI middle/basement stack edits, continuous concave hip-roof valleys, additional shaped-wall junctions and shaped paired doors/windows. See [ROADMAP.md](ROADMAP.md); these are not implied by the v1 label.

### Sharing a check result

Under **Godot Export**, choose **Download check report**. Attach that `.checks.json` together with your saved `.building.json` when reporting an issue. The report records checks at download time; it does not update after later edits and cannot replace the editable building. For automation, use `node cli.mjs validate your.building.json --out new-report.json`. See [CHECK_REPORTS.md](CHECK_REPORTS.md).
