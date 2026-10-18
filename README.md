# Building Studio — Building Editor 1.5.0

> **AI agents: start here.** Building Studio is a working command-line tool: you can author complete buildings without the browser. Read [AGENTS.md](AGENTS.md), then [LLM_GUIDE.md](LLM_GUIDE.md). The minimal workflow is a recipe of operations → `node cli.mjs new --ops recipe.edit.json --out building.json` → `validate` → `export`. Exact operation fields are in [TRANSACTIONS.md](TRANSACTIONS.md). Generating the recipe with a short script is the normal way to build anything larger than a few rooms. The [changelog](CHANGELOG.md) is history, not a list of current limitations.

Building Studio authors reusable Godot 4 building scenes: houses, shops, interiors, multi-level structures and other architectural assets. It has two front ends over the same code: a web editor for drawing and visual review, and a CLI for scripted authoring, checking and export. Every capability is available in both.

The deliverable is a building `.tscn` with its door (and elevator) `.tscn` dependencies. No game project or runtime generator is exported. Separate outward/inward shell meshes, interior wall side meshes, and per-story mesh organization are intentional for material and per-mesh lighting control. GET PROBED is an optional export profile, not a dependency.

## Quick start (CLI)

```bash
node cli.mjs new --ops my-shop.edit.json --out my-shop.building.json --warnings-as-errors
node cli.mjs validate my-shop.building.json --reachability
node cli.mjs export my-shop.building.json --out my-shop-scenes
```

A recipe is plain JSON: `{"version": 1, "operations": [...]}`. For example, `room.add` places a closed rectangle of walls, `opening.add` places a door at a world point, and `roof.add` adds a roof. Re-run a changed recipe onto the same output with `--replace`. Core commands need Node 20+ and nothing else. [QUICKSTART.md](QUICKSTART.md) has the web workflow, Godot import steps and the full set of CLI recipes.

## Used in practice

- **Shipped game:** the buildings of GET PROBED (about 15 across five maps: one to three storeys, gable, hip and flat roofs, double doors) were authored with the CLI on **Windows 10 with Node 20+** and used in **Godot 4.7** (Compatibility renderer): exported scenes, doors, collision and lighting shells.
- **Release gates** run on Linux with Godot 4.5.1 ([RELEASE_CHECKS.md](RELEASE_CHECKS.md)). That is where every check is automated, not the only place the tool works.
- **Stress tests:** a castle, a starship interior, an 11-level mixed-use complex and a five-storey hotel with two lifts were built through the CLI alone ([authoring/](authoring/)), with findings fixed and recorded.

## Scope: what the tool makes, and what stays in Godot

Building Studio makes the **building shell** and stops there on purpose. Everything that depends on a particular game, look or level is left to Godot (or the game's own tools), so the same export works in any project. A missing item in the right-hand column is a design decision, not a gap to work around, and not a reason to write a separate generator.

| Building Studio makes | Left to Godot / the game |
| --- | --- |
| Walls (exterior and interior, half walls, shaped profiles), with separate inside, outside and edge meshes per story for lighting | **Materials and textures.** Slots are empty by default. A [game layer](GAME_LAYER.md) file can assign them by surface name at export; authoring the materials themselves stays in Godot. |
| Floors, ceilings, stairs and ramps, elevators (shaft, car, sliding landing doors and stop markers), platforms (porches and decks with posts and steps), railings | **Navigation.** No `NavigationRegion3D` or navmesh is exported. Bake it in Godot from the exported collision; `validate --reachability` is an authoring check, not a navmesh. |
| Roofs (automatic and manual: gable, shed, flat, hip, mansard), gable fills | **Door behaviour.** Doors export hinge pivots (`Hinge`, `Hinge2`), a roll-up `Curtain` and collision, but no script or animation. Attach the game's door script (a game layer can do it on every export). |
| Openings: doors (single, double, closet, roll-up, custom outline) and windows (frame and glass) as separate door scenes and meshes | **Elevator behaviour.** Elevators export a movable `Car` with its own doors, sliding landing doors, `Stop_NN` markers and `CallButton`/`Indicator`/`CarPanel` anchors, with collision, but no script, working buttons or timing. The game's elevator script moves them (a game layer can attach it on every export). |
| | **Gameplay nodes:** room `Area3D`s and triggers, spawn points, interaction logic, shelter or hiding zones, AI hints, audio emitters and reverb areas. Markers (`Marker3D`) and labelled regions in the export can serve as anchors. |
| Static collision for everything above, with the export profile's layers and groups | **Lighting.** Exported `OmniLight3D` nodes are **placeholders**: they mark where lights go, with basic range, colour and energy, so the building can be previewed. Replace or retune them in Godot (light types, fixtures, shadows, energy, flicker or other behaviour); `WorldEnvironment`, sky, global illumination, lightmap baking, shadow and light-energy tuning stay in Godot. Render layers can come from a game layer. |
| Labelled regions, markers and lights as authoring data in the scene | **Furniture, props and decoration:** fixtures, signs, decals, trims beyond the generated frames, interior dressing. |
| The editable `.building.json` blueprint | **Site and terrain:** ground, landscaping, foundations into slopes, the building's placement in a level (raise it slightly to avoid z-fighting with terrain at y = 0). |
| Checks: validation, route check, Godot resource and collision checks, renders | **Performance and import settings:** LODs, occluders and occlusion culling, mesh import options, physics materials. |

Two consequences worth knowing:

- **Export is one-way.** The `.tscn` files are generated output; they cannot be loaded back as an editable building. Keep the `.building.json`, and re-export when the building changes. Anything added in Godot should live outside the generated scenes (an inherited scene, a parent scene, or a game layer applied at export), or it is lost on re-export.
- **The game owns its post-processing.** A game layer covers materials, render layers, door scripts and door child scenes. Anything else (navmesh baking, gameplay nodes) belongs in the game's own import step or scenes.

## Documentation

| File | What it covers |
| --- | --- |
| [AGENTS.md](AGENTS.md) | Rules for agents working on or with the tool |
| [LLM_GUIDE.md](LLM_GUIDE.md) | Capabilities, the scripted workflow, recipes (thicker walls, porches, parapets, mansards), export node names, geometry rules |
| [TRANSACTIONS.md](TRANSACTIONS.md) | Every operation and field |
| [CLI.md](CLI.md) | Every command and flag |
| [QUICKSTART.md](QUICKSTART.md) | Web workflow, Godot import, CLI recipes |
| [GAME_LAYER.md](GAME_LAYER.md) | Per-game materials, render layers, door scripts and door children applied at export |
| [AUTHORING_REVIEW.md](AUTHORING_REVIEW.md) | How to review an AI-authored building before delivering it |
| [VALIDATION.md](VALIDATION.md), [PREVIEWS.md](PREVIEWS.md), [RELEASE_CHECKS.md](RELEASE_CHECKS.md) | Checks, previews and release gates |
| [CHANGELOG.md](CHANGELOG.md), [ROADMAP.md](ROADMAP.md) | History and future work |

## Run

```bash
npm run dev
```

Open `http://localhost:5173`. To render exports in Godot from the web editor (**Render in Godot**), start the server with a Godot 4 executable: `GODOT_BIN=/path/to/godot node server.mjs`. On Linux, rendering also needs a display (`DISPLAY`/`WAYLAND_DISPLAY`) or `xvfb-run`; Windows and macOS render directly.

## Godot export

Choose an **Export profile** in the Godot Export panel. **New** buildings use Generic Godot. The farmhouse preset and the supplied GET PROBED examples set GET PROBED compatibility in their JSON. JSON without a profile exports as Generic (since 1.5.0; before, it fell back to GET PROBED). Profiles are saved in JSON and changes support undo/redo.

| Convention | Generic Godot | GET PROBED compatibility |
| --- | --- | --- |
| Window collider group | `sight_transparent` | `scare_sight_transparent` |
| Default light group | `building_lights` | `paranormal_lights` |

Explicit custom light groups survive profile changes. Empty window openings export no fixture collision. Neither profile attaches gameplay scripts. Both profiles preserve door hinge paths. Generic doors use layer/mask 1 and omit the game-specific interaction area. GET PROBED retains door layer 4/mask 2 and the stationary interaction area. Collision nodes remain editable in Godot.


**Export .tscn ZIP** downloads a ZIP containing:

- `<building>.tscn` — the building scene.
- `doors/*.tscn` — one separate scene for every generated door.
- `elevators/*.tscn` — one scene per elevator, when the building has any.

The building scene instances those door scenes with relative `PackedScene` references. Exterior and interior walls are baked embedded `ArrayMesh` resources; exterior walls are split into outside/inside/edge faces and interior walls into Side A/Side B/edge faces for independent materials. Windows remain separate meshes; ceiling and roof remain separate nodes. Placed lights are written directly into the building scene as `OmniLight3D` nodes (no light sidecar scene, mesh, collision, or script). No CSG or runtime building generator is used.

### Lights

Use the **Light** tool and click the plan to place a light. New lights default to warm `Color(1, 0.65, 0.34, 1)`, energy `2.35`, range `8.0`, and shadows enabled. The export profile selects the default group. Position, color, energy, range, and shadows can be edited per light in the Selection panel.

### Door scene structure

Each generated door scene intentionally contains **no attached script**. It is structured to match the supplied opening script's expected node paths:

```text
Door (Node3D)
├── Frame (MeshInstance3D)
├── Hinge (Node3D)
│   ├── DoorMesh (MeshInstance3D)
│   └── AnimatableBody3D
│       └── CollisionShape3D
└── InteractionArea (Area3D)
    └── CollisionShape3D
```

`DoorMesh` is one baked mesh (with Door and Hardware surfaces), while `Frame` stays outside the hinge so the frame does not rotate. Each leaf's `AnimatableBody3D` has `sync_to_physics` off, so rotating `Hinge` carries its collision (a game may keep the leaf solid while it swings, or disable it while moving, as GET PROBED's door script does). The `Door` root carries `door_width`, `door_height`, `door_leaves` and `door_style` metadata, and each door instance in the building scene carries the recipe's `building_opening_id` and `building_opening_label`. The moving leaf collision path is exactly `Hinge/AnimatableBody3D/CollisionShape3D`. In the GET PROBED profile, each non-empty door also includes a stationary root-level `InteractionArea` (`collision_layer = 4`, `collision_mask = 0`) with its own `CollisionShape3D`. This doorway target does not rotate with the hinge, so it remains interactable when gameplay disables the open door leaf collider. Attach your own door script manually to the `Door` root after import.

- Generated door leaf detailing and hardware are present on both sides of every door.

### Double-leaf doors
Closet door exports use two hinge pivots (`Hinge` and `Hinge2`). Each hinge owns one baked half-door mesh and its own `AnimatableBody3D/CollisionShape3D`. Exterior and room doors use one hinge unless you set **Leaves → Double leaf** in the door panel (CLI: opening `leaves: 2`); then they export the same two-hinge hierarchy with each leaf keeping its style's panels, for wide entrances such as a 1.8 m shop front. No GDScript is attached or bundled with the Godot door scenes.

## Materials and gable fills

Exported named surfaces have **empty material slots by default**, including doors. Assign materials in Godot, or let a [game layer](GAME_LAYER.md) file assign materials by surface name, render layers, door scripts and door child scenes on every export. **Include placeholder colors** is optional if you want the earlier simple color resources. Browser preview colors remain editor-only.

Both automatic and manual gable fills have matching triangular collision when collision export is enabled. Manual gables now expose separate OutsideFaces, InsideFaces and EdgeFaces below their GableFill group, preserving lighting and material separation. No rectangular collision is added across an entrance.

## Floor faces and half walls

Each automatic floor slab exports as one baked `ArrayMesh` / `MeshInstance3D` (with **Split floors, ceilings and walls by room** / `slabsByRoom`, one per labelled room region instead, and the room-facing wall faces are split the same way). The mesh contains three material surfaces named `TopFaces`, `BottomFaces`, and `EdgeFaces`, so Godot materials remain independently assignable without creating three visual nodes. Exposed story regions can generate an automatic ceiling with `RoomFaces`, `RoofSideFaces`, and `EdgeFaces`; regions covered by a higher structural floor continue to use the upper slab underside rather than duplicating a ceiling. Manual floor and ceiling objects use the same hard-surface material separation.

New walls can be created as **Full story** or **Half wall** from the Build panel. A selected non-full-height wall exposes its exact height for editing. Per-wall height is honored by baked visual meshes, opening constraints, and primitive wall collision.

## Automatic and manual floors / ceilings

Each story generates its structural floor and ceiling automatically by default. The ceiling hangs inside the story (wall top minus the ceiling thickness) over the whole footprint, including under the next floor's slab, so a room's ceiling height is the same everywhere; it stays open only at stair openings and under an upper floor whose automatic floor is off. In the **Floors** panel, **Generate floor automatically** and **Generate ceiling automatically** can be disabled independently for the active story.

The **Floor Footprint** tool remains a story-level convenience override: it changes the footprint used by the active story's automatic slab and related structural calculations while retaining that story's normal elevation.

For geometry that should not be owned by a story, use **Manual Floor** or **Manual Ceiling**. These are building-level rectangular slabs, like Manual Roof objects. Each stores its own absolute **Top height Y**, thickness, and X/Z footprint and exports under root-level `ManualFloors` / `ManualCeilings` nodes. Multiple rectangles can be combined to form stepped, L-shaped, or otherwise composite surfaces.

When an automatic floor or ceiling is enabled, any manual surface at the same height subtracts its footprint from the automatic surface before export, preventing duplicate coplanar geometry. Turning the automatic surface off allows the story surface to be authored entirely from manual pieces.

Manual slab thickness extends downward from **Top height Y**, matching the convention used by automatic floors and ceilings. Manual floors use the normal floor top/bottom/edge material surfaces; manual ceilings use room/top/edge surfaces and may include collision when collision export is enabled.

## Independent manual roofs

The **Manual Roof** tool is independent of the floor system. Drag a rectangular footprint in plan view (or choose a polygon region's outline under **Footprint**), then set an absolute **Base height Y**. Each manual roof stores its own type (gable, shed/lean-to, flat or hip), ridge/slope axis, pitch, overhang, optional gable-end fill and, for hip roofs, an optional **Flat top height** (mansard). Polygon footprints take flat roofs (convex or concave) and hip roofs (convex).

This allows roof composition that the floor-driven automatic system cannot express cleanly: a first-story wing can have its own roof while a smaller second story has a separate roof, a barn roof can be wider or offset from the wall/floor footprint, and roof sections can exist above or below any numbered floor. Manual roofs export under the root `ManualRoofs` node rather than inside `Floor_XX`.

Automatic roofs remain available as a convenience layer. When a manual roof overlaps an automatic roof region at the same base height, the manual footprint subtracts from the automatic region so the two do not stack directly on top of each other. Set **Automatic Roof → Default roof type → None** when a building should use only manually defined roofs.

Legacy JSON containing per-floor explicit roof sections is migrated on load to independent manual roofs at the corresponding story-top height.

## Multi-floor buildings and ramps

The building data model now supports multiple stacked floors. Use the **Floors** panel to add a blank upper floor, duplicate the current floor, rename levels, or delete the current top floor. The plan editor edits one active floor at a time while the 3D preview shows the full stacked building.

Floor elevations are spaced by the story wall height plus the inter-story floor slab thickness, preventing upper slabs from intersecting the walls below. Door scenes, windows, lights, wall meshes, collision, floor slabs, and automatic ceilings are generated under their corresponding `Floor_XX` node. Automatic roofs are evaluated spatially, so any exposed story region can receive a roof even when a higher floor exists elsewhere.

Use the **Ramp** tool on any floor that has an upper level. Drag from the bottom of the ramp toward the upper landing. Each ramp exports as one baked `ArrayMesh` plus a matching convex collision shape:

```text
Staircase_001
├── RampMesh (MeshInstance3D)
└── WalkableRamp (StaticBody3D)
    └── CollisionShape3D
```

`WalkableRamp` uses collision layer `1`; its mask is `1` in Generic and `2` in GET PROBED. Ramp style uses a thin sloped slab; stepped style uses visible treads and risers with smooth ramp walking collision. **Block below** optionally fills and collides with the under-stair volume. The upper automatic floor is split around the stair footprint, retaining side clearance while meeting the upper landing without a gap. Diagonal drags select a cardinal direction while keeping the clicked lower centerline.

Manual floors remain explicitly authored objects: arrange their rectangles around the stair opening yourself (see `examples/manual_upper_stairwell.building.json`).



## Elevators

An elevator is a building-level shaft serving a range of floors. Place it with the **Elevator** tool (click the shaft centre on the floor it starts from; it serves that floor and the one above). Select it on the plan to drag it, or set its size, door side, door size, bottom and top floors and **Stops at** in Selection; all lifts are also listed under **Elevators**. In the CLI: `elevator.add`, `elevator.update`, `elevator.remove` and `group.move` ([TRANSACTIONS.md](TRANSACTIONS.md)).

- Unchecking **Stops at** for a floor (CLI `skipFloorIds`) makes an express lift. The shaft passes that floor behind a solid wall, with no landing or stop.
- Floors above the bottom stop get a hole in their automatic floor at the shaft; the bottom floor's slab is the pit floor.
- Walls and railings may touch the shaft but not cross it. Stairs, porches, manual floors/ceilings and roofs must stay out of it, and doors must leave room for each leaf to slide open (at most shaft width/2 − 0.35 m). The CLI rejects such edits and the web editor undoes them, with the same message.
- The route check (`validate --reachability`, web **Include route check**) treats each lift as a route between its stops and warns when a landing is blocked.

Each elevator exports its own scene, instanced under the root `Elevators` node:

```text
Elevator (Node3D)
├── Shaft (MeshInstance3D: ShaftOutside, ShaftInside, ShaftEdges)
├── ShaftBody (StaticBody3D)
├── Car (AnimatableBody3D: CarMesh with CarFloor, CarWalls, CarCeiling)
│   ├── CarDoorLeft, CarDoorRight (AnimatableBody3D leaves riding with the car)
│   └── CarPanel (Marker3D)
├── Stops/Stop_NN (Marker3D per stop)
└── Landings/Landing_NN
    ├── DoorLeft, DoorRight (AnimatableBody3D leaves)
    ├── CallButton (Marker3D)
    └── Indicator (Marker3D)
```

Nothing moves on its own: a game script moves `Car` on Y between the `Stop_NN` markers and slides each door leaf outward on X by `leaf_travel` (metadata on `Car` and each `Landing_NN`). A [game layer](GAME_LAYER.md) can attach that script on every export (`scripts.elevator`). `godot-check --assets` probes every exported lift in Godot (car floor at each stop, closed and opened doors, clear shaft). A navmesh cannot ride a lift; link landings in Godot. [authoring/hotel](authoring/hotel/README.md) is a worked example.

## Per-floor dimensions and edit behavior

Floor elevation, wall height and slab thickness may be overridden in **Floors**. Leave an override blank to inherit the building default or automatic elevation. Automatic elevation = preceding floor elevation + preceding wall height + this floor's slab thickness. Explicit elevations are absolute, including negative elevations, and must increase in floor order. Walls, slabs, ceilings, roof bases, stair rise, UV continuity and collision share these values. Stair flights connect adjacent floors; arbitrary intermediate landings and multi-flight stair layouts remain future work.

Deleting the top floor also removes the flight leading to that deleted floor. Undo restores both. Independent roofs and manual floors/ceilings keep their authored absolute positions. Changes to story dimensions or deletion of floors show an alignment warning when independent surfaces exist; they are never silently deleted or moved.

## Window and railing styles
Windows support per-opening styles: Plain, Double-hung, and Four-pane. Railings support per-segment styles: Two rail, Picket, and Cross brace. The active drawing defaults appear in contextual Tool Options and each placed object can be changed later from Selection properties. Styles are saved in building JSON and affect preview/exported geometry.

### Empty opening styles
Windows and doors now include an **Empty opening** style. These objects still cut their configured opening from the host wall and remain editable in the plan, but generate no window frame/glass, no door frame/leaf, and no fixture collision or door PackedScene. This is useful for open doorways, barn bays, pass-throughs, and unglazed wall openings.

## Undo / Redo

The editor keeps a bounded 100-step building-state history. Use the top-bar Undo/Redo buttons, `Ctrl/Cmd+Z`, `Ctrl/Cmd+Y`, or `Ctrl/Cmd+Shift+Z`. Geometry edits, property changes, deletions, preset loads, and JSON loads are undoable. View navigation such as pan/zoom/orbit is intentionally not stored in history.

## Validation and tests

**Check building** lists errors and warnings without changing your design. Invalid numeric values, duplicate IDs within a floor, invalid opening references and overlapping openings block import/export. Unmarked open boundaries, duplicate overlapping walls, unsupported stair entrances/landings, steep inclines, vertical spacing gaps/overlaps and same-height manual-surface overlaps are warnings. Export trims hidden faces at wall crossings and T-junctions while preserving authored wall IDs and opening references. Mark intentional exterior gaps in the Floors panel; explicit Floor Footprint rectangles remove bounds-fallback ambiguity.

```bash
npm test
npm run examples
```

`npm test` runs the original tests plus geometry, profile, import-migration, authoring and editor-handler regressions. It does not rewrite examples. `npm run examples` is the explicit regeneration command; it updates building JSON, main scenes and matching door dependencies together, with deterministic IDs for generated fixtures and preserved IDs for supplied blueprints.

Examples include the supplied `barn_v2`, `farmhouse`, and `twostory`, the original demos, eight ramp/stepped scenes covering all four orientations, a manual-floor stairwell, and a three-story variable-height fixture. The Examples dropdown loads the supplied plans directly. The barn entrance remains open; its ground-floor boundary intent and explicit rectangular footprint are recorded without moving its walls or openings. Copy a main scene with its relative `doors/` dependencies into your own Godot project, or load its `.building.json` in this editor.

For optional engine-side checks, set `GODOT_BIN` to your Godot 4 executable and run `npm run test:godot`. This creates and removes a temporary test project, imports/instances all bundled scenes and checks stair/landing and story-band collision. It does not add `project.godot` to your asset export.

### Limits still requiring inspection

- Topology warnings are not a full polygon repair or room-detection system. Automatic footprints require valid closed exterior loops; use explicit footprints for open or branched layouts.
- Stair checks do not replace testing your game's character capsule, headroom, step/slope settings or gameplay movement.
- Automatic polygon footprints derive from exterior wall loops, not arbitrary room inference. Independent authored surface footprints remain rectangular; manual roofs may follow a polygon (flat or hip).
- Lighting limits depend on the target renderer and scene. This release preserves existing mesh separation; it does not promise unlimited lights or introduce a new lighting allocator.
- Release gates run headless in Godot 4.5.1. Buildings from this tool are used in Godot 4.7 (see **Used in practice**), but the release gates have not run there; check new features such as elevators with `godot-check --assets` in your own Godot version. The included canvas previews are generated by the editor renderer, not Godot screenshots.

## Editor verification

The layout wraps the toolbar and retains both side panels on narrow windows; below 720px the canvas and panels stack with scrolling. Status text wraps, validation errors/warnings remain visible, and numeric inputs reject blank/invalid required values. Optional per-floor override fields accept blank values intentionally.

Optional browser checks: install Playwright and Chromium locally, then run `npm run test:browser`. Set `SCREENSHOT_DIR` for browser captures. The test covers examples, dimensions, rollback, wall-loop closure, region creation/deletion, undo, download and three viewport sizes. `npm run test:browser-parity` checks web/CLI parity in a real browser. For 1.5.0 both passed in Chromium 141 ([RELEASE_CHECKS.md](RELEASE_CHECKS.md)).

`qa/previews/` contains actual editor-canvas renders. Regenerate them with `CANVAS_MODULE=/path/to/@napi-rs/canvas node qa/render-preview.mjs qa/previews`. This optional rendering dependency is not needed to run the editor.

The dependency-free `node editor-tests.mjs` executes the actual editor handlers with a small DOM adapter. It verifies interaction state and forms, not browser layout. `CANVAS_MODULE=/path/to/@napi-rs/canvas PLAN_SCREENSHOT=output.png node editor-tests.mjs` optionally captures the actual plan canvas. `qa/previews/courtyard_plan.png` is such a capture.
