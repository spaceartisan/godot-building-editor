# Halcyon findings: where the tool breaks

Halcyon and the limit probes (see [README](README.md)) were run on 1.4.0 at `412e6e5`. Each finding was reproduced before any change. Fixed items have a regression test that fails on the old code. Items marked **decision needed** change geometry or long-standing behaviour, so they're proposals, not fixes.

## Summary

| # | Finding | Severity | Status |
| --- | --- | --- | --- |
| H1 | An exterior wall that ends partway along another exterior wall (the sky bridge meeting the towers) leaves the outline "open". The rectangular fallback then floors the whole 28 × 24 m gap between the towers. | High (silent-looking floor in mid-air; it was warned) | Warning now names each T-junction and the wall to split. There's still no wall-split operation. |
| H2 | The void-region review warning fired whenever any manual roof, floor or ceiling existed anywhere, which blocked `--warnings-as-errors` | Medium | **Fixed** |
| H3 | With roof `none`, automatic ceilings float over open terraces and roof decks. That's documented (LLM_GUIDE §5), but validation stayed silent while 2,400 m² of ceiling floated. | High (visual) | Halcyon uses the documented recipe. **Decision needed** on a warning or a rule change. |
| H4 | Edit and export time grew with the square of the wall count: a 40 × 40 room grid took 49 s to edit and 156 s to export | High at scale | **Fixed**: byte-identical output; 15× faster export and 4.5× faster edit on the largest grid |
| H5 | Exterior corners sharper than about 15° grow a long visual spike: 10.3 m at 1°, 2 m at 5°, 1 m at 10°. Collision stays bounded, so mesh and collision disagree. | Medium (edge case) | **Decision needed** |
| H6 | The CLI said "Top floor inserted/duplicated" for basements and mid-stack copies | Low | **Fixed** |
| H7 | TRANSACTIONS.md still said CLI floor insertion and duplication were deferred | Low | **Fixed** |
| H8 | `--surface-colors` left a manual roof exported as a `BoxMesh` in default grey, which reads as wall siding | Low (diagnostic) | **Fixed** |
| H9–H15 | Usability and limit observations | Low | Documented below |

## Fixed

### H1: T-junctions in an exterior outline

The L6 bridge walls (z = ±2) start and end partway along the towers' inner walls (x = ±14). An outline only closes at shared endpoints, so validation reported "exterior boundary has open ends". The automatic floor then fell back to the bounding rectangle: 1,632 m² instead of 1,072 m², with a 28 × 24 m floor floating between the towers. The fallback was warned, but the warning didn't say why the outline was open or what to change.

- **Fix:** The warning now names each T-junction, for example "bridge_n ends partway along west1 at (−10, −1)". It explains that the host wall must be split there, or Floor Footprints set, and it targets both walls for diagnostic navigation.
- **Test:** `boundary-warning-tests.mjs` checks the message on the two-tower plan. It also follows the advice (split hosts, interior bridge mouths) and gets exactly 280 m² with no warnings.
- **Halcyon:** uses three Floor Footprints on L6. Splitting the duplicated tower walls would have meant removing each wall and re-adding three, then re-hosting its four windows and door.
- **Proposal (not done):** a shared `wall.split` operation in the web editor and CLI that splits a wall at a point and keeps its openings on the right piece.

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

## Decision needed

### H3: Ceilings under open sky

Since K2, an enabled automatic ceiling hangs under a story's whole floor area. Where nothing is above, the automatic roof is assumed to cover it. With roof `none` and nothing above (Halcyon's 80 × 40 m L3 terrace and the L8 east roof deck), the ceiling floats under open sky: see `godot-renders/limits/floating-ceiling-before.png`.

LLM_GUIDE §5 documents this case: use `autoCeiling:false` on such floors. Halcyon does, so the rooms there are closed by the next floor's slab instead. But the first pass validated with 0 warnings while 2,400 m² of ceiling floated, and the recipe also removes the ceiling from enclosed rooms on that floor (the tower rooms on L3).

Options:

1. **Warning only:** "N m² of automatic ceiling has nothing above it and no roof". No geometry change.
2. **Rule change:** with roof `none`, exposed areas get an automatic ceiling only under a manual roof, ceiling or floor. Tower rooms keep their ceilings with `autoCeiling` left on. This changes output for existing roof-`none` plans that rely on the ceiling as a flat roof.

(A per-region "open to sky" flag was deferred earlier as architectural expansion.)

### H5: Acute exterior corners

The exterior shell offsets the outline with an unlimited miter. The wall-top cap (EdgeFaces) reaches 0.09 / sin(θ/2) m past the apex: 10.3 m at 1°, 2.1 m at 5° and 1.0 m at 10°. OutsideFaces reaches up to 1.8 m (its 20 × half-thickness cap). Collision boxes only extend by half a thickness. See `godot-renders/limits/acute-corner-*.png`.

Options:

1. **Warning only:** for exterior corners under, say, 20°.
2. **Bevel limit:** bevel the shell where the miter exceeds a limit. This is a geometry change, but no example or authored building has an exterior corner under 90°, so none of their scenes would change.

## Observations (H9–H15, not changed)

- **H9: One scene per door.** Halcyon exports 141 door scenes, and 72 are byte-identical. Sharing identical door scenes would shrink exports but change the file layout and per-door editability.
- **H10: Duplicate chains.** Copying a copy gives IDs like `l5-l4-x`. Halcyon avoids this by duplicating L3 six times top-down (each copy is placed directly above its source).
- **H11: Opening guards are manual.** Railings around stair openings must be placed on the opening footprint by hand: 0.06 m outside the flight's sides and entry, flush at the top. That's documented under `inspect`; Halcyon computes its 47 stair rails and 3 ramp rails. A "guard this opening" helper would remove a common mistake.
- **H12: Shaped curves have a segment limit.** A 128-segment circle (12 m radius) of a 0.3 m-offset profile is rejected: "profile is too wide for this short wall" (0.59 m segments; the rule is offset + thickness/2 ≤ 45% of the length). 64 segments work.
- **H13: Far coordinates.** Plans are accepted up to ±1,000,000 m. Godot stores vertices as 32-bit floats, so the step is 7.8 mm at 100 km and 6 cm at 1,000 km. Nothing warns. The scene text at 100 km matches the plan; Godot rounds it to float32 on load.
- **H14: Near-miss endpoints.** A wall that stops 1 mm or 0.1 mm short of closing a loop gets the generic open-ends warning and the rectangle fallback. It doesn't say which endpoint nearly meets which.
- **H15: Dry-run output for duplicates.** A `floor.duplicate` diff prints the whole copied floor as one JSON line (18.7 KB for L2).

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
| Halcyon in Godot | 142 scenes, navmesh 2,917 polygons, 22 of 22 targets in 3.3 s |
