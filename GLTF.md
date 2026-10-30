# glTF export for Unreal Engine and other engines

> Start with the [README](README.md) (what the tool makes, and its **Scope**) and [LLM_GUIDE.md](LLM_GUIDE.md). This page is a reference for one part.

The `.tscn` export stays the main output. `--format glb` writes the same building as one glTF 2.0 binary (`.glb`) for engines other than Godot, Unreal Engine 5 first:

- CLI: `node cli.mjs export FILE --format glb --out NEW_DIR` writes `NEW_DIR/<scene name>.glb`; `package --format glb` zips one per input. `--no-collision`, `--no-markers`, `--profile`, `--replace`, `--include-json` and batches work as for `.tscn`.
- Web editor: **Export .glb** beside **Export .tscn ZIP**, with the Godot Export panel's **Include collision** and **Opening Marker3D helpers** settings.

Both call the same code (`src/gltf-export.js`). It reads the exporter's own building, door and elevator scenes, so the `.glb` holds exactly the geometry the `.tscn` holds, and `.tscn` output is unaffected. `--game-layer` and `--placeholders` are Godot features and are refused with `--format glb`.

## What is in the file

| Godot export | In the .glb |
| --- | --- |
| Node tree (`Floor_NN/Geometry/Walls/ExteriorWalls/OutsideFaces`, …) | The same tree and transforms, in metres, Y-up. Door and elevator scenes are inlined at their instances; hinge pivots (`Hinge`, `Hinge2`), `Curtain`, elevator `Car` and landing door nodes stay separate nodes, so they can be animated. |
| Node names | Unique within the file (a repeat gets `_2`, `_3`, …; the original is in `extras.godot_name`), because Unreal matches collision to meshes by node name. |
| ArrayMesh surfaces (`OutsideFaces`, `TopFaces`, `Door`, …) | One primitive each, with normals, tangents and UV0 in metres. Each gets a material **named after the surface**, so slots can be bound by name. `Glass` is translucent; the rest are plain grey. Untrimmed box parts (roof slabs, ridge caps, posts, beams, steps) get a material named after their `building_part` (`roof`, `post`, …). |
| `metadata/*` (`building_part`, `building_opening_id`, `building_floor_id`, `building_regions`, `door_width`, …) | glTF `extras` on the same node. Groups are `extras.godot_groups`; non-plain node types are `extras.godot_type` (for example `AnimatableBody3D` on an elevator car). |
| Collision bodies and shapes | Unreal collision meshes (below). Collision nodes themselves are not written. |
| `OmniLight3D` | A `KHR_lights_punctual` point light with the colour, range and energy. Lights are placeholders as in Godot; Unreal reads the energy as candelas, which is dim, so set the intensity in Unreal. |
| `Marker3D` (openings, `Threshold`, elevator stops and anchors) | Empty nodes with their metadata. |

## Collision for Unreal

Unreal does not read glTF physics extensions, but it does read its own collision naming from glTF: a mesh named `UBX_<node>_NN` becomes a box and `UCX_<node>_NN` a convex hull on the static mesh of node `<node>`. Each collision body is attached to a **carrier**: the nearest mesh in its own subtree, else in its parent's, so a floor's walls and slabs collide through one of that floor's meshes, a door leaf's collision swings with its `Hinge`, and an elevator car's collision rides on `CarMesh`.

| Godot shape | Unreal collision |
| --- | --- |
| `BoxShape3D` | `UBX_` box, rotated as authored |
| `ConvexPolygonShape3D` | `UCX_` hull of its points |
| `ConcavePolygonShape3D` (trimmed roofs, gables, shaped walls, custom door frames) | `UCX_` hulls: coplanar neighbouring triangles are joined into convex polygons and each becomes a 2 cm thick prism on the surface |

`extras` and collision follow the carrier: hiding or deleting the carrier actor in Unreal removes that collision too.

## Importing into Unreal Engine 5

Use **Import Into Level** (Interchange glTF) to get the node tree as actors, or a plain content import for static meshes only. Scale needs no change (glTF metres become centimetres). Each mesh imports as a static mesh with named material slots, its `UBX_`/`UCX_` simple collision and its `building_*` metadata as asset metadata (`INTERCHANGE.<node>.building_part`). Doors and elevators carry no logic, as in Godot: rotate a `Hinge` actor to swing its leaf, move `Car` between the `Stop_NN` markers.

`qa/unreal-import-check.py` runs that import headless and writes a JSON report (material slots, box and convex collision per mesh, metadata, actor tree, lights); see the comment at its top for the command line.

## Checks

- `gltf-tests.mjs` (core and cli suites): every catalog example and an elevator building against its own `.tscn`: each mesh node and `building_part`, a material per surface name, every box shape's world centre reproduced by its `UBX_` piece, every concave triangle inside a `UCX_` hull, unique names, counter-clockwise winding matching the normals, lights, deterministic bytes, and CLI/web parity.
- `gltf-engine-tests.mjs` (engine-assets suite): Godot's own glTF importer reads nine exports back and compares them with the `.tscn` (meshes, world bounds, triangles per surface name, front faces, lights, metadata).
- Unreal Engine 5.8.4 (Windows), checked with `qa/unreal-import-check.py` on the Dirtscape smithy, `shaped_walls`, `stair_ramp_north` and an elevator building: every `UBX_`/`UCX_` piece became simple collision with no stray actors, every slot was named, every mesh had `building_part`, lights became point lights, and door hinges and the elevator car kept their own collision. Unreal is not a test dependency; other engines and versions are unverified.
