# Historical validation notes

These sections record earlier releases and their then-current counts/capabilities. For v1, use [RELEASE_CHECKS.md](RELEASE_CHECKS.md), [the v1 audit](qa/REVIEW_v100.md) and the archive’s `release-report.json`.

# Building Studio 0.24.0 — polygon regions

- Web polygon drawing, wall-outline copying, numeric corner editing/insertion, name/effect changes, undo/redo, corner undo, invalid finish retention and cancellation are exercised through actual main.js handlers in the DOM/canvas harness. This is not a browser CSS/layout test.
- Model tests verify concave solid/void decomposition, area measurements, true polygon picking, winding independence, invalid/stale-bound rejection, exact group translation, polygon guides, CLI add/update and JSON/TSCN metadata. Label-only regions preserve scene geometry exactly.
- Godot 4.5.1 headless: four additional scenes, 20 collision rays and exact region name/purpose/effect/bounds/corner checks. Label, solid/void, concave and moved regions are included; warnings-as-errors is enabled. Both lighting shells remain required.
- Actual software canvas captures: `qa/previews/polygon_regions_plan.png` and `polygon_regions_floor.png`. Concave region labels fit inside their outlines. Polygon slab previews use one fog depth per mesh to avoid false seams between boolean cells; exported mesh geometry is unaffected by that visual fix.
- Catalog: 26 plans and 55 TSCNs including doors. The prior 25 plans and 53 scenes remain byte-identical. The release runner includes 25 core scripts and eight engine-asset scripts, with exact results in the ZIP's `release-report.json`.
- Scope: single simple polygon per region; separate void regions provide holes. From wall outline requires one closed exterior loop. Regions do not create walls, furniture or point markers. Continuous concave roof valleys, browser layout and Godot 4.7 remain unverified/unimplemented as described in the README.

# Building Studio 0.23.0 — polygon footprints and hipped roofs

- Supplied `round_bounding` layout: 12 exterior edges, 52 m² automatic floor and ceiling coverage. Original wall/door data is preserved; the example selects Hip / polygon.
- Model/mesh tests cover polygon winding and volume, wall order/direction independence, crossing rejection, concave outlines, boolean cutouts, narrow remnants, incoming stair openings, stacked roofs, pitch/overhang ranges and capped roof-to-wall cuts.
- Real web handlers cover roof selection, undo, footprint feedback and export parity. Existing picker/group/floor/marker tests remain release gates.
- Godot 4.5.1 headless polygon validator: six exported scenes and 70 physics rays for floors, ceilings, excluded square corners, courtyard holes, stair openings, roof contact heights/overhangs and canopy clearance. Both exterior and interior lighting shells must exist in every case. Warning-as-error parsing is enabled.
- Actual canvas previews: `qa/previews/round_bounding_hip.png`, `round_bounding_floor.png`, and `round_bounding_plan.png`. Browser CSS/layout and Godot 4.7 remain unverified here.
- Catalog: 25 plans and 53 TSCNs including door dependencies. All 24 v0.22 plans and 51 scenes remain byte-identical. New release gates include 24 core scripts and seven engine-asset scripts.
- Scope: convex hipped roofs are continuous. Concave/cutout coverage uses separate convex roof sections; continuous concave hip valleys remain future work. Polygon flat roofs are supported. Automatic gable/shed and independent manual roof sections remain rectangular and are described as such in the UI/docs.
- Final aggregate gate results are supplied in the ZIP's `release-report.json`; no runtime-generated project is included in the building asset export.

# Building Studio 0.22.0 — floor stacks and named markers

Architectural editor and scene-asset export package. No gameplay project or runtime generator is included. Materials are authored in Godot; furniture and dressing are outside the scope.

## Preserved contracts

- Separate outward/inward shells, interior Side A/Side B meshes and per-story mesh instances preserve lighting control.
- Walls retain their IDs and opening references. Export-time clipping removes faces hidden by other wall solids.
- Floors, ceilings, roofs and doors remain editable Godot scene resources.
- All three supplied plans are bundled with regenerated TSCNs and door dependencies. Their authored JSON and IDs are retained; derived roof geometry is trimmed where it enters a neighboring story interior.
- The barn's first-floor entrance is intentionally open. Only boundary-intent metadata and an explicit footprint rectangle were added to its blueprint.

## Retained structural hardening

1. Crossings and T-junctions use clipped union boundaries, including rotated walls and height differences. Duplicate coplanar faces have one owner. Exposed caps above half-height junctions remain closed.
2. Per-floor wall heights, slab thicknesses and absolute/automatic elevations drive export, preview and stair rise. Old plans retain default spacing. Non-increasing elevations block export; mismatched vertical spacing produces a warning.
3. Deleting a top floor removes its incoming flight; undo restores both. Independent manual surfaces retain absolute positions, with an alignment warning after relevant edits.
4. Intentional exterior openings are explicit metadata. On floors whose coverage comes from wall loops, unmarked open ends, branches and rectangular-footprint fallback produce distinct warnings. On floors with explicit coverage (solid regions or Floor Footprints) branches are expected, and only exterior ends that touch no other wall (centreline or face) warn, naming those walls as targets. The open-ends warning names each exterior wall that ends partway along another (split the host with `wall.split`) and each pair of free ends within 5 cm of each other (move one onto the other). Plans reaching more than 10 km from the origin warn that Godot's 32-bit vertex positions lose precision there.
5. Automatic/manual gables have triangular collision. Manual gables expose separate outside/inside/edge mesh instances. No wall collision crosses the barn entrance.
6. Generic exports use generic door collision layers and omit the game-specific interaction area. GET PROBED retains its original door contract and stock light/window groups. Custom light groups survive profile changes.
7. Named material slots are empty by default. Optional placeholder colors retain the previous simple materials.
8. UI adds floor overrides and an example picker. Narrow screens retain properties/export access. Toolbar/status text wrap; keyboard focus and validation severity are clearer. Required numeric fields reject invalid input.
9. Automatic gable preview uses exported gable geometry. Shed-roof preview rise matches the full exported span. Preview instructions shorten on narrow canvases.

## Retained 0.4 authoring work

- Endpoint / wall / grid magnet priority, zoom-independent radius, Alt bypass, safe wall-loop closure and overlapping-segment rejection.
- Amber open ends, mint endpoint joins, and T/X connection indicators.
- Optional named rectangular regions with label/solid/void effects. Explicit Floor Footprints take precedence over solids; voids cut automatic surfaces only. Per-story scope and manual-surface independence are preserved.
- Region list, area labels with overlap avoidance, property editing, delete/undo, fresh IDs on floor duplication, and Godot Floor-node metadata.
- Grouped tools, Project files menu, collapsed dimension overrides and scene summary, clearer empty-selection state and canvas controls.
- Fixed undeclared selection-checkbox variable, malformed Barn v2 picker option, drawing state leaking across floor changes, missing pointer-cancel cleanup and building undo intercepting text-field undo.
- Fixed empty-footprint fallbacks that could refill a complete region cutout in preview/export. Solid-only layouts without walls now preview/export their automatic surfaces.
- Added courtyard fixture and regenerated all bundled JSON/TSCN/dependencies. All 43 pre-existing TSCN files remain byte-for-byte identical to the delivered 0.3 package.

## This round: floor stacks and named markers

- Added guarded web insertion above/below the active floor, basement insertion with the old ground anchored, adjacent floor swaps, duplicate-above and active-floor deletion. Reorders retain floor IDs/contents/dimensions, rebuild elevations from the lowest base and retain explicit override slots/spacing gaps. Independent roofs and manual slabs remain absolute. Floor edits use isolated candidates and a single undo record.
- Changed stair destinations are identified and blocked unless Remove affected stairs is explicitly enabled. Top-floor deletion keeps the prior incoming-stair removal behavior. Duplicate floors remap wall/opening/marker IDs and omit stairs; marker notes survive duplication.
- Added optional per-floor named markers, validated coordinates, 120-character single-line names and 2,000-character notes. Notes are JSON-only. Authored Marker3D nodes always export independently of generated opening helpers, with stable authored ID/name metadata, unique scene names and floor-relative transforms. JSON import/CLI inspection/export retain marker data without altering marker-free legacy plans.
- Markers have placement/property/list controls, pick filtering, Shift/box/group movement, delete and undo. Purple guides render in plan/building/cutaway views and are suppressed in roof-only review. Marker-only scenes frame distant reference points. Notes never appear in TSCN or editor_description.
- Core regressions cover basement anchors, repeated/middle/top insertion, variable-height swaps, deletion inverses, invalid boundaries, affected stairs, explicit removal, duplication/reference remapping, independent surfaces, marker validation/import, source isolation, naming/notes and real Node-adapted UI handlers. Canvas tests check visible gizmo pixels and framing. Playwright cases were extended but not run: Chromium remains unavailable. No browser/CSS/layout pass is claimed.
- Added the deterministic Basement and markers example, its TSCN, and inspected plan/3D canvas captures at `qa/previews/basement_markers*.png`. The catalog now has 24 plans and 51 TSCNs including door dependencies. All 23 original plans and 50 original scenes remain byte-identical to v0.21.0. Mesh-generation and roof-clipping algorithms are unchanged; separate lighting shells and empty material slots remain intact.
- Eight Godot cases export actual web-edited documents: baseline, lower basement, middle insertion, swap, basement removal, duplication, unequal floor heights, and marker-only data with quoted/Unicode duplicate names. They check 24 marker world positions/names and 34 physics rays for slab contacts and story bands. These sample geometric properties, not whole-character accessibility.
- The final release gate includes 23 core scripts, the 24-plan catalog, preview rendering, bundled scene loading/physics, six engine-asset scripts and source integrity. Runtime checks use Node 24.19.0 and Godot 4.5.1; Godot 4.7 and other runtime/OS combinations remain unverified here. CLI floor creation/removal remains separate backlog work.

## Retained from 0.21: web group selection and movement

- Shift-click toggles objects; box drag selects fully enclosed objects, with Shift to add. Box/all selection follows the pick filter and includes active-floor entities plus independent manual surfaces/roofs. Named overlap choices support Shift-click. Selected objects share a consistent highlight; a dashed outline previews translation.
- Whole-wall and mixed-object movement uses an isolated candidate, committing once on release or exact X/Z offset application. Keep wall joints moves adjacent endpoints and protects existing T contacts. Collapse, overlap, new crossing, invalid coordinates and opening conflicts reject the whole candidate. Selected host walls carry their openings once, retaining IDs/dimensions; an opening alone stays on its host. No height/orientation edits are implied.
- Group delete is one undo step, cascades openings of removed walls and clears removed roof-host references. Drawing/tool/floor changes, Escape, blur, pointer cancellation and lost capture discard pending movement. Individual endpoint editing and overlap cycling retain regression coverage.
- `group-edit-tests.mjs` covers all 11 selectable object types, source/floor isolation, hosted openings, joint/detach rules, movement guards, selection filters, Shift/box/additive selection, exact offsets, preview isolation, pointer ownership, cancellation, delete/undo/redo and normalized export parity through real Node-adapted editor handlers. The core registry now contains 22 scripts.
- `qa/previews/web_group_move.png` is an inspected software canvas image of the actual pending drag, not a full browser screenshot. Playwright coverage was extended for group selection/drag/exported JSON/undo/Escape. Chromium was unavailable and its installation download failed; real browser interaction, CSS layout and narrow viewport behavior remain unverified this round.
- The final release report runs canvas/Godot gates with required dependencies on Node 24.19.0 and Godot 4.5.1. Existing model/exporter/roof/preview geometry remains unchanged. All 23 bundled building JSONs and 50 TSCNs remain byte-identical to v0.20.0, preserving separate lighting shells and empty material slots.
- This user-requested web update takes priority over the CLI backlog. Floor creation/removal and the final v1 audit remain next.

## Retained from 0.20: CLI platform creation and removal

- Added explicit `platform.add` and `platform.remove`, retaining the shared constructor defaults and property guard. Creation requires four bounds, floor ID and caller-owned object ID. Unknown/duplicate IDs, invalid bounds/types and unsupported fields fail without partial publication. Removal affects only the named platform.
- `platformChanges` now represents membership using null on the absent side. Net-zero add/remove transactions produce no platform difference. Geometric/membership edits can include an informational inventory of same-floor railings and building-wide manual surfaces/roofs. This does not infer ownership or certify alignment, and does not itself block strict mode. Existing authored pieces remain intact.
- Shared validation warns about same-height overlapping platforms; ordinary authoring remains available, while strict mode blocks final warnings. Explicit repair/removal is evaluated on the final transaction state. Touching edges and clearly different heights remain permitted without this warning.
- Web drawing now uses the platform guard before adding a new rectangle. Actual draw/delete/undo/redo handlers match CLI authoring; rejected out-of-range drawings do not change the document or add undo history. Node DOM-adapter tests are not browser/CSS/layout verification.
- Unit and eight-call CLI regressions cover constructor defaults, coverage overrides, deterministic IDs/output, duplicate and missing IDs, invalid input, nullable reports, mixed floor effects, independent pieces, overlap warnings/strict repair, normalized reload and exact exported-scene parity.
- Twelve CLI-authored Godot stages check no/one/two platforms, removal of either, overlapping/duplicate coverage, retained manual floors/roofs and final removal. 168 physics probes verify floor contact heights, absence/restoration at story level, roof coverage and support collision. Mesh checks count platform slabs and generated supports. Three scene comparisons verify exact restoration after removal. Twenty-four CLI calls generate fresh files for these engine checks. These are sampled geometry/collision checks, not whole-character accessibility certification.
- Added west-deck creation/removal recipes and an inspected software-rendered comparison at `qa/previews/cli_west_deck.png`. Both independent manual roofs of the original example remain authored objects.
- The included final release report runs all 21 core scripts, both preview-render scripts, bundled Godot fixtures and five engine-assets scripts with canvas/Godot required. Validation uses Node 24.19.0 and Godot 4.5.1; Godot 4.7, other OS/runtime combinations and full browser layout remain unverified here.
- All 23 existing building JSONs and 50 TSCNs remain byte-identical to v0.19.0. Model/exporter/preview geometry and roof clipping are unchanged; separate lighting shells and empty material slots remain intact.
- Next: explicit top-story creation/removal with stair/elevation/reference guards, then the v1 audit.

## Retained from 0.19: CLI porch/deck updates

- Added `platform.update` for existing label, rectangle bounds, height offset, kind and roof coverage. IDs, ordering, metadata and ownership are preserved. Type changes follow the web coverage default; an explicit coverage field wins. Unsupported fields, nonnumeric values, invalid dimensions and out-of-range coordinates/heights are rejected without publication.
- Web property edits and CLI updates use the same non-mutating proposal. Invalid web rectangles no longer disappear during normalization. Rejected input is restored, selection remains intact, and undo goes directly to the preceding valid change. The real editor handlers are exercised through the Node DOM adapter; this is not a browser/CSS/layout check.
- Inspection exposes authored platform fields, dimensions, absolute top/bottom heights and actual automatic-floor slab coverage. Transactions report final platform and floor-coverage differences, including equal-area moves and combined floor effects. Cuts use exporter rectangles plus the exporter's manual-floor override tolerance. Platform contribution is measured after other cuts as a union, not a sum; disabled automatic slabs report zero area. These totals exclude independently generated platform/manual slabs and do not certify character clearance.
- Unit/CLI regressions cover porch/deck and coverage combinations, deterministic output, metadata preservation, rollback, no overwrite, overlapping cuts, manual overrides, independent railings/roofs, upper-level heights, preview slab area/position parity, real web rejection/undo/reload and exact web-to-CLI scene export. Seven CLI calls exercise the supplied east-deck recipe and failure paths.
- Ten CLI-edited Godot cases verify raised/lowered platforms, moved and restored floor cuts, overlap unions, manual overrides, upper-story placement, disabled automatic slabs and automatic roof coverage. 130 physics rays and platform mesh bounds/surface checks pass with zero failures. Twenty CLI calls produce fresh documents and scenes. Expected contacts and bounds use authored fixture dimensions rather than exported geometry. Existing wall/shell/roof regressions run separately.
- Added `examples/transactions/east-deck.edit.json` and a CLI-rendered comparison at `qa/previews/cli_east_deck.png`. The recipe widens the uncovered east platform of `roof_junctions` and changes it to a deck. The software preview is not a Godot or browser capture.
- The final `release-report.json` records 20 core scripts, both preview-render scripts, the fixture suite and four engine-assets scripts with canvas/Godot required. Runtime: Node 24.19.0 / Godot 4.5.1. Godot 4.7, other runtime/OS combinations and browser layout remain unverified here.
- All 23 existing building JSONs and 50 TSCNs remain byte-identical to v0.18.0. Model, exporter, preview geometry and roof clipping remain unchanged. Separate lighting shells and empty material slots are preserved. Shared validation additionally checks platform kind and coverage types.
- Next: explicit platform creation/removal, followed by floor creation/removal and the v1 audit. Independent railings and manual surfaces/roofs retain their own geometry; platform property edits do not reposition them.

## Retained from 0.18: CLI stair creation and removal

- Added `stair.add` with caller-owned identity and required center/width/run/direction, using shared stair-constructor defaults; added `stair.remove` for one selected flight. Creation requires an adjacent upper floor. Removal permits orphan cleanup. No automatic floor creation, ownership transfer or implicit deletion is introduced.
- Membership-aware `stairChanges` uses null on the absent side. Final net-zero edits have no stair review change; floor-rise reports describe only retained flights. Existing source metadata and other object definitions remain intact. Validation, rollback and publication rules are retained.
- Shared web/CLI validation warns about overlapping stair footprints and upper landing sample points entering another stair's nominal opening. These are advisory geometry checks; manual surface overrides and full character clearance require review. Strict mode blocks final warnings, while explicit later repairs can make a transaction valid.
- Lifecycle regression tests cover constructor defaults, missing/duplicate IDs and fields, orphan removal, independent/overlapping flights, mixed floor edits, manual-surface preservation, zero net change, exact regenerated-scene restoration and seven CLI calls. Actual web loading, stair deletion and undo/redo agree with CLI results.
- Eight CLI-authored engine stages cover no stairs, one/two flights, removal of either flight, final removal and partially overlapping openings. 208 physics rays check sampled walking/floor heights, slab undersides acting as lower-room ceilings, hole restoration and interior/exterior story bands. Expected points come from explicit fixture definitions. Removing all flights reproduces the empty-stair scene exactly. This does not certify arbitrary headroom or whole-character traversal.
- Added second-stair creation/removal recipes and an inspected software-rendered comparison at `qa/previews/cli_second_stair.png`. Existing manual floors/ceilings retain their authored geometry; this pass does not cut them automatically or change the exposed-ceiling algorithm.
- The included `release-report.json` records the final required-dependency run: 19 core scripts plus the existing asset/edited-stair suites and the new 16-call lifecycle engine suite. Godot fixture rays (234), edited-stair rays (488) and lifecycle rays (208) remain separately identified. Runtime validation uses Godot 4.5.1; Godot 4.7, other OS/runtime combinations and full browser layout remain unverified.
- All 23 existing building JSONs and 50 TSCNs remain byte-identical to v0.17.0. Model, exporter and roof geometry code are unchanged, preserving separate lighting shells and empty material slots. Shared validation gains the new multiple-stair warnings; the web UI only changes its version badge.
- Next bounded pass: CLI property updates for existing porch/deck platforms.

## Retained from 0.17: CLI stair updates

- Added `stair.update` for existing label, center X/Z, width/run, cardinal ascent direction, ramp/step style, integer step count and boolean underside blocking. IDs, array order, floor ownership and the adjacent upper-floor connection remain fixed. Unknown fields, invalid types, silent numeric coercions and orphan-flight edits are rejected. New stair creation/removal and intermediate landings remain outside this pass.
- Inspection now lists authored stairs and derived connected elevations/rise, slope, step dimensions and footprint/opening bounds. Transaction `stairChanges` reports final before/after reviews, including combined floor edits. Existing `structuralChanges` retains its floor/rise-only semantics. Final shared warnings cover incline, support and wall intersections; ordinary edits can retain warnings, while strict mode prevents saving them.
- New dependency-free checks cover 16 direction/style/blocker combinations, invalid values and selectors, metadata/identity preservation, deterministic reload, final-state warning repair, mixed floor changes and seven CLI calls. Actual web stair controls produce the same result as the recipe; undo/redo, saved-file reload and exact export parity are covered. No browser CSS/layout verification is claimed.
- The optional edited-stair engine suite authors and exports 16 variants through 32 CLI calls. Each uses changed dimensions/placement plus variable floor elevations and an enabled lower ceiling. Godot casts 488 rays for walking heights across stair width, full-width landings, open/blocked underside, old-opening restoration and interior/exterior story bands. Expected world points derive from explicit fixture dimensions, independent of exported stair transforms. This is sampled collision validation, not a full character traversal or headroom certificate.
- `stair-refresh.edit.json` turns the existing north-facing ramp fixture into a wider east-facing open 16-step stair. `qa/previews/cli_stair_refresh.png` is an inspected CLI software-rendered comparison. All original examples remain unchanged; the recipe and test outputs are separate copies.
- The final `release-report.json` records all seven gates with canvas and Godot required, including 18 core scripts, the retained 21 asset-integration calls and the new 32-call stair suite. Original fixture physics remains 50 scenes / 234 rays / 10 roof comparisons; the extra 16 edited cases / 488 rays are reported separately under `engine-assets`.
- All 50 pre-existing TSCNs and 23 building JSONs remain byte-identical to v0.16.0. Model/exporter/roof geometry code is unchanged, preserving separate lighting shells and default empty material slots. The only web UI change is the version badge. Godot verification uses the available 4.5.1 binary; Godot 4.7, other OS/runtime combinations and full browser layout remain unverified here.
- Next bounded pass: explicit stair creation/removal with opening creation/restoration checks and multiple-stair coverage.

## Retained from 0.16: CLI floor updates

- Added `floor.update` for existing floor labels and elevation/wall-height/slab-thickness overrides. Null resets numeric overrides; omitted values are untouched. Floor IDs/order, walls, openings, stairs and custom metadata are retained. Floor creation/deletion is excluded.
- Shared structural validation runs on the final candidate. Non-increasing elevations fail; spacing, stair slope/landing and roof diagnostic warnings remain visible. Shrinking stories never silently resizes openings or caps custom-height walls: explicit repairs can be included in the same transaction. Independent manual surfaces keep their authored absolute heights; effective floor-dimension changes trigger an alignment warning that strict mode respects.
- Inspection exposes authored overrides separately from resolved dimensions. Edit reports include derived effects on all affected floors and connected stair bottom/top/rise, with no mutations to the stored stair definitions. Automatic elevations propagate; explicit elevations stop propagation. Reports describe the candidate even when final validation blocks publication.
- New floor regressions exercise override removal, negative elevation, invalid types/ranges/fields, rejected creation/deletion, atomic repairs, propagation, spacing/slope warnings, preserved independent roofs/floors, metadata, ramp/stepped-stair rise, dry-run/save identity and seven floor-specific CLI calls. Actual web floor handlers produce the same blueprint as the recipe, support undo/redo and reject inverted levels. Saved results load unchanged and export byte-identical building/door scenes through web and CLI paths.
- The new `twostory-levels.edit.json` recipe updates the supplied two-story plan without changing its wall/opening/stair definitions. The stair rise changes from 4.18 to 4.64 m; the new upper floor elevation is 4.14 m above the origin and its wall top is 7.74 m. `qa/previews/cli_floor_levels.png` is an inspected CLI software-rendered before/after cutaway, not a Godot render or browser screenshot.
- Release checks now include 17 core scripts and the engine suite includes the floor recipe's fresh scene/door export and resource/collision-presence check (21 integration CLI calls total). See the included root `release-report.json` for the actual final run, runtime versions and exact source fingerprint. The bundled physics fixtures still provide 234 rays; the new recipe's asset check does not claim walking/headroom coverage.
- All 23 pre-existing building JSONs and 50 TSCNs remain byte-identical to v0.15.0. Model, exporter, roof clipping and shell geometry code are unchanged. Separate lighting shells and empty material slots are preserved. The web UI only changes its version badge. Browser CSS/layout, other OS/runtime combinations and Godot 4.7 remain unverified in this environment; the available engine is Godot 4.5.1.
- Next bounded pass: edits to existing stairs, with connection/identity preservation, slope/landing diagnostics and collision checks.

## Retained from 0.15: consolidated release checks

- Added a non-mutating `release-check` CLI command with seven ordered gates: syntax, infrastructure, catalog, preview rendering, Godot fixtures, exported-asset integration and source integrity. `test-suites.mjs` keeps the CLI and infrastructure runner on the same 16-script core registry.
- Checks run in a disposable source copy. Content and permission fingerprints detect changes to the included files in both the original and the copy. Temporary test outputs remain outside the installation. Source boundaries and exclusions are documented in RELEASE_CHECKS.md.
- Optional canvas and Godot dependencies have explicit auto/required/skip policies. Configured or discovered broken installations fail. Per-gate timeouts, bounded output and Linux process-group termination cover failure and cancellation; reports distinguish passed, failed, timed-out and skipped gates.
- Regression checks cover dependency policies, controlled all-gate success, test failure, copy mutation, malformed reports, syntax errors, timeout, cancellation, UTF-8 chunk boundaries, output overflow, descendant termination, symlink boundaries and eight actual CLI preflight cases. Controlled fixture tools verify orchestration; the production run uses the actual installed canvas backend and Godot 4.5.1.
- The archive's root `release-report.json` records the final production run with both optional dependencies required, exact runtime versions, source fingerprint and detailed results. It sits outside the `building-editor/` source folder to avoid a circular fingerprint. Archive integrity and comparison with v0.14.0 are checked separately before delivery.
- All 50 existing TSCNs and 23 building JSONs remain byte-identical to v0.14.0. Model, exporter, roof clipping and shell geometry are unchanged; separate lighting shells, default empty material slots and supplied plans are preserved. The web UI only changes its version badge.
- Browser interaction/CSS/layout and other OS/runtime combinations remain unverified. Next bounded pass: CLI floor labels and dimensional/elevation overrides using the existing editor structural guards, with ID/stair preservation and web/export parity. Floor creation/deletion and new stair/platform authoring remain separate work.

## Retained from 0.14: attachment diagnostics

- Added host-effectiveness measurement using the shared roof parts and clipping pipeline. Each child slab/ridge is measured after story-interior and child flush cuts, then after adding the host. Host contribution is a sum of part-volume differences, not roof union volume or a material quantity.
- Reports distinguish effective, no additional cut, already removed, fully removed, missing child parts, missing host envelope and unverified states. Numerical tolerance and per-part results are explicit. Invalid or inconsistent measurements are never reported as zero overlap. Gable-fill review remains independent.
- Prepared CLI validation, final transaction checks and the web validation panel share warnings. Ordinary export stays available; strict CLI validation/export/edit respects warnings and prevents publication. A repairing transaction is evaluated on its final state. Low-level raw validation remains structural by default, avoiding stale warnings before normalization.
- CLI inspection reports measured contributions; attachment guide records include the same results. The web preview counts links needing review and lists their details. Single-roof CLI legends include status. No geometry is repaired or moved automatically.
- Added analytic partial/full/no-cut cases, tangency, tolerance, story/flush redundancy, translated coordinates, 36 host/child type-axis combinations, ridge inclusion, invalid/default states and gable-review independence. Nine CLI calls verify warning/strict-mode behavior, repair and source preservation. Actual editor handlers verify validation/guide parity and undo/redo.
- All 23 catalog examples keep their exact warning expectations. The attachment example is effective, removing about 2.7024 m³ from 5.4049 m³ of slab/ridge part volume. A separate transaction exercise deliberately raises the canopy without removing its link; its comparison image is a software review, not a browser or Godot screenshot.
- All 50 existing TSCNs and 23 building JSONs remain byte-identical to v0.13.0. The shared exporter, model, roof clipping and shell geometry remain unchanged, preserving separate lighting shells, empty material slots and the supplied plans.
- Release checks passed fifteen core scripts through CLI infrastructure, source immutability, deterministic regeneration, HTTP checks, both optional preview-render scripts and syntax for 49 JavaScript modules. Godot 4.5.1 passed 50 scenes, 234 physics rays and 10 roof comparisons with zero failures. Engine-assets results below are retained from earlier passes; the unchanged optional suite was not rerun this round. Browser CSS/layout and Godot 4.7 remain unverified in this environment.
- Next bounded pass: one non-mutating CLI release-check command with explicit optional-dependency status, machine-readable results and bounded execution.

## Retained from 0.13: interactive web inspection

- Added Whole building, Active floor cutaway and Roofs and gables modes to the web preview, using the exact shared CLI scene builder and footprint/attachment guides. Export/model/roof clipping code remains unchanged.
- Added synchronized floor selection, a contextual manual-roof selector, Frame view, wrapping controls, legends, visible through-surface scope, and expandable details. Floor and roof deletion, host detachment, loading and undo refresh cached geometry and guide choices. View settings never modify the saved blueprint or enter authoring history.
- Camera moves reuse generated geometry. Framing fits visible objects and guides; changing views uses a suitable pitch and canvas resizing refits at the current angles. Hidden canvases defer rendering and framing until visible. Floor/roof views omit light gizmos; Whole building retains them.
- Dependency-free handler checks cover all 23 examples and 41 floor cutaways, exact shared scenes/guides, both floor selectors, floor/roof deletion and undo, supplied-plan export parity, empty states, rejected programmatic selectors and immutable documents.
- Optional canvas tests execute the actual interactive renderer with event/resize adapters: shared pixel equality, orbit/pan/zoom/cancellation, cached geometry, hidden/show transitions, DPR 2 guide fitting and document preservation. The retained CLI rendering tests cover 18 subprocess calls. Two inspected web-renderer canvas outputs are included under `qa/previews/`; they exclude HTML controls and are not browser screenshots.
- Release gates passed fourteen core scripts through CLI infrastructure, source immutability, deterministic fixture regeneration, HTTP checks, both optional preview-render scripts and syntax for 47 JavaScript modules. Godot 4.5.1 passed 50 scenes, 234 physics rays and 10 roof comparisons with zero failures. The optional engine-assets suite is unchanged and retains prior-pass results rather than being rerun this round.
- All 50 existing TSCNs and 23 building JSONs remain byte-identical to v0.12.0. Separate lighting shells, per-story grouping, empty material slots, supplied examples and scene-only export are preserved.
- Chromium launch was attempted but its executable is missing. Browser CSS/layout, responsive screenshots and Godot 4.7 remain unverified here. The browser script includes the new preview controls at 1440, 768 and 390 widths for later execution. Engine checks use Godot 4.5.1.
- Next bounded pass: diagnostics for ineffective manual roof attachments, keeping independent gable-fill review and slab clipping distinct. No reciprocal roof unions or new authored geometry are introduced here.

## Retained from 0.12: measured overlays

- Added opt-in CLI footprint and manual roof-attachment guides, including before/after comparisons and structured JSON summaries. Guides are drawn through surfaces and clearly labeled; they do not claim collision or walkability validation.
- Footprint boundaries come from the shared structural coverage rectangles with internal cell seams removed. Authored Floor Footprints, solid regions and void regions have separate dashed guides. Source, exact area, fallback reason and automatic-surface flags are reported. Area is measured before stair/platform slab cutouts; independent manual surfaces retain their own geometry.
- Attachment guides use the actual finite host clipping envelope from the shared roof code, the authored child footprint and flush-edge traces at roof-base height. Infinite-plane surrogate boxes are excluded from rendering and camera fitting. Host and child names identify each relationship. Gable fills remain independent; automatic roof-to-wall blockers are outside this overlay's scope.
- Geometry checks cover all 23 examples and 41 floors, analytic courtyard/L boundaries, fallback and footprint precedence, disabled automatic floors, gable/shed/flat hosts on both axes, exact envelope vertices, near-plane clipping, camera bounds and source immutability. Optional rendering checks cover 18 CLI calls plus pixel equality, repeatable PNG output, legends, dimensions and rejected selectors in either comparison input.
- Four inspected overlay images are bundled under `qa/previews/`: courtyard, L outline, selected roof attachment and the porch-entry roof comparison. Overlay images are 1100×932 or 2200×932; existing non-overlay dimensions are unchanged. They are software previews, not Godot or browser screenshots.
- Release checks passed all thirteen core scripts through the CLI infrastructure suite, optional rendering, deterministic regeneration, source immutability, HTTP routes and syntax for 44 JavaScript modules. The Godot fixture checker passed 50 scenes, 234 physics rays and 10 roof comparisons with zero failures on Godot 4.5.1. Full browser layout and Godot 4.7 remain unverified. The table also retains asset-integration results from earlier passes; the unchanged optional engine-assets suite was not rerun this round.
- All 50 existing TSCNs and 23 building JSON files remain byte-identical to v0.11.0. Shared export, model, wall-union, roof clipping and interactive preview geometry remain unchanged, preserving separate lighting shells and intentionally empty material slots.
- The web UI only changes its version badge. The next bounded pass is to expose the shared review modes and overlays in the interactive web preview; collision overlays and broader authoring commands remain separate work.

## Retained from 0.11: preview review

- Added building/floor/roofs CLI views and before/after comparisons with one shared camera. Both sources are prepared/validated before rendering. The selected ordinal floor must exist in both inputs.
- Preview geometry is generated from the complete building before filtering. Selected-story geometry retains its elevations, stair holes and original roof-blocker context. Floor cutaways hide roofs, gables, ceilings, other-story objects and off-level independent surfaces. Manual floors matching the story elevation use the existing slab tolerance. Incoming lower-story stairs are hidden; their upper-floor openings remain.
- Geometry bounds use actual rendered vertices, including offsets, clipped roofs and independent surfaces. Automatic distance fits visible geometry on both sides with 12% margins. Explicit distance remains an override that can crop. Empty views are labeled.
- Added a headless renderer path with no browser-global shims. Static review images have concise labels and omit interactive controls, light gizmos and the finite ground polygon. Interactive web controls and geometry remain unchanged; only the version badge changes in the UI.
- Dependency-free checks cover all 23 examples and 41 floor cutaways, exact filtering, clipping retention, finite framing, manual-floor scope and input preservation. Optional rendering checks pass 11 CLI calls plus direct pixel assertions: identical comparison inputs have identical viewport pixels; repeated PNG output is deterministic on the same backend; invalid input, floor/camera options and existing paths produce no replacement output.
- Four CLI views are included and visually inspected: porch building/floor/roof before-and-after images and the supplied two-story house's isolated upper story. They are software review images, not Godot or browser screenshots. Single outputs are 1100×852 and comparisons 2200×852.
- All 50 existing TSCNs and 23 building JSON files remain byte-identical to v0.10.0. The shared exporter, structural model, wall-union and roof-clipping algorithms remain unchanged. Separate lighting shells and empty material slots are preserved.
- Release checks passed through the CLI: twelve core scripts via infrastructure, optional preview rendering, deterministic regeneration/source immutability, 18 engine integration calls and the Godot fixture checker (50 scenes, 234 rays, 10 roof comparisons, zero failures). Syntax passed for 42 JavaScript modules. Direct comparison with v0.10 confirms full preview geometry is identical on all 23 examples after excluding the new filter metadata. Full browser layout and Godot 4.7 remain unverified here; engine verification uses the available 4.5.1 binary.
- No shell-only views, clipping-envelope/collision overlays, plan renderer, new geometry union algorithm or full character clearance checks are added. See PREVIEWS.md for view semantics and the measured/reporting limits.

## Retained from 0.10: CLI authoring transactions

- Added format-1 wall/opening/manual-roof/region transactions with explicit IDs, shape/type checks, shared connected-endpoint proposals, whole-document validation, optional source SHA-256 guards and no in-place overwrite mode.
- Dry runs report exact authoring changes separately from shared import/default migrations. Saved files have the same result hash as the dry run. `inspect --entities` provides normalized floor/object IDs and authoring fields. Empty transactions support opt-in normalized copies.
- Failed edits produce no blueprint. Missing roof/wall references require explicit detach/rehost/remove operations; no implicit cascade is applied. Oversized/overlapping openings and invalid endpoint moves are rejected. Harmless floating-point normalization is stabilized; actual coercions remain errors. Retained custom metadata, object IDs and roof links are covered by tests.
- Added 16 CLI subprocess checks plus direct transaction assertions, actual web load-handler parity and exact CLI/shared-exporter parity. Infrastructure now runs all eleven core scripts and verifies source immutability and deterministic fixture regeneration. Syntax passes for 39 JavaScript modules.
- The nine-operation porch-entry demo widens the house, adjusts the roof, adds a partition/interior door, exterior porch door, window and label region, and updates the canopy. Its JSON loads unchanged through the web handler adapter. It exports 3 scenes (building and two doors), and Godot checks 37 instantiated mesh nodes, 38 collision shapes and 3 trimmed-roof comparisons with empty materials and zero failures. This asset check runs zero character/clearance rays.
- The optional engine integration suite now passes 18 CLI calls, including the authored demo and deliberately broken exports. The retained fixture checker passes 50 scenes, 234 physics rays and 10 roof comparisons with zero failures on Godot 4.5.1.
- `qa/previews/cli_porch_entry.png` is an inspected CLI software-rendered view of the edited demo. No browser layout or new Godot render is claimed. The web UI only changes its version badge in this pass.
- All 50 prior TSCNs and all 23 building JSON files remain byte-identical to v0.9.0. Shared exporter/model/roof geometry is unchanged; separate lighting shells, per-story grouping, supplied examples and default empty materials are preserved. The demo is a reusable transaction recipe rather than a change to the example catalog.
- Remaining limits: no floor/stair/platform/manual-surface edits, arbitrary JSON patches, in-place replacement or cross-platform validation. Atomic edit publication requires same-filesystem hard-link support. See TRANSACTIONS.md and ROADMAP.md.

## Retained from 0.9: exported assets and catalog

- Added `godot-check --assets DIR` with explicit resource-only scope and zero fixture-specific rays. Existing fixture mode retains the 234 authored physics probes.
- Preflight checks the supported Building Studio scene grammar, relative dependency closure, duplicate/unresolved IDs, cycles, path boundaries, symlinks and size budgets before copying only accepted text into a disposable project. Original project/configuration files and scripts are not loaded.
- Engine checks cover nonempty finite mesh triangles, collision resources/data/dimensions, material policy, and trimmed-roof geometry/collision agreement. Comparisons use world-space vertices and resolve meshes within the owning story/building to handle repeated names.
- Added optional material allowance and an asset-set collision-presence requirement. Neither implies complete collision coverage or character clearance.
- Added `src/examples.js`, shared by the CLI and web picker. All 23 blueprints are grouped and described. `examples --check` enforces exact expected warning messages, door counts, attachment counts and specified footprint areas. The original farmhouse retains one known warning; the supplied plans have none.
- New non-engine regressions cover asset snapshot immutability, malformed references/headers/types, scripts, cycles, paths/symlinks, all 23 supported exports, catalog drift and the grouped web picker through real handlers.
- Optional engine integration uses CLI-generated temporary exports, including missing shape data, mismatched roof collision data/transforms, duplicate building instances, collision opt-out/requirement and placeholder policy. Inputs receive no engine imports or edits.
- Previous material/shell/roof/footprint geometry behavior is preserved. The web change is the shared grouped picker; full browser layout validation is still unavailable.
- Executed via the CLI: all ten core scripts through the infrastructure suite, source/fixture immutability and deterministic regeneration, catalog expectations for 23 examples, 15 optional engine integration calls, a fresh 50-scene batch export and its new asset check, and the original fixture physics checker.
- Fresh exported assets: 50 scenes, 27 relative dependencies, 589 instantiated mesh checks, 979 collision-shape checks, 10 trimmed-roof comparisons, zero material surfaces, zero failures. These resource checks perform zero physics rays; the separate fixture checker passed all 234 rays.
- Syntax passed for 37 JavaScript modules. All 50 existing TSCNs and 23 building JSON files match v0.8.0 byte-for-byte. Engine execution used Godot 4.5.1.

## Retained from 0.8: CLI workflow

- Added validate, inspect, export, package, examples, test, godot-check and optional preview commands. All existing web features remain present.
- Extracted existing normalization into `src/document.js`. Browser and CLI share it; CLI validates original data, normalizes a clone with deterministic missing IDs, and validates the result. Future schema versions are rejected rather than silently downgraded.
- Export/package preflight inputs and filenames, verify relative door references, isolate batch output, and refuse existing destinations. Package timestamps are fixed; optional JSON is the exact source text. No full Godot project is exported.
- `inspect` inventories generated geometry and shell paths without claiming runtime physics verification. Godot checking explicitly covers the bundled fixture set.
- Added 35 CLI subprocess checks: usage/schema/I/O failures, batch aggregation, legacy determinism, web/export parity, warnings, shell/material inventory, destination protection, batch collisions, export options, reproducible ZIP bytes/content, path independence, and optional-dependency failures.
- Infrastructure fixture regeneration now runs in a disposable copy, protecting working examples even when the deterministic comparison fails.
- One old source-location assertion was replaced with a behavioral empty-opening normalization test after the normalization extraction. The regression suite now directly imports the shared normalization module.
- CLI preview output `qa/previews/cli_roof_attachment.png` was rendered and inspected. No UI layout redesign is claimed.
- Core CLI runtime: Node 24.19.0 on Linux. Windows/macOS and Node 20 are not execution-verified here. Full browser layout testing remains unexecuted.
- Executed through the CLI: all nine core scripts, the infrastructure suite, validation of all 23 JSON examples, batch export/package of 50 scene assets, optional PNG preview, and Godot 4.5.1 checking (50 scenes, 234 rays, 10 trimmed mesh comparisons, zero failures).
- Independently checked the batch ZIP's CRCs, all 50 entries against loose exports, and every relative door dependency. The original farmhouse preset retains its one known stair-clearance warning; other bundled examples passed without warnings.
- All 50 pre-existing TSCNs and all 23 building JSON files remain byte-for-byte identical to v0.7.0. Syntax checks passed for 32 JavaScript modules.

## Retained from 0.7: selection, roof attachments and footprints

- Type filters reach areas beneath precise objects without hiding geometry or changing history. Actual handlers cover filtered roof/wall/platform picks beneath a light, roof settings undo, host deletion/detachment undo, and footprint feedback.
- Four optional flush edges cut the full manual roof slab and ridge. One-way manual roof attachments subtract a convex filled host envelope with capped faces. Both axes and gable/shed/flat hosts are tested with dense surface samples, oriented volume, winding, zero net boundary area vector, preview parity and immutable authored data.
- Missing hosts, self references, chains, cycles and invalid edge modes block export. Gable fills remain independent and produce an explicit review warning when attached.
- Existing orthogonal L/U/courtyard footprint support is now covered by area, void, reversed wall ordering, and inward/outward shell-normal checks. Self-crossing exterior outlines no longer qualify as valid automatic footprints. The UI reports source, area and fallback reason.
- Added four JSON/TSCN examples: roof_attachment, l_shaped_outline, u_shaped_outline, courtyard_outline. The new examples and all three supplied plans have zero authoring warnings.
- All 46 existing TSCNs and 19 building JSON files match v0.6.0 byte-for-byte. New controls are opt-in and preserve the existing shell and material contracts.
- Godot probes cover the removed canopy intrusion, retained free canopy and host ridge, flush overhang removal, supported concave wings and unobstructed notches/courtyard.

## Retained from 0.6: overlapping object selection

- All area candidates are reachable, including several roofs of the same type. Repeated clicks cycle at a fixed point; explicit buttons choose the intended object by type/name/height.
- Nearby area outlines take precedence over filled interiors. Active-story surfaces and stable type/ID ordering resolve ties. Precise point/line objects retain priority.
- Opening picking follows the full visible span. Stair picking measures distance to the run centerline, with tolerance in screen pixels.
- Selected areas receive a final solid outline and readable label above the other plan geometry. The choice list resets after edits, floor/tool navigation, pan/zoom/resize, cancellation and direct selection.
- Real editor-handler tests cover cycling, explicit choices, reset behavior, opening spans, stairs, floor navigation and unchanged data/history. The actual plan canvas render is included as `qa/previews/overlapping_selection.png`.
- All 46 existing TSCNs and all 19 building JSON examples match the v0.5.1 package byte-for-byte. Roof, shell, stair and gable export code is unchanged.

## Retained from 0.5.1: roof-to-wall trimming

- Automatic and independent gable, shed and flat roof slabs share geometry between preview and export. Cuts include the rotated roof thickness and have closed boundary faces.
- Interior blockers use structural footprints and finite story heights, including the inter-story band. Free edges and overhang beyond partially shared walls remain intact.
- Trimmed roofs use baked ArrayMesh surfaces and matching static ConcavePolygonShape3D triangle collision. Unaffected slabs retain their original boxes. Authoring JSON is not rewritten.
- Added the Roof wall junctions example, combining gable, shed and flat attachments around a taller host and a partially shared edge.
- Of the 45 scenes in v0.5.0, 42 remain byte-for-byte identical. Only the supplied farmhouse, supplied two-story house and independent roof demo change. All 195 existing exterior/interior wall and gable resources match the prior package exactly.
- The measured section diagram shows the farmhouse's approximately 33 cm intrusion removed from the room. Exterior farmhouse and junction-example canvas renders were inspected.

## Retained from 0.5: wall endpoint editing

- Added selectable A/B endpoint handles, 10-pixel-class hit targets, live valid/blocked plan previews and dimensions.
- Connected endpoints move together by default; intentional detaching is explicit. T-junction contacts are preserved or the edit is rejected.
- Numeric coordinates share drag validation. Collapsed walls, overlaps, newly introduced crossings, opening shrinkage and opening overlaps are rejected.
- Proposals never modify the saved building until release. Completed drags use one undo step; clicks, invalid drops, Escape, pointer cancellation, capture loss and focus loss add no edit.
- Wall/opening IDs, roles, heights and opening sizes are retained. Only opening centers may be clamped to fit.
- Active-floor scope and independent surfaces/regions are preserved. Closed diagonal boundaries now warn when automatic footprints use rectangular bounds.
- Added a two-story editable-junction fixture generated by the edit operation, with passage/jamb/diagonal-wall/junction/story-band collision probes.
- At the 0.5 release, all 44 pre-existing TSCN files were byte-for-byte identical to the delivered 0.4 package.

## Executed validation

| Gate | Result |
| --- | --- |
| Original tests | Pass |
| Structural/profile/import/resource regressions | 19 groups passed |
| Authoring geometry/snapping regressions | 6 groups passed |
| Actual editor handlers with DOM adapter | Pass: loops, regions, undo, floor isolation, cancellation and forms |
| Endpoint model checks | 7 groups passed |
| Endpoint handler integration | Pass: preview isolation, single undo, detach, numeric edits, invalid drop and cancellation |
| Roof geometry regression groups | 5 passed: analytic volume/caps, rotated cuts, supplied houses, all four attachment sides and detached roofs |
| Selection regression groups | 5 passed: geometry ranking, overlapping flights, actual click/choice/reset handlers, precise objects and floor navigation |
| Junction/footprint regression groups | 5 passed: flush edges, host envelope cuts, invalid relationships, concave coverage/shells and actual editor handlers |
| JavaScript syntax | Pass |
| CLI subprocess checks | 35 passed; run via the CLI core runner |
| Asset preflight and catalog regressions | Pass: supported formats, dependency closure, rejected invalid inputs, all catalog expectations and shared picker handlers |
| Exported-asset Godot checks | 50 scenes, 589 mesh instances, 979 collision shapes, 10 roof comparisons, 0 failures; resource checks only |
| Optional engine-assets suite | 18 CLI calls passed, including authored demo, deliberate failure cases and repeated building instances |
| Transaction regressions | 16 CLI calls plus direct transaction assertions; web-load and exact export parity, IDs, metadata, rollback, source guard and rounding stabilization |
| Preview review geometry | 23 examples, 41 floor views; context-preserving filtering and shared framing passed |
| Measured overlay geometry | 23 examples, 41 floors; boundary cancellation, coverage scope, exact host envelopes, flush traces and immutable sources passed |
| Web preview handlers | 23 examples, 41 floors; shared geometry, synchronized floor selection, roof/floor deletion and undo, empty states and unchanged exports passed |
| Interactive preview canvas | Shared pixels, orbit/pan/zoom/cancel, geometry caching, hidden/show resize, DPR 2 fitting and document preservation passed |
| Attachment diagnostics | Analytic volumes/statuses, 36 host/child combinations, nine CLI calls, raw/default behavior, strict-mode repair, web warnings/guides and undo parity passed |
| Preview render checks | 18 CLI calls plus pixel equality/repeatability, overlays, empty views and invalid-input/destination checks passed |
| Authored demo Godot resource checks | 3 scenes, 37 mesh instances, 38 collision shapes, 3 roof comparisons, 0 material surfaces, 0 failures |
| Full CLI batch | 23 inputs validated; 50 assets exported and packaged; independent CRC/content/dependency checks passed |
| Tests preserve source and fixtures | Pass |
| Deterministic regeneration/current fixtures | Pass |
| HTTP routes, MIME, malformed URL and traversal | Pass |
| Godot 4.5.1 scene loading/instantiation | 50 scenes, 0 failures |
| Godot collision checks | 234 rays, 0 failures |
| Godot trimmed roof geometry/collision parity | All 10 trimmed meshes match their collision triangle vertices |
| Godot material-slot checks | Empty slots on all bundled mesh surfaces |
| Editor canvas renders | All 11 editor 3D previews regenerated; roof attachment, L/U and courtyard previews inspected; existing plan and measured roof-wall section previews retained |
| Full browser interaction/layout test | Chromium remains unavailable; browser script now includes the chooser at 1440, 768 and 390 pixels, but has not been executed here |

Collision checks cover all four stair directions, entrances/landings, story bands, both variable-height flights, edited junctions and passage clearances, the courtyard floor/ceiling/roof opening and supported wings, the barn entrance, its upper wall and both gables. Gable probes must hit the roof collision body rather than unrelated geometry. The engine test treats GDScript warnings as errors and rejects logged engine errors.

## Limits

- Engine verification used the available Godot 4.5.1 binary. Re-run with Godot 4.7 and inspect your actual materials/lighting.
- `qa/previews/` contains editor software canvas renders, not Godot renders or browser layout screenshots. Roof solids now match the export; wall trim and shading are illustrative. `roof_wall_section.png` is a measured geometry diagram.
- Automatic roof-to-wall trimming stops at wall tops and uses orthogonal structural coverage. Explicit manual roof attachments also trim against an independent host roof envelope above the wall tops. They do not open the host, create reciprocal valley unions, or change gable fills. Interior half-walls do not define separate roof clipping volumes.
- `browser-tests.mjs` is supplied for local execution with Playwright/Chromium. Responsive HTML/CSS has not received browser visual approval here.
- Stairs connect adjacent floors. Explicit level offsets may intentionally overlap walls or leave vertical gaps; those cases are warned about rather than automatically redesigned.
- Manual surfaces retain independent authorship. Floor edits warn about alignment; there is no inferred ownership or silent relocation.
- Named regions currently use rectangles, not polygons or automatic room ownership. Purpose does not imply geometry; footprint effect must be explicit. Cuts do not propagate between stories or cut manual surfaces/platforms/stairs. Roof overhang may enter a cutout; complex pitched-roof intersections still need manual inspection.
- Automatic footprints remain orthogonal. Closed orthogonal L/U and nested courtyard loops are supported. Use explicit Floor Footprint/manual rectangles for open or diagonal layouts.
- Collision rays verify support, not full character movement, headroom or slope compatibility.
- The original `farmhouse_example` preset retains its existing stair/wall-clearance warning. The supplied `examples/farmhouse` is a different plan. All three supplied plans and the generated stair/variable-height fixtures have zero authoring warnings.

## Local checks

Run `npm run dev`, load an example, try closing a wall loop, drawing/editing a Region, and Floors overrides, and clear an override to restore automatic/default behavior. Export the TSCN and keep its relative door dependencies together.

Use `npm test`, `npm run test:infra`, and `GODOT_BIN=/path/to/godot npm run test:godot`. Optional: `npm run test:browser` after installing Playwright/Chromium.

The engine runner creates a disposable validation project. No `project.godot` is included in this asset package.
