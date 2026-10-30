# Changelog

Release history for Building Studio, newest first. The [README](README.md) describes what the tool is today; this file records how it got there, including fixes for problems that no longer exist.

## Unreleased: glTF for Unreal Engine, and Windows test fixes

- **glTF export** (`export`/`package --format glb`, web **Export .glb**; [GLTF.md](GLTF.md)). One `.glb` per building, written from the exporter's own `.tscn` scenes, so the geometry is identical and `.tscn` output is unchanged. Each surface gets a material of its name (`OutsideFaces`, `TopFaces`, `Door`, …) so engines can bind materials by slot; `building_*` and door metadata become glTF extras; door and elevator scenes are inlined with their hinge, curtain and car nodes. Collision uses Unreal's naming, which Unreal reads from glTF: boxes as `UBX_`, convex shapes as `UCX_`, and concave shapes as `UCX_` prisms of merged coplanar triangles, attached to the nearest mesh so door leaves and elevator cars carry their own. Point lights use `KHR_lights_punctual`. Checked against every catalog example (`gltf-tests.mjs`), read back by Godot 4.7's importer (`gltf-engine-tests.mjs`), and imported into Unreal Engine 5.8.4 with `qa/unreal-import-check.py`.
- **Tests run on Windows.** Fake Godot executables in two tests were `#!` scripts, which Windows cannot start; they now use the real `GODOT_BIN` there (or report a skip). A CLI path built from `URL.pathname`, a case-collision fixture on case-insensitive filesystems and symlink creation without rights are handled. A `.gitattributes` keeps LF line endings in Windows checkouts, so the regeneration check sees current scenes. `release-check --canvas required --engine required` passes all 7 gates on Windows 10 with Node 22.19 and Godot 4.7.

## Added in 1.5.0: feedback from a real game build

An AI rebuilt a fast-food restaurant, a log cabin and a diner with a service garage for GET PROBED and reported what got in the way. Each item is either fixed, added, or turned out to be possible already and is now documented. Every new capability works in both the CLI and the web editor, through the same shared code.

| Feedback | Outcome | CLI | Web editor |
| --- | --- | --- | --- |
| `godot-check --render` refused to run on Windows without `DISPLAY` | **Fixed.** Windows and macOS render directly; Linux uses `DISPLAY`/`WAYLAND_DISPLAY`, else `xvfb-run` | `godot-check --render` | **Render in Godot** (server) |
| Wide doors exported as one giant leaf | **Added** double-leaf exterior and room doors: two hinges (`Hinge`, `Hinge2`) for `double_hinge` door scripts | opening `leaves: 2` | Door panel **Leaves** |
| No parapet or ceiling below the wall top | **Already possible**: a short top story whose slab is the flat roof and whose walls are the parapet (recipe in LLM_GUIDE) | `floor.add-top` | **Add above** |
| No mansard roof | **Added** `flatTopHeight` on hip roofs (manual and automatic): steep slopes around a flat top | `roof.add`/`roof.update`, `building.update` | Roof panel and automatic roof **Flat top height** |
| No higher-level layout | **Added** `room.add` (a rectangle of four walls) and named `points` in recipes. Placing an opening by world point (`at: {x, z}`) already existed. | `room.add`, recipe `points` | **Room** tool (already existed) |
| Game setup redone after every export | **Added** an optional game layer: materials by surface name, render layers, building/door scripts and door child scenes ([GAME_LAYER.md](GAME_LAYER.md)) | `export`/`package --game-layer FILE` | Godot Export **Game layer…** |
| `preview` needs `@napi-rs/canvas` with no fallback | **Added** a Godot aerial-render fallback when `--godot`/`GODOT_BIN` is set; Windows install steps in PREVIEWS.md | `preview` | Not needed (the browser draws the preview) |
| Manual ceiling always triggered a warning | **Fixed.** The height-review warning lists only surfaces that existed before the transaction and kept their height | `edit` | Not affected (each web edit is a single change) |
| One floor slab per floor, one material | **Added** `slabsByRoom`: floors, ceilings and room-facing wall faces split into one mesh per labelled room region (`FloorSlab_Kitchen`, …), same collision; per-room materials with the game layer's `nodeMaterials` | `building.update slabsByRoom` | Building settings **Split floors, ceilings and walls by room** |
| No roll-up door | **Added** `rollup` door style: curtain, side guides and a drum housing inside; `openFraction` exports it partly open | opening `doorStyle: "rollup"`, `openFraction` | Door type **Roll-up door**, **Open fraction** |
| No porch, deck or veranda | **Mostly possible already** (porch platforms with posts and the roof over them). **Added** porch `steps` and railing `elevation` so railings stand on the deck; a shed porch roof is a manual roof (recipe in LLM_GUIDE) | `platform` `steps`, `railing` `elevation` | Platform **Steps**, railing **Elevation above floor** |
| Two commands per building; outputs never overwritten | **Added** `new --ops RECIPE` (one step) and `--replace` to re-run onto an existing building JSON | `new --ops`, `--replace` | Not applicable (no recipe files) |
| Slab at y = 0 z-fights with terrain | **Already possible**: set the ground floor's elevation (for example 0.04 m); the floors above follow (tip in LLM_GUIDE) | `floor.update elevation` | Floor panel **Elevation** |

### Also in 1.5.0

- **Feedback from Dirtscape** (a keep and a five-building village built entirely through the CLI):
  - **Walls no longer poke through steep roofs.** Gable and shed slabs were always 0.12 m thick with their middle plane on the wall centre line, so a thick wall's outer top edge came through a steep roof (0.3 m walls under a 38° gable showed a line of wall top along each eave). Sloped slabs now thicken with the wall: at least wallThickness × sin(pitch) + 1 cm (0.195 m in that case); hip roofs by the same rule. Thin walls keep 0.12 m slabs. A new Godot test drops rays onto the eave walls of gable, steep gable, hip and manual shed roofs on 0.3–0.5 m walls: 17 of 17 hit the wall before the fix, 0 after.
  - **Lean-to porch roofs.** A covered porch still extends the main roof over itself by default, which turns a deep porch into one large gable over house and porch (the smithy). `roofStyle: "lean-to"` gives it its own shed roof instead: from the wall below the main eave, sloping away from the building, with posts and beams cut to it. The pitch is chosen for 2.2 m headroom at the posts (5–15°) unless `roofPitch` sets it; validation warns under 2 m. CLI `platform.add`/`platform.update`, web platform panel **Porch roof** and **Lean-to pitch**.
  - **`floor.insert` spaces the stack with its own `value`.** A cellar inserted with `wallHeight` no longer needs an explicit `elevation` to avoid the "vertical wall gap" error; the value was applied only after the stack had been spaced with the default height.
  - **Floor IDs on `Floor_NN`.** `metadata/building_floor_id` and `building_floor_label`, so a game can find a storey after an insertion renumbers the nodes.
  - **Stable export name.** `building.update` `sceneName` (web: **Scene name**) fixes the scene file, root node and door/elevator scene prefix, so renaming the building no longer moves the file.
  - **`metadata/building_part` on every mesh node** (`roof`, `ridge`, `post`, `beam`, `step`, `floor`, `exterior_wall`, …), and game-layer `nodeMaterials`/`layers` rules can select by `part`, so plain roof boxes, ridge caps, posts and beams are styled without node-name globs that break when a label changes.
  - **Exterior door thresholds.** Doors in exterior walls get `metadata/outward_normal` and a `Threshold` marker at the door's foot on the outer face, facing out, for terrain steps.
- **Tangents on every exported surface** (change request from five games). Surfaces now include `ARRAY_FORMAT_TANGENT`: one tangent per flat triangle, encoded as Godot stores it (checked against `SurfaceTool.generate_tangents()` output in Godot 4.5.1, the same layout reported for 4.7). Before, a triplanar or normal-mapped material logged "requires tangents" warnings for as long as the scene rendered: 68 in 20 frames on the farmhouse, now 0. A new Godot test compares every surface's tangents with `generate_tangents()` and renders with such a material.
- **Valid resource IDs for hyphenated room labels.** With `slabsByRoom`, a room label such as "Globo-Dyne" put a hyphen into sub-resource IDs, which Godot reports as "The scene unique ID must contain only letters, numbers, and underscores". IDs now replace such characters with `_`; node names still keep the hyphen.
- **Game-facing export contract** (feedback from HAUNT and a cabin build):
  - **Hinged door leaves follow their hinge.** Their `AnimatableBody3D` now has `sync_to_physics` off, like the roll-up curtain, custom panel and elevator leaves. Before, rotating `Hinge` left the leaf's collision in the closed position (reproduced in Godot 4.5.1). Games that disable leaf collision while a door moves, as GET PROBED does, are unaffected. A new Godot test rotates single, double and closet doors.
  - **Metadata for matching without node names:** `building_opening_id` and `building_opening_label` on door instances, windows and opening markers (door instances and markers number differently; both rules are now in the names table); `door_width`, `door_height`, `door_leaves` and `door_style` on each door scene root; `building_room` (the exact label) and `building_region_id` on per-room nodes, whose names drop characters such as accents.
  - **Export and game layer:** `export`/`package --replace` re-exports onto a previous export folder or zip and refuses anything else. A game layer with a `materials` map now gets a note listing named surfaces it leaves without a material (CLI output and the web export status). A door script attached by the game layer is named in the door's description instead of "attach your door script manually".
  - **Docs:** CLI.md, TRANSACTIONS.md and GAME_LAYER.md now point to the README and LLM_GUIDE first. GAME_LAYER's surface list includes the ceiling's `RoomFaces`. LLM_GUIDE gains the name rule, both numbering rules, `building_regions`, the ceiling-underside formula, a knee-wall attic recipe, and a note that `slabsByRoom` splits meshes but not collision. The example scenes were regenerated for these additions; no building JSON changed.
- **Elevators**, demonstrated by a new test building, the five-storey [Meridian Hotel](authoring/hotel/README.md) with two lifts ([findings](authoring/hotel/FINDINGS.md)). A building-level shaft serving a range of floors: `elevator.add`/`update`/`remove` in the CLI and an **Elevators** panel in the web editor, both checked by the same rules (`src/elevators.js`). Each elevator exports its own scene under `Elevators`: a static shaft with landing openings, a `Car` that moves on Y with its collision, sliding `DoorLeft`/`DoorRight` landing doors on each floor and `Stop_NN` markers. Upper floors get a hole at the shaft; the route check links the landings and reports a blocked one. No script is attached; the game layer can attach `scripts.elevator`. Checked in Godot 4.5.1 by moving the car to each stop and sliding the doors open. In the web editor, the **Elevator** tool places a shaft with a click; select it on the plan to drag it (`group.move` in the CLI) or edit it in Selection. Railings, porches, manual floors and ceilings, and roofs that would cross a shaft are rejected in both, with the same rule. `inspect --entities` lists elevators, and elevator problems in the web Checks panel have a **Show elevator** button. Refinements: car doors that ride with the car; `skipFloorIds` for express lifts (no landing or stop on those floors, in the CLI and as **Stops at** checkboxes in the web editor); `CallButton`, `Indicator` and `CarPanel` marker anchors; separate surfaces `ShaftOutside`/`ShaftInside`/`ShaftEdges` and `CarFloor`/`CarWalls`/`CarCeiling` for materials; and `godot-check --assets` probes every exported elevator in Godot (car floor at each stop, closed and opened doors, clear shaft).

- **Export profile default.** A blueprint without `exportProfile` now exports as `generic`; it used to fall back to `get_probed`, which added GET PROBED's groups to other projects. The supplied GET PROBED examples (`barn_v2`, `farmhouse`, `twostory`, `farmhouse_example`) now state `exportProfile: "get_probed"`, so their scenes are unchanged. Older GET PROBED blueprints without the field need the field or `--profile get_probed`.
- **Per-room walls and roof materials.** `slabsByRoom` also splits room-facing wall faces (`InsideFaces_<Room>`, `SideAFaces_<Room>`, `SideBFaces_<Room>`), so rooms keep their own wall finish. Game-layer `nodeMaterials` rules without a `surface` set the whole node's material, which reaches roof slabs, ridge caps, posts and steps exported as plain boxes without surface names.
- **Documentation for agents.** The README now starts with an agent entry block, a quick start, where the tool is used in practice and a documentation map; release history moved here. LLM_GUIDE gained a scripted-recipe walkthrough, a wall-thickness guide and a table of exported node and file names.

## Added in 1.4.0: Kestrel starship stress test and code audit

Code audit fixes (each reproduced first, with a regression test):

- **Scene files with backslashes in labels.** A floor label such as `C:\stores` passed validation but exported a `.tscn` that Godot could not parse. Labels in quoted scene strings are now escaped; five hostile labels round-trip exactly through Godot.
- **Route check in check reports.** Reports from `validate --reachability --out` and the web download now record that the route check ran, from open ground and from which route starts, with per-floor reached areas (`results[].routeCheck`, `verification.routeCheck`).
- **Wall loops close where you started.** In the web Wall tool, clicking the start point again could make a T-junction instead of closing the loop when grid snapping had moved the start beyond the 10 px snap radius. Snapping to the start's grid point now closes the loop. Found by the repaired browser suite.
- **One Godot render at a time.** The local server claimed its render slot only after reading the request body, so simultaneous requests both ran Godot; a second request now gets 409.
- **Clear errors for malformed lights.** A light `color` or `position` that is not an object is a validation error instead of a raw JavaScript TypeError.
- **Tests and docs.** `npm run test:browser` passes again (ambiguous selector, phone-width click); the test runner allows 10 minutes per file and reports timeouts plainly; LLM_GUIDE lists the light operations; the version is 1.4.0; unused legacy interior-mesh code is removed.

Web/CLI parity: every web editing capability now has a CLI transaction, through the same shared code, each with a web-parity test.

| Capability | CLI | Web editor |
| --- | --- | --- |
| Markers | `marker.add/update/remove` | Marker tool and panel |
| Floor Footprints | `slab.add/update/remove` | Floor Footprint tool and panel |
| Manual floors/ceilings | `manualFloor.*`, `manualCeiling.*` | Manual Floor/Ceiling tools and panels |
| Floor stack | `floor.insert` (above/below), `floor.duplicate`, `floor.move`, `floor.remove` | Add above/below, Duplicate, Move up/down, Delete |
| Move a selection | `group.move` | Move selection, Move by distance |
| Door/window meshes | `building.update` `doorMesh`/`windowMesh` | Door and window mesh settings |

### Kestrel starship stress test

An AI built a two-deck starship interior ([authoring/kestrel](authoring/kestrel/README.md)) using custom wall profiles (flared hull, hexagonal corridors) and custom doorway shapes (hatches, airlocks, blast doors). Its [FINDINGS.md](authoring/kestrel/FINDINGS.md) lists each issue with its status. Still open: Standard stubs at shaped-wall ends (K6, deferred), shaped windows (K7) and ladders or lifts (K8), which are accepted limits for now. Fixed:

- **Z-fighting on lower-story ceilings (Godot export).** Buildings with shaped walls or shaped openings no longer emit the story-seam skirt underside, which lay exactly on the lower story's ceiling and flickered in Godot. The Standard wall path never emitted it. Collision is unchanged, and no bundled example scene changed.
- **Nubs at angled wall junctions (Godot export).** At junctions whose angles are not all multiples of 90° (obtuse corners, Y junctions), Standard wall ends are now mitered on the bisector planes instead of extended by half the thickness. The extension overshot and left small nubs whose end caps showed as strips. Right-angle and T junctions and all collision shapes are unchanged. Only three example scenes changed: `editable_junctions`, `polygon_regions` and `round_bounding`, in mesh data only.
- **Uniform ceiling height (Godot export).** The automatic ceiling used to hang only under exposed areas (wall top − 0.12 m), while rooms under the next floor saw that floor's slab at wall top. Wherever an upper story was smaller, the ceiling stepped 12 cm. The ceiling now hangs over the whole story, cut at stair openings and left open under upper floors with `autoFloor:false`. The CLI and web previews share the rule. Changed scenes: `twostory`, `basement_markers` and `roof_junctions`; the others have automatic ceilings off or no setback.
- **Profile thickness follows the wall thickness.** Profile station heights are fractions of the wall height (one type fits walls of different heights); offsets and thickness are metres. When the building wall thickness changes (web setting or `building.update`), stations at the old thickness follow the new one, so profiles no longer drift out of step with the plan footprint. Deliberately thicker or thinner stations keep their metres.
- **Interior surface-colour check.** `--surface-colors` (web: **Color surfaces by type**) paints interior-wall EdgeFaces red, distinct from exterior teal, next to interior SideA orange and SideB yellow.
- **Readable interior renders.** `godot-check --render` and the web **Render in Godot** share a script that now adds a short-range camera headlamp and a clear render-only material on `Glass` surfaces. Sealed rooms are visible and windows show what they look onto. Scenes are still unmodified.
- **CLI wall types, doorway shapes and lights.** New operations mirror the web dialogs and panels, on the same shared validators:
  - `wallType.add/update/remove` and `openingShape.add/update/remove`;
  - `wall.add/update` accept `wallTypeId`, `inwardSide` and `inwardToward: {x, z}`, a point on the side the profile should face;
  - `light.add/update/remove`.

  `inspect --entities` lists the definitions, lights and each shaped wall's resolved inward direction. The Kestrel is now built with CLI commands only.
- **Route check for sealed interiors and shaped walls.** `validate --reachability --from "x,z[,floorId]"` (web: **Route start** under **Include route check**) starts the route inside, for ships and bunkers with no exterior opening. Shaped walls now block by their profile's reach up to body height.
- **Render and probe fixes.** Automatic eye-level render cameras avoid stairs and walls. The navmesh probe fails a start or target that is not on the navmesh instead of silently snapping it.

| Capability | CLI | Web editor |
| --- | --- | --- |
| Wall types | `wallType.*`, `wall.add/update wallTypeId` | **Wall types** dialog, wall panel |
| Wall inward side | `wall.add/update inwardSide` or `inwardToward` | Wall panel **Inward direction** |
| Doorway shapes | `openingShape.*`, opening `shapeId` | **Doorway shapes** dialog, opening panel |
| Lights | `light.add/update/remove` | **Light** tool and light panel |
| Route start points | `--reachability --from` | **Route start** field |

## Added in 1.3.0: AI authoring fixes from the Ravenhold castle exercise

An AI built a four-level castle through the CLI ([authoring/ravenhold](authoring/ravenhold/README.md)) and recorded where the workflow failed ([FINDINGS.md](authoring/ravenhold/FINDINGS.md)). This release addresses those findings:

- **Starting and settings.** `node cli.mjs new --out NEW.json` writes a deterministic blank building. `building.update` edits name, default dimensions, wall thickness, automatic roof and ceiling. `floor.update` and `floor.add-top` accept `autoFloor`, `autoCeiling` and `boundaryMode`.
- **Route evidence.** `validate`/`inspect --reachability` is an opt-in static check from open ground through doors, empty passages and stairs, with walker clearance. It warns about unreachable floor areas and blocked stair ends.
- **Godot renders.** `godot-check --assets DIR --render --out NEW_DIR` renders the exported scenes in Godot: exteriors, aerial and eye-level region views, or custom `--views`. Windows and macOS render directly; on Linux it needs `DISPLAY`/`WAYLAND_DISPLAY` or `xvfb-run`.
- **Parapets, guards and openings.** `wall.crenellate` adds crenels to a wall as empty window openings, `railing.add/update/remove` edit railings, and `opening.add/update` accept a world point `at: {x, z}` instead of `t`.
- **Reviewable diffs.** Adding or removing ID'd objects reports per-ID `add`/`remove` entries instead of restating whole arrays.
- **Exterior shell fixes (Godot export).**
  - Thick exterior walls no longer show EdgeFaces strips at convex corners, or holes in the story-seam skirt there. Where a wall's side face and a neighbour's end cap share a plane, the side face now always wins, regardless of wall order.
  - Open wall chains, such as parapets ending against a tower, no longer flip which side of other exterior walls is OutsideFaces.
  - Collision is unchanged. Bundled example scenes were regenerated with `generate-examples.mjs`; their building JSON is unchanged.
- **Fewer false warnings.** On floors with solid regions or Floor Footprints, only free-standing exterior wall ends warn, with wall targets.
- **Docs and papercuts.**
  - Saved check reports use relative paths.
  - The docs cover an open-deck recipe, floor spacing and canvas installation.
  - TRANSACTIONS.md now states that `roof.add` accepts every roof field.

Every addition is available in both the web editor and the CLI, through the same shared code:

| Capability | CLI | Web editor |
| --- | --- | --- |
| Blank building | `new` | **New** |
| Building and floor settings | `building.update`, `floor.update` | Building and Floors panels |
| Route check | `validate`/`inspect --reachability` | **Include route check** under Godot Export: warnings with **Show floor**/**Show stair**, a red plan outline of unreachable areas, and inclusion in the check report |
| Godot renders | `godot-check --assets DIR --render --out NEW_DIR [--views FILE]` | **Render in Godot**: gallery, ZIP download and optional current 3D view. Uses the local server started with `GODOT_BIN`. |
| Crenellation | `wall.crenellate` | Wall panel: crenel/merlon width, depth, **Add crenels** |
| Surface-colour renders | `godot-check --render --surface-colors` | **Color surfaces by type** |
| Railings | `railing.add/update/remove` | Railing tool and railing panel |
| Wall splitting | `wall.split` (`at` or `distance`) | Wall panel: **Split at (m from A)**, **Split wall** |
| Stair-opening guards | `stair.guard` | Stair panel: **Guard opening above** |
| Opening placement | `opening.add` with `t` or `at` | Click placement on a wall |
| Polygon and hip roofs | `roof.add/update` with `polygon`, type `hip` | Roof panel: **Footprint** from a polygon region, **Hip** type |
| Shared door scenes | `export`/`package --share-door-scenes` | Godot Export: **Share identical door scenes** |

Default validation, example expectations and existing scene exports are unchanged.

Web verification:

- The editor-handler suite (`web-parity-tests.mjs`) checks that web crenels equal the `wall.crenellate` result, that route warnings match `--reachability`, and that the render request carries exactly the web export.
- The engine suite renders through the local server and gets the same views as `godot-check --render`.
- `npm run test:browser-parity` passed in Chromium 141 (Playwright 1.56) at 1440 px and 390 px: route check and overlay, a 47-view Godot render of Ravenhold, **Add crenels** and **Split wall** on a wall selected in the plan, and **Guard opening above** on a stair selected in the plan.
- The older `npm run test:browser` suite stops at a pre-existing ambiguous `.advanced-options` locator; this also fails on the 1.2.5 commit and was not changed. Per-wall thickness and a per-region "open to sky" flag remain deferred. The rebuilt castle uses only CLI commands, with no JSON edits. `release-check --canvas required --engine required` passed all 7 gates on Linux with Node 22.22.2 and Godot 4.5.1. The report was not packaged with the source, and browser layout, other platforms and archive comparison remain unchecked.

## Cleanup in 1.2.5: AI authoring review

[AUTHORING_REVIEW.md](AUTHORING_REVIEW.md) adds a concrete review process for circulation, floor coverage, courtyard ground, visual design and honest completion claims. A supplied castle is retained as a negative QA fixture: it passes schema validation but has missing lower keep floors and no stairs. The regression test verifies void precedence and a focused coverage repair without changing the exporter or rebuilding the castle.

## Cleanup in 1.2.4: local server startup

Invalid `PORT` values now produce a concise configuration error. An occupied port reports how to choose another one instead of printing a Node stack trace. The default remains 5173; `PORT=0` chooses an available port and prints its URL. The server continues to listen only on loopback.

## Cleanup in 1.2.3: numeric placement controls

Blank, nonfinite and out-of-range placement values now restore the previous value with a status explanation. Stair counts require a whole number from 2 to 512. Valid negative surface elevations and platform offsets remain supported. Placement preferences do not change the current blueprint or its undo history. CLI preview rejects empty numeric arguments instead of treating them as zero.

## Cleanup in 1.2.2: download and CLI error handling

Save JSON now reports when the browser download is requested and displays failures in the status bar. JSON, check reports and Godot ZIP downloads share one cleanup path, including when a browser DOM call throws. This does not confirm that a user completed the browser's save dialog; check browser downloads for the final file. Saving leaves the document and undo history unchanged.

CLI parse errors now honor `--`: a following filename named `--json` cannot switch error output to JSON. Put an actual `--json` option before the separator when machine-readable errors are wanted. Commands, exit codes and scene geometry are unchanged.

## Cleanup in 1.2.1: reliable loading

Delayed JSON/example loads no longer overwrite newer loads, committed edits, New/preset actions or Undo/Redo. Old failures do not replace current status messages, and superseded example requests do not leave the picker disabled. A failed current load preserves the current building and history; null input reports “Not a building file.”

Web file import and CLI blueprint/transaction parsing accept one leading UTF-8 byte-order mark. Source fingerprints and `package --include-json` retain the exact input bytes. Malformed JSON and unsupported schema versions still fail. Geometry and export behavior are unchanged.

## Added in 1.2: shareable check reports

Use **Download check report** under Godot Export to save current errors, warnings and resolved object references as JSON. The report is a diagnostic snapshot; save the building JSON separately when sharing a reproducible issue. Downloading leaves the current drawing, selection, geometry and undo history intact. Errors do not block reporting.

The CLI uses the same report format: `node cli.mjs validate plan.building.json --out plan.checks.json`. Batch inputs are supported; failures still produce a report and retain their normal nonzero exit codes. Existing destinations and input paths are protected. Reports distinguish web checks of the current document from CLI validation and in-memory preparation. They do not claim Godot execution or collision-clearance verification. See [CHECK_REPORTS.md](CHECK_REPORTS.md).

## Added in 1.1: go directly from a warning to its object

Validation results now offer **Show stair**, **Show wall**, **Show roof**, and other object buttons when the check identifies a specific object. Stair warnings select the flight; overlap warnings offer each implicated wall, stair, platform or manual surface. Attachment warnings offer the child roof and its host. Exact collection-path errors can identify their object, while broader floor checks offer **Show floor**. Checks without an unambiguous target remain plain text.

Choosing an object switches to Plan and Select mode, clears the selection filter, activates its owning floor, centers/highlights it and focuses its properties. A floor-wide warning opens that floor's controls. Independent roofs and manual surfaces retain the active floor because they are building-level objects. Navigation cancels unfinished drawing and does not change the blueprint, exported geometry or undo history. Targets use scoped IDs rather than names; missing or ambiguous targets do not select a substitute.

See [the selected stair from a clearance warning](qa/previews/diagnostic_stair_selection.png). This is the actual plan canvas from the original farmhouse preset, whose known stair/wall overlap remains intentional test data. It is not a browser screenshot. All 33 existing plans and 64 scene assets are unchanged from v1.0.

## Added in 1.0: workflow audit and validation feedback

The planned v1 workflow audit is complete for the available environment. All 11 shipped transaction recipes pass CLI dry-run/save, web reload and exact scene export comparison. Their 27 fresh Godot scenes load with 524 collision shapes and empty material slots; fixture-specific physics tests remain separate release gates. Addition/removal recipes restore their original scene bytes. The 33 catalog plans and 64 bundled scene files remain unchanged from v0.33.

A compact **Checks** button beside Export now shows current errors or warnings. It and **Check building** take keyboard focus and scrolling to a clear results summary. Export errors block the download; warnings allow export and reveal the results. Background checks do not steal focus. Out-of-range numeric building settings now roll back before they enter undo history, fixing a case where an invalid grid size was saved with a success message.

The quickstart and current CLI/preview guides now distinguish shipped features, intentional warning examples and future work. Earlier release sections below and VALIDATION.md are historical notes. Live browser layout, target Godot 4.7 and other operating systems/runtimes remain unverified; the successful engine gate uses Godot 4.5.1 Compatibility on Linux. The v1 label does not imply those unavailable checks passed.

## New in 0.33: CLI top-floor creation and removal

Transactions can now **add a blank top floor, author its contents, and connect stairs in one edit**. `floor.add-top` requires a new floor ID and the current `aboveFloorId`; labels, dimension overrides and automatic floor/ceiling switches are optional. It shares the web floor-stack rules and leaves existing floor IDs and contents intact.

`floor.remove-top` requires the current top ID. Populated floors need explicit `removeContents:true`; incoming stairs separately need `removeAffectedStairs:true`, or explicit removal operations first. The last floor cannot be deleted. Dry runs list removed contents and stairs, resolved level changes and automatic slab coverage. Independent manual roofs/floors/ceilings retain their absolute heights and produce an alignment-review warning for effective stack changes.

Try the [add-third-floor recipe](examples/transactions/add-third-floor.edit.json) on `examples/stair_ramp_north.building.json`, then the [removal recipe](examples/transactions/remove-third-floor.edit.json). See [transaction instructions](TRANSACTIONS.md#top-floor-creation-and-removal-033) and the [before/after software preview](qa/previews/cli_floor_stack.png). Tests cover full and smaller upper footprints, automatic roof/ceiling exposure, stair holes, story seams and exact scene restoration. The existing 33 example plans and 64 scene files are unchanged from v0.32.

This CLI pass covers top-floor membership only; basement/middle insertion, duplication and swapping remain available in the web builder. Separate lighting shells, empty material defaults and asset-only exports are preserved.

## Added in 0.32: doorway editing refinements

The doorway dialog now has its own **Undo shape edit / Redo shape edit** history. Corner drags are single edits; point values, presets, bounds fitting, corner insertion/removal and drawing steps are undoable before saving. Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z and Ctrl/Cmd+Y work when the canvas or a dialog button is focused; text fields retain native text undo. The building's history is unchanged until Save, and Cancel still discards the entire draft.

**Save as new shape** creates an independent copy. When editing a selected doorway, only that doorway receives the copy; other doors using the original shape retain it. **Save shared shape** updates the original type and all its linked openings. Copies use the entered name, adding “copy” if the name was not changed. A completed save remains one building-level undo step.

**Preview frame and panel at this size** shows the real inset geometry, panel and 6 mm side/top clearance using current door settings. It reports frame-fit problems while you edit, and reports invalid preview dimensions without changing the document. The preview tests the displayed size only: every affected opening is still validated at its actual dimensions on Save. An empty passage can use an outline whose frame preview cannot fit. Toggle the overlay off to work with the outline alone.

Unfinished drawing disables controls that would act on the previous outline. Pointer cancellation or lost capture restores the pre-drag points; clicks outside the canvas drawing bounds no longer snap onto distant edge handles. Numeric edits preserve their input elements and focus. See [the updated canvas and live fit feedback](qa/previews/doorway_frame_preview.png). Export geometry, materials, lighting shells and all 33 bundled plans / 64 scene files are unchanged from v0.31.

## Added in 0.31: custom doorway outlines

Choose **Door → Doorway shape → Edit doorway shapes…**, or select an existing door and choose **Create doorway shape…**. A front-view dialog lets you draw an outline, drag its corners, enter exact percentages, insert/remove corners, or start with Rectangle, Clipped corners / airlock, or a Faceted arch. Use **Fit to bounds** after drawing if the outline does not reach all four bounds. Preview width/height affect only the diagram; each opening has its own physical width and height in Selection.

Save a named shape and reuse it on multiple doors. Saving edits to a shared shape updates its openings; Cancel discards the draft. Deleting a shape returns its openings to rectangles, and Undo restores them. Select **Empty opening** for a shaped passage without a frame or panel. Room/Exterior doors with an outline produce a plain matching panel and frame; their rectangular decorative styling is not applied. The standard rectangle and existing door styles remain available.

Wall cuts, reveals, separate lighting shells, previews, and collision follow the outline, including concave notches. Empty passages can cross wall-profile bends. A framed panel still needs a straight, constant-thickness wall profile over its height. Outlines need 3–32 noncrossing corners and a flat bottom edge at floor level. Frames have no raised threshold; thin or sharply notched outlines that cannot fit the frame inset report an error. Custom outlines do not yet support closet pairs, windows, or compound frame cross-sections.

Custom doors export a **Panel** pivot containing a mesh and an `AnimatableBody3D` with shape-following convex collision pieces. Moving Panel moves its collider; the frame has separate stationary collision. Add sliding, swinging, or other movement in Godot. No movement script is generated, and these panels do not automatically implement Get Probed's legacy Hinge script contract. Material slots remain empty by default. Export remains the building `.tscn` plus its relative door scenes.

Choose **Custom doorways and airlocks** in Examples. See [the outline editor canvas](qa/previews/doorway_shape_editor.png), [empty passage and matching panel](qa/previews/custom_doorway_detail.png), and [whole example](qa/previews/custom_doorways.png). These are actual software/canvas renderings, not browser-layout or Godot screenshots. All 32 prior plans and 62 scene files remain byte-identical to v0.30.

Plans containing shared doorway shapes use schema **10**, so older editors reject them instead of exporting rectangular holes. Other plans keep schema 9. Shapes live in `openingShapes` with `id`, `label`, and normalized `points: [{x,y}, …]`; doors reference `shapeId`. Front-view X runs from wall A toward B and Y upward. The same definition drives CLI validation, previews, and exports; `opening.add/update` transactions can set a saved `shapeId`, or use `null` to return to Rectangle. Shape-library creation/editing is via the web dialog or JSON.

## Added in 0.30: angled Standard partitions

Standard partitions now fit shaped hosts at oblique angles, including matching split hosts. The smaller angle between the wall lines must be **at least 30°**. Both ends may attach; the partition keeps its flat sides and Standard thickness while each end follows the host surface through its height bends. Preview, exported geometry and collision share the fitted union. The established right-angle path is preserved.

Choose **Angled partitions and split hosts** in Examples for a diagonal partition with an open passage between recessed and flared hosts. See the [3D preview](qa/previews/angled_partitions.png) and [authored plan](qa/previews/angled_partition_plan.png).

Angled joins need more room along the host as the profile moves inward or outward. Validation uses a conservative clearance envelope for host corners, openings and frames, including frame depth and frames extending down toward a short partition. It also checks both side edges of a partition for collapsed fitted ends. Move the join/opening or reduce the profile offset if those guards report a conflict. Shaped-to-shaped branches and extra branches at one attachment remain unsupported. All 31 previous plans and 61 previous scenes remain byte-identical.

## Added in 0.29: partitions join split shaped hosts

A perpendicular Standard partition can now attach where **two collinear shaped wall sections meet**, on either or both ends. The sections stay separate editable walls. Their physical offsets, thickness and heights must match; using the same shared wall type is the easiest way to maintain that match. Equivalent profiles with different type IDs or reversed drawing directions also work when they describe the same physical shape.

Choose **Split shaped-wall junctions** in Examples. Its Standard partition has an open passage and meets split recessed/flared hosts at both ends. See the [3D example](qa/previews/split_host_junctions.png) and [authored plan](qa/previews/split_host_plan.png). The fitted union matches the unsplit geometry, including collision and separate lighting shells. All 30 previous plans and 60 scene files remain byte-identical.

This supports walls already authored as separate sections; it does not add an automatic wall-splitting operation. Version 0.30 adds angled Standard branches under the rules above. Shaped-to-shaped branches and extra branches at the same connection remain unsupported. Clearance from openings, frames and the hosts' outer corners still applies. A mismatched pair reports profile/height/direction guidance instead of silently joining incompatible surfaces.

## Added in 0.28: Standard partitions join shaped walls

Draw a **Standard** wall whose endpoint meets the middle of a shaped wall at a right angle. Its end automatically follows that host's offset through every profile height; both ends can attach to different shaped hosts. The solid union removes buried faces, so a recessed host does not leave a protruding partition and a flared host does not leave a gap. The partition keeps its Standard thickness and flat sides. This works with exterior or interior shaped hosts and with shorter partitions.

Choose **Standard partitions between shaped walls** in Examples. It includes two Standard partitions between recessed and flared walls, with an open passage in one partition. See the [connection comparison](qa/previews/fitted_partition_detail.png) and [whole example](qa/previews/fitted_partitions.png). Preview, exported geometry and collision share the fitted union. Walls remain independently editable, lighting shells remain separate per story, and material slots stay empty. No JSON migration or additional setting is required.

Each fitted end must meet a shaped host at 90°, clear of its corners and openings. The host must reach at least the partition's height. Openings in the partition also need clearance from the fitted end. Validation explains those constraints and rejects offsets that collapse the partition. Version 0.29 adds the matching split-host case above. Existing two-wall endpoint corners keep their previous miter behavior.

All 29 previous plans and 59 previous scenes remain byte-identical. This release adds one example to the web and CLI catalog.

## Added in 0.27: shaped roof fitting around recesses and cutouts

Profile-aware roof cuts now follow concave exterior outlines, courtyard wall loops and separate rooms. Authored rectangular and polygon void regions retain their fixed edges. Roof pieces inside those open areas survive, while pieces entering the shaped room are removed. The same cuts drive the web preview, exported meshes and Godot collision.

Choose **Concave shaped roof junctions** in Examples for a U-shaped hull building with flat and gabled canopies in its recess. See the [close-up comparison](qa/previews/concave_roof_detail.png) and [current example](qa/previews/concave_roof_joins.png).

Fitting requires closed, unbranched exterior loops and full-height exterior walls. Every remaining footprint boundary must follow an exterior wall or an authored void edge. Collinear wall sections must share their outside profile; wall thickness schedules must match across the fitted outline. A common thickness can vary vertically. Profiles that collapse an edge, cross another boundary or exceed the fitting budget (128 boundary segments or 512 convex cells) retain the previous plan-footprint cuts and report a nearby roof/wall warning. Reduce the offsets or simplify the outline in those cases.

This extends clipping of existing roofs; automatic concave hipped roofs with continuous valleys and automatic roof extension remain future work. Previous convex fitting and separate interior/exterior lighting shells are preserved. All 28 previous plans and 58 previous scene files remain byte-identical in this release.

## Added in 0.26: roofs meet shaped walls

Roofs now cut against the shaped exterior room envelope at each height, including bends, inward/outward offsets and shared variable thickness. This fixes the reviewed 34.8 cm gap and 17.2 cm interior intrusion when the authored roof already reaches the wall. Preview, exported roof geometry and collision use the same cuts. Exterior/interior wall lighting meshes and empty material slots remain separate and unchanged in purpose.

Automatic and independent **gable end panels** now use the applicable story/host cuts too. Their collision follows the surviving capped geometry. This removes internal panels that previously remained after the roof slabs were trimmed. Intentional open gables and barn door openings remain authored choices. Explicit roof-to-roof attachments still trim the child only; they do not create reciprocal roof unions or valleys.

Choose **Shaped roof junctions** in Examples to inspect three canopies meeting recessed, flared and Standard walls. See the actual software-preview [before/after](qa/previews/profile_roof_before_after.png) and [updated example](qa/previews/profile_roof_joins.png).

The original convex fitting includes the supplied twelve-sided round outline. Version 0.27 extends this to the additional shapes described above. Differing corner thickness, incomplete outlines and half-height exterior sections still receive fitting guidance.

Clipping removes excess geometry; it does not extend a roof that was drawn too short. For nearby exterior attachments that remain wholly separated in the sampled contact check, validation reports the roof, wall and measured gap. Extend the footprint or overhang toward that wall and validate again. Distant detached roofs avoid that proximity warning. This check samples generated vertices; it is not a proof of continuous contact across every point of a complex junction. JSON and CLI `inspect` expose these results as `roofs.wallContacts` for documents with wall types.

Floors/ceilings and automatic gable support footprints still follow the plan outline; a shifted top or bottom wall endpoint can need separate surface fitting. These warnings remain. This release does not generate a transition between separated collinear wall profiles or invent missing roof spans.

Verification: eight focused Godot scenes and sixteen collision rays cover the repaired cases, retained outer gables, an explicit roof host, an upper story and the round outline. Core geometry checks cover flat/gable/shed roofs at three profile heights, preview/export parity and precise/unsupported warnings. All previous building JSON files stay byte-identical; the existing `twostory.tscn` and `roof_junctions.tscn` change because automatic gable panels now clip against taller stories. Other existing scene files retain their previous bytes.

## Added in 0.25: custom wall profiles

Open **Wall types → Edit wall types…** to create a named side-on cross-section. Start with Straight, Hull (recessed middle), Flared middle or Thick base. Drag the yellow points or enter height, offset and thickness values; add/remove intermediate levels. Height is a percentage of each wall's own height. Offset and horizontal thickness are metres, so thickness can vary with height. The diagram shows the profile with independent horizontal/vertical scales.

**Positive offset is inward; negative is outward.** Auto uses the geometric inside of a closed exterior loop, and Side A for interior walls. On an open exterior chain, Auto uses the existing exterior-side inference; choose Left or Right when the intended inside is ambiguous. Each selected shaped wall shows a **+ inward** arrow in plan. Left/Right refer to looking from A toward B in the X/Z plan. Flipping that setting changes the shape direction while the exterior/interior lighting shell identities remain intact.

Choose the default type for new walls and rectangles. To change existing walls, use **Wall type** in the selection panel, or select multiple walls and use **Apply type to selected walls**. **Standard** retains the normal constant-thickness wall. **Create wall type…** on a selected Standard wall applies the new type when saved. Editing a shared type updates all its walls across floors; deleting a type returns those walls to Standard. Save, apply and delete each make one undo step. Cancel discards the draft.

The web preview and exported meshes follow the same profile. Exterior OutsideFaces/InsideFaces/EdgeFaces and interior SideAFaces/SideBFaces/EdgeFaces stay separate per story. Shaped stories use concave triangle collision following their wall surfaces; collision does not fill the air outside a recessed middle. Existing Standard-only stories keep their previous mesh and collision path. Material slots remain unassigned by default. JSON, CLI validation and export preserve optional `wallTypes`, `wallTypeId` and `inwardSide` fields without migrating old documents.

Load **Shaped wall workshop** from Examples for a Standard entry wall meeting recessed hull walls at corners, with a window shifted to the recessed face. See its [floor cutaway](qa/previews/shaped_walls_floor.png) and the [actual profile-editor canvas](qa/previews/shaped_walls_profile.png).

Initial limits:

- Profiles have 2–16 ordered levels from 0% to 100%, with straight interpolation between them. Folded-back sections, duplicate-height shelves, curved splines and holes inside the cross-section are not supported. Up to 64 shared types are allowed.
- Unbranched endpoint corners of at least 30° are supported. Standard branches may join continuous or matching split shaped hosts at 30° or more under the v0.28–0.30 rules above. Other T junctions still need a Standard host section. Straight adjoining profiles must physically meet at every shared height; a transition across a lateral gap is not generated. Profile width/offset must fit the wall length. Openings need enough clearance from shaped corners.
- Enabled framed doors/windows need a constant offset and thickness across the opening height. Place them on straight portions, use a Standard wall, or choose an empty opening across a bend. Frames are translated to the profile but are not bent or tilted.
- Keep the bottom/top profile centred at offset zero with the default thickness for existing floor and ceiling joins. Other endpoints produce review warnings. Roof fitting is extended in v0.26 above; automatic transitions into slabs and separated neighboring wall profiles remain future work.

## Added in 0.24: polygon regions

In **Region → Shape**, choose **Polygon**, then click each corner. Click the first corner again, press Enter, or use **Finish polygon** to close it. **Undo corner** / Backspace removes the last pending corner; Escape, tool/floor changes, focus loss or pointer cancellation discard the unfinished shape. Each finished region is a single undo step. Rectangle drawing remains available.

**From wall outline** copies the active floor's single closed exterior wall loop into an independent polygon region. This is the quickest way to name the supplied round building. Open, branched, crossing or multiple-loop outlines are rejected with an explanation; draw individual regions for separate loops. Moving the walls afterward does not reshape an existing region.

Select a region to edit its name, purpose and footprint effect, or change individual **Corner X/Z** values. **Insert after** adds an edge midpoint; **Remove corner** removes that vertex. Invalid edits roll back without changing the region. Polygons need 3–256 distinct corners, positive area of at least 0.01 m² and at least 0.1 m extent on both axes. Self-crossings, touching nonadjacent edges and overlapping/backtracking edges are rejected. Concave outlines are supported. Separate void regions represent holes.

Regions use the same **Label only**, **Define footprint** and **Cut automatic surfaces** effects as rectangles. Solid/void geometry, collision and coverage guides follow the polygon, including concave notches. Label-only regions change metadata without changing meshes. Regions remain independent of walls, stairs, platforms and manual pieces. Selection follows actual edges/interiors; group dragging and exact movement translate every corner together. JSON and Godot's floor-level `building_regions` metadata preserve the polygon vertices, name, purpose and effect. Region metadata does not create Marker3D nodes; use Marker for point references.

The **Polygon regions** example shows a round solid region, a diamond-shaped opening and a concave named bay. See its actual [plan capture](qa/previews/polygon_regions_plan.png) and [floor cutaway](qa/previews/polygon_regions_floor.png). Hip roof sections around cutouts retain the v0.23 limitation: separate convex sections, with continuous concave valleys still future work.

## Added in 0.23: polygon footprints and hipped roofs

Closed exterior wall loops now generate floors and ceilings along angled edges, including twelve-sided round buildings, triangles, concave outlines, and enclosed courtyard loops. Explicit Floor Footprints and solid regions retain their existing precedence. Void regions, incoming stair openings, platforms, manual surface overrides and higher-floor coverage use polygon cuts; exported collision follows the same footprint. Exterior/interior lighting shells and empty material slots are preserved.

Choose **Default roof type → Hip / polygon** for sloping roofs that follow a convex outline. Equal-pitch slopes meet along hips/ridges; a round outline produces a faceted, cone-like roof. Pitch and overhang remain adjustable. **Flat** also follows polygon outlines. Concave shapes and cutouts are decomposed into separate convex roof sections, not a continuous concave hip/valley solution; overhangs can extend into cutouts, so use zero overhang where an exact opening is needed. Independent manual roofs are rectangles, or polygons for flat (convex or concave) and hip (convex) roofs. Gable and shed automatic roofs still use rectangular sections, with a warning when a polygon footprint needs Hip or Flat.

Load **Round building · hipped roof** from Examples. It preserves the supplied wall and door layout with the roof type changed to `hip`; floor and ceiling coverage is **52 m²**, instead of the old 64 m² bounding square. Existing JSON files do not need a schema migration. Opening the original gable JSON preserves that roof choice; select Hip / polygon to change it.

See the actual [roof preview](qa/previews/round_bounding_hip.png) and [floor cutaway](qa/previews/round_bounding_floor.png). The new geometry and Godot physics checks cover polygon corners, ceiling contacts, stair/region holes, roof overhangs and roof-to-wall clipping. These are software canvas captures, not browser-layout or Godot render captures.

## Added in 0.22: basements, floor order and named markers

The web **Floors** panel now has **Add above**, **Add below**, **Move up**, **Move down**, **Duplicate above** and **Delete active floor**. Insertions are relative to the active floor. Adding below the lowest floor creates a basement and anchors the existing ground at its current elevation. Repeated additions can create multiple basement levels. Inserting between levels moves the upper stack upward, including absolute elevation overrides.

Moving up/down swaps neighboring floors. Each floor carries its name, contents, wall height and slab thickness. Elevations are recalculated from the existing lowest base; intentional vertical gaps/overlaps retain their level slots. Automatic levels remain automatic, while existing absolute override slots get adjusted heights. Independent manual roofs/floors/ceilings keep their absolute positions, with an alignment reminder. Deleting a middle floor lowers the stack above; deleting the lowest preserves the remaining building's elevations.

Stairs connect a floor to the next floor in the stack. Edits that would change those connections are blocked and identify the affected flights. Enable **Remove affected stairs** to remove them as part of the edit; the option resets afterward. Deleting a top floor retains the existing behavior of removing its incoming stairs, and deleting any floor removes its own contents. Duplicates receive new IDs and omit stairs. Every successful operation is one undo step.

Use **Marker** to place a reference point, then set **Marker name**, **Notes (JSON only)** and its X/Z/height in Selection. Height is relative to the owning floor. Markers participate in the pick filter, marker list, Shift/box selection, group movement, deletion and undo. Purple guides show them in the plan and 3D view; guides are visible through geometry and are omitted in the roof-only view.

Authored markers always export as `Marker3D` nodes under `Floor_XX/Markers`. Nodes have unique numbered names plus the authored ID/name in metadata; duplicate display names are allowed. Notes stay in the optional `floors[].markers` JSON collection and are never written to TSCN or its node descriptions. The existing opening-helper toggle / CLI `--no-markers` only controls generated door/window helpers. Markers add no gameplay behavior, meshes or collision. CLI validation/import, inspection and export preserve the new data; floor-stack editing and marker authoring controls in this release are web features.

Try **Basement and markers** in the examples picker. Its [plan](qa/previews/basement_markers.png) and [3D cutaway](qa/previews/basement_markers_3d.png) are captures of the actual software canvases. Godot checks cover floor changes, marker heights/names and collision bands; browser CSS/layout remains unverified. All 23 pre-existing plans and 50 scenes remain byte-identical, and separate interior/exterior lighting shells are preserved.

## Added in 0.21: web multi-selection and group movement

In **Select**, Shift-click objects to add/remove them, or drag a box from empty space to select fully enclosed objects. Shift-box adds to the selection. **Select all** and box selection honor **Pick objects**; choose **Walls** to move a room's walls together. Scope is the active floor plus independent manual roofs/floors/ceilings at any height. Other stories' walls are not selected automatically.

Drag a selected object to translate the group, or press **Move selection** and drag anywhere on the plan. **Move by distance** applies exact X/Z offsets in meters. Dragging snaps the translation to the grid, keeping the group's spacing; hold Alt to bypass it. Heights, IDs, sizes and orientations stay intact. A single selected wall still has its A/B endpoint handles; dragging its body moves the entire wall.

**Keep wall joints** starts enabled: adjacent wall endpoints follow selected walls, so neighboring walls can stretch. A branch can slide along its host, but moves that break its junction are blocked unless you include the host or explicitly turn this option off. Zero-length walls, new overlaps/crossings and invalid openings block the whole move. Doors/windows follow selected host walls exactly once; selecting an opening alone lets it move along its wall. Independent footprints, manual surfaces, rails and roofs move only when selected, so include them when repositioning a complete layout. Generated surfaces rebuild from the edited blueprint.

Yellow outlines mark the selection and dashed outlines preview the move. Release applies one undo step; Escape, focus/pointer loss, floor/tool changes or an invalid drop leave the document unchanged. **Delete selected objects** (or Delete) removes a group in one undo step; wall openings follow wall deletion and surviving roof children lose removed host links. Shift-click the named overlapping-area choices to build a precise mixed selection. See the [plan-canvas preview](qa/previews/web_group_move.png).

This update targets the web builder. The `.tscn` export format, separate lighting shells, material defaults and supplied building plans remain intact. Node handler tests and Godot release checks are included; the canvas preview is not a browser layout screenshot. CLI top-floor creation/removal shipped in 0.33; the available-environment v1 audit is complete.

## Added in 0.20: CLI platform creation and removal

`platform.add` creates a porch/deck with your chosen ID and four rectangle bounds. `platform.remove` deletes the selected platform. Automatic slab cutouts, roof coverage and generated supports regenerate from the remaining platforms. Reports distinguish additions/removals and list independent railings and manual surfaces/roofs for alignment review without treating them as attached objects.

Shared validation warns about platforms overlapping at the same height. Strict CLI mode rejects final warnings; explicit removal or repair can resolve them. The web drawing tool now uses the existing platform guard before committing new geometry. Try the `add-west-deck.edit.json` / `remove-west-deck.edit.json` recipes with `examples/roof_attachment.building.json`, and see [the comparison](qa/previews/cli_west_deck.png). Twelve Godot lifecycle cases check floor, roof and support restoration. See [TRANSACTIONS.md](TRANSACTIONS.md). Top-floor creation/removal shipped in 0.33; the v1 audit is recorded above.

## Added in 0.19: CLI porch/deck updates

`platform.update` edits existing platform bounds, height offset, name, porch/deck type and roof coverage. Changing type sets the usual coverage default; an explicit `covered` value overrides it. CLI and web property edits share a guard that rejects invalid rectangles before they can disappear during normalization. The web editor restores rejected values without adding an undo step.

Inspection and edit reports include resolved platform heights and actual automatic-floor coverage after stair holes, platform cuts and manual-floor overrides. This is slab area, not a walking-clearance assessment. Independent railings and manual surfaces/roofs keep their authored geometry. Try `examples/transactions/east-deck.edit.json` with `examples/roof_junctions.building.json`; see [the comparison](qa/previews/cli_east_deck.png) and [TRANSACTIONS.md](TRANSACTIONS.md).

## Added in 0.18: CLI stair creation and removal

Transactions now support `stair.add` with an explicit ID and `stair.remove` for one existing flight. Adding requires an adjacent upper floor. Removing can also repair an imported orphan. Reports distinguish added and removed stairs, and shared validation warns about overlapping flights or upper landings entering another stair opening.

The new `add-second-stair.edit.json` and `remove-second-stair.edit.json` recipes work with the north-ramp fixture. See [TRANSACTIONS.md](TRANSACTIONS.md) for commands and [the two-stair comparison](qa/previews/cli_second_stair.png). Godot lifecycle tests sample both faces of the upper slab to verify openings, restoration and overlapping-hole unions. Independent manual surfaces retain their authored geometry. All existing catalog plans and scenes remain unchanged.

## Added in 0.17: CLI stair updates

Transactions now support `stair.update` for existing stair labels, center X/Z, width/run, ascent direction, ramp/step style, integer step count and under-stair blocking. Stair IDs and adjacent-floor connections stay intact. Inspection reports slope, step dimensions and footprints; transactions report the before/after stair review. Shared landing, slope and wall-intersection warnings remain available, with strict mode blocking publication.

Try `examples/transactions/stair-refresh.edit.json` with `examples/stair_ramp_north.building.json`. It moves and widens the ramp, turns it east and converts it into an open 16-step staircase. The [before/after cutaway](qa/previews/cli_stair_refresh.png) is generated with the CLI. Godot checks cover 16 edited variants and 488 additional physics rays, including moved openings, landings, open/blocked undersides and story seams. These sampled checks do not certify character clearance. See [TRANSACTIONS.md](TRANSACTIONS.md).

## Added in 0.16: CLI floor updates

Transactions now support `floor.update` for existing floor labels, absolute elevation, wall height and slab thickness. Set an override to `null` to restore automatic/default behavior. Inspection distinguishes authored overrides from resolved dimensions; edit reports show the effects on upper levels and connecting stair rise. Independent surfaces retain their absolute heights and produce an alignment warning when dimensions change. Openings and custom-height walls that no longer fit require explicit repair.

Try `examples/transactions/twostory-levels.edit.json` with the supplied `examples/twostory.building.json`. The recipe keeps every wall, opening and stair definition intact. See [TRANSACTIONS.md](TRANSACTIONS.md) for usage and [qa/previews/cli_floor_levels.png](qa/previews/cli_floor_levels.png) for a CLI-rendered before/after cutaway. All existing catalog plans/scenes remain unchanged. Later releases add stair authoring and guarded top-floor creation/removal; see TRANSACTIONS.md for the current command set.

## Added in 0.15: one release-check command

`node cli.mjs release-check` runs syntax, infrastructure, catalog and available preview/Godot checks in an isolated copy. Results distinguish passed, failed, timed-out and skipped gates. Optional dependencies can be required or explicitly skipped; `--out ../release-report.json` saves a new JSON report outside the source tree. Per-gate timeouts and Linux process-group cleanup bound execution. See [RELEASE_CHECKS.md](RELEASE_CHECKS.md) for commands, scope and exit codes.

The archive includes the actual release report. Geometry, blueprints, lighting shells, material slots and exports remain unchanged.

## Added in 0.14: roof attachment diagnostics

The editor and CLI now warn when a host link removes no additional child roof volume, when existing wall/flush cuts already removed the child, or when the host removes all remaining slab/ridge parts. Measurements use the actual shared clipping geometry and remain separate from gable-fill review. `inspect` reports contribution details; attachment guides show the status. Strict CLI mode respects these warnings, while ordinary editing and export remain available.

No building geometry or existing example changes are introduced. See [ROOF_DIAGNOSTICS.md](ROOF_DIAGNOSTICS.md) for status meanings, numerical scope and a reproducible warning exercise.

## Added in 0.13: web inspection controls

Open **3D PREVIEW** and choose **Whole building**, **Active floor cutaway** or **Roofs and gables**. Optional **Floor footprint** and **Roof attachments** guides use the same geometry as CLI reviews. A nearby Floor selector stays synchronized with the editor; the Manual roof selector appears only for attachment guides. **Frame view** fits visible geometry and guides.

Legends and expandable details show guide scope, coverage area/source, fallback reasons and roof relationships. Controls wrap with the viewport; guide labels sit outside the canvas. Orbit, pan and zoom remain interactive, with generated geometry reused between camera movements. Inspection settings never enter the blueprint or undo history. See [PREVIEWS.md](PREVIEWS.md) for behavior and verification limits.

## Added in 0.12: measured review overlays

Add `--overlay footprint` to show the selected floor's structural coverage perimeter, authored Floor Footprints and solid/void regions. The report includes shared coverage area, source and any rectangular-fallback reason. Coverage is measured before stair/platform slab cutouts; it is not a walkability claim.

Add `--overlay attachments` to show exact manual host clipping envelopes, authored roof footprints and flush edges. Narrow the guides with `--roof MANUAL_ROOF_ID`, including in before/after comparisons. Guides are drawn through surfaces and never change building or export geometry. See [PREVIEWS.md](PREVIEWS.md) for scope, legends and examples.

## Added in 0.11: CLI inspection previews

`preview FILE --view floor --floor 2 --out NEW.png` shows a floor cutaway with other stories, roofs and ceilings hidden. `--view roofs` isolates automatic/manual roof slabs and their gable fills. Both are filtered from the complete building context, retaining original stair openings, elevations and roof clipping.

Add `--compare AFTER.building.json` for a before/after image using one shared camera, scale and framing. Automatic framing uses the actual rendered geometry of both inputs, including independent pieces; `--distance` overrides it. These are software review images with illustrative materials, separate from Godot collision checking. Existing building geometry and separate lighting shells are unchanged. See [PREVIEWS.md](PREVIEWS.md) for examples, floor-scope rules and limitations.

## Added in 0.10: transactional CLI authoring

Use `inspect FILE --entities` to see floor/object IDs and authoring fields. `edit FILE --ops transaction.json --dry-run` validates proposed wall, opening, manual-roof and region edits and reports before/after values. Replace `--dry-run` with `--out NEW.building.json` to save a validated copy. Existing inputs and destinations are never overwritten. Source fingerprints can bind a reviewed transaction to the exact original file.

Connected wall moves share the editor's junction and opening constraints. Invalid references, overlapping openings and openings that no longer fit reject the transaction. Defaults/import migrations have their own diff; the written blueprint loads unchanged in the web editor. See [TRANSACTIONS.md](TRANSACTIONS.md) for the versioned format, supported operations and the runnable porch-entry demo.

Separate lighting shells, default empty material slots and all 23 existing examples remain unchanged. The `transactions` test suite checks dry-run/save parity, failed writes, IDs, source preservation and web-load/export parity; `engine-assets` also checks the authored demo in Godot.

## Added in 0.9: exported-asset checking and example catalog

Use `node cli.mjs godot-check --assets ./exports/house --godot /path/to/godot` to check a new export in an isolated Godot project. It checks scene/dependency loading, mesh and collision resources, material slots, and trimmed-roof collision agreement including transforms. Input files remain unchanged. This mode performs resource checks, not the fixture-specific walking/clearance rays; those remain available through ordinary `godot-check`.

The input must use Building Studio's supported scene format with relative scene dependencies. Scripts, unsupported resource/node types and dependencies outside the supplied directory are rejected before engine loading. Add `--allow-materials` for embedded placeholder colors or `--require-collision` to require collision somewhere in the asset set. See [CLI.md](CLI.md) for exact scope and limits.

The web picker and CLI share one grouped catalog (currently 33 examples). `node cli.mjs examples --check` verifies expected warnings, door counts, roof attachments and selected footprint areas. It distinguishes the original preset's known warning from the supplied farmhouse and reports any unexpected change.

The optional `engine-assets` test suite exercises new exports, repeated building instances, material/collision options and deliberately broken copies. Existing building geometry, JSON, separate shells and material defaults are preserved.

## Added in 0.8: command-line workflow

The web editor stays intact. The Linux-tested Node CLI adds `validate`, `inspect`, `export`, `package`, `examples`, `test`, `godot-check`, and optional software `preview`. Use `node cli.mjs --help`; see [CLI.md](CLI.md) for options and [ROADMAP.md](ROADMAP.md) for remaining work.

```bash
node cli.mjs validate examples/*.building.json
node cli.mjs inspect examples/farmhouse.building.json --json
node cli.mjs export examples/farmhouse.building.json --out ./exports/farmhouse
node cli.mjs package examples/farmhouse.building.json --out ./exports/farmhouse.zip
node cli.mjs test
node cli.mjs test --suite infrastructure
node cli.mjs godot-check --godot /path/to/godot
```

Outputs must be new paths. Inputs are never rewritten. Batch buildings get separate subdirectories to keep door dependencies isolated. CLI and web share normalization/validation/export code; separate lighting shells, empty materials and per-story organization are unchanged. JSON output and exit codes make these commands suitable for assistant-driven audits. `inspect` reports generated resources, not unperformed physics checks.

Core commands need Node 20+ and no npm dependencies. Preview optionally needs `@napi-rs/canvas`; Godot checks need a provided Godot 4 executable. The CLI installs/downloads neither. Supported CLI authoring transactions are documented above; floor/stair/platform automation remains future work.

## New in 0.7: selection, roof attachments and footprint checks

**Selection → Pick objects** limits picking to roofs, walls, porches/decks, or another object type. Choose **All areas** to reach overlapping surfaces beneath lights, openings and walls. Geometry stays visible, and filtering adds no undo entry. The existing click cycle and named candidate buttons remain available.

Select a **Manual Roof** to set each West/East/North/South edge to **Flush with footprint** or **Use roof overhang**. Flush cuts include the actual slab thickness and ridge cap. **Trim to host roof** cuts this roof against an independent manual host's filled roof envelope. Gable, shed and flat hosts are supported on either axis. Preview and Godot export share closed cut faces and matching triangle collision.

Attachments are explicit and one-way: the host remains intact. This is suitable for canopies and branches terminating against another roof; it does not create a dormer opening, reciprocal cross-gable union or automatic valley system. Gable end fills remain an authored choice; v0.26 clips them against the applicable story/host envelopes and keeps a review reminder for exposed ends. Chains, cycles and missing hosts block export. Deleting a host detaches its children; undo restores the host and links. Automatic roofs retain their existing roof-to-wall trimming and are not selectable attachment hosts.

Selection now shows the active story's **footprint source and area**. Existing closed orthogonal L/U outlines and nested courtyard loops retain their automatic floor, ceiling and roof coverage. Crossing or overlapping exterior outlines now trigger an explicit rectangular-fallback explanation. Floor Footprints take precedence, followed by solid regions, then valid wall outlines; void regions still cut automatic surfaces. Version 0.23 also derives coverage from valid closed diagonal wall loops.

Try **Explicit roof attachment**, **L-shaped outline**, **U-shaped outline** and **Courtyard outline** in Examples. All include editable JSON and baked TSCNs. All 46 prior TSCNs and 19 prior building JSON files remain byte-for-byte unchanged from v0.6.0, including the supplied barn, farmhouse and two-story house. Separate lighting shells and empty material slots are preserved.

## Added in 0.6: selecting overlapping objects

The plan picker includes every overlapping area, including multiple roofs or platforms of the same type. Click the same spot to cycle, or use the **areas at this point** buttons in Selection to choose directly. The list shows object type, authored name and absolute height for independent surfaces. Selecting changes no building data and adds no undo entry.

Lights and opening spans win over walls, railings, stairs and filled areas. Openings are selectable along their full visible span. Overlapping stairs use distance to the run centerline. For areas, a nearby outline wins first; otherwise active-story surfaces take precedence, then roof, platform, manual ceiling, manual floor, floor footprint and region. Equal hits use stable IDs. Hit tolerance stays in screen pixels when zooming.

Selected areas have a solid yellow outline with a dark backing and a readable label drawn above the other plan geometry. The overlap list and click cycle reset on empty/precise-object picks, direct region selection, edits, undo, floor/tool changes, pan, zoom, resize and cancellation. Manual surfaces from other heights remain selectable.

The 0.6 update changed selection only; 0.7 adds opt-in roof controls and footprint validation as described above.

## Fixed in 0.5.1: roofs entering rooms

Attached roof slabs now trim against neighboring story interiors, including slab thickness and roof rotation. Exposed overhang stays in place. Preview and export share the same roof geometry; trimmed sections have closed cut faces and matching static triangle collision. Separate exterior/interior wall shells, per-story organization and empty material slots are preserved.

This applies to automatic and independent gable, shed and flat roof slabs. Each story's interior volume is derived from its structural footprints and wall height; cut edges sit just inside the outer wall face. The roof's own supporting footprint is retained. Taller stories block lower roofs, including the band between stories. Independent roof footprints and heights in the saved JSON are not rewritten.

The fix removes room intrusions below wall tops. It does not redesign roof-to-roof valleys above wall tops or gable fills. Automatic footprints now include closed polygon wall loops; explicit footprints define coverage for intentional open layouts. Trimmed static collision uses a baked `ConcavePolygonShape3D`; unaffected roof slabs retain their original boxes.

Try **Examples → Roof wall junctions**, with gable, shed and flat attachments around a two-story host and a partially shared edge. The supplied farmhouse and two-story examples are rebuilt with the correction.

## Added in 0.5: editing existing walls

Select a wall, then drag its **A / B endpoint handles**. A green dashed preview shows a valid edit; red means the edit is blocked and the status line explains why. Release to apply; Escape, pointer cancellation, loss of capture, focus loss, changing tools or changing floors cancels. A click without movement makes no edit. Each completed drag creates one undo step.

**Move connected endpoints** is on by default in Selection. All endpoints sharing that corner move together. Turn it off explicitly to detach only the selected endpoint. T-junctions are protected: their endpoint can slide along the host wall, but the host is not automatically bent or split. Moving a host endpoint is blocked if that would strand a branch attached midway along it.

The numeric Start/End X/Z fields use the same checks and connected-endpoint setting. Edits reject collapsed/overlapping walls and newly introduced wall crossings. Opening widths, heights, IDs and host-wall references are preserved. Openings keep their relative position along the wall; their centers may be clamped inward when necessary. Edits that require shrinking an opening or produce overlapping openings are blocked.

Snapping still prioritizes endpoints, then wall centerlines, then grid. During a drag, the moved endpoints and their old wall projections are excluded from snap targets. Alt bypasses snapping. Closed diagonal boundaries now generate polygon floors/ceilings. Gable/shed roofs report their rectangular-section limitation; select Hip / polygon or Flat to follow convex outlines.

Only the active story's affected walls and opening centers change. Regions, explicit footprints, manual floors/ceilings/roofs and other stories retain independent authorship. Review their alignment after changing walls. The exterior/interior lighting shells and empty Godot material slots remain unchanged.

Try **Examples → Editable wall junctions**. Its two stories contain a moved three-wall junction, an open passage and a stair. The JSON is regenerated through the same edit operation as the UI and ships with its Godot scene. Plan and 3D canvas previews are in `qa/previews/`.

## Added in 0.4: layout authoring

- Wall drawing snaps to existing endpoints first, then wall centerlines, then the grid. The magnet radius is 10 screen pixels at every zoom. Hold Alt for unsnapped placement; Plan View can disable snapping entirely.
- Click the first point after at least two segments to close a wall loop. Closure ends that run. Duplicate/overlapping or near-zero-length new segments are rejected. Existing wall IDs and opening references are never rewritten by snapping.
- Connection dots show open ends (amber), joined endpoints (mint), and larger T/X junctions. They describe centerline connectivity, not a guarantee of a watertight solid; intentional barn entrances may legitimately have amber ends.
- Region draws a named rectangular area on the active story. Room outline still draws four walls. These are deliberately separate tools.
- The Regions list selects overlapping areas reliably. Rename, resize, change purpose/effect, delete and undo from Selection; floor duplication copies regions with fresh IDs.

| Region effect | Geometry behavior |
| --- | --- |
| Label only — default | Names and area labels only; exported geometry stays identical. |
| Define footprint | Union of these rectangles replaces the wall-derived automatic footprint. Explicit Floor Footprints take precedence. |
| Cut automatic surfaces | Subtracts from this story's automatic floor, ceiling and roof footprints, including explicit Floor Footprints. |

Purpose (room, bay, wing, garage, porch, courtyard) is organizational metadata, independent of effect. A courtyard label does not silently cut geometry. Regions do not create/delete walls or assign wall roles. Manual floors, manual ceilings, manual roofs, platforms and stairs remain independently authored and are not cut by regions. Repeat courtyard cutouts on each relevant story; they are not automatically propagated vertically. Roof overhang can project into a cutout; use zero overhang for the exact flat-roof opening. Automatic pitched roofs around cutouts remain separate sections, without cross-gable branch extensions across the hole; complex junctions should use manual roofs.

Regions are saved in schema version 9 JSON and exported as `building_regions` metadata on their existing `Floor_XX` node, even with Marker3D helpers off. They add no gameplay scripts, collision shapes or meshes of their own. Older files load with an empty region list.

Try **Examples → Courtyard & named regions** for a flat-roof courtyard with collidable surrounding floors and a clear center. The supplied barn, farmhouse and two-story plans remain included.

The toolbar now has a Project files menu, tool categories, compact level-dimension overrides, and an optional Scene summary. Selection checkbox rendering and the Barn v2 example option are fixed; drawing cancels safely on floor switches and pointer cancellation. Native text-field undo no longer changes building history.

## Audit hardening pass

- Placed OmniLight3D entries now have visible position/height markers in the editor's 3D preview. These markers are editor-only; exported lights remain bare OmniLight3D nodes.
- Door/window openings are constrained to the host wall horizontally and to wall height vertically. The exporter applies the same constraints defensively even when called with hand-edited data.
- Overlapping openings on the same wall are blocked in the editor, rejected on JSON load, and rejected at export rather than producing order-dependent wall geometry.
- Exterior InsideFaces/OutsideFaces classification now uses even/odd containment against the exterior wall boundary, so concave L/U-shaped closed footprints are classified correctly. Open/incomplete shells retain the previous bounds-based fallback.
- Wall collision remains primitive BoxShape3D geometry and compatible collinear wall collision runs are merged automatically.

## Stairwell / story continuity fixes

- Story-gap wall strips remain present when an upper automatic floor is disabled. They stay in the original face-specific wall meshes, with matching wall collision.
- Wall-face texture coordinates continue through the strip to the next story instead of resetting at each floor.
- Slabs generate edges only on their union boundary, including stairwell edges; adjacent slab pieces no longer emit opposing internal faces.
- Stair openings no longer extend 6 cm beyond the top landing. Clearance at the sides and lower end is retained.
- Independent upper manual floors participate in lower ceiling/roof exposure calculations.
- Preview seam strips match wall thickness rather than protruding. The preview is still illustrative, with decorative trim and shading that are not part of exported geometry; use the Godot scenes for final inspection.
