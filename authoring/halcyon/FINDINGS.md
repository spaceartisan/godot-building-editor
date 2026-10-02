# Halcyon findings: where the tool breaks

Halcyon and the limit probes (see [README](README.md)) were run on 1.4.0 at `412e6e5`. Each finding was reproduced before any change. Every item below is now fixed. Each fix has a regression test that fails on the old code.

## Summary

| # | Finding | Severity | Status |
| --- | --- | --- | --- |
| H1 | An exterior wall that ends partway along another exterior wall (the sky bridge meeting the towers) leaves the outline "open". The rectangular fallback then floors the whole 28 × 24 m gap between the towers. | High (floor in mid-air; it was warned) | **Fixed**: the warning names each T-junction, and the new `wall.split` (web: **Split wall**) closes the outline |
| H2 | The void-region review warning fired whenever any manual roof, floor or ceiling existed anywhere, which blocked `--warnings-as-errors` | Medium | **Fixed** |
| H3 | With roof `none`, automatic ceilings floated over open terraces and roof decks. Validation stayed silent while 2,400 m² of ceiling floated. | High (visual) | **Fixed**: open-sky coverage gets no ceiling unless a manual roof covers it |
| H4 | Edit and export time grew with the square of the wall count: a 40 × 40 room grid took 49 s to edit and 156 s to export | High at scale | **Fixed**: byte-identical output; 15× faster export and 4.5× faster edit on the largest grid |
| H5 | Exterior corners sharper than about 15° grew a long visual spike: 10.3 m at 1°, 2 m at 5°, 1 m at 10°. Collision stayed bounded, so mesh and collision disagreed. | Medium (edge case) | **Fixed**: miter limit with a bevel |
| H6 | The CLI said "Top floor inserted/duplicated" for basements and mid-stack copies | Low | **Fixed** |
| H7 | TRANSACTIONS.md still said CLI floor insertion and duplication were deferred | Low | **Fixed** |
| H8 | `--surface-colors` left a manual roof exported as a `BoxMesh` in default grey, which reads as wall siding | Low (diagnostic) | **Fixed** |
| H9 | One exported scene per door, many identical | Low | **Fixed**: opt-in `--share-door-scenes` (web: **Share identical door scenes**) |
| H10 | Copying a copied floor stacked ID prefixes (`l5-l4-x`) | Low | **Fixed** |
| H11 | Railings around stair openings had to be placed by hand on a hidden 0.06 m margin. Halcyon's hand-placed rails missed one open side. | Medium | **Fixed**: `stair.guard` (web: **Guard opening above**) |
| H12 | Smooth shaped curves were limited to about 64 segments at a 12 m radius | Low | **Fixed**: the short-wall rule charges each end only what its join cuts |
| H16 | With roof `none`, the ceiling's top face lay in the wall caps' plane under the walls and z-fought with them when seen from above | Medium (visual, top-down views) | **Fixed** |
| H17 | Manual roofs were rectangles only, so the bay roof overhung the angled bay walls | Low (visual) | **Fixed**: polygon footprints for flat roofs (convex or concave) and hip roofs (convex); `hip` manual roofs |
| H18 | Splitting a many-cornered concave outline into convex cells took seconds: 12 s for a 128-corner star, 45 s for 256 corners, and a 23 s export with a star region and roof | Medium (usability) | **Fixed**: the cell merge skips pairs that cannot merge; region cells are cached by corner coordinates. The star export takes 1.4 s, with byte-identical output. |
| H19 | Each web edit on Halcyon took about 0.3 s, even renaming a wall; 90% was the 3D preview rebuilding the rotunda's shaped walls | Low (usability) | **Fixed**: the preview reuses shaped-wall meshes while a floor is unchanged apart from labels. Edits take about 0.1 s. |
| H13 | Coordinates far from the origin lose precision in Godot without a warning | Low | **Fixed**: a warning beyond 10 km |
| H14 | A loop that stops a millimetre short got the generic open-ends warning | Low | **Fixed**: the warning names the near miss |
| H15 | A `floor.duplicate` dry run printed the whole copied floor as one 18.7 KB line | Low | **Fixed**: long values are summarised |

## Fixed

### H1: T-junctions in an exterior outline

The L6 bridge walls (z = ±2) start and end partway along the towers' inner walls (x = ±14). An outline only closes at shared endpoints, so validation reported "exterior boundary has open ends". The automatic floor then fell back to the bounding rectangle: 1,632 m² instead of 1,072 m², with a 28 × 24 m floor floating between the towers. The fallback was warned, but the warning didn't say why the outline was open or what to change.

- **Fix:** The warning now names each T-junction, for example "bridge_n ends partway along west1 at (−10, −1)". It explains that the host wall must be split there, or Floor Footprints set, and it targets both walls for diagnostic navigation.
- **Test:** `boundary-warning-tests.mjs` checks the message on the two-tower plan. It also follows the advice (split hosts, interior bridge mouths) and gets exactly 280 m² with no warnings.
- **`wall.split`:** A shared `proposeWallSplit` (in `src/wall-edit.js`) splits a wall at a plan point (`at`) or a distance from end A. The original keeps its ID as the A piece; the new piece copies its properties. Openings follow their piece, and one across the split point is rejected. The CLI operation is `wall.split`; in the web editor, the wall panel has **Split at (m from A)** and **Split wall**. The warning's advice now names it. Tests: `parity-transaction-tests.mjs` (pieces, order, openings, the closed dumbbell and every rejection) and `web-parity-tests.mjs` (web result equals the transaction, undo, shared rejection).
- **Halcyon:** L6 now splits each tower's inner wall at the bridge and makes the mouth interior. The floor follows the dumbbell outline (1,072 m²) with no Floor Footprints.

### H2: The void review warning ignored where surfaces are

"region cutouts affect automatic surfaces only…" fired for any manual roof, floor or ceiling in the building. Halcyon's three small roofs (the bay, the bridge at 22.8 m and the tower top at 33.3 m) blocked strict saves because of the L2 atrium void.

- **Fix:** It now warns only for an independent surface that overlaps a void in plan (roof eaves included) within that void's story. That means from the floor's slab up to the next floor.
- **Test:** `region-tests.mjs` covers a far roof, eaves reaching the void, a roof over the void in its story, and the same roof 40 m up.

### H4: Quadratic edit and export time

Profiling showed that every wall face was clipped against every other wall's solid on the floor (`unionFaceWriter`). Each wall end also scanned every wall several times per segment (`endpointJoinOffset`). Validation recomputed wall lengths in an all-pairs loop and searched for shaped-wall junctions in plans that have no wall types.

Fixes, all exactly equivalent:

- **Grid-indexed cull:** A wall solid is skipped for a face only when one of its own axis-aligned planes puts the whole face outside it. `subtract()` returns that face unchanged anyway. Angled solids and roof solids spanning many cells are always checked.
- **Join-offset cache:** join offsets are cached per exported floor view, as `wallMiters` already was.
- **Validation:** the shaped-junction scans skip plans without wall types, and the pair loop hoists the per-wall work.

Evidence:

- All 39 example, demo, Kestrel, Ravenhold, Halcyon and probe scenes export byte-identically before and after.
- `export-scale-tests.mjs` shows that an in-place edit followed by a re-export matches a fresh export, which is how the web editor works.

Times on this machine (Node 22). Each grid has 4 m rooms with a doorway to each neighbour:

| Grid | Walls / doorways | Edit before → after | Export before → after |
| --- | --- | --- | --- |
| 10 × 10 | 220 / 181 | 0.10 → 0.07 s | 1.0 → 0.41 s |
| 20 × 20 | 840 / 761 | 1.3 → 0.43 s | 10.7 → 1.36 s |
| 30 × 30 | 1,860 / 1,741 | 10.1 → 2.7 s | 51.8 → 4.1 s |
| 40 × 40 | 3,280 / 3,121 | 48.5 → 10.9 s | 156.0 → 10.6 s |

Halcyon exports in 1.5 s instead of 2.5 s. The remaining edit time is validation's all-pairs wall overlap check, run once per transaction.

### H6 and H7: Floor-stack wording and a stale note

The edit summary now reads "Floor inserted: b1 (below floor_1)" and "Floor duplicated: l2 (copy of floor_1, placed above it)". `floor.add-top` and `floor.remove-top` keep "Top floor". This is tested in `floor-lifecycle-tests.mjs`. TRANSACTIONS.md no longer says basement and middle insertion, duplication and reordering need the web editor.

### H8: Surface colours missed primitive roofs

A manual roof that meets no wall exports as a plain `BoxMesh`, which has no surface names. The colour pass left it in Godot's default grey, the same tone as OutsideFaces. Meshes under `ManualRoofs` now get the roof colour. `render-engine-tests.mjs` renders a lone roof and requires the coloured image to differ from the plain render; it fails on the old script. See `godot-renders/limits/box-roof-colour-*.png`.

### H3: Ceilings under open sky

Since K2, an enabled automatic ceiling hangs under a story's whole floor area. Where nothing is above, the automatic roof was assumed to cover it. With roof `none` and nothing above (Halcyon's 80 × 40 m L3 terrace and the L8 east roof deck), the ceiling floated under open sky: see `godot-renders/limits/floating-ceiling-before.png`. LLM_GUIDE §5's workaround, `autoCeiling:false` on such floors, also removed the ceilings from the enclosed tower rooms on those floors.

- **Fix:** With roof `none`, floor coverage outside the floor's closed exterior wall outline that has nothing above it is open sky. It gets no automatic ceiling unless an independent roof, ceiling or floor at or above the wall top covers it.
- **Changed:** A floor with no exterior walls (coverage only from solid regions or Floor Footprints) is all open sky under roof `none`. `region-engine-tests.mjs` covered such a deck and expected a ceiling, so its moved-polygon case now has a manual roof above it to keep testing the moved ceiling collision.
- **Unchanged:** Rooms inside the outline keep their ceilings, and the ceiling still closes them as before. Floors with an open or branched outline are unchanged, and so is any automatic roof type other than `none`. All 35 example, demo, Kestrel and Ravenhold scenes export byte-identically.
- **Shared code:** The rule lives in `storyCeilingRectangles`, which the exporter and the web 3D preview share.
- **Test:** `ceiling-tests.mjs` covers the open terrace, a manual roof over part of it, the automatic flat roof and enclosed rooms with roof `none`.
- **Halcyon:** no longer sets `autoCeiling:false`. The tower rooms on L3 and L8 keep their ceilings, and the terrace and deck are open (`floating-ceiling-after.png`).

### H5: Acute exterior corners

The junction miter (`junctionMiters`) drew each wall's miter face all the way to the outer apex, ht / sin(θ/2) behind the corner. The wall box itself was capped at 20 half-thicknesses, so at 1° a 10.3 m wall-top sheet stuck out (`godot-renders/limits/acute-corner-1deg-before.png`).

- **Fix:** A miter limit. When the outer apex is more than 4 half-thicknesses from the junction, which happens for corners sharper than about 29°, a bevel plane square to the apex direction cuts it at that distance. The miter face stops there, and a bevel face (EdgeFaces) closes the end.
- **Result:** The shell now stays within 0.36 m (0.18 m walls) at 1°, 5° and 10° (`acute-corner-*-after.png`). Blunter corners keep their sharp miter, and every existing scene exports byte-identically.
- **Test:** `exterior-shell-tests.mjs` checks the reach along the apex direction, the closed bevel face at 1°, 5° and 10°, and that 30° stays sharp.

### H10: Duplicate chains

`floor.duplicate` now replaces the source floor's prefix instead of stacking it: `l5-x` from `l4-x`, not `l5-l4-x`. Opening hosts follow, and the full prefix is kept if stripping would make two IDs equal. Tested in `parity-transaction-tests.mjs`.

### H11: Stair-opening guards

A shared `stairGuardRailings` (`src/stair-guards.js`) places railings on the floor above around a flight's opening. They sit on the model's opening footprint, one per open side. The landing end stays open, and sides already closed by a parallel wall (within half a wall thickness + 0.25 m) or by a railing are skipped, so guarding twice adds nothing.

- **Routes:** The CLI operation is `stair.guard`, with an optional `idPrefix`, `height`, `style` and `label`. In the web editor, the stair panel has **Guard opening above**.
- **Tests:** `parity-transaction-tests.mjs` and `web-parity-tests.mjs`.
- **Halcyon:** its 19 flights and the ramp now use `stair.guard` instead of 50 hand-placed rails. The helper found a side the hand-placed rails had missed: the outer side of the east core's last opening, which is on the open L8 roof deck with no shaft wall beside it.

### H13: Far coordinates

Validation now warns when plan coordinates reach more than 10 km from the origin. The warning gives the 32-bit float step there (7.8 mm at 100 km, 6.3 cm at 1,000 km) and suggests positioning the scene in Godot instead. Tested in `boundary-warning-tests.mjs`.

### H14: Near-miss endpoints

The open-ends warning now names free exterior ends within 5 cm of each other, for example "a end A is 0.001 m from d end B: move one endpoint onto the other". It targets both walls. The test follows the advice with `wall.move-endpoint` and the warning clears.

### H15: Dry-run output

In the human-readable edit summary, a value longer than 300 characters is summarised by its shape (keys and array counts) with its size; `--json` keeps the full value. Halcyon's longest dry-run line went from 18.7 KB to 282 characters.

### H9: Shared door scenes

Halcyon exported 141 door scenes, and 72 of them were byte-identical. The new opt-in export option makes doors with identical scenes instance one shared file: `--share-door-scenes` for `export` and `package`, or **Share identical door scenes** in the web Godot Export panel. Halcyon then exports 8 door scenes instead of 141 (9.8 MB → 7.6 MB). Every door is still placed, the Godot navmesh probe still reaches 22 of 22 targets, and `godot-check --require-collision` passes. It's off by default because one file per door keeps each door editable on its own in Godot, and existing exports stay byte-identical.

- **Tests:** `export-scale-tests.mjs` (default unchanged; every instance's scene is declared once; the main scene differs only in door references; the CLI writes the same files), `web-parity-tests.mjs` (the toggle is off by default and the render posts the shared export) and `asset-engine-tests.mjs` (a shared farmhouse export loads in Godot with collision).

### H12: Short sections of shaped walls

Validation required every shaped wall to be at least 2.2 × its profile's reach long, as if both ends could be cut back by the full reach. That only happens at a free end, a T or a sharp corner. At a plain join to another shaped wall, the fitting cuts back the reach × tan(turn/2), which is about 1 cm per joint on a 128-section circle.

- **Change:** each end is now charged reach × min(1, tan(turn/2)) at a plain join to one other shaped wall, and the full reach everywhere else. Both cuts must fit in 90% of the wall. The rule only ever gets looser, so nothing that was valid is rejected.
- **Result:** a 12 m radius circle of the flared profile is now valid with 128 and 256 sections (64 before). The 0.15 m minimum wall length stops it at 512.
- **Evidence:** rays from the centre through every joint and mid-section, at 5 heights, cross the 64-, 128- and 256-section shells exactly twice; the only exceptions are rays through the doorway in the 64- and 128-section loops. Surface-colour renders of 64 and 128 sections show no seams.
- **Test:** `wall-profile-tests.mjs` checks that the 128-section curve is accepted and watertight, and that a free-standing short section and a short section at a right angle are still rejected.

### H16: Ceiling tops z-fighting with wall caps

Found while checking H12. Every automatic ceiling's top face sat exactly at wall-top height and ran under the walls to their centrelines, overlapping the wall-top caps. With roof `none`, viewed from above, the two flickered along every wall: a plain box room showed it too. Top-down game cameras would see it.

- **Fix:** with roof `none`, the ceiling's top face is clipped against the wall solids, using the existing union clipper with walls taking priority, so it stops at the walls' inner faces. Under an automatic roof it's hidden and stays a full slab.
- **Effect:** the ceiling's top surface (`RoofSideFaces`) changed in three supplied scenes: `examples/roof_attachment.tscn`, `independent_roof_demo.tscn` and `manual_surface_demo.tscn`. They were regenerated with `generate-examples.mjs`; nothing else in any fixture changed.
- **Test:** `ceiling-tests.mjs`.

### H17: Rectangular manual roofs

The entrance bay's roof could only be a rectangle, so its corners overhung the angled bay walls. Manual roofs now take a `polygon` footprint for flat and hip roofs, and `hip` is a manual roof type. Hip roofs need a convex outline; flat roofs may be concave.

- **Shared code:** the rules live in `src/roof-outline.js` (3–256 corners, flat or hip, hip convex only, no host attachment or edge modes) and are used by validation, transactions and the web roof panel. Geometry uses the automatic roof's existing polygon path (`polygonRoofParts`) with the manual roof's own overhang and pitch. A concave flat roof is grown by its overhang (`offsetOutline`, which rejects an overhang that would make the outline cross itself) and split into convex pieces (`roofFootprintAreas`), because roof solids and the polygon subtraction used for interior blockers need convex pieces. The same pieces drive the open-sky ceiling cover and the automatic-roof override.
- **Routes:** the CLI takes `polygon` and type `hip` on `roof.add`/`roof.update`, and `polygon: null` returns the roof to its rectangle. In the web editor, the roof panel's **Footprint** select copies the outline of a polygon region on any floor, and **Hip** is a type. A concave region turns a hip roof flat, with a status message. The plan draws the polygon outline.
- **Overhang:** validation checks the overhang the geometry uses (`manualRoofOverhang`: the roof's own, else the building roof's), and the web **Overhang** field is validated like `roof.update`, so a too-wide overhang on a concave roof is refused on both routes instead of the roof disappearing from the export.
- **Also polygon-aware:** the open-sky ceiling cover (H3) and the automatic-roof override at a manual roof's level now use the polygon, not its bounds.
- **Halcyon:** the bay roof follows the bay walls (`godot-renders/surface-colors/` and `entrance-bay.png`).
- **Tests:** `parity-transaction-tests.mjs` (bounds from corners, roof geometry inside the outline plus overhang, one hip face per polygon edge, an L-shaped flat roof whose pieces cover the grown outline exactly, every rejection including a concave hip and a self-crossing overhang, back to a rectangle), `web-parity-tests.mjs` (Footprint equals `roof.update` for convex and concave regions, Hip, shared rejection, undo) and `asset-engine-tests.mjs` (polygon and hip roofs load in Godot with collision).

### H18: Slow splits of many-cornered concave outlines

Found while testing concave roofs. `wallPolygonAreas`, which splits an outline into convex cells for polygon regions, wall-loop floors and concave roofs, cut it into scan-band trapezoids and then merged them. After each merge, the loop restarted and recomputed a convex hull for every pair of cells. On a 128-corner star that meant 500 trapezoids and tens of millions of hulls. The earlier 256-corner probe used a convex outline, so it never reached this case.

- **Fix:** `mergeConvexAreas` skips pairs whose bounds are apart, and pairs it has already rejected while neither cell has changed. It tries the remaining pairs in the same order as before, so it makes the same merges. `regionAreaCells` caches each polygon's cells by its corner coordinates (an edited polygon gets new cells) and returns copies.
- **Result:** the 256-corner star splits in 0.6 s. A building with a 128-corner star region and a matching flat roof exports in 1.4 s instead of 23 s, with an identical scene, and all 35 supplied buildings export byte-identically.
- **Test:** `polygon-tests.mjs` (a 256-corner star splits within the time limit, with exact area).

### H19: Slow web edits on a large building

Profiling a wall rename on Halcyon in the editor harness (handlers only, no canvas drawing) showed about 0.3 s per edit. Most of it was `buildProfileMeshData` rebuilding the shaped-wall meshes for the L1 rotunda, because every edit rebuilds the whole preview.

- **Fix:** the preview (`src/preview.js`) keeps the shaped-wall meshes for up to 32 floor states, keyed by the floor's content with labels left out, since labels never affect geometry. Any other change to the floor rebuilds them. Export doesn't use this cache.
- **Result:** edits take about 0.1 s and undo about 0.18 s, down from 0.3 s and 0.4 s.
- **Test:** `web-preview-tests.mjs` (a label change reuses the meshes; moving a wall or changing a profile rebuilds them).

## Limits that held

| Probe | Result |
| --- | --- |
| 200 floors (10 × 10 m box each, 1,001 operations in two transactions) | Edit 0.4 s, export 1.7 s |
| 100-floor scene in Godot | Loads, no failures |
| 300 windows on one 100 m wall | Edit 0.1 s, export 0.5 s; loads in Godot |
| 8 and 16 interior walls meeting at one point | Valid, exported and loaded |
| 0.02 m and 2 m walls | Valid, exported and loaded |
| 256-corner solid polygon region | Accepted; 257 is rejected with a clear message |
| 1,001 operations in one transaction | Rejected with a clear message (limit 1,000) |
| Coordinate 1,000,000 + 5 | Rejected (limit ±1,000,000) |
| 512 steps over a 1 m run | Accepted with the "incline exceeds 45°" warning |
| Halcyon in Godot | 142 scenes, navmesh 2,922 polygons, 22 of 22 targets |
