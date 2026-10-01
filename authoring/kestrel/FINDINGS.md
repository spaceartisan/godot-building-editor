# Kestrel findings: next steps for the tool

These findings come from authoring the [Kestrel](README.md) with the CLI workflow and reviewing its Godot export. They are ordered by how much they would help AI authoring of walkable interiors. The K0 items were found and fixed while building the ship. Most of K1–K12 were then implemented in a follow-up pass; each carries its status.

| Finding | Status |
| --- | --- |
| K1 CLI wall types, doorway shapes, assignment | **Fixed:** `wallType.*`, `openingShape.*`, `wall.add/update` `wallTypeId`/`inwardSide`/`inwardToward`; the Kestrel is now built with CLI commands only |
| K2 Ceiling step under setbacks | **Fixed:** the ceiling hangs over the whole story |
| K3 Lights from the CLI | **Fixed:** `light.add/update/remove`; the Kestrel now has 22 lights |
| K4 Route check inside sealed vessels | **Fixed:** `--from` and the web **Route start** field |
| K5 Route check ignores profiles | **Fixed:** shaped walls block by their profile's reach up to body height |
| K6 Shaped wall ends need Standard stubs | Open (deferred) |
| K7 Doorway shapes door-only | Accepted limit |
| K8 No ladders/lifts | Accepted limit |
| K9 `inwardSide` hard to author | **Fixed:** `inwardToward` and `inspect --entities` `profileInward` |
| K10 Eye-level views inside objects | **Fixed:** cameras use the first collision-free candidate point |
| K11 Absolute profile station thickness | **Fixed:** stations at the building thickness follow it |
| K12 Probe snap distances | **Fixed:** the probe fails starts and targets more than 0.6 m from the navmesh |

**What worked well:**

- **Profiles:** Standard partitions branch into shaped hosts (hull and corridors) at T-junctions without trouble.
- **Openings through profiles:**
  - Empty shaped passages cut cleanly through profile bends, and their reveals follow the bend.
  - Framed portholes are accepted wherever the profile is straight across the window's height.
  - Placing openings by world point (`at`) made every door and window a one-liner.
- **Validation:** every recipe passed its first dry run. The profile rules are strict but their messages are clear.

## Fixed in this pass

### K0. Shaped-wall exports z-fought on the ceiling below (fixed)

Symptom: every Deck 1 ceiling under a Deck 2 wall showed flickering dashed teal lines in Godot.

Cause:

- Buildings with a wall type or shaped opening use the solid/union export path.
- That path emitted the underside of each upper-story wall's slab-thickness skirt, which lies exactly on the lower story's slab underside: 19.1 m² of EdgeFaces here.
- The Standard wall path never emits this face.

Fix: `buildProfileMeshData` now skips the skirt underside (`src/exporter.js`). Collision and the skirt's side faces are unchanged. A regression case in `exterior-shell-tests.mjs` fails before the fix and passes after it. No catalog example has shaped walls above the ground floor, so no checked-in scene changed.

### K0b. Godot renders were not usable for enclosed interiors (fixed)

- With only sun and ambient light, sealed rooms rendered almost black.
- Empty material slots made window glass opaque grey.

`qa/render-views.gd` now adds a short-range camera headlamp and a clear render-only material for exported `Glass` surfaces. The script is shared, so CLI `godot-check --render` and the web **Render in Godot** both get it. Scenes are still not modified.

### K0c. The navmesh probe was Ravenhold-only (fixed)

`authoring/ravenhold/probe/run-reachability.mjs` accepts an optional targets file (`probe-targets.json` here).

### K0d. Interior-wall surface check: nubs at non-right-angle junctions (fixed)

Interior walls got their own surface-colour check. `--surface-colors` now paints interior-wall EdgeFaces red, distinct from exterior teal, while SideA stays orange and SideB yellow. Cameras were aimed at both faces and both ends of every interior wall: 272 views across 11 examples and 132 across the Kestrel. A numeric check confirmed that every SideA/SideB triangle in all examples and Ravenhold sits on the correct side of its wall.

One real defect turned up:

- **Cause:** in the Standard wall path, each wall end at a corner was extended by half the wall thickness along its own axis. That is exact only at 90°.
- **Effect at obtuse corners and three-way junctions:**
  - the extension overshot the neighbour's outer face;
  - it left a small nub whose end cap showed as a red (interior) or teal (exterior) strip.
- **Where:** the Y junction in `editable_junctions`, and every 135° corner of the octagonal outlines in `polygon_regions` and `round_bounding`.

**Fix:** a new shared `junctionMiters` in `src/wall-union.js` handles junctions whose angles are not all multiples of 90°. There, wall ends are mitered against their angular neighbours, on the bisector planes through the junction point.

- **Unchanged:** right-angle junctions and T-junctions keep the old box extension and their scene bytes. Collision boxes are unchanged.
- **Examples:** only the three affected example scenes changed, and only in mesh data. They were regenerated with `generate-examples.mjs`.
- **Tests:** a regression case in `exterior-shell-tests.mjs` fails before the fix and passes after it. It checks:
  - no end caps at octagon corners;
  - octagon siding area equals the exact mitered outline;
  - no end caps at the Y junction.
- **Hole check:** a ray-cast hole check around every Standard junction gave identical results before and after.

Evidence: `godot-renders/interior-check/junction-miters-before-after.png`.

Two things in the review look like defects but are not:

- **Kestrel corridor ends:** red lens-shaped strips where each hexagonal corridor wall meets its straight end stub. They are the real step between the two profiles (K6). The other Kestrel partitions fit their shaped hosts cleanly.
- **`editable_junctions` floor:** jagged pink patches on the floor. That building has no roof or ceiling, so they are sunlight through the stair opening with aliased shadow edges, not geometry.

## Findings K1–K12

### K1. No CLI operations for wall types, doorway shapes or wall-type assignment (parity gap)

The web editor has dialogs for wall types and doorway shapes, and can set a wall's type and inward side. Transactions can only reference an existing `shapeId`.

Authoring the Kestrel therefore needed one scoped JSON edit (`apply-profiles.mjs`) to:

- add the two wall types and three shapes;
- bump the schema to 10;
- set `wallTypeId`/`inwardSide` on 12 walls.

This breaks the rule that every capability is available in both web and CLI. Also, `inspect --entities` lists `wallTypeId`/`shapeId` references but not the wall type or shape definitions.

**Next step:**

- Add `wallType.add/update/remove` and `openingShape.add/update/remove` operations, built on the shared validators.
- Accept `wallTypeId` and `inwardSide` in `wall.add`/`wall.update`.
- Bump the schema version automatically.
- List the definitions in `inspect --entities`.

**Status: fixed.** `wallType.add/update/remove` and `openingShape.add/update/remove` use the web dialogs' records and removal rules and the shared validators, and `wall.add/update` accept `wallTypeId`, `inwardSide` and `inwardToward`. `inspect --entities` lists the definitions. The Kestrel's `apply-profiles.mjs` is gone: the CLI-only rebuild produces an identical building and byte-identical scenes. Tests: `profile-transaction-tests.mjs` and web parity (dialog delete and inward direction equal the operations).

### K2. Automatic ceilings step 0.12 m below the upper floor's slab

The automatic ceiling in exposed areas spans `wallHeight − ceiling.thickness … wallHeight`. The upper floor's slab starts at `wallHeight`. Wherever an upper story is smaller than the one below, the room's ceiling drops 0.12 m, with an edge band at the boundary.

- **Kestrel:** visible in the cargo bay, engineering, the airlock, life support and the whole sensor bay (`godot-renders/sensor-bay.png`).
- **Other buildings:** affects any building with an upper-story setback, not just ships.

**Next step:** make exposed ceilings flush with the slab underside, for example by keeping the ceiling bottom at wall top. This changes exported scenes for setback buildings, so it needs a deliberate decision and fixture review.

**Status: fixed.** The cause was the floor/ceiling distinction:

- Floor slabs sit on top of the walls; Deck 2's slab spans 3.20–3.38 m.
- Automatic ceilings hang inside the story; Deck 1's spans 3.08–3.20 m.
- Only exposed areas got a ceiling.

`storyCeilingRectangles` (shared by the exporter and the CLI and web previews) now hangs the ceiling over the whole story footprint. It stays open only where something higher covers the story without a slab directly above: stair openings, and upper floors with `autoFloor:false`. A void region upstairs still gets a ceiling below it, as before.

- **Kestrel:** Deck 1 has one ceiling of 484.31 m², the 492 m² deck minus the stair opening.
- **Examples:** the `twostory`, `basement_markers` and `roof_junctions` scenes changed. The rest have automatic ceilings off.
- **Tests:** `ceiling-tests.mjs`.
- **Evidence:** `godot-renders/interior-check/ceiling-step-before-after.png`.

### K3. Lights cannot be authored from the CLI (parity gap)

Floors carry `lights`, which the web editor places and the exporter writes, but no transaction adds or edits them. A sealed interior is dark in a game without lights, so an AI author can't finish a usable ship, bunker or basement through the CLI.

**Next step:** `light.add/update/remove` transactions, with the same fields as the web editor.

**Status: fixed.** `light.add/update/remove` take the web light panel's fields and defaults (`light-transaction-tests.mjs`, web parity in `web-parity-tests.mjs`). The Kestrel's `tx-4-lighting` adds 22 lights.

### K4. The route check cannot start inside a sealed vessel

`--reachability` floods only from open ground outside the ground floor. The user's own spaceship (`spaceship.building.json`, one deck, 65 walls, 19 empty doorways) has 668.48 m² walkable and 0 m² reached. Every room is reported unreachable because the ship has no exterior opening, which is intended for a sealed ship. The Kestrel passes only because its cargo ramp and airlock are open empty doorways.

**Next step:** a start option, such as `--from x,z[,floorId]` or a saved spawn marker, in both the CLI and the web **Include route check**.

**Status: fixed.** `validate/inspect --reachability --from "x,z[,floorId][;...]"` and the web **Route start** field share `parseRouteStarts`. With `--from "-18,0"`, all 668.48 m² of the user's spaceship is reached. A start that is not on walkable floor is reported, and the web plan marks each start point.

### K5. The route check ignores wall profiles

`src/reachability.js` rasterizes walls on their plan centreline at the building thickness. A profile that leans *into* a room narrows the space at body height without the check noticing. For example, the built-in `hull` preset leans +0.35 m between 16% and 80% of the height.

The Kestrel's profiles lean outboard or away from the walkways, so its result is sound. A ship built with the inward `hull` preset could pass with 0.7 m corridors that are unusable in practice.

**Next step:** inflate walls by their largest inward offset between the floor and walker height (about 1.8 m).

**Status: fixed.** Shaped walls now block by their profile's reach on each side, sampled between the floor and 1.8 m. In the regression case, a 1.2 m corridor with inward-leaning walls is correctly impassable. The Kestrel's walkable areas dropped slightly (399.45 → 394.63 m² and 228.62 → 224.16 m²) because the corridor walls bulge 0.2 m into the cabins, and everything is still reached.

### K6. Shaped walls cannot end on another wall, so corridors need Standard stubs

A shaped wall may not end midway along another wall, even a Standard bulkhead. Each corridor wall therefore ends in a 0.6 m Standard stub: 8 stubs in total. Straight joins between different profiles must also overlap at every height, which capped the hex corridor's offset at less than 0.25 m, half the combined thickness. The reverse case already works: a Standard wall can end on a shaped host.

**Next step:** let a shaped wall end on a Standard host with a fitted end, or have the editor and CLI insert the transition stub automatically.

### K7. Doorway shapes are doors only and must reach the floor

Shapes need a flat bottom edge at y = 0 and apply only to doors. Round or hexagonal portholes and shaped canopy windows are impossible, so every window is rectangular.

**Next step:** allow shapes on windows, with the shape normalized between sill and head.

### K8. No vertical circulation besides stair flights

The Kestrel's 3.38 m deck rise needs a 5 m run and a 7.7 m² slab opening, a large share of a small ship. Ships, towers and bunkers usually use ladders, deck hatches or lifts.

**Next step:** a steep ladder stair style with a small opening. Alternatively, a vertical shaft or lift marker that exports a floor opening plus a traversal link, which the route check and navmesh probe treat as connected.

### K9. `inwardSide` is hard to author blind

`inwardSide` is `left` or `right` relative to the wall's A→B direction, and `auto` means left for interior walls. Picking the side that faces into the corridor meant reading `wall-profile-geometry.js`.

**Next step:**

- Accept `inwardToward: {x, z}` in the future wall operations (K1).
- Report each shaped wall's resolved inward normal in `inspect --entities`.

**Status: fixed.** `inwardToward: {x, z}` resolves to `left`/`right`, and `inspect --entities` reports `profileInward`, each shaped wall's resolved inward direction.

### K10. Automatic eye-level render views can sit inside objects

The automatic cargo-bay view placed its camera inside the stair flight. Views are offset from the region centre with no regard for stairs or railings.

**Next step:** pick eye points from the reachability grid, or nudge them out of stair and railing footprints.

**Status: fixed.** Each automatic region view tries up to 15 candidate eye points and uses the first that a physics point query finds clear at eye, chest and knee height. The cargo-bay camera now stands beside the stair.

### K11. Profile station thickness is absolute

To avoid the warning that a profile "changes the floor/top edge", end stations need offset 0 and the building's exact wall thickness. Station thickness is stored in metres, so changing `wallThickness` after defining profiles makes every existing profile warn. The web presets take the building thickness at the time they are applied, so this happens after any later thickness change.

**Next step:** support thickness relative to the building wall, or rescale profiles on `building.update`.

**Status: fixed.** The units are mixed by design, one per axis:

- **Height** is a fraction of each wall's height, so the Kestrel's single hull profile fits both its 3.2 m and its 3.0 m decks.
- **Offset and thickness** are metres.

The hazard was the duplicated thickness. Now a station whose thickness equals the building wall thickness follows it when the web setting or `building.update` changes it (shared `followWallThickness`). Deliberately thicker or thinner stations keep their metres, and no schema change was needed. Tested in `profile-transaction-tests.mjs`, CLI and web.

### K12. Navmesh probe path lengths can mislead near the hull

The probe reported "outside → airlock" as 2.6 m for a 6 m walk. There's no terrain outside the ship, so the start point snaps to the nearest navmesh point, which is the hatch threshold.

**Next step:** report the snap distance for each start and target, and fail when it exceeds a tolerance.

**Status: fixed.** The probe reports snap distances and fails a start, leg origin or target more than 0.6 m (horizontally) or 0.35 m (vertically) from the navmesh. This exposed that the original Kestrel start and airlock leg began outside the hull, 3–4 m from any navmesh. Both now start inside, and the Kestrel (18/18) and Ravenhold (47/47) pass.
