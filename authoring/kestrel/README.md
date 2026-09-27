# Kestrel-class courier: an AI-authored starship interior

A second stress test of the authoring workflow, after [Ravenhold](../ravenhold/README.md). It is a two-deck ship interior that exercises **custom wall profiles** (flared hull, hexagonal corridors) and **custom doorway shapes** (octagon hatches, airlocks, blast doors). The goal is walkable game space, not a spacecraft model: there are no engines, thrusters or weapons. The tool issues it exposed are listed in [FINDINGS.md](FINDINGS.md). It is **not** added to the example catalog.

![Stern quarter, rendered by Godot 4.5.1](godot-renders/stern-quarter.png)

The images in `godot-renders/` are Godot 4.5.1 renders of the exported `.tscn`, made with `godot-check --render --views`. The scene is unmodified. Empty materials show as Godot's default grey. The renderer adds only a camera, sky, sun, ambient light, a short-range camera headlamp and a clear render-only material on `Glass` surfaces.

## Layout

The bow points to +X. Port is −Z, starboard +Z.

| Deck | Elevation / walls | Spaces |
| --- | --- | --- |
| Deck 1: engineering and cargo | 0 m / 3.2 m | Cargo bay with an aft blast-door ramp and the main companionway; hexagonal central corridor; Engineering and Reactor room to port; Storage, Airlock (inner and outer airlock hatches) and Life support to starboard; Sensor bay in the pointed bow |
| Deck 2: crew | 3.38 m / 3.0 m | Observation lounge (wide aft window, stair arrival with rails); hexagonal corridor; Crew quarters 1–2 and Captain's quarters to port; Mess (arched opening to the lounge) and Med bay to starboard; Bridge behind a bulkhead, with three canopy windows |

Construction:

- **Hull (`hull` wall type):** tumblehome. It flares 0.35 m outboard from 18% to 55% of the story height, then tucks back to the plan line under the ceiling. Framed portholes sit in the straight band, 13 of them.
- **Corridors (`corridor` wall type):** hexagonal cross-section, 0.2 m wider on each side at shoulder height. All cabin hatches are empty passages cut through the bend, and their reveals follow the profile.
- **Doorway shapes:**
  - `hatch` (octagon): cabin hatches, plus framed hatch doors on the Standard bulkheads.
  - `airlock`: both airlock hatches and the lounge/mess arch.
  - `blast`: the cargo ramp and the corridor blast doors.
- **Standard walls:** bulkheads, cabin partitions, the bridge canopy and the lounge's aft wall.
- **Circulation:** one 20-riser flight, 1.4 m wide, climbs 3.38 m from the cargo bay to the lounge. Rails guard the stair opening.

Totals: 34 walls (12 shaped), 19 doors (4 framed), 17 windows, 1 stair, 2 railings, 16 labelled regions. The ship covers 492 m² on Deck 1 and 306 m² on Deck 2.

## Files

| Path | What it is |
| --- | --- |
| `output/kestrel.building.json` | **The editable building** (schema 10). Load it in the web editor to continue by hand. |
| `output/assets/` | Exported `kestrel_class_courier.tscn` and 4 relative door scenes |
| `output/checks.json` | `validate --warnings-as-errors --reachability` report |
| `output/navmesh-reachability.json` | Godot navmesh probe results (18 targets) |
| `generate-transactions.mjs` | Generates the recipes and `profiles.json` from one layout description |
| `tx-1-structure`, `tx-2-openings`, `tx-3-circulation` `.edit.json` | Transaction recipes (53, 36 and 3 operations) |
| `profiles.json`, `apply-profiles.mjs` | The one **scoped JSON edit**: wall types, doorway shapes and wall-type assignment, which have no CLI operations (FINDINGS K1) |
| `probe-targets.json` | Navmesh probe targets for `../ravenhold/probe/run-reachability.mjs` |
| `build.sh` | Rebuilds everything from a blank building |
| `godot-renders/` | Curated Godot renders (`renders.json` gives each camera); `surface-colors/` shows the `--surface-colors` shell check |

From the editor root, pass a new work directory:

```bash
authoring/kestrel/build.sh ../kestrel-work /path/to/godot
```

## Authoring sequence

1. `node cli.mjs new`, then `tx-1-structure`:
   - `building.update`: 0.25 m walls, 3 m default story, flat roof, no overhang.
   - Deck 1 gets 3.2 m walls; `floor.add-top` adds Deck 2.
   - 34 walls and 16 regions are added.
2. `apply-profiles.mjs`, a scoped JSON edit, writes to a new file. It adds 2 wall types and 3 doorway shapes, sets schema 10, and assigns `wallTypeId`/`inwardSide` to 12 walls. `validate --warnings-as-errors` runs straight after it.
3. `tx-2-openings`: 19 doors with `shapeId`, 4 canopy/observation windows and 13 portholes, all placed by world point (`at`).
4. `tx-3-circulation`: the stair and two railings.

Every recipe passed its dry run and save with `--warnings-as-errors`. No step needed a retry after its dry run. The profile and junction rules shaped the plan up front instead (FINDINGS K6).

## Review evidence (AUTHORING_REVIEW §2)

Environment: Linux, Node 22.22.2, Godot 4.5.1 stable. Checks ran headless; renders used Compatibility/OpenGL through Mesa llvmpipe under Xvfb.

| Review item | Status | Evidence |
| --- | --- | --- |
| Schema and authoring validation | Verified | 0 errors, 0 warnings (`output/checks.json`) |
| Routes (static check) | Verified | `--reachability`: 399.45 of 399.45 m² reached on Deck 1 and 228.62 of 228.62 m² on Deck 2, entering by the cargo ramp and outer airlock hatch. The check ignores wall profiles (FINDINGS K5); here every profile leans away from the walkways. |
| Routes (Godot navmesh) | Verified | 18/18 probe checks pass: all 16 rooms, the outer airlock hatch into the airlock, and cargo bay to bridge in 34.8 m (`output/navmesh-reachability.json`) |
| Intended floors | Verified | Automatic coverage matches the hull loops: 492 and 306 m², minus the 7.7 m² stair opening |
| Profiles and shaped openings as exported | Verified in Godot renders | The flared hull, hex corridors and every hatch shape render as authored. Hatch reveals follow the corridor bend. Portholes sit in the straight hull band. |
| Lighting shells | Verified in Godot surface-colour renders | Grey siding outside, pink inside, orange/yellow corridor sides, teal only on reveals and wall tops (`godot-renders/surface-colors/`). This pass found and fixed the z-fighting skirt underside (FINDINGS K0). |
| Export | Verified | `godot-check --assets --require-collision`: 5 scenes, 0 failures |
| Ceiling finish | **Known defect** | Deck 1 ceilings step down 0.12 m where Deck 2 does not cover them (FINDINGS K2) |
| Character traversal | Partly verified | Connectivity only. Door swing, stair comfort and headroom along the flight are unverified. |
| Materials and lights | Intentionally omitted | Materials are empty by default. The CLI cannot add lights (FINDINGS K3). |

## Known limits of this blockout

- It sits on the ground plane: there's no terrain, and the cargo ramp is a doorway at floor level with no ramp.
- There are no lights. A game scene needs them, because every room is enclosed.
- Ship "hull" features such as nacelles, fins or curved roofs are out of scope and would be separate art.
