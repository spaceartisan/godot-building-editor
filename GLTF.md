# Unreal Engine: glTF export, setup and checks

> Start with the [README](README.md) (what the tool makes, and its **Scope**) and [LLM_GUIDE.md](LLM_GUIDE.md). This page is a reference for one part.

Building Studio serves Godot and Unreal Engine 5 alike. Godot gets `.tscn` scenes; Unreal gets the same building as one glTF 2.0 binary (`.glb`), a setup script that does in Unreal what the export and a [game layer](GAME_LAYER.md) do in Godot, and the same checks and renders:

| Godot | Unreal Engine 5 |
| --- | --- |
| `export` (`.tscn` scenes) | `export --format glb` (web **Export .glb**) |
| `--game-layer FILE`, applied at export | the same file's `unreal` block, applied after import by `unreal/building_studio_setup.py` |
| `export --out PROJECT/buildings/NAME --replace` (Godot imports the scenes it finds) | `unreal-import FILE.glb --project P.uproject --content /Game/… --level /Game/… --replace` |
| `godot-check --assets DIR` | `unreal-check --assets DIR` |
| `godot-check --render`, web **Render in Godot** | `unreal-check --render`, web **Render in Unreal** |
| `engine-assets` test suite, `GODOT_BIN` | `engine-unreal` test suite, `UNREAL_BIN` |

Godot render layers (`layers` rules) have no Unreal counterpart: Unreal has no render-layer bitmask on meshes. Use `tags` rules there instead.

**Which file for which engine.** Use the `.tscn` export in Godot: Godot imports the `UBX_`/`UCX_` collision meshes below as ordinary visible meshes. For Blender or engines that don't read Unreal's collision naming, export with `--no-collision` (web: untick **Include collision**).

## Export

- CLI: `node cli.mjs export FILE --format glb --out NEW_DIR` writes `NEW_DIR/<name>.glb`, where `<name>` is the building's `sceneName` (`building.update`), else its name with every run of characters other than letters and digits turned into `_` and lower-cased (as for `.tscn` files). `package --format glb` zips one per input. `--no-collision`, `--no-markers`, `--placeholders`, `--profile`, `--replace`, `--include-json` and batches work as for `.tscn`. `--game-layer` is refused: apply the game layer in Unreal (below).
- Web editor: **Export .glb** beside **Export .tscn ZIP**, with the Godot Export panel's **Include collision**, **Include placeholder colors** and **Opening Marker3D helpers** settings.

Both call the same code (`src/gltf-export.js`). It reads the exporter's own building, door and elevator scenes, so the `.glb` holds exactly the geometry the `.tscn` holds, and `.tscn` output is unaffected.

| Godot export | In the .glb |
| --- | --- |
| Node tree (`Floor_NN/Geometry/Walls/ExteriorWalls/OutsideFaces`, …) | The same tree and transforms, in metres, Y-up. Door and elevator scenes are inlined at their instances; hinge pivots (`Hinge`, `Hinge2`), `Panel`, `Curtain`, elevator `Car` and landing door nodes stay separate nodes, so they can be animated. |
| Node names | Unique within the file (a repeat gets `_2`, `_3`, … in traversal order; the original is in `extras.godot_name`), because Unreal matches collision to meshes by node name. See **Re-exporting**: these suffixes are not stable. |
| ArrayMesh surfaces (`OutsideFaces`, `TopFaces`, `Door`, …) | One primitive each, with normals, tangents and UV0 in metres. Each gets a material **named after the surface**, so slots can be bound by name. `Glass` is translucent; the rest are plain grey, or the Godot placeholder colours with `--placeholders`. Untrimmed box parts (roof slabs, ridge caps, posts, beams, steps) get a material named after their `building_part` (`roof`, `post`, …). |
| `metadata/*` (`building_part`, `building_opening_id`, `building_floor_id`, `building_regions`, `outward_normal`, `door_width`, `leaf_travel`, …) | glTF `extras` on the same node, **with their Godot values unchanged** (metres, Godot axes; see **Units and axes**). Groups are `extras.godot_groups`; non-plain node types are `extras.godot_type` (for example `AnimatableBody3D` on an elevator car). |
| Collision bodies and shapes | Unreal collision meshes (below); collision nodes themselves are not written. A mesh carrying collision has `extras.collision_pieces`, `collision_layer` and `collision_mask` (the body's Godot layers) and `collision_groups` (groups of the shapes it carries, such as a window's `sight_transparent`). |
| GET PROBED door `InteractionArea` (`Area3D`) | An empty node with `extras.trigger_center` and `trigger_size` (its box, metres) and its collision layers; the setup script makes it a `TriggerBox`. |
| `OmniLight3D` | A `KHR_lights_punctual` point light with the colour, range and energy, and `extras.shadow_enabled`. |
| `Marker3D` (openings, `Threshold`, elevator stops and anchors) | Empty nodes with their metadata. |

## Collision for Unreal

Unreal does not read glTF physics extensions, but it does read its own collision naming from glTF: a mesh named `UBX_<node>_NN` becomes a box and `UCX_<node>_NN` a convex hull on the static mesh of node `<node>`. Unreal first looks for a mesh named exactly `<node>_NN` and only then strips `_NN`, so the export never names a node `<node>_NN` for one of its pieces: in a tall building the tenth copy of `FloorSlab_Stairwell` is `FloorSlab_Stairwell_11` when storey 1's slab carries a piece `_10`. Each collision shape rides on a **carrier** mesh:

- A shape named after a mesh (`Window_001_Window_Collision`, `Porch_001_…_Post_002_Collision`, `Roof_001_North_Collision`, …) rides on that mesh, so a window, post or roof slab carries its own collision and groups.
- A storey's wall, floor, ceiling and gable shapes ride on that storey's first mesh of the same part: exterior walls on `OutsideFaces`, partitions on `SideAFaces`, the floor on `FloorSlab`, the ceiling on `Ceiling` (with `slabsByRoom`, one of the room meshes). So each carrier holds one part's collision, and a collision profile or hiding by part reaches only that part (before, they all rode on one mesh of the storey, often its floor slab).
- Other shapes ride on the nearest mesh to their body: a door leaf's collision swings with its `Hinge`, and an elevator car's rides on `CarMesh`.

| Godot shape | Unreal collision |
| --- | --- |
| `BoxShape3D` | `UBX_` box, rotated as authored |
| `ConvexPolygonShape3D` | `UCX_` hull of its points |
| `ConcavePolygonShape3D` (trimmed roofs, gables, shaped walls, custom door frames) | `UCX_` hulls: coplanar neighbouring triangles are joined into convex polygons and each becomes a 2 cm thick prism on the surface |

Every carrier has `collision_pieces` in its extras, which Unreal keeps as asset metadata (`INTERCHANGE.<node>.collision_pieces`). Replacing or deleting a carrier actor or static mesh in Unreal removes that collision with it; keep it, or move the collision to your replacement.

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
- `building_regions` bounds `minX/maxX` are Unreal X and `minZ/maxZ` are Unreal Y, in metres; `shaft_size` `[width, height, depth]` is local X, Z, Y in metres; `trigger_center` and `trigger_size` follow the same swap.
- `door_width`, `door_height` and other lengths in `extras` are metres.

## Importing and setting up in Unreal Engine 5

Use **Import Into Level** (Interchange glTF) to get the node tree as actors. Scale needs no change. Each mesh imports as a static mesh with named material slots, its `UBX_`/`UCX_` simple collision and its `extras` as asset metadata (`INTERCHANGE.<node>.building_part`, …). Unreal rebuilds normals and tangents (MikkTSpace) and keeps the flat shading. **Every imported actor is Static**, and Unreal keeps no extras on actors.

Then run `unreal/building_studio_setup.py` from the editor's Output Log. It reads the `.glb` for each node's data (actors are matched by label, the unique node names) and applies the game layer's `unreal` block:

```text
py "C:/path/to/godot-building-editor/unreal/building_studio_setup.py" --glb C:/path/to/smithy.glb --game-layer C:/path/to/game.layer.json --light-scale 8
```

Always, as the Godot export does:

- moving parts (`Hinge`, `Hinge2`, `Panel`, `Curtain`, `Car`, `CarDoorLeft/Right`, `DoorLeft/Right`) and everything attached below them become **Movable**, so a game script can rotate a `Hinge` or move `Car` (they carry no logic, as in Godot);
- Godot groups (`building_lights`, `sight_transparent`, profile groups, groups of carried collision shapes) become **actor tags**;
- each GET PROBED door `InteractionArea` becomes a **`TriggerBox`** child actor of its size;
- **Nanite is turned off on meshes with a translucent material** (window glass, or a translucent material from the game layer). Interchange imports every mesh as Nanite, and Nanite cannot draw translucency: Unreal logs "Invalid material [Glass] used on Nanite static mesh" and a cooked build shows the default material. Game-layer materials on the other meshes must have **Used with Nanite** enabled (GAME_LAYER.md). Godot has no Nanite: nothing to do there.

From the game layer's `unreal` block ([GAME_LAYER.md](GAME_LAYER.md)): slot materials, `nodeMaterials` rules, `tags` rules, `collisionProfiles` rules (by node, or by collision layer: the one the game layer's top-level `collision` rules give the carrier's part, else the exported Godot layer), `scripts` (a component class added to the building, door and elevator roots) and `doorChildren` (actors attached to each door root). Each import otherwise creates its own grey placeholder materials. `--root LABEL` picks the imported root actor when the name is ambiguous; `--materials FILE` is a shorthand for `{"slot": "/Game/…"}`. `--light-scale K` multiplies point-light intensities: Unreal reads Godot's light energy as candelas and its own default point light is 8 cd, so `--light-scale 8` maps Godot's default energy to Unreal's default as a starting point. Running it again adds nothing twice. Validate the game layer with the CLI first (`node cli.mjs export FILE --out DIR --game-layer FILE`).

## Importing into an existing project from a script

`unreal-import` does the import and setup above headless, for an existing project and level: it opens the level, imports the `.glb` into a content folder (Interchange **Import Into Level**), places the building, runs the setup script and saves the level and assets. Close the project in the editor first (Unreal cannot open a project twice).

```text
node cli.mjs unreal-import party_palace.glb --project C:/Games/Town/Town.uproject --content /Game/Buildings/party_palace --level /Game/Maps/Town --location 5000,2000,0 --yaw 90 --replace [--game-layer game.layer.json] [--light-scale 8]
```

- `--location X,Y,Z` places the building root in Unreal centimetres (Unreal axes: X forward, Y right, Z up; see above); `--yaw` turns it about Z in degrees. Both default to 0.
- `--level` is the level to import into (a saved `/Game/…` level; required).
- `--replace` first removes earlier copies of this building from the level (the actors under each root with its name, from Interchange's `<file>_scene_0` actor down) and deletes the `--content` folder, so re-running after a re-export leaves one copy. Without it a second import adds a second copy. Other actors in the level are kept.
- `--game-layer` is validated by the CLI before Unreal starts and applied as by the setup script.
- It needs `--unreal PATH` or `UNREAL_BIN`, as `unreal-check`. The JSON result (`--json`) has the root actor, actor count, removed count and the setup report; exit 1 if the setup reports missing materials or classes.

The same script runs from the editor's Output Log on the open project, where it imports into the level that is open unless `--level` is given:

```text
py "C:/path/to/godot-building-editor/unreal/building_studio_import.py" --glb C:/path/party_palace.glb --content /Game/Buildings/party_palace --location 5000,2000,0 --yaw 90 --replace
```

Use forward slashes in paths given to `py`: Unreal's Python command line reads backslashes as escapes. In Git Bash, set `MSYS_NO_PATHCONV=1` before commands with `/Game/…` arguments, or Git Bash rewrites them into Windows paths (`cmd`, PowerShell and Linux shells pass them as they are).

In the web editor, **Export .glb** and run the same script from the Output Log; a browser cannot open a local Unreal project, just as the web Godot export downloads scenes rather than writing into a Godot project.

The Godot counterpart: `export --out PROJECT/buildings/NAME --replace` writes the scenes inside the Godot project, which imports them when the editor next has focus; instance the building scene in a level as usual.

## Checking and rendering in Unreal

`unreal-check` is the Unreal counterpart of `godot-check --assets`. It needs Unreal Engine 5 (`--unreal PATH` or `UNREAL_BIN`, either editor binary; nothing is downloaded) and imports each `.glb` of a folder into a disposable project (each into its own level, probed through its own imported actors, so several buildings in one folder cannot stand in for each other), runs the setup script without a game layer, and checks:

- every mesh node became a static mesh actor with the same named slots, and `building_part` reached the mesh assets;
- every `UBX_`/`UCX_` piece became simple collision on its carrier, with none left as an actor;
- lights became point lights, moving parts are Movable, door trigger boxes exist;
- no Nanite mesh has a translucent material;
- elevator probes, as `godot-check` runs them: with the car moved to each stop a downward trace finds the car floor at the stop height; each closed landing leaf blocks its half of the opening (one ray through each leaf's centre); with the landing and car doors slid open by `leaf_travel`, no door leaf blocks the way into the car.

```text
node cli.mjs unreal-check --assets NEW_DIR --require-collision
node cli.mjs unreal-check --assets NEW_DIR --render --out RENDERS [--views FILE] [--surface-colors] [--replace]
```

`--render` writes 1280 × 800 PNGs and `renders.json` with the same views as `godot-check --render` (four exterior diagonals, an aerial view and one eye-level view per labelled region, its eye moved out of collision; `--views` takes the same Godot-space file). It opens the Unreal editor (it needs a display) and adds only a sun, sky light, atmosphere, a light height fog and a camera headlamp; the template level's ground, sky and lights are removed, so buildings render on a plain sky as in Godot. `--surface-colors` uses Godot's diagnostic surface colours. In the web editor, **Render in Unreal** renders the current `.glb` export the same way through `server.mjs` started with `UNREAL_BIN`. The first run on a machine compiles shaders and takes longer.

`qa/unreal-import-check.py` remains as a manual report script (slots, collision, metadata, the actor tree with locations, rotations and mobility, lights).

## Re-exporting

Re-exporting replaces the whole file, and the `_2`, `_3` suffixes follow traversal order: adding a door can turn one door's `DoorMesh_3` into `DoorMesh_4`. Bind materials by slot name and find objects by `building_*` extras (`building_opening_id`, `building_floor_id`, `building_part`) or tags, never by imported mesh or actor names. Set the building's `sceneName` so the `.glb` file name, and so Unreal's import folder, stay put when the building is renamed. Re-run the setup script after each re-import, or use `unreal-import --replace`, which re-imports and sets up in one step.

## Checks of this route

- `gltf-tests.mjs` (core and cli suites): every catalog example and an elevator building against its own `.tscn`: each mesh node and `building_part`, a material per surface name, every box shape's world centre reproduced by its `UBX_` piece, every concave triangle inside a `UCX_` hull, `collision_pieces` on carriers, placeholder colours, collision layers and trigger boxes, unique names, counter-clockwise winding matching the normals, lights, deterministic bytes, and CLI/web parity.
- `unreal-cli-tests.mjs` (core and cli suites, no Unreal needed): `unreal-check` and `unreal-import` usage and dependency errors, its default views, the game layer's `unreal` block and `groups` rules, the server's Unreal endpoints and the web **Render in Unreal** request.
- `gltf-engine-tests.mjs` (engine-assets suite): Godot's own glTF importer reads nine exports back and compares them with the `.tscn`.
- `unreal-engine-tests.mjs` (engine-unreal suite, `UNREAL_BIN`): `unreal-check` passes four buildings (including the elevator probes) and fails a collision-less one; the setup script applies a full `unreal` block and adds nothing on a second run; `unreal-import` places a building in a saved level at a location and yaw, and `--replace` leaves one copy and the level's own actors; `unreal-check --render` writes every view. `release-check` runs it as the `engine-unreal` gate (`--unreal-engine auto|required|skip`, `--unreal PATH`).
- Checked on Unreal Engine 5.8.4 on Windows; other engines and Unreal versions are unverified.
