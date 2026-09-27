# Findings from authoring Ravenhold with the CLI workflow

These were found while building the first version of [Ravenhold](README.md) strictly through the documented workflow on version 1.2.5. They are ordered by how much they limit AI authoring. Each finding ends with its **status**. The current Ravenhold is rebuilt with the fixes, from `node cli.mjs new` and four transactions, with no JSON edits. Descriptions of the problems refer to that first version (362 walls, five recipes, two scoped JSON edits); its scripts are in the git history.

## High impact

### F1. No check establishes that levels are reachable

`validate`, `inspect`, `export` and `godot-check --assets` all pass for a castle with no route above ground. Removing all seven ground-floor stairs from Ravenhold still gives `validate --warnings-as-errors` 0 warnings, and `godot-check` reports `physicsRays: 0`. The navmesh probe in `probe/` fails 27 of 47 targets on that copy (`output/history-v2/navmesh-reachability-control-no-ground-stairs.json`).

AUTHORING_REVIEW asks for route evidence, but the tool provides no way to produce it. Visual review alone was also inconclusive here: the v1 tower pocket looked sealed in the plan renders, but the navmesh showed it was passable.

**Suggested fix:** add a reachability check that an AI can run.

- **Cheap version:** a shared-model connectivity graph. Nodes are floor coverage pieces split by walls. Edges are doors, empty passages and stair landings. Report any occupied region or labelled room with no path to an exterior opening. This would be a `validate` warning or an `inspect` report.
- **Stronger version:** adopt the `probe/` approach as `godot-check --reachability TARGETS.json`. It bakes a navmesh from exported collision with door panels removed and paths to named points. Targets could default to region label centres.

**Status: fixed (cheap version).** `validate`/`inspect --reachability` rasterizes each floor's walkable surface with walker clearance, opens doors and passages, links stairs and floods from open ground (`src/reachability.js`). Unreachable areas of 1 m² or more, named by the regions they cover, and blocked stair ends become warnings. It flags every upper level of the no-ground-stairs control and of the supplied stairless castle fixture. It is opt-in, because most catalog examples are doorless geometry demos. The Godot navmesh probe stays in `probe/` as a second, collision-based check; it was not promoted into `godot-check`. In the web editor, **Include route check** shows the same warnings with navigation targets and outlines unreachable areas on the plan.

### F2. Floor and building settings that AI authoring needs are not transaction-editable

These fields have no transaction, so each needed a hand-written JSON edit (`prepare-base.mjs`, `mark-open-boundary.mjs`):

- **Per floor:** `floor.update` rejects `autoFloor`, `autoCeiling` and `boundaryMode`. `floor.add-top` accepts the first two but not `boundaryMode`.
- **Building level:** `name`, `wallThickness`, `floorThickness`, `roof` (type, pitch, overhang) and `ceiling`.

There is also no `new` command, so every design must start by deleting an example's contents. Ravenhold's first transaction begins with 12 removals.

**Suggested fix:** add `building.update` and widen `floor.update` to those fields. A `new` or `init` command, or a documented blank template, would remove the "delete the example" step.

**Status: fixed.** `building.update` edits name, export profile, default dimensions, wall thickness, grid, automatic roof and ceiling. `floor.update` and `floor.add-top` accept `autoFloor`, `autoCeiling` and `boundaryMode`. `node cli.mjs new --out NEW.json` writes a deterministic blank building. Window/door mesh settings remain web/JSON fields.

### F3. Open wall walks and terraces need an undocumented recipe

When the roof type is anything other than `none`, every exposed floor area gets an automatic roof at its wall top: an open wall walk gets roofed over. And with `autoCeiling` left on, exposed areas get a ceiling slab that behaves like a flat roof. Uncovered deck platforms avoid the roof, but they don't carry stair openings.

The only working combination was:

- building `roof.type: none`;
- `autoCeiling: false` on every floor;
- every enclosed room covered either by the next floor's slab or by an independent roof.

None of this is in LLM_GUIDE §5, and two of the three settings can't be reached by transaction (F2).

**Suggested fix:** document an "open deck / rampart" pattern in LLM_GUIDE §5. Consider a per-floor or per-region "open to sky" flag, so a walk region can suppress roof and ceiling without turning off the whole building's automatic roof.

**Status: documented; flag not added.** LLM_GUIDE §5 now gives the recipe, and every setting in it is transaction-editable (F2). A per-region "open to sky" flag would change automatic roof and ceiling generation, which is architectural expansion, so it is deferred.

### F4. Dry-run diffs replace whole wall arrays

Adding or removing any wall reports the entire `walls` array of that floor as a single `replace` change, with both before and after in full. `tx-5` made 24 wall additions or removals, 8 stair updates and 1 opening update, and produced a 199 KB dry run: two array replacements of 28 KB and 43 KB. `tx-1` produced 194 KB.

The workflow asks an AI to inspect `changes` before saving. At this size, doing that uses a large share of its context and hides the stair edits that matter.

**Suggested fix:** report array membership changes as per-ID `add`/`remove` entries keyed by the stable IDs that transactions already require. Alternatively, add a `--summary` mode giving counts per collection and per floor plus warnings.

**Status: fixed.** Arrays of uniquely ID'd objects now report `add`/`remove` entries with `id` and `index`, plus field-level diffs for retained objects. The same `tx-5` diff fell from about 140 KB to 6 KB. Reordered or unkeyed arrays still use one replacement.

## Medium impact

### F5. The exterior-boundary warning forces role and topology workarounds

The branched or open-ends check counts endpoints of `exterior` walls only. So:

- a T-junction that meets another wall midspan is fine, but the same junction at a split point warns;
- attached multi-level masses (a tower abutting a range room) need their shared wall split into `exterior` and `interior` pieces to keep every vertex at degree 2;
- parapets need `boundaryMode: intentional_open`, which has no transaction (F2).

Six tower walls were split into exterior and interior pieces purely to satisfy this rule.

**Suggested fix:** base the check on the actual boundary of the floor's coverage rather than on endpoint degree, or suppress it on floors whose coverage comes from solid regions.

**Status: fixed.** On floors with solid regions or Floor Footprints, branches no longer warn, and an exterior end touching any other wall (centreline or face) counts as joined. Only free-standing ends warn, naming the walls as navigation targets. Wall-loop floors keep the original rules, and catalog expectations are unchanged. The rebuilt Ravenhold needs no `boundaryMode` override. (It still splits tower walls into exterior and interior pieces, but only to give the right faces for lighting.)

### F6. There is no parapet, crenellation or guard-rail primitive, and wall thickness is global

Of Ravenhold's 362 walls, 251 are merlon or crenel segments. `tx-1` alone has 411 operations, against a 1,000-operation limit. Each segment has its own ID, so later edits to a parapet touch dozens of objects.

Because `wallThickness` is building-wide, 1 m stair guards are as thick as the 0.5 m curtain wall. They also have to be offset from stair openings by hand so they don't overlap them. `railings` exist in the model and exporter but have no transaction.

**Suggested fix:**

- add transactions for `railing.add/update/remove`;
- add either a per-wall `thickness` or a parapet wall option (height plus a crenellation pattern) that exports as one wall with notched geometry.

**Status: mostly fixed.**

- `railing.add/update/remove` exist, and railings count as barriers in the route check.
- `wall.crenellate` (and **Add crenels** in the web wall panel) lays out crenels on one wall as ordinary empty window openings; Godot renders confirm clean notches with collision. The rebuilt castle has 116 walls instead of 362, and its structure recipe 162 operations instead of 411.
- Per-wall thickness is **not** added: it would touch junction fitting, openings, roofs and profiles across the exporter, so it is deferred.

### F7. Placing an opening needs hand-computed `t` fractions

`opening.add` takes `t`, a fraction along the wall from endpoint A to B. The generator converts world points to `t` itself (`opening()` in `generate-transactions.mjs`). Hand-computed `t` values break silently when a wall's direction is reversed.

**Suggested fix:** accept `at: {x, z}` as an alternative to `t`, projected onto the host wall and rejected if the point is more than a small distance from the wall.

**Status: fixed.** `opening.add/update` accept `at`. Points up to half the wall thickness from the centreline (that is, on a wall face) are accepted; points beyond the wall ends are rejected. All 91 Ravenhold openings now use it.

### F8. Stair checks don't cover arrival usability

The landing check samples one point per side of the stair. It doesn't check whether the arrival area connects to the rest of the floor. In v1, each tower's arrival pocket was reachable only by stepping across the top of the flight. Nothing checks headroom beneath an upper flight or a slab edge either.

The cheap connectivity graph in F1 would cover the first gap. Headroom would need a separate sampled check.

**Status: partly fixed.** The F1 route check reports stairs whose lower entrance or upper arrival is blocked or unfloored, and arrival areas that don't connect to the floor. There is still no headroom check.

### F9. Visual review doesn't show the Godot export

The workflow's visual review (LLM_GUIDE §3, AUTHORING_REVIEW §4) uses the CLI `preview`, a software approximation. What matters is how the exported `.tscn` looks in Godot, and `godot-check` never renders it.

For this review, a one-off render script rendered the unmodified export in Godot 4.5.1. It used the Compatibility renderer through Mesa under Xvfb, took about 10 seconds for 17 views, and gave eye-level interior views that the CLI preview can't produce.

**Suggested fix:** add a Godot render mode, for example `godot-check --assets DIR --render VIEWS.json --out NEW_DIR`. Views could default to opposite exteriors plus one eye-level shot per labelled region. Point AUTHORING_REVIEW at those images rather than the software preview. Keep `preview` as a quick approximation. Its gaps, such as no way to focus on part of a building and no orthographic plan view, matter less once Godot renders are available.

**Status: fixed.** `godot-check --assets DIR --render --out NEW_DIR [--views FILE]` renders the checked scenes in Godot (`DISPLAY` or `xvfb-run`). By default it takes four exterior diagonals, an aerial view and eye-level views per labelled region. The web editor's **Render in Godot** does the same through `server.mjs` started with `GODOT_BIN`, optionally adding the current 3D preview camera. AUTHORING_REVIEW, LLM_GUIDE and PREVIEWS now point at Godot renders; the software preview is described as an approximation.

## Low impact and papercuts

- **F10. The canvas dependency has no install route.** The docs say to "install `@napi-rs/canvas` locally", but `package.json` has no optional dependency for it. For this exercise it was installed in a separate directory and passed as `CANVAS_MODULE=.../index.js`. **Status: fixed.** PREVIEWS and the missing-canvas error give an install command and accept a package directory.
- **F11. Reports embed absolute machine paths.** `validate --out` (`file`) and `godot-check` (`preflight.root`) record absolute paths, so committed evidence leaks the author's directory layout and isn't portable. **Status: fixed for saved reports.** `validate --out` records input paths relative to the report. The `--json` stdout responses still use absolute paths by design.
- **F12. Creating a configured roof takes two operations.** `roof.add` accepts only bounds, so each configured roof needs a follow-up `roof.update`. **Status: documentation gap.** `roof.add` already accepted every `roof.update` field; TRANSACTIONS.md now says so.
- **F13. `floor.add-top` spacing isn't explained.** An added floor's elevation includes the new floor's slab thickness (4.0 m walls give the next floor at 4.18 m). This is correct, but an AI computing independent roof `baseY` values must derive it from `structuralChanges`. Documenting it next to the manual-roof guidance would help. **Status: documented** in LLM_GUIDE §5.

## Things that worked well

- Every dry run matched its save. Strict mode caught nothing unexpected: the 91 openings and 14 stairs were right first time, with fit, junction clearance and landings all checked.
- A full rebuild from recipes was byte-identical, and web-loaded exports matched the CLI exactly.
- Separate exterior and interior shells, per-story nodes and empty materials were preserved automatically across 34 scenes (873 collision shapes in the first version, 865 in the rebuild).
