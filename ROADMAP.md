# Building Studio task backlog

## Current direction: cleanup

- [x] 1.5.0: game-build feedback: floors/ceilings split by room (`slabsByRoom`, game-layer `nodeMaterials`), roll-up doors, porch steps and raised railings, `new --ops`/`--replace`, Windows/macOS Godot rendering without DISPLAY, double-leaf doors, mansard roofs (`flatTopHeight`), `room.add` and named recipe points, optional game layer (`--game-layer`), preview Godot fallback, narrower independent-surface warning, parapet and terrain recipes.
- [x] 1.4.0: Kestrel starship stress test (wall-type, doorway-shape and light transactions; route starts and profile-aware route check; uniform ceilings; junction miters) and a code audit (scene-text escaping, route check in reports, wall-loop closing, render guard, malformed-light errors, browser suite repaired).
- [x] Halcyon limit test ([findings](authoring/halcyon/FINDINGS.md)): up to 15× faster export and 4.5× faster edits (byte-identical output); open-sky ceilings with roof `none`; a miter limit for sharp corners; `wall.split` and `stair.guard` (web: **Split wall**, **Guard opening above**); clearer outline, near-miss and far-coordinate warnings; flatter duplicate IDs; summarised dry-run values.
- [x] Halcyon follow-ups: opt-in shared door scenes (`--share-door-scenes`, web **Share identical door scenes**), short sections for smooth shaped-wall curves, open-top ceilings no longer z-fight with wall caps, and manual roofs take polygon footprints (flat roofs convex or concave, hip roofs convex) and a hip type.
- [x] Web/CLI parity: transactions for markers, manual floors/ceilings, Floor Footprints, floor insertion/duplication/reordering/removal, group move and door/window mesh settings.
- [x] 1.3.0: fix the AI-authoring findings from the Ravenhold castle exercise: `new`, `building.update`, floor surface/boundary fields, opt-in `--reachability`, `godot-check --render`, `wall.crenellate`, railing transactions, world-point openings, per-ID diffs, coverage-aware boundary warnings. Per-wall thickness and per-region open-to-sky remain open.

- [x] 1.2.5: add evidence-based AI building review and a castle void/keep regression case; distinguish valid data from a complete accessible design.

- [x] 1.2.4: validate local server port configuration and explain occupied-port startup failures.

- [x] 1.2.3: restore rejected placement numbers, enforce supported ranges and integer stair counts, and reject blank CLI preview numbers.

- [x] 1.2.2: honor literal option-like filenames in CLI usage-error output.
- [x] 1.2.2: report Save JSON failures and consolidate cleanup of browser download resources.

- [x] 1.2.1: prevent stale file/example loads from overwriting newer work or status; recover picker state.
- [x] 1.2.1: accept a leading UTF-8 BOM in blueprint/transaction JSON while preserving source bytes for hashing and packaging.

Focus on web/CLI usability, reproducible defects, consistency, maintainability and documentation. Architectural additions below are deferred until explicitly requested. [AGENTS.md](AGENTS.md) and [LLM_GUIDE.md](LLM_GUIDE.md) guide automated use of existing capabilities. Reproduce historical findings against current source: openings/walls already precede filled-area picking, and overlapping stairs already use distance ranking.

## Custom doorway outlines (0.31)

- [x] Shared named outlines, front-view drawing, draggable corners, numeric points and presets.
- [x] Empty passages and matching plain single panels with frame inset guards.
- [x] Standard/shaped wall cutouts, reveals, collision and separate lighting shells.
- [x] Shape-aware moving panel collision and stationary frame collision.
- [x] Web shared edits/cancel/delete/undo, JSON schema 10, CLI shape assignment and example.
- [x] Dialog draft history, independent copies, live frame/panel inset preview and input/pointer refinements (0.32).
- [ ] Shaped double/closet panels and nonrectangular windows.
- [ ] Frames/panels following wall bends and independently shaped frame cross-sections.
- [ ] Live browser layout/focus checks and target Godot 4.7 verification.

## Fitted partitions (0.28)

- [x] Standard walls fit one or two perpendicular continuous shaped hosts.
- [x] Shared union removes buried faces while preserving lighting shells and wall IDs.
- [x] Host height, corner/opening clearance and collapsed-end validation.
- [x] Web drawing/edit/undo, example, rotated/reversed geometry and Godot collision checks.
- [x] Split-host endpoint T joins with matching physical profiles (0.29).
- [x] Angled Standard-to-shaped T joins at 30° or more, with swept clearance (0.30).
- [ ] Shaped-to-shaped branches and multiple branches at one attachment.

## Shaped roof fitting (0.25–0.27)

- [x] Named wall types, profile editor, inward/outward orientation and separate lighting shells.
- [x] Convex room envelopes follow exterior wall profiles through height bends.
- [x] Roof slabs and gable panels share capped clipping with collision.
- [x] Concave outlines, courtyard wall loops, disconnected rooms and fixed polygon void edges.
- [x] Nearby roof/wall diagnostics, collapse/crossing guards and inspectable examples.
- [ ] Continuous concave hip roofs with valleys (distinct from trimming existing roofs).
- [ ] Automatic floor/ceiling transitions for profiles with displaced endpoints.
- [ ] Differing thickness at adjoining shaped wall corners.
- [ ] Interactive browser layout verification and Godot 4.7 verification on the target setup.

## Polygon regions (0.24)

- [x] Polygon click drawing, close/finish, pending-corner undo and cancellation.
- [x] Region from a single closed exterior wall loop.
- [x] Numeric corner editing, midpoint insertion/removal, valid concave shapes.
- [x] Polygon selection, group movement, labels, solid/void coverage and Godot metadata.
- [x] CLI region polygon transactions, example and engine collision regressions.

## Polygon buildings (0.23)

- [x] Closed angled/concave wall outlines drive automatic floor and ceiling geometry/collision.
- [x] Polygon stair/void/manual-surface cuts, higher-story suppression and coverage guides.
- [x] Convex automatic hipped roofs and polygon flat roofs, with adjustable pitch/overhang.
- [x] Supplied round building example, web roof controls and Godot regression rays.
- [ ] Continuous concave hipped roofs with automatic valleys and unified overhang boundaries.
- [ ] Authored polygon manual surface tools; manual floors/ceilings remain rectangles (manual roofs take polygons; concave hip roofs with valleys remain future work).

Checked items shipped through 1.2.0. Unchecked items are future work, not implied capabilities. Keep future passes independently testable and preserve backward compatibility.

## v1 finish line

The broader backlog below is not a prerequisite for v1. The scoped v1 finish line is complete: porch/deck authoring, guarded top-floor CLI creation/removal, all-recipe CLI → web → Godot audit, quickstart documentation and validation-feedback cleanup. Defer additional architectural features, intermediate landings, furniture and expanded tooling. Record unavailable browser/engine/runtime checks honestly rather than treating them as passed.

## Non-negotiable contracts

- [x] Keep the web editor as the visual authoring tool.
- [x] Export building TSCNs with relative door scenes, not a complete game project.
- [x] Preserve separate exterior outside/inside/edge and interior Side A/Side B/edge meshes.
- [x] Preserve per-story organization for light-count control.
- [x] Preserve multi-story/stair seam fixes and authored wall/opening IDs.
- [x] Leave named material slots empty by default.
- [x] Keep the supplied barn, farmhouse and two-story examples.
- [x] Preserve the barn's intentional ground-floor entrance and closed upper gable.
- [x] Keep gameplay profiles optional and furniture outside this tool's scope.

## 1. CLI foundation

- [x] Linux executable entry, package binary mapping, help/version and Node entry point.
- [x] Dependency-free argument parsing with unknown/repeated option rejection.
- [x] Human/JSON/quiet/verbose output and documented exit codes.
- [x] Caller-relative paths and installation-relative built-in resources.
- [x] Non-mutating inputs and non-overwriting destinations.
- [ ] Test Windows and macOS launch/path behavior.
- [ ] Add installed-package smoke tests on Node 20 and current supported Node releases.
- [ ] Add more actionable error codes/paths for programmatic consumers.

## 2. Validation

- [x] Wrap the existing model validator and report all batch input results.
- [x] Validate before and after shared normalization; retain warning severity.
- [x] Reject unsupported future schema versions.
- [x] Support warnings-as-errors without inventing a second strictness policy.
- [ ] Catalog every validation rule with positive/negative fixtures.
- [ ] Add explicit limits for excessively large documents and geometry budgets.
- [ ] Add targeted roof/gable conflict diagnostics beyond existing overlap warnings.
- [ ] Keep authoring intent and geometric guarantees distinct in every report.

## 3. Inspection

- [x] Per-floor elevations, wall/opening/stair/light/platform/region counts.
- [x] Footprint source, area and fallback reasons.
- [x] Manual roof host IDs, types, heights and flush edges.
- [x] Export mesh/collision/material inventory and shell node paths.
- [x] List normalized authoring IDs and fields with inspect --entities.
- [ ] Add inspect filters for floors, openings, roofs and shell details.
- [ ] Add automatic roof-section and clipped-face statistics from shared geometry.
- [ ] Add measured triangle/surface totals and configurable complexity budgets.

## 4. Export

- [x] Shared exporter, default materials, profile/collision/marker options.
- [x] Relative door dependency checks and batch directory isolation.
- [x] Preflight every input and target before exporting.
- [x] Stage new directories and refuse existing destinations.
- [ ] Add explicit output-name override with tested reference updates.
- [ ] Design recoverable replacement/backup mode before exposing force overwrite.
- [ ] Support streamed large batches and cancellation without partial publication.

## 5. Preview

- [x] Optional software 3D PNG using the existing renderer.
- [x] Yaw/pitch/distance and active-floor options.
- [x] Clear missing-dependency and invalid-camera errors.
- [ ] Extract a reusable plan renderer independent of the DOM harness.
- [ ] Add roof-only, shell-only and floor-isolation modes.
- [x] Add roof-only and floor-cutaway CLI views (shell-only remains pending).
- [ ] Add collision, footprint and attachment-envelope overlays.
- [x] Add measured footprint and manual host-envelope/flush-edge overlays (collision overlays remain pending).
- [ ] Add before/after comparisons and multi-example contact sheets.
- [x] Add two-input before/after comparisons with shared framing and scale (contact sheets remain pending).
- [ ] Add dimensions, resolution and transparent-background options.

## 6. Examples

- [x] CLI listing of all 33 editable examples.
- [x] Deterministic regeneration checked in a temporary copy.
- [x] Validation/export through ordinary batch commands.
- [x] Create a shared web/CLI example catalog with purpose and expected warnings/checks.
- [ ] Add explicit CLI example regeneration to a chosen new directory.
- [x] Add example-specific area, roof-attachment and door-scene expectations to catalog output.
- [ ] Add configurable fixture-specific collision expectations beyond existing engine probes.

## 7. Tests

- [x] CLI suites for core, geometry, editor, CLI and infrastructure.
- [x] Report failed scripts and captured output in JSON and terminal modes.
- [x] Subprocess tests for paths, options, I/O, export parity and safety.
- [x] Preserve source/examples during fixture checks, including stale-fixture failure.
- [x] Add a single release command with explicit optional-dependency status.
- [ ] Add timing, machine-readable test identifiers and log retention controls.
- [x] Add controlled timeout/cancellation fixtures for the release runner and its processes.

## 8. Godot checking

- [x] Explicit executable or GODOT_BIN with version preflight.
- [x] Disposable validation project, engine warning/error rejection.
- [x] Bundled scene loading, physics rays and roof mesh/collision parity.
- [x] Report scene/ray/comparison counts.
- [x] Add generic supported-export checking separately from fixture-specific ray probes, with isolated input handling.
- [x] Test missing shapes, material/collision options, roof data/transform mismatches and repeated building instances.
- [ ] Parameterize character clearance, slopes and headroom checks.
- [ ] Add Godot 4.7 execution when a working binary is provided.

## 9. Packaging

- [x] CLI stored ZIP using the shared archive writer, fixed timestamps and SHA-256.
- [x] Optional exact original JSON inclusion.
- [x] Asset-only output and dependency/path verification.
- [ ] Add optional preview/readme inclusion without unnecessary files.
- [ ] Add compression as an optional backend if large packages justify it.
- [ ] Add package manifests and standalone integrity verification.

## 10. Audit/report commands

- [x] Machine-readable validate/inspect results support initial automated audits.
- [ ] Consolidate richer audit categories into a shared report model.
- [ ] Add baseline comparison: authored changes versus derived geometry changes.
- [ ] Report unresolved geometry as unverified, never falsely as zero problems.
- [x] Add saved validation reports with explicit overwrite protection (1.2); broader audit reports remain future work.

## 11. Web integration

- [x] Shared floor/roof review modes and footprint/attachment guides, synchronized floor selection, framing, legends and empty states.
- [x] Extract normalization into a shared module used by web and CLI.
- [x] Keep existing web editing/undo behavior covered by handlers.
- [ ] Surface shared diagnostics in compact web panels.
- [x] Add a web download-check-report action using the shared report format (1.2).
- [ ] Add copy-CLI-command actions.
- [ ] Add an export preflight summary with actionable object references.

## 12. Schema and authoring automation

- [x] Deterministic missing import IDs; no implicit source rewrite.
- [x] Future-version guard and retained legacy normalization.
- [ ] Document a full versioned JSON Schema and migration matrix.
- [ ] Separate authored, derived and compatibility fields explicitly.
- [x] Add opt-in normalized-copy output with a change report.
- [x] Add transactional CLI authoring operations for walls, openings, roofs and regions using existing model/edit functions.
- [x] Preserve identity/references and validate whole transactions before writing new files.
- [x] Add dry-run changes and machine-readable diffs before any edit-in-place mode.
- [x] Bind transactions to optional source fingerprints and verify web-load/export/Godot parity on an authored demo.
- [x] Expand authoring to existing floor dimensions, top-floor membership, stairs and platforms with their structural guards.
- [ ] Extend CLI membership edits to basement/middle insertion, duplication and reordering; add manual-surface authoring.
- [x] Update existing floor labels/elevation/wall height/slab thickness; reset overrides, report derived stair/level effects and preserve web/export parity.
- [x] Update existing stairs with identity/connection preservation, derived review, web handler parity and 16-case edited-export physics checks.
- [x] Explicit stair creation/removal, nullable membership reports, overlap/landing warnings and multi-stair surface restoration checks.
- [x] Existing platform property updates, shared CLI/web rectangle guards, resolved height/slab coverage reports and 10-case Godot checks.
- [x] Platform creation/removal, shared defaults, overlap warnings, independent-piece review and 12-case floor/roof/support restoration checks.

## 13. Roof follow-up

- [x] One-way attachments and full-thickness flush edges.
- [ ] Visualize host envelopes, clipped faces, clipping planes and ridge cuts.
- [ ] Detect ineffective attachments and unresolved roof/gable overlap.
- [x] Measure incremental host cuts; warn about ineffective links, prior removal and complete child removal. Gable overlap detection remains pending.
- [ ] Specify canopy, parallel/perpendicular junction and dormer semantics.
- [ ] Add reciprocal union/valley behavior only with closed-solid and collision tests.
- [ ] Add dormer openings without silently changing unrelated gable fills.

## 14. Footprints

- [x] Orthogonal L/U/courtyard coverage and shell-orientation regressions.
- [x] Explicit crossing/fallback diagnostics and rectangle overrides.
- [ ] Visualize cells, holes, disconnected components and source wall segments.
- [ ] Expand tests for touching/nested/disconnected loops; valid nesting should not itself be a warning.
- [x] Validate closed polygon wall loops, decompose surface cells and offset convex roof eaves.
- [x] Extend automatic slabs and convex Hip/Flat roofs to polygons while preserving rectangle behavior.

## 15. Collision

- [x] Existing door/window/stair/roof/courtyard checks remain in place.
- [ ] Add editor collision overlays and layer/mask summaries.
- [ ] Add full-width/headroom and slope checks with explicit character parameters.
- [ ] Add navigation-clearance diagnostics without adding gameplay systems.
- [ ] Keep profile-specific collision contracts isolated.

## 16. Shells and lighting

- [x] Separate shells and per-story grouping preserved.
- [x] CLI exports report actual shell nodes and material resource counts.
- [ ] Expand automated normal/duplicate-face coverage across all examples.
- [ ] Detect unexpected merges and empty shell resources per wall type.
- [ ] Add configurable per-mesh complexity/light-budget reporting; do not merge shells merely to lower mesh count.

## 17. UI

- [x] Existing selection filters, roof controls and footprint feedback retained.
- [x] Web Shift/box/all selection, whole-wall and mixed-object group translation, exact offsets, joint preservation, cancellation and one-step undo/delete.
- [x] Web basement/middle/top insertion, adjacent floor swaps and active-floor deletion with explicit changed-stair handling.
- [x] Named reference markers with JSON-only notes, Marker3D export, per-floor lists and plan/3D guides.
- [ ] Group junction controls and show host type/height in choices.
- [x] Expose check counts beside Export and focus/scroll to validation results on explicit review or export issues.
- [x] Add scoped diagnostic buttons for implicated objects and floors, with selection/framing and stale-target guards.
- [ ] Extend exact object references to remaining floor-wide profile/footprint diagnostics; continue empty/disabled-state and focus-order improvements.
- [ ] Keep 390px-class layouts usable with compact architecture-focused controls.
- [ ] Continue responsive polish without decorative double-slash separators.

## 18. Browser validation

- [ ] Run Playwright/Chromium when available at 1440, 768 and 390 widths.
- [ ] Exercise loading, selection, attachment edits, undo, deletion, export and keyboard cancellation.
- [ ] Capture pertinent UI screenshots and check overflow/focus behavior.
- [ ] Maintain browser checks separately from Node DOM-adapter tests.

## 19. Documentation

- [x] CLI guide, release validation notes and this tracked backlog.
- [ ] Add schema, roof-junction, footprint, export-profile and Godot-import guides.
- [ ] Add compact example catalog and troubleshooting by diagnostic identifier.
- [ ] Keep actual capabilities and future plans clearly separated.

## 20. Release gates

- [x] CLI-driven JavaScript and engine test entry points.
- [x] Deterministic examples, prior-scene comparisons, ZIP integrity and hash checks.
- [x] Preserve existing material/shell contracts and previous release.
- [x] Consolidate release checks into a reusable non-mutating command.
- [ ] Add cross-platform/runtime matrix and browser gate once dependencies are available.

## v1 completion and next work

The available-environment v1 audit is complete. Every shipped recipe has an explicit input mapping, dry-run/save checks, web reload/export parity and engine resource checks. Invalid numeric settings roll back and validation feedback is easier to reach. Existing examples/scenes remain byte-identical, and the final archive is exercised from a clean extraction.

Before extending architecture, the most useful remaining verification is live browser interaction/layout at desktop/tablet/phone widths and Godot 4.7 on the target setup. Those dependencies are unavailable here, and are not recorded as passed. The broader unchecked backlog is optional future scope; CLI basement/middle insertion and intermediate stair landings were not prerequisites for this v1 release.

## 1.1 follow-up

Web diagnostics now navigate to scoped object IDs or the affected floor, preserving authoring history and geometry. Remaining verification still includes real browser layout/focus and Godot 4.7. No architecture expansion was introduced in this pass.

## v1.2 check reports

Web report download and CLI `validate --out` share a versioned snapshot format with exact diagnostic messages, counts, strict-policy flags and scoped resolved targets. They preserve inputs, geometry, unfinished web drawings and undo history. This is authoring validation only; engine/headroom/playability are explicitly unverified. Live browser verification and target Godot 4.7 remain pending.
