# glTF export for Unreal Engine and other engines

> Start with the [README](README.md) (what the tool makes, and its **Scope**) and [LLM_GUIDE.md](LLM_GUIDE.md). This page is a reference for one part.

The `.tscn` export stays the main output. `--format glb` writes the same building as one glTF 2.0 binary (`.glb`) for engines other than Godot, Unreal Engine 5 first:

- CLI: `node cli.mjs export FILE --format glb --out NEW_DIR` writes `NEW_DIR/<name>.glb`, where `<name>` is the building's `sceneName` (`building.update`), else its name with every run of characters other than letters and digits turned into `_` and lower-cased (as for `.tscn` files). `package --format glb` zips one per input. `--no-collision`, `--no-markers`, `--profile`, `--replace`, `--include-json` and batches work as for `.tscn`.
- Web editor: **Export .glb** beside **Export .tscn ZIP**, with the Godot Export panel's **Include collision** and **Opening Marker3D helpers** settings.

Both call the same code (`src/gltf-export.js`). It reads the exporter's own building, door and elevator scenes, so the `.glb` holds exactly the geometry the `.tscn` holds, and `.tscn` output is unaffected. `--game-layer` and `--placeholders` are Godot features and are refused with `--format glb`.

**Which file for which engine.** Use the `.tscn` export in Godot: Godot imports the `UBX_`/`UCX_` collision meshes below as ordinary visible meshes. For Blender or engines that don't read Unreal's collision naming, export with `--no-collision` (web: untick **Include collision**), or the collision pieces show up as visible boxes.

## What is in the file

| Godot export | In the .glb |
| --- | --- |
| Node tree (`Floor_NN/Geometry/Walls/ExteriorWalls/OutsideFaces`, …) | The same tree and transforms, in metres, Y-up. Door and elevator scenes are inlined at their instances; hinge pivots (`Hinge`, `Hinge2`), `Panel`, `Curtain`, elevator `Car` and landing door nodes stay separate nodes, so they can be animated. |
| Node names | Unique within the file (a repeat gets `_2`, `_3`, … in traversal order; the original is in `extras.godot_name`), because Unreal matches collision to meshes by node name. See **Re-exporting**: these suffixes are not stable. |
| ArrayMesh surfaces (`OutsideFaces`, `TopFaces`, `Door`, …) | One primitive each, with normals, tangents and UV0 in metres. Each gets a material **named after the surface**, so slots can be bound by name. `Glass` is translucent; the rest are plain grey. Untrimmed box parts (roof slabs, ridge caps, posts, beams, steps) get a material named after their `building_part` (`roof`, `post`, …). |
| `metadata/*` (`building_part`, `building_opening_id`, `building_floor_id`, `building_regions`, `outward_normal`, `door_width`, `leaf_travel`, …) | glTF `extras` on the same node, **with their Godot values unchanged** (metres, Godot axes; see **Units and axes**). Groups are `extras.godot_groups`; non-plain node types are `extras.godot_type` (for example `AnimatableBody3D` on an elevator car). |
| Collision bodies and shapes | Unreal collision meshes (below). Collision nodes themselves are not written. A mesh carrying collision has `extras.collision_pieces` (the number of pieces). |
| `OmniLight3D` | A `KHR_lights_punctual` point light with the colour, range and energy, and `extras.shadow_enabled`. |
| `Marker3D` (openings, `Threshold`, elevator stops and anchors) | Empty nodes with their metadata. |

## Collision for Unreal

Unreal does not read glTF physics extensions, but it does read its own collision naming from glTF: a mesh named `UBX_<node>_NN` becomes a box and `UCX_<node>_NN` a convex hull on the static mesh of node `<node>`. Each collision body is attached to a **carrier**: the nearest mesh in its own subtree, else in its parent's, so a door leaf's collision swings with its `Hinge` and an elevator car's collision rides on `CarMesh`.

| Godot shape | Unreal collision |
| --- | --- |
| `BoxShape3D` | `UBX_` box, rotated as authored |
| `ConvexPolygonShape3D` | `UCX_` hull of its points |
| `ConcavePolygonShape3D` (trimmed roofs, gables, shaped walls, custom door frames) | `UCX_` hulls: coplanar neighbouring triangles are joined into convex polygons and each becomes a 2 cm thick prism on the surface |

A storey's static collision (walls, floor, ceiling, roof, stairs) rides on **one** of that storey's meshes, often its floor slab or `OutsideFaces`. That mesh has `collision_pieces` in its extras, which Unreal keeps as asset metadata (`INTERCHANGE.<node>.collision_pieces`). Replacing or deleting that actor or static mesh in Unreal removes the storey's collision with it; keep it, or move the collision to your replacement.

## Units and axes in Unreal

Unreal converts node transforms on import, but not the values in `extras`. Measured on Unreal Engine 5.8.4 imports (positions agree to 0.05 cm):

| Godot (and the .glb) | Unreal |
| --- | --- |
| metres | centimetres (× 100) |
| +X (east) | +X |
| +Y (up) | +Z |
| −Z (north) / +Z (south) | −Y / +Y |
| Position `(x, y, z)` | `(100x, 100z, 100y)` |
| Yaw about up, θ | Yaw −θ |

So, in Unreal terms:

- `outward_normal` `[x, y, z]` is the Unreal direction `(x, z, y)`: a door in a south wall has `[0, 0, 1]` and faces out along Unreal +Y.
- The `Threshold` marker faces outward along its own local **−Y** (Godot's local −Z).
- Door and elevator door leaves slide along their own local **X** by `leaf_travel` (metres × 100 in Unreal).
- The elevator `Car` moves along Unreal **Z** between the `Stop_NN` actors.
- `building_regions` bounds `minX/maxX` are Unreal X and `minZ/maxZ` are Unreal Y, in metres; `shaft_size` `[width, height, depth]` is local X, Z, Y in metres.
- `door_width`, `door_height` and other lengths in `extras` are metres.

## Importing into Unreal Engine 5

Use **Import Into Level** (Interchange glTF) to get the node tree as actors, or a plain content import for static meshes only. Scale needs no change. Each mesh imports as a static mesh with named material slots, its `UBX_`/`UCX_` simple collision and its `extras` as asset metadata (`INTERCHANGE.<node>.building_part`, …). Unreal rebuilds normals and tangents (MikkTSpace) and keeps the flat shading.

**Every imported actor is Static.** Doors and elevators need their moving parts set to **Movable**, with everything attached below them, before a game script can rotate a `Hinge` or move `Car`. They carry no logic, as in Godot.

`unreal/building_studio_setup.py` does that, and binds materials by slot name: the Unreal counterpart of a [game layer](GAME_LAYER.md)'s `materials`. Run it from the editor's Output Log with the imported building in the level:

```text
py "C:/path/to/godot-building-editor/unreal/building_studio_setup.py" --content /Game/Buildings/smithy --materials C:/path/to/materials.json --light-scale 8
```

- Moving parts (`Hinge`, `Hinge2`, `Panel`, `Curtain`, `Car`, `CarDoorLeft/Right`, `DoorLeft/Right`, with `_2`, `_3` suffixes) and all actors under them become Movable. `--root LABEL` limits it to one imported building.
- `--materials` takes JSON such as `{"OutsideFaces": "/Game/Materials/M_Siding", "TopFaces": "/Game/Materials/M_Planks", "roof": "/Game/Materials/M_Shingles"}` and sets every matching slot of the static meshes under `--content`. Each import otherwise creates its own grey placeholder materials.
- `--light-scale K` multiplies point-light intensities. Unreal reads Godot's light energy as candelas; its own default point light is 8 cd, so `--light-scale 8` maps Godot's default energy to Unreal's default as a starting point. The lights are placeholders either way.

`qa/unreal-import-check.py` runs an import headless and writes a JSON report (material slots, box and convex collision per mesh, metadata, the actor tree with locations, rotations and mobility, lights); see the comment at its top.

## Re-exporting

Re-exporting replaces the whole file, and the `_2`, `_3` suffixes follow traversal order: adding a door can turn one door's `DoorMesh_3` into `DoorMesh_4`. Bind materials by slot name and find objects by `building_*` extras (`building_opening_id`, `building_floor_id`, `building_part`), never by imported mesh or actor names. Set the building's `sceneName` so the `.glb` file name, and so Unreal's import folder, stay put when the building is renamed. Re-run the setup script after each re-import.

## Checks

- `gltf-tests.mjs` (core and cli suites): every catalog example and an elevator building against its own `.tscn`: each mesh node and `building_part`, a material per surface name, every box shape's world centre reproduced by its `UBX_` piece, every concave triangle inside a `UCX_` hull, `collision_pieces` on carriers, unique names, counter-clockwise winding matching the normals, lights, deterministic bytes, and CLI/web parity.
- `gltf-engine-tests.mjs` (engine-assets suite): Godot's own glTF importer reads nine exports back and compares them with the `.tscn` (meshes, world bounds, triangles per surface name, front faces, lights, metadata).
- Unreal Engine 5.8.4 (Windows), checked with `qa/unreal-import-check.py` on the Dirtscape smithy, the farmhouse, `shaped_walls`, `stair_ramp_north` and an elevator building: every `UBX_`/`UCX_` piece became simple collision with no stray actors, every slot was named, every mesh had `building_part`, lights became point lights, door hinges and the elevator car kept their own collision, and the axis table above was read off the actor transforms. `unreal/building_studio_setup.py` was run on the elevator building and `stair_ramp_north`: all 23 moving-part actors became Movable and nothing else, 16 slots were bound, lights were scaled. A render of the smithy shows flat shading. Unreal is not a test dependency; other engines and versions are unverified.
