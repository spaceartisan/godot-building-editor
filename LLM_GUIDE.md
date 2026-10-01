# Using Building Studio effectively as an LLM

Applies to executable version **1.4.0**, building schemas through **10**, transaction format **1**, and check-report format **1**. Start with `node cli.mjs --version` and `node cli.mjs --help` in the installed package; use its implementation and current guides over remembered behavior from older releases.

## 1. Establish the task and source

Distinguish editing a user's building from maintaining the editor itself. For a building edit, identify the actual `.building.json`, desired result, dimensions and intentional openings. For tool cleanup, reproduce the behavior in current code and preserve existing capabilities. The current development direction is cleanup of the web tool and CLI; expansion entries in the roadmap are deferred.

Keep the original blueprint. TSCNs are generated assets and cannot be reimported as an editable building. Saved check reports are diagnostic snapshots, not blueprint backups. Supplied screenshots can explain intent but do not supply missing dimensions, IDs or exact geometry.

Use `examples --json` to find a suitable starting plan, its actual path, purpose and expected warnings. Use [QUICKSTART.md](QUICKSTART.md) for the source-to-recipe table: removal recipes require the result of their matching addition. Do not blindly apply an example recipe to another plan with different IDs.

For a new design, start from `node cli.mjs new --out NEW.json --name NAME` (floor ID `floor_1`) or from a copy of the closest existing example. Use `building.update` for building settings. There is no arbitrary-property patch command or TSCN import. If the requested design needs fields outside supported transactions, use the web controls or a carefully scoped JSON edit based on the shared model and validator; preserve unrelated fields and validate the candidate before export.

## 2. Discover capabilities instead of inventing commands

| Need | Supported route | Limits to remember |
| --- | --- | --- |
| Discover plans | `examples --json`, `examples --check --json` | Checks expectations; does not regenerate examples |
| Diagnose a blueprint | `validate FILE --json`; optional `--out NEW.json`; `--reachability` adds route warnings | Reports errors/warnings; normalization is in memory |
| Discover editable IDs | `inspect FILE --entities --json` | Lists normalized floor IDs and supported entity inventories; inspect JSON for fields not included |
| Repeatable building edit | `edit FILE --ops RECIPE --dry-run` then `--out NEW.json` | Version-1 operations only; exact fields in TRANSACTIONS.md |
| Walls/openings/regions/manual roofs | Add, update, remove transactions; wall endpoint moves | Wall property updates do not move endpoints; manual roofs are building-level objects |
| Building settings | `building.update` (name, default dimensions, wall thickness, automatic roof, ceiling, profile) | Window/door mesh settings remain web/JSON fields |
| Floors | Existing dimensions/labels/surface switches/boundary mode, add/remove top floor | Basement/middle insertion, duplication and reordering are web controls |
| Stairs/platforms | Add, update, remove transactions | Stairs connect adjacent floors; independent pieces do not automatically follow platform edits |
| Wall/door shapes | Web dialogs; `wallType.add/update/remove`, `openingShape.add/update/remove`, `wall.add/update` `wallTypeId`/`inwardSide`/`inwardToward`, opening `shapeId` | Doorway shapes are door-only and must reach the floor |
| Parapets and guards | `wall.crenellate` (crenels as empty windows), `railing.add/update/remove` | Wall thickness remains building-wide |
| Lights | `light.add/update/remove` (omni lights, web light tool defaults) | Exported as `OmniLight3D` per floor |
| Markers, manual floors/ceilings, Floor Footprints | Web controls or supported JSON fields | No transaction commands yet (parity gap tracked in the 1.4.0 audit) |
| Inspect appearance | Web 3D preview; CLI `preview` with floor/roof views, comparisons and overlays | Optional canvas dependency for PNGs; no CLI plan/collision-overlay mode |
| Generate Godot assets | `export FILE --out NEW_DIR`, `package FILE --out NEW.zip` | Retain relative door dependencies; materials empty by default |
| Verify exported assets | `godot-check --assets DIR --godot PATH`; add `--render --out NEW_DIR` for Godot screenshots | Resource checks, not character traversal certification; rendering needs a display or xvfb-run |

Transactions support `building.update`, `floor.update/add-top/remove-top`, `wall.add/update/move-endpoint/crenellate/remove`, and `railing`, `light`, `opening`, `roof`, `region`, `stair`, `platform`, `wallType`, `openingShape` add/update/remove. Do not extrapolate new operation names from this pattern. Read the operation table for supported `value` fields and removal flags.

Core CLI and web serving need Node 20+ and no npm install. Linux is the tested platform. `CANVAS_MODULE` can name an installed canvas module; `GODOT_BIN` or `--godot` supplies an existing Godot executable. Browser tests additionally need Playwright and its Chromium binary. Do not infer availability from the module alone.

## 3. A complete, repeatable workflow

For new buildings or substantial layout changes, first read [AUTHORING_REVIEW.md](AUTHORING_REVIEW.md). Reserve circulation before detailing, inspect each occupied level and actual surface coverage, and record failed/unverified requirements. Inspect rendered views before delivery. A successful CLI command or zero default validation warnings cannot establish that a building is complete or accessible; run `validate --reachability` for route evidence and read its remaining limits. The supplied castle case study demonstrates this failure and a focused floor-coverage repair.

Run from the extracted `building-editor` directory. The block uses a newly created output directory and the shipped stair recipe, so its IDs are known to match. Check every exit status and `ok` result before continuing. These commands were exercised when this guide was introduced.

```bash
node cli.mjs --version
node cli.mjs --help
node cli.mjs examples --check --json
node cli.mjs inspect examples/stair_ramp_north.building.json --entities --json
build_run_dir="$(mktemp -d)"
node cli.mjs edit examples/stair_ramp_north.building.json --ops examples/transactions/stair-refresh.edit.json --dry-run --warnings-as-errors --json
node cli.mjs edit examples/stair_ramp_north.building.json --ops examples/transactions/stair-refresh.edit.json --out "$build_run_dir/edited.building.json" --warnings-as-errors --json
node cli.mjs validate "$build_run_dir/edited.building.json" --out "$build_run_dir/checks.json" --warnings-as-errors --json
node cli.mjs inspect "$build_run_dir/edited.building.json" --entities --json
node cli.mjs export "$build_run_dir/edited.building.json" --out "$build_run_dir/assets" --warnings-as-errors --json
node cli.mjs package "$build_run_dir/edited.building.json" --out "$build_run_dir/assets.zip" --include-json --warnings-as-errors --json
```

Optional inspection commands, after dependencies are confirmed:

```bash
node cli.mjs preview examples/stair_ramp_north.building.json --compare "$build_run_dir/edited.building.json" --view floor --floor 1 --out "$build_run_dir/comparison.png" --json
node cli.mjs godot-check --assets "$build_run_dir/assets" --godot /absolute/path/to/godot --require-collision --json
```

Replace the Godot placeholder with an actual executable. Load `edited.building.json` in the web builder to review and continue visually. Share the edited JSON and asset ZIP, plus relevant diagnostics/previews. Preserve the original plan and do not delete a previous export merely to reuse its path.

For a custom transaction:

1. Inspect the exact source and read the needed operation definitions.
2. Use existing scoped IDs, not labels or array indices. Supply explicit new IDs for additions.
3. Write the recipe, dry-run it, and inspect `changes`, `normalizationChanges`, warnings and derived structural reports.
4. For revision-sensitive edits, copy dry-run `sourceSha256` into `expectedSourceSha256`. This protects exact source bytes, including whitespace.
5. Save to a new path and compare its `resultSha256` with the reviewed dry-run hash when source and operations are unchanged.
6. Revalidate, inspect, export and perform the relevant visual/engine checks.

An empty version-1 operations list can save an explicit normalized copy. A failed transaction publishes no candidate. `operations` in a failed report describes attempted steps, not committed edits. Local move constraints must pass at the step where they occur; final reference and geometry validation evaluates the completed transaction. There is no implicit cascade: removing a wall needs explicit handling of its openings, and deleting a roof host needs explicit child detach/remove/rehost operations.

## 4. Read machine output correctly

Use subprocess argument arrays rather than shell interpolation when automating filenames. Quote paths in shell examples. Input/output paths are caller-relative, while bundled catalog/test resources are installation-relative. Place flags before `--` when passing filenames beginning with a dash. Shells expand globs; an unmatched literal glob is a missing input.

Error formatting also respects `--`: a literal filename `--json` after it is never an output option. Supply `--json` before the separator to obtain machine-readable diagnostics, including usage failures.

Blueprint and transaction JSON may start with one UTF-8 BOM. Parsing removes that marker from its text copy only; source hashes and `--include-json` still describe the original bytes. Do not strip the source file before computing `expectedSourceSha256`.

`--json` emits one response object; inspect the process exit code and `ok`. Do not parse human text to recover IDs. Codes are 0 success, 1 validation/test failure, 2 usage, 3 I/O/dependency failure; release cancellation uses 130/143. Fix usage errors by reading help, and dependency errors by checking the configured executable/module rather than retrying identical commands.

Destinations must be new. Unknown/repeated flags are errors. There is no `--force`, `--strict`, `--output`, generic JSON Patch API or automatic dependency download. `--warnings-as-errors` is the supported strict policy; warnings retain their severity. Review intentional warnings instead of changing a design just to obtain a green result. If saving reviewed warnings is appropriate, explicitly use ordinary mode and disclose them.

`validate --out` deliberately saves diagnostics for invalid or missing inputs while retaining failure exit codes. Its saved file uses the portable check-report envelope; stdout retains the CLI command-response envelope. See [CHECK_REPORTS.md](CHECK_REPORTS.md). Targets are scoped navigation references and can be missing/ambiguous; they are not automatic repair instructions.

Authored diffs use JSON Pointer paths but are reports, not executable patches. Added/removed objects in ID'd arrays are per-ID `add`/`remove` entries whose `path` names the array (with `id` and `index`); arrays without unique IDs or with reordered IDs still appear as one `replace`. `null` overrides mean automatic/default only for fields documented that way. `before:null`/`after:null` in derived reports mean addition/removal or unavailable state as documented; never interpret them as zero elevation or zero rise. Manual surfaces listed in alignment review are context, not proof of a collision.

## 5. Geometry conventions and common pitfalls

- Plan coordinates use X/Z in metres; Y is elevation. North is −Z, south +Z, east +X, west −X. Preview camera angles use radians; roof pitch uses degrees. CLI `--floor` is a 1-based display index; transaction `floorId` is an ID.
- Floor overrides and automatic stacking determine stair rise. A stair belongs to its lower floor and connects to the adjacent upper floor. Manual roof `baseY` and manual floor/ceiling heights are absolute; platform `height` is relative to its floor. Recheck independent pieces after level edits.
- Openings reference a host wall within their floor. `t` is a fractional position along wall A→B. Opening fit, overlap and junction clearance still apply. Empty door/window styles are intentional unfilled openings.
- Automatic surfaces can follow closed polygon wall loops and authored coverage. Floor Footprints take precedence over solid regions; label regions add metadata, void regions cut automatic surfaces. Region effects do not rewrite independent roofs/slabs, platforms, stairs or walls.
- All voids are subtracted after solid coverage is combined. A solid keep inside a courtyard void loses its automatic floors too; changing region order or adding a Floor Footprint cannot override the void. Shape the cutout around the keep or use an intentional independent surface, and separately plan courtyard ground and vertical access.
- Open walks, tower tops and roof terraces: with any automatic roof type other than `none`, every floor area not covered by a higher floor gets an automatic roof at its wall top, and an enabled automatic ceiling hangs under the whole story (open only at stair openings and under upper floors with `autoFloor:false`). For open decks use `building.update` with `roof:{type:"none"}`, set `autoCeiling:false` on the floors whose exposed areas must stay open (`floor.update`/`floor.add-top`), and make sure every enclosed room is covered by the next floor's slab or an independent roof (`roof.add` accepts all roof fields). Uncovered deck platforms also avoid roofs but do not receive stair openings. Parapets can be one wall with `wall.crenellate`; thin guards are `railing.add`.
- Automatic elevation includes the new floor's slab: a 4.0 m ground story with 0.18 m slabs puts the next floor at 4.18 m, and its wall top at 4.18 m + wall height. Independent roof `baseY` is absolute, so read resolved values from the dry run's `structuralChanges` or `inspect` before placing roofs on a story.
- Automatic Hip roofs support convex footprints; continuous concave valleys remain unsupported. Independent manual roofs/slabs use rectangular footprints. Do not confuse clipping an existing roof with generating a new valley or dormer.
- Roof `hostRoofId` is a one-way trim relationship. Host chains/cycles are unsupported. The child may receive no additional cut or be removed entirely; read the attachment diagnostics. Gable fills are separate from attachment slab trimming. Use [ROOF_DIAGNOSTICS.md](ROOF_DIAGNOSTICS.md) and attachment overlays.
- Wall-profile stations use normalized height 0–1 (a fraction of each wall's height, so one type fits walls of different heights), metre offsets and metre horizontal thickness. Stations at the building wall thickness follow it when that setting changes. Positive offset means inward; negative means outward. `inwardSide` selects auto/left/right relative to wall A→B; in transactions, prefer `inwardToward: {x, z}` (a point on the inward side). `inspect --entities` reports each shaped wall's resolved inward direction (`profileInward`), and the web editor shows an inward arrow. Shared type edits affect every referencing wall.
- Profile endpoints displaced from the standard slab boundary can need separate surface fitting. Supported Standard-to-shaped branches require clearance and at least a 30° smaller angle. Shaped-to-shaped branches and multiple branches at an attachment are not supported.
- Shared doorway outlines use normalized front-view points, 3–32 noncrossing corners and a flat bottom. Custom single panels/frames need a straight constant-thickness wall segment over their height; empty passages can cross profile bends. Shaped paired doors/windows and bent frames remain unsupported.
- Separate shell meshes and per-story organization are deliberate light-budget controls. Preserve their boundaries, surface names, IDs and collision correspondence. Empty material slots are expected. The generic profile is reusable; preserve an existing GET PROBED profile unless the user requests conversion.

Keep the supplied barn's large ground-level entrance and closed upper gable. The root `farmhouse_example.building.json` intentionally has a stair/wall warning and differs from the supplied `examples/farmhouse.building.json`. Use catalog expectations to identify deliberate fixtures.

## 6. Efficient web use and review

Start the local web builder with `node server.mjs` (add `GODOT_BIN=/path/to/godot` to enable **Render in Godot**, which uses the same renderer and views as `godot-check --render`). An unset `PORT` uses 5173; a supplied value must be decimal digits representing 0–65535. Empty, whitespace, fractional and out-of-range values exit 2. For automation, use `PORT=0` and parse the actual URL from stdout. An occupied port exits 3 with a recovery message; choose a different port instead of retrying the same one. The server binds to loopback only.

Placement numeric controls reject blank, nonfinite and out-of-range entries, restoring the last accepted preference. Stair counts must be integers from 2 through 512. These preferences affect subsequent placements without adding undo entries or rewriting existing objects. Negative absolute slab/roof elevations and relative platform offsets remain valid within their documented bounds. CLI preview numeric options must contain a number; empty strings are usage errors, while an explicit zero yaw is valid.

Use selection filters when objects overlap; Shift/box selection and exact group offsets support moving multiple objects. Floor stack operations and shared wall/door shape editors expose functions beyond current transaction coverage. Shared shape editing affects all references; copy a shape first when only one opening should change.

Every CLI capability has a web equivalent: **Include route check** (reachability warnings plus a red plan overlay of unreachable areas), **Render in Godot**, and the wall panel's **Add crenels** (same layout as `wall.crenellate`). Use **Checks → Show…** to inspect affected objects. This switches to Plan, selects/frames the target or opens floor controls, and cancels pending drawing. The report download does not cancel pending drawing. Save JSON after editing; exported scenes do not preserve an editable web session. Undo covers authored edits, while inspection actions do not add undo entries.

Current selection already tests nearby openings and walls before filled areas. Stair selection already ranks hits by run-centerline distance with stable ID tie-breaking. Old audit recommendations about first-hit stair selection or areas winning over walls must be reproduced before scheduling another fix.

Wait for a JSON/example load to finish before editing that imported building. Starting another load, committing an edit, creating a new/preset building or using Undo/Redo supersedes an outstanding load. Superseded results and errors are ignored; to load them later, choose the file/example again. A failed current load leaves the existing building and history intact.

Save JSON reports a download request or a synchronous failure without changing the blueprint/history. A request is not proof the browser saved a file; confirm the browser download result before claiming delivery. Shared download cleanup releases temporary object URLs even when a DOM download call fails.

## 7. Verification by claim

| Evidence | What it supports | What it does not establish |
| --- | --- | --- |
| `validate` / saved checks | Existing schema/authoring rules and warnings | Full geometric correctness or playability |
| `inspect` | Derived dimensions, coverage, resource counts, shell paths | Watertightness, useful collision everywhere |
| `validate --reachability [--from "x,z[,floorId]"]` | Floor areas and stairs connected to open ground, or to interior start points, through doors, passages and stairs, with walker clearance and shaped-wall profiles | Headroom, stair comfort, door swing, physics traversal |
| CLI software PNG | Shared preview geometry and camera framing (approximation) | Godot lighting or browser layout |
| `godot-check --assets --render` | How the exported scene renders in Godot with default materials and a neutral sun/sky | Game lighting, materials or post-processing; physics |
| DOM editor suites | Actual handler behavior, history, modeled focus intent | Real CSS, responsive sizing, browser focus behavior |
| Playwright browser suite | The executed live interactions and viewport checks | Engine physics |
| `godot-check --assets` | Supported scene loading/resources and configured checks | Character traversal; it reports zero fixture physics rays |
| Bundled Godot/engine suites | Their specific generated scenes and authored probes | Arbitrary building or character clearance |
| `release-check` | Reported gates on an isolated source snapshot | Skipped dependencies or untested target engines/platforms |

For ordinary building authoring, validate and inspect the candidate, then review the export as appropriate. For tool cleanup, run the relevant suite (`editor`, `cli`, `transactions`, `geometry`, etc.) and the established release gate before claiming a release. Do not repeatedly run broad tests for a documentation-only edit: check the documented workflow, links and unchanged runtime bytes instead.

`release-check --canvas required --engine required --godot PATH --out ../NEW.json --json` requires both optional backends. The report path must be outside the installation. Read `complete`, every gate status and dependency version; exit 0 with skipped optional checks is not complete coverage. Avoid writing reports or screenshots into the source snapshot during the run.

The shipped runtime baseline was tested on Linux/Node 24.19.0/Godot 4.5.1 Compatibility. Godot 4.7, other OS/runtime combinations and live Chromium layout were not verified there. Check the current environment before repeating that limitation as fact. State what actually ran and attach relevant genuine captures for visual changes.

## 8. Source map for cleanup work

| Area | Files to inspect |
| --- | --- |
| CLI parsing, publication and output | `cli.mjs`, `asset-check.mjs` |
| Authored model/import defaults | `src/model.js`, `src/document.js` |
| Transactions and shared edit guards | `src/transactions.js`, `src/authoring.js`, `src/wall-edit.js`, `src/floor-stack.js`, `src/group-edit.js` |
| Validation, inspection, reports | `src/validation.js`, `src/diagnostics.js`, `src/diagnostic-targets.js`, `src/check-report.js` |
| Web controls, picking and history | `src/main.js`, `src/selection.js`, `src/history.js`, `index.html`, `src/style.css` |
| Shapes and junctions | `src/wall-types.js`, `src/wall-profile-geometry.js`, `src/profile-junctions.js`, `src/opening-shapes.js` |
| Roofs/footprints | `src/roof-geometry.js`, `src/roof-diagnostics.js`, `src/roof-wall-diagnostics.js`, `src/polygon-areas.js`, `src/regions.js` |
| Scene/preview generation | `src/exporter.js`, `src/preview-web.js`, `src/preview-review.js`, `src/preview-overlays.js` |
| Tests and packaging evidence | `test-suites.mjs`, `release-check.mjs`, `qa/editor-harness.mjs`, `qa/recipe-workflows.mjs`, `browser-tests.mjs` |

Change shared logic at its source and exercise affected web/CLI consumers. Existing user changes must be preserved. The example generator rewrites JSON, scenes and dependencies; use it only when regeneration is intended and review its diff. Generated assets should demonstrate an exporter change, not contain hand repairs that the next export loses.

## 9. Handoff checklist

State the source/revision used, exact requested change, output paths and what was tested. List intentional warnings and unavailable checks. Deliver the editable JSON for building edits and retain relative door files with the main scene. For tool maintenance, provide the updated package and a concise change summary. Report whether examples/scene bytes changed; do not claim a previous release report's fingerprint covers modified documentation or code.

Useful references: [QUICKSTART.md](QUICKSTART.md), [CLI.md](CLI.md), [TRANSACTIONS.md](TRANSACTIONS.md), [PREVIEWS.md](PREVIEWS.md), [CHECK_REPORTS.md](CHECK_REPORTS.md), [ROOF_DIAGNOSTICS.md](ROOF_DIAGNOSTICS.md), [RELEASE_CHECKS.md](RELEASE_CHECKS.md), [ROADMAP.md](ROADMAP.md).
