# v1.1 — actionable building diagnostics

The web builder's existing validation list now connects users to affected objects and floors. This pass changes diagnostic metadata and editor inspection behavior, not exported geometry.

- Structured target references identify stair warnings, overlapping walls/stairs/platforms/manual surfaces, opening-layout conflicts, shaped-door errors, explicit roof hosts and shaped-wall/roof contact diagnostics. Precise collection paths resolve individual objects. Remaining floor-wide checks open their owning floor; global checks without safe references remain text.
- References use floor IDs and object IDs rather than names parsed from messages. Buttons resolve identity again when clicked. Missing or duplicate IDs cannot select another entity. An explicit missing reference does not fall back to an unrelated positional target.
- Navigation cancels pending drawing, selects Plan/Select mode, clears the picking filter, activates the owning floor and frames/highlights the object. Properties receive focus. Independent surfaces preserve the active floor; floor-wide targets open floor controls. Authoring JSON, export bytes and undo history do not change.
- Existing diagnostic paths/messages and severity remain unchanged. Optional `targets` metadata is additive in shared CLI/web validation results; it is not authored JSON and does not change transaction semantics.

The new focused suite covers duplicate names and IDs across different floors, ambiguous references within a scope, strict path resolution, root surfaces far outside the building, roof/host buttons, unfinished wall cancellation, focus/scroll intent, stale buttons, ordinary undo after navigation and exact export preservation. The real handler tests run through the DOM adapter. Existing engine suites remain regression gates, with no new collision claim.

[Selected stair](previews/diagnostic_stair_selection.png) is an actual plan-canvas capture after following the original farmhouse preset's stair/wall-clearance warning. The highlighted flight crosses walls in this known warning fixture; this release does not silently repair that authored plan. Surrounding HTML controls are not pictured. Chromium is unavailable, so live browser layout/focus remains unverified. Godot execution uses 4.5.1 Compatibility; the user's 4.7 target remains unverified here.

The release gate now contains 35 core scripts and 13 engine-asset scripts. Packaging compares all 33 previous plans and 64 scene assets with v1.0, checks archive integrity and executes the new navigation checks from a clean extraction. Separate lighting shells, per-story meshes, intentionally empty material slots and asset-only export remain preserved.
