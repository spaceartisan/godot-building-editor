# Building Studio CLI 1.2.5

Version 1.2.3 rejects empty or whitespace-only preview numeric arguments with exit code 2 before loading the optional canvas backend. Explicit `--yaw 0` remains valid.

Version 1.2.2 fixes output-mode detection during argument errors: tokens after `--` are literal input names, including `--json`. For example, `test -- --json` produces a normal usage error on stderr; `test --json -- --json` produces the same exit-2 error as JSON on stdout. A real output option must precede `--`.

Version 1.2.1 accepts one leading UTF-8 BOM when parsing blueprint or transaction JSON. Source hashes and `package --include-json` retain the exact original bytes; saved edited JSON uses the existing normalized output format. Invalid JSON and future-schema rejection are unchanged.

Agent workflow: [LLM_GUIDE.md](LLM_GUIDE.md) explains capability discovery, scoped IDs, dry-run review, safe publication, diagnostics and evidence. It supplements the exact flags below and the operation definitions in [TRANSACTIONS.md](TRANSACTIONS.md).

Version 1.1 adds web diagnostic navigation. Some diagnostic JSON entries now include optional `targets` arrays with `type`, `id` and, for floor-owned entities, `floorId`. These are scoped references for inspection; they are not saved into blueprints or permission to edit. Existing diagnostic paths/messages/severity and CLI commands are unchanged. Checks without precise references may identify only a floor.

Version 1.0 completes the available-environment workflow audit: all 11 recipes, web reload/export parity, and fresh Godot resource checks. Start with [QUICKSTART.md](QUICKSTART.md) for the concise workflow and recipe-to-source index.

Version 0.33 adds `floor.add-top` and guarded `floor.remove-top` transactions, with explicit floor IDs, content/stair removal options and nullable before/after structural reports. See [TRANSACTIONS.md](TRANSACTIONS.md#top-floor-creation-and-removal-033) for executable recipes. Basement/middle insertion and reordering remain web operations.

Version 0.32 refines the web doorway dialog (draft undo/redo, independent copies and live frame preview). That pass left CLI commands and exported scene geometry unchanged.

Version 0.31 supports schema-10 shared doorway outlines in `openingShapes`, referenced by `shapeId` on a door. Validation, previews and TSCN export use the outline for wall cuts and matching single panels. `opening.add/update` accepts an existing shape ID; `shapeId: null` restores a rectangle. Define shapes in the web editor or JSON. Load `custom_doorways` from the catalog. Custom panels export a movable `Panel` node; movement scripts are authored in Godot. See README for frame and wall-profile limits.

Version 0.30 adds oblique Standard-to-shaped joins at 30° or more (the smaller angle between wall lines), on continuous or matching split hosts. The same fitting applies to web-authored and CLI-edited endpoints. Validation expands corner/opening/frame clearance for the angled profile sweep and checks both partition edges for collapse. Load `angled_partitions` from the example catalog. No new transaction fields are needed.

Version 0.29's split-host fitting remains supported. The paired host sections need matching physical offsets, thickness schedules and heights; their type IDs may differ. The `split_host_junctions` example remains available. Authored sections keep their own IDs; no automatic splitting is introduced.

Version 0.28's continuous-host fitting remains supported. JSON wall IDs and opening references remain authored; fitting and union happen in shared preview/export geometry. Validation checks angle, host height, opening/corner clearance and collapsed partitions. The `fitted_partitions` example remains available.

Version 0.27's concave roof and gable clipping remains in place. `inspect` includes `roofs.wallContacts` when wall types exist; trimming does not extend an authored roof footprint. See README for supported junctions and remaining limits.

Version 0.25 preserves and validates optional building-level `wallTypes: [{id,label,stations:[{height,offset,thickness}]}]`. `height` runs from 0 to 1; offset and horizontal thickness are metres. Walls optionally reference `wallTypeId` and `inwardSide` (`auto`, `left`, `right`). The web dialog authors these types; the CLI can validate, preview, export and package the resulting JSON. There are no dedicated wall-type transaction commands in this release. Existing transaction operations preserve these fields. See the README for profile/opening/junction limits.

Version 0.24 added support for `regions[].polygon`, an ordered array of `{x,z}` corners, together with matching `minX/maxX/minZ/maxZ` bounds. Load/validate/inspect/export preserve the shape. `region.add` and `region.update` transactions accept a polygon and derive its bounds; edit polygon vertices instead of rectangular bounds. Existing rectangular regions are unchanged. See [TRANSACTIONS.md](TRANSACTIONS.md).

Version 0.23 reads `roof.type: "hip"` for automatic hipped roofs. Angled closed wall outlines now determine automatic slab geometry and coverage measurements. `inspect` coverage cells retain their rectangular bounds and may additionally contain a `polygon` vertex array; use that array for their actual outline. The supplied round example is available through `examples`. Roof selection is exposed in the web builder; manual roof objects remain gable/shed/flat rectangles.

`platform.add` and `platform.remove` now complete the platform command set. Creation requires an explicit ID, floor ID and four bounds; defaults come from the shared constructor. `platformChanges` uses `before:null` for additions and `after:null` for removals. Its optional `independentReview` is a context inventory, not an attachment or misalignment claim, and does not itself block strict mode. Shared same-height platform-overlap warnings do block strict mode. See [TRANSACTIONS.md](TRANSACTIONS.md) for the west-deck recipes.

`platform.update` edits an existing porch/deck on its owning `floorId`. `inspect --entities` includes authored platforms; `inspection.floors[].platforms` adds dimensions and absolute top/bottom heights. `inspection.floors[].floorCoverage` measures the automatic floor slab after cuts and overrides. Transactions expose final `platformChanges` and `floorCoverageChanges`, including combined floor/stair effects. Platform kind changes reset roof coverage unless the same operation explicitly supplies `covered`. See [TRANSACTIONS.md](TRANSACTIONS.md) for limits and the east-deck recipe.

`stair.add` creates a flight using an explicit ID, owning floor and required center/width/run/direction. `stair.remove` deletes only the selected flight. `stairChanges` uses `before:null` for additions and `after:null` for removals; ordinary updates retain both objects. Net-zero membership edits produce no stair difference. See [TRANSACTIONS.md](TRANSACTIONS.md) for recipes and multiple-stair warnings.

`stair.update` edits existing stair definitions within their owning `floorId`, preserving the adjacent upper-floor connection. `inspect --entities` includes authored `stairs`, and `inspection.floors[].stairs` reports connected levels, slope, step dimensions and footprints. Edit results include `stairChanges` for final before/after reviews, including effects from combined floor edits. See [TRANSACTIONS.md](TRANSACTIONS.md) for accepted fields and limits.

Transactions support `floor.update` for existing labels and elevation/wall-height/slab-thickness overrides. `inspect --entities` includes `overrides` (`null` means automatic/default); `inspection.floors` includes resolved `elevation`, `wallHeight`, `floorThickness` and `wallTop`. Edit reports include `structuralChanges` for derived floor dimensions, connected stair elevations/rises and independent surfaces needing alignment review. See [TRANSACTIONS.md](TRANSACTIONS.md).

`release-check` consolidates syntax, infrastructure, catalog, preview and engine gates in an isolated source copy. Use `--canvas auto|required|skip`, `--engine auto|required|skip`, `--godot PATH`, `--timeout SECONDS`, and optional `--out NEW.json` outside the source tree. `--json` prints the structured report. Skips are explicit; a configured broken dependency fails. See [RELEASE_CHECKS.md](RELEASE_CHECKS.md). `test --suite release` runs runner-specific regressions.

Manual roof attachment diagnostics are shared with the web editor. Prepared validation and final transactions warn about ineffective/redundant links and complete child removal; `--warnings-as-errors` uses the existing strict policy. `inspect` reports measured host contribution under `inspection.roofs.attachments`. See [ROOF_DIAGNOSTICS.md](ROOF_DIAGNOSTICS.md) for statuses, fields and limits.

Linux is the primary tested environment. The implementation uses cross-platform Node APIs, but Windows and macOS have not been exercised here. Node 20+ is the supported baseline; this release was tested with Node 24.19.0. Core commands require no npm dependencies. The web editor remains the visual authoring interface.

## Start

From the extracted editor directory:

```bash
node cli.mjs --help
node cli.mjs examples
node cli.mjs examples --check
node cli.mjs inspect examples/farmhouse.building.json
node cli.mjs validate examples/*.building.json --warnings-as-errors
node cli.mjs export examples/farmhouse.building.json --out ./exports/farmhouse
node cli.mjs package examples/farmhouse.building.json --out ./exports/farmhouse.zip
node cli.mjs test
node cli.mjs test --suite infrastructure
node cli.mjs godot-check --godot /absolute/path/to/godot
node cli.mjs godot-check --assets ./exports/farmhouse --godot /absolute/path/to/godot
```

On Linux, `./cli.mjs` also works. An optional `npm link` exposes the package's `building-studio` binary; it is not required and is not performed automatically. `npm run cli -- validate FILE` is another entry point. `npm test` now invokes the CLI's core test runner.

Input/output paths are relative to your current working directory. Calling `/absolute/path/to/cli.mjs` from elsewhere works; bundled examples and test scripts are resolved from the installation directory. Use quotes for paths with spaces. Globs are expanded by your shell: on shells without wildcard expansion, pass explicit filenames. An unmatched wildcard produces a missing-file diagnostic, not an empty successful batch. Use `--` before filenames beginning with a dash.

## Commands

| Command | Behavior |
| --- | --- |
| `new --out NEW.json [--name TEXT]` | Writes a deterministic blank one-floor building (the web New building, floor ID `floor_1`) to a new file as a transaction starting point. |
| `validate FILE...` | Validates original JSON, applies shared normalization to an in-memory clone, then validates again. Reports errors and warnings without changing input. |
| `inspect FILE...` | Adds per-floor counts/elevations, footprint source/area, manual roof relationships, exported resource counts and separate shell node paths. |
| `validate`/`inspect FILE... --reachability` | Opt-in route check from open ground through doors, empty passages and stairs (0.1 m grid, 0.25 m walker radius). Unreachable floor areas of at least 1 m² and blocked stair ends become warnings, which `--warnings-as-errors` and `validate --out` include; JSON results add a `reachability` object with per-floor walkable/reached areas. |
| `inspect FILE... --entities` | Also lists normalized floor IDs/overrides, walls, openings, stairs, platforms, markers, regions and manual roofs for transaction targeting. |
| `edit FILE --ops JSON --dry-run` | Validates a version-1 transaction; reports separate import/default and authoring diffs without writing. |
| `edit FILE --ops JSON --out FILE` | Writes a validated, normalized building copy to a new file. See [TRANSACTIONS.md](TRANSACTIONS.md). |
| `export FILE... --out DIR` | Writes baked building and relative door TSCNs to a new directory. Every input must pass before output is written. |
| `package FILE... --out ZIP` | Creates a reproducible stored ZIP of those same assets and reports its SHA-256. No full Godot project. |
| `examples [--check]` | Lists the shared 33-example catalog with titles, purpose, expected warnings and absolute paths. `--check` verifies exact warning messages, door counts, attachment counts and specified footprint areas; it does not regenerate files. |
| `test [--suite NAME]` | Runs the selected JavaScript checks from the installation directory and reports each script separately. |
| `godot-check [--godot PATH]` | Runs the bundled Godot scene/physics regressions, using an explicit executable or `GODOT_BIN`. Reports engine version and check counts. |
| `godot-check --assets DIR` | Checks newly exported scene assets in Godot, using an isolated copy. Verifies loading, mesh/collision resources, material policy and trimmed-roof mesh/collision agreement. |
| `godot-check --assets DIR --render --out NEW_DIR [--views FILE]` | After the resource checks pass, renders the root scenes with Godot's Compatibility renderer (needs `DISPLAY`, or `xvfb-run` for a virtual display; `--headless` cannot render). Default views: four exterior diagonals, an aerial view and one eye-level view per labelled region (from the exported floor metadata, up to 64). `--views` takes `{"views":[{"name","eye":[x,y,z],"look":[x,y,z],"fov"}]}`. Writes 1280 × 800 PNGs and `renders.json` (views, engine, renderer) to a new directory. Scenes are unmodified: empty materials render as default grey; only a camera, sky, sun and ambient light are added. |
| `preview FILE --out PNG` | Renders the editor's software 3D view, using optional `@napi-rs/canvas`. Not a Godot screenshot or a browser layout test. |
| `preview FILE --view floor --floor 2 --out PNG` | Isolates a floor cutaway while retaining full-building stair/roof context during geometry generation. |
| `preview FILE --view roofs --compare AFTER.json --out PNG` | Compares roofs in two blueprints with a shared camera. Comparison also supports building and floor views. |
| `preview FILE --overlay footprint --out PNG` | Adds selected-floor structural coverage, authored footprint/region boundaries, measured area and fallback reasons. |
| `preview FILE --overlay attachments --roof ID --out PNG` | Adds exact manual host clipping envelope and authored roof/flush-edge guides for one roof. Omit `--roof` to show all manual roofs with host links or flush edges. |

`inspect` is an inventory, not proof that a building is watertight or walkable. A shell count of zero is legitimate when that wall type is absent. Counts include doors; shell paths identify building and gable meshes. Collision resources are not reported as having passed physics merely because they exist.

Without `--assets`, `godot-check` runs the bundled fixture-specific walking/clearance rays. With `--assets`, it checks resources in a supplied export directory and reports **zero physics rays**. Passing resource checks does not establish headroom, walkability, watertightness or useful collisions throughout a building. Continuous concave hip valleys, dormer openings and authored polygon manual footprints remain future work.

## Options and output

- All commands accept `--json`, `--quiet`, `--verbose` and `--help`. `--json` emits exactly one result object on stdout, including errors and exit code; test process logs are embedded in that object. Quiet cannot be combined with JSON or verbose.
- `validate`, `inspect`, `export`, `package` and `edit` accept `--warnings-as-errors`. Without it, warnings remain visible but do not block export or an otherwise valid edit. Edit evaluates warnings on the completed transaction.
- `export` and `package` accept `--profile generic|get_probed`, `--no-collision`, `--no-markers` and `--placeholders`. Materials remain empty unless placeholders are explicitly requested. Profile overrides do not rewrite the source document.
- `package --include-json` includes the exact original source text, not an implicitly rewritten normalized file.
- `test --suite` accepts `core` (default), `geometry`, `editor`, `cli`, `transactions`, `preview`, `preview-render`, `assets`, `engine-assets`, `release`, or `infrastructure`. Core includes CLI, transactions, preview geometry/framing, preflight, catalog and release-runner regressions. `preview-render` requires the optional canvas backend and exercises actual pixels/PNG output. `engine-assets` additionally requires `GODOT_BIN` and checks both valid and deliberately broken temporary exports, including the authored demo. Infrastructure repeats the core scripts and also checks source immutability, deterministic fixture generation in a temporary copy, HTTP routes, MIME types and traversal rejection.
- `godot-check --assets DIR --allow-materials` accepts embedded placeholder materials; default checking requires empty material slots and overrides. `--require-collision` requires at least one collision shape in the entire asset set, not one in every scene or room. Both options require `--assets`.
- No abbreviated flags, implicit `--force`, `--strict`, downloads, global installs or silent overwrites are supported. Unknown/repeated options fail.

Exit codes: **0** success, **1** validation/test failure, **2** usage error, **3** I/O or missing/unusable dependency. A validation batch examines all files and returns the highest encountered code. Invalid JSON is a validation failure; a nonexistent file is an I/O failure.

`release-check` additionally returns **130** for SIGINT and **143** for SIGTERM cancellation. A successful run can contain optional skips; inspect `complete` and the gate statuses for coverage.

## Output safety and determinism

Destinations must not exist, including ZIPs, PNGs and directories. Choose a new destination for the next build. Exports stage all files before publishing a directory; malformed input and conflicting batch names do not leave a partial exported building. Temporary staging/test directories are cleaned up by their owning operation. No unrelated output directory is recursively deleted.

For several inputs, each receives a subdirectory derived from its **input filename**, so buildings with the same authored name do not mix door dependencies. Case-insensitive filename collisions are rejected before writing. For one input, the building scene and `doors/` sit directly in the output directory/archive.

Existing IDs and references are retained. Missing import IDs receive deterministic, collision-free names. Schema versions newer than 10 are rejected instead of being silently downgraded. Existing legacy/default migration remains the same operation used by the web editor. Read/export commands normalize in memory only; `edit --out` explicitly saves a normalized copy and reports those changes separately. This is not yet a complete JSON Schema/migration framework.

TSCN bytes share the existing exporter. CLI ZIPs use fixed metadata timestamps for repeatability. The default archive contains only scene assets and door dependencies—no `project.godot`, scripts, editor source, or materials. Scene paths and generated door dependencies are checked before writing.

## Optional preview and engine

Install `@napi-rs/canvas` locally if you want PNG previews, or point `CANVAS_MODULE` at an already-installed module. Nothing is downloaded by the CLI.

```bash
node cli.mjs preview examples/roof_attachment.building.json --out ./exports/roof.png --yaw 0.6 --pitch -0.5 --distance 20 --floor 1
GODOT_BIN=/absolute/path/to/godot node cli.mjs godot-check --json
```

Preview modes are `building` (default), `floor` (a cutaway) and `roofs`. `--floor` is a 1-based index: it chooses the isolated story in floor mode and the active-story shading in building mode. Roof mode shows all roofs. `--compare AFTER.json` uses a shared camera/scale for the two inputs, validating the selected floor exists in both. Camera angles are radians; omitted distance fits visible geometry and overlay guides automatically. Single images are 1100×852; comparisons are 2200×852, including labels. An active `--overlay footprint|attachments` adds an 80-pixel legend band (height 932). `--roof` requires the attachments overlay and an existing manual roof ID in both compared inputs. See [PREVIEWS.md](PREVIEWS.md) for exact scope. Plan views, collision overlays and transparent-background options remain on the roadmap.

Godot is version-probed before execution. It must be Godot 4 and must already be installed/provided. The checker creates a disposable project and treats GDScript warnings as errors. Browser checks remain separately available through `npm run test:browser` when Playwright/Chromium are installed.

## Exported-asset checking

`--assets` accepts an unzipped directory containing Building Studio format-3 TSCNs and their relative PackedScene dependencies. It accepts the editor's built-in node/resource types, including empty material slots or embedded StandardMaterial3D placeholders. This is deliberately not a general loader for edited Godot projects, scripts, shaders or external textures.

Preflight rejects missing/cyclic dependencies, external paths that leave the supplied directory, absolute/resource-URL dependencies, symlinks in the checked tree, unsupported types, scripts, object constructors, duplicate IDs and noncanonical/multiline section headers. Budgets are 1,000 scenes, 64 MiB per scene and 256 MiB total. Hidden entries and node_modules are skipped. Ordinary non-scene files, including an existing project.godot, are not copied or loaded.

Only the preflighted scene text and the checker's own runner/configuration enter the temporary project. Original files are unchanged and receive no .godot imports. Preflight is a format restriction, not an operating-system sandbox for untrusted third-party content.

Godot checks nonempty finite mesh triangles, nonnull collision shapes, positive finite box dimensions, convex/triangle collision data, empty material slots/overrides unless permitted, and trimmed roof collision vertices in world space. Roof lookups are scoped to the owning story/building so repeated instances do not compare against the wrong mesh. Aggregate mesh/collision counts include each instantiated scene, including separately checked door dependencies; they are not unique resource counts.

```bash
node cli.mjs export examples/roof_attachment.building.json --out ./exports/attachment
node cli.mjs godot-check --assets ./exports/attachment --require-collision --godot /absolute/path/to/godot --json
GODOT_BIN=/absolute/path/to/godot node cli.mjs test --suite engine-assets
```

## Example expectations

The web picker and CLI share `src/examples.js`. The picker groups all 24 entries into supplied buildings, authoring examples, the legacy example and stair regressions. Descriptions identify coverage and authored intent. The original farmhouse preset intentionally retains its known warning; the separately supplied farmhouse has none.

`examples --check` passes only when actual warning messages match the catalog exactly, including the absence or unexpected disappearance of warnings. It also verifies expected door/attachment counts and declared footprint areas. Catalog tests ensure every bundled blueprint is listed once. These checks validate fixture expectations; they do not replace the engine checks.

## Assistant workflow

Use the CLI first for future audits and rebuilds: inspect inputs (add `--entities` for IDs), dry-run any authoring transaction, save it to a fresh blueprint path, export/package, then run the relevant tests and engine checker. Use the web editor for visual authoring and inspection. The explicit `edit` command owns authoring; `validate` and `export` never rewrite the blueprint.

The shipped `qa/previews/cli_roof_attachment.png` was produced with the CLI preview command.

## Named markers (0.22)

Optional per-floor `markers` contain an `id`, `label`, `position: {x,y,z}` and optional `details`. Y is relative to the owning floor. `inspect --entities` includes the names, coordinates and notes; counts include markers. Export/package always include authored Marker3D references. `--no-markers` suppresses only generated opening helpers; marker notes remain solely in JSON. Web controls author and reorder floors/markers; no new CLI edit operations are introduced in this release.

## Saved validation reports (1.2)

`node cli.mjs validate plan.building.json --out checks.json` saves the portable [check report](CHECK_REPORTS.md). Multiple inputs are supported. `--out` is optional, caller-relative and must be a new path distinct from every input, including missing inputs. Parent directories are created. Existing files, directories and dangling output symlinks are refused. Reports are saved even for invalid JSON, validation errors, missing inputs or strict warning failures; normal exit codes remain 0/1/3. A report write failure uses exit 3. Usage errors do not generate a report.

The saved file uses `kind: "building-check-report"` and `formatVersion: 1`. `--json` stdout retains the existing CLI command-response format plus `output` when saving succeeds; stdout is **not** the same envelope as the portable file. Without `--out`, existing CLI results are unchanged. CLI reports include absolute input paths. Share them accordingly.
