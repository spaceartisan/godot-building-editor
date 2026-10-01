# Check reports — format 1

Use **Godot Export → Download check report** in the web builder, or:

```bash
node cli.mjs validate examples/farmhouse.building.json --out ../farmhouse.checks.json
node cli.mjs validate examples/*.building.json --warnings-as-errors --out ../batch.checks.json --json
```

Reports are diagnostic snapshots, not editable building files. Save the `.building.json` separately when sharing a reproducible problem. Reports contain no full building geometry, marker notes or exported scenes. Building names, diagnostic messages, object labels/IDs and (in CLI reports) absolute input paths can appear.

## Format

| Field | Meaning |
| --- | --- |
| `kind`, `formatVersion` | `building-check-report`, `1`; separate from the building schema version |
| `policy.warningsAsErrors` | Whether warnings make the result unsuccessful; warnings retain their severity |
| `ok` | Every listed document passed the recorded policy |
| `counts` | Document, error and warning totals |
| `results` | One entry per input, preserving input order; the web has one current document |
| `verification` | Authoring-check scope; Godot is `not-run`, collision clearance is `not-verified`, `routeCheck` is `static-check-run` when the route check ran and `not-run` otherwise |
| `results[].routeCheck` | Present only when the route check ran (CLI `--reachability`, web **Include route check**): `ok`, `from` (open ground plus each route start), `starts`, `settings`, per-floor walkable/reached areas, and the counts of unreachable areas and stair issues. A clear report without it does not say anything about routes. |
| `usage` | Reminder to save/share the building separately |

Each result records optional CLI `file` (the input path relative to the saved report's directory, with `/` separators, so reports can be shared without machine paths), building name and schema version (null when unavailable), `validationStage`, `normalized`, policy outcome, error/warning counts and issue arrays. Issues preserve the validator's messages, paths, codes and other existing metadata. `resolvedTargets` adds the currently resolvable navigation targets, including labels. A target uses `type`, optional entity `id`, and `floorId` for floor-owned objects. Floor-wide targets have only `type: "floor"` and `floorId`. Targets are inspection references, not edit operations. IDs are scoped to their owning floor or building-level collection; names are never used to infer identity.

Targets may be empty because the check is global or an ID is missing, duplicated or stale. An empty list does not mean the issue is resolved. Do not treat paths or target IDs in an old report as proof of the current building's state. Re-run checks after edits.

## Web and CLI differences

The web checks the current in-memory building at download time (`current-document`). It does not reimport or normalize it. Downloading works for errors as well as warnings and preserves selection, pending drawing and undo history. A failed download is reported in the status bar.

The CLI first validates raw JSON, then applies shared in-memory defaults/migrations and validates again when possible (`prepared-document`). `normalized` records whether that preparation changed the in-memory representation, not the input file. A raw validation failure uses `raw-document`; JSON parse/read failures use `unreadable-input`. Identical current documents use the same diagnostics and target resolution in both interfaces, but a legacy raw input can legitimately have different preparation diagnostics.

`validate --out` saves the report even when validation fails or some batch files cannot be read. Exit codes remain 0 for success, 1 for validation/JSON/strict-warning failure, 2 for usage errors and 3 for I/O failures. Mixed batches retain the highest applicable failure code. A failed write also uses exit 3. New parent directories are allowed; existing destinations, dangling output symlinks and destinations matching any input (including a missing input through a directory alias) are refused. Usage errors do not save reports.

`--json` stdout remains the existing CLI response with `command`, `results`, `exitCode` and an `output` path after a successful save. The portable file has the format above, not the stdout envelope. Omitting `--out` leaves existing CLI behavior unchanged.

## What a report cannot certify

These are existing authoring checks, not new geometry rules. Neither interface launches Godot, simulates a character, proves headroom or guarantees every roof/wall intersection is resolved. Use the separate engine checks and inspect the exported scene in Godot. Reports do not alter separate lighting shells, material slots, collisions or scene-only export.
