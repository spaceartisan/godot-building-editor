# Building Studio — Building Editor 1.3.0

For LLMs and coding agents, start with [AGENTS.md](AGENTS.md) and [LLM_GUIDE.md](LLM_GUIDE.md): supported capabilities, an executable workflow, geometry conventions, source map and verification limits. Current development is focused on web/CLI cleanup; architectural expansion is deferred.

A lightweight web editor for quickly authoring reusable Godot 4 building scenes: houses, shops, interiors, multi-level structures and other architectural assets. GET PROBED is an optional compatibility profile, not a required game dependency.

The deliverable is a building `.tscn` with its door `.tscn` dependencies. No game project or runtime generator is exported. Separate outward/inward shell meshes, interior wall side meshes, and per-story mesh organization are intentional for material and per-mesh lighting control; updates preserve these boundaries.

Start with [QUICKSTART.md](QUICKSTART.md) for the web workflow, Godot import steps and all 11 CLI recipes. Detailed operation fields live in [TRANSACTIONS.md](TRANSACTIONS.md).

## Since 1.3.0: Kestrel starship stress test

An AI built a two-deck starship interior ([authoring/kestrel](authoring/kestrel/README.md)) using custom wall profiles (flared hull, hexagonal corridors) and custom doorway shapes (hatches, airlocks, blast doors). Its [FINDINGS.md](authoring/kestrel/FINDINGS.md) lists the next steps. The top items are CLI operations for wall types, doorway shapes and lights, a ceiling step under upper-story setbacks, and route checks for sealed interiors. Fixed in this pass:

- **Z-fighting on lower-story ceilings (Godot export).** Buildings with shaped walls or shaped openings no longer emit the story-seam skirt underside, which lay exactly on the lower story's ceiling and flickered in Godot. The Standard wall path never emitted it. Collision is unchanged, and no bundled example scene changed.
- **Readable interior renders.** `godot-check --render` and the web **Render in Godot** share a script that now adds a short-range camera headlamp and a clear render-only material on `Glass` surfaces. Sealed rooms are visible and windows show what they look onto. Scenes are still unmodified.

## Added in 1.3.0: AI authoring fixes from the Ravenhold castle exercise

An AI built a four-level castle through the CLI ([authoring/ravenhold](authoring/ravenhold/README.md)) and recorded where the workflow failed ([FINDINGS.md](authoring/ravenhold/FINDINGS.md)). This release addresses those findings:

- **Starting and settings.** `node cli.mjs new --out NEW.json` writes a deterministic blank building. `building.update` edits name, default dimensions, wall thickness, automatic roof and ceiling. `floor.update` and `floor.add-top` accept `autoFloor`, `autoCeiling` and `boundaryMode`.
- **Route evidence.** `validate`/`inspect --reachability` is an opt-in static check from open ground through doors, empty passages and stairs, with walker clearance. It warns about unreachable floor areas and blocked stair ends.
- **Godot renders.** `godot-check --assets DIR --render --out NEW_DIR` renders the exported scenes in Godot: exteriors, aerial and eye-level region views, or custom `--views`. It needs `DISPLAY` or `xvfb-run`.
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
| Opening placement | `opening.add` with `t` or `at` | Click placement on a wall |

Default validation, example expectations and existing scene exports are unchanged.

Web verification:

- The editor-handler suite (`web-parity-tests.mjs`) checks that web crenels equal the `wall.crenellate` result, that route warnings match `--reachability`, and that the render request carries exactly the web export.
- The engine suite renders through the local server and gets the same views as `godot-check --render`.
- `npm run test:browser-parity` passed in Chromium 141 (Playwright 1.56) at 1440 px and 390 px: route check and overlay, a 47-view Godot render of Ravenhold, and **Add crenels** on a wall selected in the plan.
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

## Run

```bash
npm run dev
```

Open `http://localhost:5173`. To render exports in Godot from the web editor (**Render in Godot**), start the server with a Godot 4 executable: `GODOT_BIN=/path/to/godot node server.mjs`. Rendering also needs a display (`DISPLAY`) or `xvfb-run`.

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

Choose **Default roof type → Hip / polygon** for sloping roofs that follow a convex outline. Equal-pitch slopes meet along hips/ridges; a round outline produces a faceted, cone-like roof. Pitch and overhang remain adjustable. **Flat** also follows polygon outlines. Concave shapes and cutouts are decomposed into separate convex roof sections, not a continuous concave hip/valley solution; overhangs can extend into cutouts, so use zero overhang where an exact opening is needed. Independent manual roofs remain rectangular gable/shed/flat sections. Gable and shed automatic roofs still use rectangular sections, with a warning when a polygon footprint needs Hip or Flat.

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

## Godot export

Choose an **Export profile** in the Godot Export panel. **New** buildings use Generic Godot. The farmhouse preset and old JSON without a profile retain GET PROBED compatibility. Profiles are saved in JSON and changes support undo/redo.

| Convention | Generic Godot | GET PROBED compatibility |
| --- | --- | --- |
| Window collider group | `sight_transparent` | `scare_sight_transparent` |
| Default light group | `building_lights` | `paranormal_lights` |

Explicit custom light groups survive profile changes. Empty window openings export no fixture collision. Neither profile attaches gameplay scripts. Both profiles preserve door hinge paths. Generic doors use layer/mask 1 and omit the game-specific interaction area. GET PROBED retains door layer 4/mask 2 and the stationary interaction area. Collision nodes remain editable in Godot.


**Export .tscn ZIP** downloads a ZIP containing:

- `<building>.tscn` — the building scene.
- `doors/*.tscn` — one separate scene for every generated door.

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

`DoorMesh` is one baked mesh (with Door and Hardware surfaces), while `Frame` stays outside the hinge so the frame does not rotate. The moving leaf collision path is exactly `Hinge/AnimatableBody3D/CollisionShape3D`. In the GET PROBED profile, each non-empty door also includes a stationary root-level `InteractionArea` (`collision_layer = 4`, `collision_mask = 0`) with its own `CollisionShape3D`. This doorway target does not rotate with the hinge, so it remains interactable when gameplay disables the open door leaf collider. Attach your own door script manually to the `Door` root after import.

- Generated door leaf detailing and hardware are present on both sides of every door.

### Double-leaf closet doors
Closet door exports now use two hinge pivots (`Hinge` and `Hinge2`). Each hinge owns one baked half-door mesh and its own `AnimatableBody3D/CollisionShape3D`. Exterior and room doors retain the existing single-hinge hierarchy. No GDScript is attached or bundled with the Godot door scenes.

## Audit hardening pass

- Placed OmniLight3D entries now have visible position/height markers in the editor's 3D preview. These markers are editor-only; exported lights remain bare OmniLight3D nodes.
- Door/window openings are constrained to the host wall horizontally and to wall height vertically. The exporter applies the same constraints defensively even when called with hand-edited data.
- Overlapping openings on the same wall are blocked in the editor, rejected on JSON load, and rejected at export rather than producing order-dependent wall geometry.
- Exterior InsideFaces/OutsideFaces classification now uses even/odd containment against the exterior wall boundary, so concave L/U-shaped closed footprints are classified correctly. Open/incomplete shells retain the previous bounds-based fallback.
- Wall collision remains primitive BoxShape3D geometry and compatible collinear wall collision runs are merged automatically.

## Undo / Redo

The editor keeps a bounded 100-step building-state history. Use the top-bar Undo/Redo buttons, `Ctrl/Cmd+Z`, `Ctrl/Cmd+Y`, or `Ctrl/Cmd+Shift+Z`. Geometry edits, property changes, deletions, preset loads, and JSON loads are undoable. View navigation such as pan/zoom/orbit is intentionally not stored in history.

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



## Per-floor dimensions and edit behavior

Floor elevation, wall height and slab thickness may be overridden in **Floors**. Leave an override blank to inherit the building default or automatic elevation. Automatic elevation = preceding floor elevation + preceding wall height + this floor's slab thickness. Explicit elevations are absolute, including negative elevations, and must increase in floor order. Walls, slabs, ceilings, roof bases, stair rise, UV continuity and collision share these values. Stair flights connect adjacent floors; arbitrary intermediate landings and multi-flight stair layouts remain future work.

Deleting the top floor also removes the flight leading to that deleted floor. Undo restores both. Independent roofs and manual floors/ceilings keep their authored absolute positions. Changes to story dimensions or deletion of floors show an alignment warning when independent surfaces exist; they are never silently deleted or moved.

## Materials and gable fills

Exported named surfaces have **empty material slots by default**, including doors. Assign materials in Godot. **Include placeholder colors** is optional if you want the earlier simple color resources. Browser preview colors remain editor-only.

Both automatic and manual gable fills have matching triangular collision when collision export is enabled. Manual gables now expose separate OutsideFaces, InsideFaces and EdgeFaces below their GableFill group, preserving lighting and material separation. No rectangular collision is added across an entrance.

## Automatic and manual floors / ceilings

Each story generates its structural floor and exposed ceiling automatically by default. In the **Floors** panel, **Generate floor automatically** and **Generate ceiling automatically** can be disabled independently for the active story.

The **Floor Footprint** tool remains a story-level convenience override: it changes the footprint used by the active story's automatic slab and related structural calculations while retaining that story's normal elevation.

For geometry that should not be owned by a story, use **Manual Floor** or **Manual Ceiling**. These are building-level rectangular slabs, like Manual Roof objects. Each stores its own absolute **Top height Y**, thickness, and X/Z footprint and exports under root-level `ManualFloors` / `ManualCeilings` nodes. Multiple rectangles can be combined to form stepped, L-shaped, or otherwise composite surfaces.

When an automatic floor or ceiling is enabled, any manual surface at the same height subtracts its footprint from the automatic surface before export, preventing duplicate coplanar geometry. Turning the automatic surface off allows the story surface to be authored entirely from manual pieces.

Manual slab thickness extends downward from **Top height Y**, matching the convention used by automatic floors and ceilings. Manual floors use the normal floor top/bottom/edge material surfaces; manual ceilings use room/top/edge surfaces and may include collision when collision export is enabled.

## Independent manual roofs

The **Manual Roof** tool is independent of the floor system. Drag a rectangular four-corner footprint in plan view, then set an absolute **Base height Y**. Each manual roof stores its own type (gable, shed/lean-to, or flat), ridge/slope axis, pitch, overhang, and optional gable-end fill.

This allows roof composition that the floor-driven automatic system cannot express cleanly: a first-story wing can have its own roof while a smaller second story has a separate roof, a barn roof can be wider or offset from the wall/floor footprint, and roof sections can exist above or below any numbered floor. Manual roofs export under the root `ManualRoofs` node rather than inside `Floor_XX`.

Automatic roofs remain available as a convenience layer. When a manual roof overlaps an automatic roof region at the same base height, the manual footprint subtracts from the automatic region so the two do not stack directly on top of each other. Set **Automatic Roof → Default roof type → None** when a building should use only manually defined roofs.

Legacy JSON containing per-floor explicit roof sections is migrated on load to independent manual roofs at the corresponding story-top height.

## Floor faces and half walls

Each automatic floor slab exports as one baked `ArrayMesh` / `MeshInstance3D`. The mesh contains three material surfaces named `TopFaces`, `BottomFaces`, and `EdgeFaces`, so Godot materials remain independently assignable without creating three visual nodes. Exposed story regions can generate an automatic ceiling with `RoomFaces`, `RoofSideFaces`, and `EdgeFaces`; regions covered by a higher structural floor continue to use the upper slab underside rather than duplicating a ceiling. Manual floor and ceiling objects use the same hard-surface material separation.

New walls can be created as **Full story** or **Half wall** from the Build panel. A selected non-full-height wall exposes its exact height for editing. Per-wall height is honored by baked visual meshes, opening constraints, and primitive wall collision.

## Window and railing styles
Windows support per-opening styles: Plain, Double-hung, and Four-pane. Railings support per-segment styles: Two rail, Picket, and Cross brace. The active drawing defaults appear in contextual Tool Options and each placed object can be changed later from Selection properties. Styles are saved in building JSON and affect preview/exported geometry.

### Empty opening styles
Windows and doors now include an **Empty opening** style. These objects still cut their configured opening from the host wall and remain editable in the plan, but generate no window frame/glass, no door frame/leaf, and no fixture collision or door PackedScene. This is useful for open doorways, barn bays, pass-throughs, and unglazed wall openings.

## Stairwell / story continuity fixes

- Story-gap wall strips remain present when an upper automatic floor is disabled. They stay in the original face-specific wall meshes, with matching wall collision.
- Wall-face texture coordinates continue through the strip to the next story instead of resetting at each floor.
- Slabs generate edges only on their union boundary, including stairwell edges; adjacent slab pieces no longer emit opposing internal faces.
- Stair openings no longer extend 6 cm beyond the top landing. Clearance at the sides and lower end is retained.
- Independent upper manual floors participate in lower ceiling/roof exposure calculations.
- Preview seam strips match wall thickness rather than protruding. The preview is still illustrative, with decorative trim and shading that are not part of exported geometry; use the Godot scenes for final inspection.

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
- Automatic polygon footprints derive from exterior wall loops, not arbitrary room inference. Independent authored surface/roof footprints remain rectangular.
- Lighting limits depend on the target renderer and scene. This release preserves existing mesh separation; it does not promise unlimited lights or introduce a new lighting allocator.
- This release passed headless validation in Godot 4.5.1. Your Godot 4.7 build and rendered lighting/seam appearance still need visual verification; full browser automation was unavailable in this environment. The included canvas previews are generated by the editor renderer, not Godot screenshots.

## Editor verification

The layout wraps the toolbar and retains both side panels on narrow windows; below 720px the canvas and panels stack with scrolling. Status text wraps, validation errors/warnings remain visible, and numeric inputs reject blank/invalid required values. Optional per-floor override fields accept blank values intentionally.

Optional browser checks: install Playwright and Chromium locally, then run `npm run test:browser`. Set `SCREENSHOT_DIR` for browser captures. The test covers examples, dimensions, rollback, wall-loop closure, region creation/deletion, undo, download and three viewport sizes. It could not launch here because the Chromium executable is unavailable.

`qa/previews/` contains actual editor-canvas renders. Regenerate them with `CANVAS_MODULE=/path/to/@napi-rs/canvas node qa/render-preview.mjs qa/previews`. This optional rendering dependency is not needed to run the editor.

The dependency-free `node editor-tests.mjs` executes the actual editor handlers with a small DOM adapter. It verifies interaction state and forms, not browser layout. `CANVAS_MODULE=/path/to/@napi-rs/canvas PLAN_SCREENSHOT=output.png node editor-tests.mjs` optionally captures the actual plan canvas. `qa/previews/courtyard_plan.png` is such a capture.
