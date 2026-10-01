# Release checks (1.2.5)

For 1.4.0, `release-check --canvas required --engine required` passed all 7 gates on Linux with Node 22.22.2 and Godot 4.5.1. `npm run test:browser` and `npm run test:browser-parity` also passed in Chromium 141 (Playwright 1.56). That report was not packaged with the source either.

For 1.3.0, `release-check --canvas required --engine required` passed all 7 gates (syntax, infrastructure, catalog, preview-render, godot-fixtures, engine-assets, source-integrity) on Linux with Node 22.22.2 and Godot 4.5.1. That report was not packaged with the source. The rest of this page describes the 1.2.5 package.

The 1.2.5 cleanup package includes a fresh `release-report.json` for its source snapshot. Earlier documentation-only packages used a separately labeled baseline report.

The existing CLI suite now covers literal option-like filenames and usage-error output routing. The existing validation-feedback suite covers Save JSON status/failures and shared object-URL cleanup for JSON, report and Godot ZIP downloads, including DOM exceptions. These are handler tests; live-browser download completion is not claimed. The core registry remains 37 scripts.

`release-check` consolidates the existing checks into one Linux-oriented command. It checks an isolated source copy and reports exactly which gates ran. It does not build/publish a game, change a blueprint or generate a replacement release archive.

## Usage

```bash
node cli.mjs release-check
node cli.mjs release-check --canvas required --engine required --godot /path/to/godot --out ../release-report.json
node cli.mjs release-check --canvas skip --engine skip --json
```

`npm run check:release` is equivalent to the first command. Use `--` to forward npm options. Test and example paths refer to the installed editor directory, while `--godot` paths and `--out` are caller-relative. The report path must be new and outside the installation source tree; symlink ancestors are resolved when checking that boundary. Existing files are never overwritten. The report is optional; `--json` prints the same structured result to stdout. When `--out` is supplied, its saved JSON matches the stdout JSON report, including the output path.

## Gates

| Gate | Execution |
| --- | --- |
| `syntax` | Node syntax checks for every included `.js` and `.mjs` module |
| `infrastructure` | All 37 core scripts, including angled/fitted Standard junctions, concave roof envelopes, wall profiles, polygon geometry and web group/floor/marker handlers, deterministic fixture regeneration, source preservation and HTTP checks |
| `catalog` | All 33 examples against their expected warnings, attachments, doors and configured coverage areas |
| `preview-render` | Both optional CLI and interactive-canvas rendering suites |
| `godot-fixtures` | The bundled scene loader and authored physics/roof checks |
| `engine-assets` | 13 scripts: all-recipe workflow audit (11 recipes / 27 fresh scenes / 524 collision shapes; resource checks, no new physics rays), exported-asset integration; CLI top-floor lifecycle (5 cases / 60 rays, full/partial footprints, separate shells and exact restoration); edited stairs (16 variants / 488 rays); stair creation/removal (8 stages / 208 rays); platform edits (10 cases / 130 rays and mesh bounds); platform creation/removal (12 cases / 168 rays and mesh/support checks); web floor-stack/marker exports (8 cases / 24 marker transforms / 34 rays); polygon surfaces/roofs (6 cases / 70 rays); polygon regions (4 cases / 20 rays plus metadata checks) |
| `source-integrity` | Original and copied source content/permission fingerprints compared to the starting snapshot |

The CLI and infrastructure runner share `test-suites.mjs`; tests are no longer maintained in two independent lists. `test --suite release` runs the release runner's own regression tests. Those tests use small controlled fixture projects to exercise orchestration and do not recursively run a full release check on themselves.

## Optional dependencies

`--canvas` and `--engine` each accept `auto` (default), `required`, or `skip`.

- **Auto:** run the applicable gates when the dependency is available. An absent, unconfigured dependency produces explicit skipped gates. A configured or discovered broken installation produces failure, not a successful skip.
- **Required:** missing or unusable dependencies fail their gates. Both Godot gates share the engine policy.
- **Skip:** explicitly skip the relevant gates, even if environment variables are set. `--godot` with `--engine skip` is rejected as contradictory.

Canvas uses `CANVAS_MODULE`, or resolves `@napi-rs/canvas` from the installation. A bounded probe creates and encodes a tiny PNG before the rendering gate. Dependencies stay at their installed locations and are not copied or downloaded. Godot uses `--godot` or `GODOT_BIN`; its version probe must report Godot 4. The exact engine version appears in the report. An unconfigured engine is not searched for on PATH automatically; setting `GODOT_BIN=godot` is supported if it is already on PATH.

## Isolation, limits and cancellation

The runner copies included source files into a disposable directory before running gates. Temporary exports, fixture projects and test files use a separate temporary directory. Optional screenshot-output variables and asset-check override variables are cleared for the gate processes, so a fixture check cannot accidentally become a custom asset check. `CANVAS_MODULE` is provided only to the rendering gate; core DOM tests stay dependency-free.

The snapshot includes non-hidden regular files, excludes hidden entries and `node_modules`, and records content SHA-256 and permission bits. Included symlinks and special files are rejected. Source is limited to 10,000 files and 128 MiB. Fingerprints cover this documented set; they are not a filesystem security boundary. The runner executes the trusted project's test code and does not sandbox arbitrary hostile code or external dependencies.

`--timeout SECONDS` sets a per-gate limit from 1 through 600 seconds (default 180). Probes have a maximum of 10 seconds; each syntax subprocess also has a 10-second ceiling. Existing tests may have tighter internal limits. There is no single overall wall-clock deadline: gates run sequentially and ordinary failures do not prevent later independent checks.

On Linux/POSIX, each gate owns a process group. Timeout, output overflow or cancellation terminates that group, including nested test tools that remain in it. Captured stdout/stderr share a 1 MiB per-process budget. Ctrl+C returns a cancelled report and exit 130; SIGTERM returns exit 143. Remaining gates are skipped with a cancellation reason, and the temporary workspace is removed. On Windows, only direct-child termination is implemented; Windows/macOS execution remains unverified.

The profile-roof suite checks 18 scenes and 51 physics rays for corrected gap/intrusion cases, removed internal and retained external gables, explicit roof hosts, upper stories, round footprints, U/L recesses, courtyard walls, separate rooms and rectangular/diamond voids. The CPU suite independently checks 123,552 points in slices of 24 shape/profile/rotation combinations, plus exact canopy limits, shifted story elevations and crossing-boundary guidance. These targeted cases supplement the previous suites; they do not prove every possible profile/footprint combination.

The wall-profile engine suite checks 26 scenes and 591 physics rays for recessed surfaces, corners, mixed Standard/profile walls, windows, empty openings, inward flips and the inter-story wall band, plus fitted partitions. Fitting cases cover continuous and split hosts, both ends, 30/45/60/90-degree joins, eight profile heights, rotations, reversed wall directions, shorter partitions, shaped interior hosts, varying host thickness and retained open passages. It verifies the separate lighting-shell nodes. The right-angle junction CPU suite adds 384 mesh rays and split/unsplit surface-area comparisons per shell. The angled suite adds 492 rays, winding/finite checks, swept-clearance guards, frame-height coverage and full-width collapse rejection. Both exercise web drawing/undo through the DOM adapter; this is not browser layout validation.

## Reports and exit codes

Reports have `formatVersion: 1`, tool/runtime version, platform, source fingerprint, dependency results, ordered gates, elapsed timings and aggregate counts. Gate statuses are `passed`, `failed`, `timed-out`, or `skipped`. Failed child processes retain exit status, signal, reason and bounded output; malformed success JSON is rejected. Structured CLI child results are retained in `details`, including Godot measurements.

Overall status is `passed`, `passed-with-skips`, `failed`, or `cancelled`. `ok` means no gate failed and the run was not cancelled. `complete` additionally requires no skipped gates. Neither means every possible project risk has been checked: the report always lists browser interaction/layout, other OS/runtime combinations, prior-release comparison and final ZIP integrity under `notChecked`.

| Exit | Meaning |
| --- | --- |
| 0 | Selected gates passed; check `complete`/skips for optional coverage |
| 1 | Test, syntax, integrity, output-budget or timeout failure |
| 2 | Invalid options or a report destination inside the source tree |
| 3 | Dependency failure without another test failure, or report I/O failure |
| 130 / 143 | Cancelled by SIGINT / SIGTERM |

Ordinary test failures can still produce a saved report. Usage, output preflight or setup failures may return the CLI error envelope before gate execution instead. Setup/source-limit errors currently use exit 1 unless the underlying filesystem operation supplies an I/O error code.

## This release

The v1.2.5 archive includes `release-report.json` beside the `building-editor/` folder. It reports the actual final source check with canvas and Godot required. The report itself is outside the source fingerprint, so it does not create a circular checksum. Final archive integrity and comparison with the previous release are checked separately before delivery. Stair and platform physics results appear in the `engine-assets` script output, separately from the original `godot-fixtures` measurements. Group-move coverage uses real editor handlers through the Node DOM adapter; browser interaction/layout is not part of this gate.

Regression cases cover skipped/required/broken dependencies, controlled all-gate success, child failure, copy mutation with original preservation, bad JSON, invalid syntax, timeout, cancellation, UTF-8/output limits, POSIX descendant termination, report boundary/symlink checks and eight actual CLI preflight cases. The full production command is also executed for this release.

Doorway outline coverage includes 4,874 CPU wall/panel probes, clipped/arched/concave outlines, shaped walls, reversed and rotated walls, and shared web dialog draw/edit/cancel/delete/undo handlers. The separate doorway Godot suite checks 14 scenes and 1,262 physics rays, including retained corner collision, clear passages, stationary frames and moved panel collision. These counts are separate from the established wall-profile and roof suites. Browser CSS/layout and Godot 4.7 remain outside this Linux/Godot 4.5.1 gate.

The v0.32 dialog regressions additionally exercise isolated draft undo/redo, numeric-input identity, text undo routing, pointer cancellation/lost capture, outside-bounds selection, unfinished drawing state, preview-size feedback and copying one shared opening type without changing other users. Geometry and engine suites remain regression gates; that pass added no export geometry or new example plan.

The v0.33 floor lifecycle suite covers deterministic new-floor IDs/defaults, full-transaction validation, explicit content/incoming-stair removal guards, last-floor protection, independent-height review, web reload/export parity and nullable structural/coverage reports. Its 11 CLI calls include dry runs, saves, text reports and no-output failures. The separate Godot lifecycle suite adds 10 CLI calls and 5 exported cases / 60 physics rays: full and partial top footprints, roof/ceiling exposure, stair holes, unchanged lower seams and new upper wall bands. Addition followed by removal restores the original scene bytes. Existing 33 plans and 64 scenes are compared with v0.32 during final packaging.

The v1 workflow audit adds all 11 shipped recipes as one explicit source/dependency matrix. It executes 24 CLI calls in the core suite for dry-run/save policy, intentional-warning rejection, source preservation, web reload and exact export/restoration parity. Its separate engine suite executes 13 CLI calls and loads 27 scenes / 524 collision shapes, with empty materials; these are resource checks rather than additional physics rays. Validation-feedback handler checks cover numeric rollback/history, current check counts, focus/scroll intent, permitted warning exports, hard-error blocking and download-failure feedback. Browser tests include the new controls but remain unexecuted because Chromium is missing. Final clean-archive recipe execution and prior-release byte comparison are separate packaging checks.

The v1.1 diagnostic navigation suite checks scoped IDs (including identical IDs/names on different floors), strict path fallback, ambiguous/missing targets, active-floor changes, root-level surfaces, roof/host selection, Plan mode/filter reset, distant-object framing, focus/scroll intent, cancellation of unfinished drawing and unchanged blueprint/history/export bytes. Buttons never derive identity from message text. Exact paths and existing message severity are unchanged; optional target metadata is additive. Optional browser cases include diagnostic-action layouts at three widths; these remain unexecuted without Chromium. The plan capture shows the actual selected stair in a known warning fixture, not HTML layout.

The 1.2 check-report suite exercises shared web/CLI issue parity, scoped references, strict policy without severity changes, invalid JSON and mixed failing batches, report output protections (including dangling symlinks and aliased missing inputs), web download failures, fresh snapshots and unchanged geometry/history/pending drawing. These are actual handler checks in the DOM adapter, not live-browser layout checks.
