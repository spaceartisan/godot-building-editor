# Game layer: per-game export setup

> Start with the [README](README.md) (what the tool makes, and its **Scope**: what stays in Godot) and [LLM_GUIDE.md](LLM_GUIDE.md) (workflow, recipes and the export names table). This page is a reference for one part.

Exports keep material slots empty and attach no scripts. That is the default and does not change. A game usually needs the same setup after every re-export, though: materials on named surfaces, render layers, a script on the building and on each door, and extra child scenes in each door. A **game layer** file describes that setup once, and the exporter applies it to every export, so no post-processing script is needed.

- CLI: `node cli.mjs export FILE --out NEW_DIR --game-layer my-game.layer.json` (also `package`).
- Web editor: **Godot Export → Game layer…** loads the same file. The editor remembers it in this browser, shows what it contains, and applies it to **Export Godot package**. **Clear game layer** removes it.

Without a game layer, exports are byte-for-byte unchanged.

## File format (version 1)

```json
{
  "version": 1,
  "materials": {
    "OutsideFaces": "res://materials/siding.tres",
    "InsideFaces": "res://materials/plaster.tres",
    "SideAFaces": "res://materials/plaster.tres",
    "SideBFaces": "res://materials/plaster.tres",
    "Frame": "res://materials/window_frame.tres",
    "Glass": "res://materials/glass.tres",
    "Door": "res://materials/door.tres"
  },
  "layers": [
    {"match": "*ExteriorWalls/OutsideFaces", "layers": 2},
    {"match": "*Roof*", "layers": 2},
    {"match": "*", "layers": 4, "in": "building"},
    {"match": "*", "layers": 6, "in": "doors"}
  ],
  "scripts": {
    "building": "res://scripts/building.gd",
    "door": "res://scripts/door.gd",
    "elevator": "res://scripts/elevator.gd"
  },
  "doorChildren": [
    {"name": "UVResidue", "scene": "res://scenes/uv_residue_receiver.tscn"}
  ]
}
```

All sections are optional.

| Field | What it does |
| --- | --- |
| `materials` | Surface name → material resource. Every exported mesh surface with that name gets the material, in the building scene and in door scenes. Surface names are the ones in the exported meshes: exterior `OutsideFaces`/`InsideFaces`/`EdgeFaces`, interior `SideAFaces`/`SideBFaces`/`EdgeFaces`, slab `TopFaces`/`BottomFaces`/`EdgeFaces`, ceiling `RoomFaces`/`RoofSideFaces`/`EdgeFaces`, roof `RoofFaces`/`RoofSideFaces`, railings `Railing`, window `Frame`/`Glass`, door `Frame`/`Door`/`Hardware`, elevator `ShaftOutside`/`ShaftInside`/`ShaftEdges`, `CarFloor`/`CarWalls`/`CarCeiling` and door leaves `Door`, and so on. Open an export in a text editor and search for `"name":` to list them, or see the export names table in [LLM_GUIDE.md](LLM_GUIDE.md#exported-node-and-file-names) for node names (porches, roofs, ridge caps). Unmapped surfaces keep empty slots; when the layer has a `materials` map, `export`/`package` (and the web editor's export status) print a note listing the named surfaces it leaves without a material (whole-node `nodeMaterials` rules may still cover them). |
| `nodeMaterials` | Ordered rules `{match, surface, material, in}` that set materials on matching `MeshInstance3D` nodes. With `surface`, one surface is overridden (`surface_material_override`); a node without that surface is skipped. Per-room floors and walls with `slabsByRoom`: `{"match": "*FloorSlab_Kitchen", "surface": "TopFaces", "material": "res://materials/quarry_tile.tres"}`, `{"match": "*Faces_Bathroom", "material": "res://materials/wall_tile.tres"}`. **Without `surface`**, the whole node (`material_override`): this is how to colour parts whose surfaces have no name, such as plain gable/shed roof slabs, ridge caps, porch posts and steps (`{"match": "*Roof/*", "material": "res://materials/shingles.tres"}`). `match` works as in `layers`. These take precedence over `materials`. |
| `layers` | Ordered rules that set `layers` (the render layer bitmask, 1–1048575) on `MeshInstance3D` nodes. `match` is a node path pattern relative to the scene root (`*` matches anything, including `/`), for example `Floor_01/Geometry/Walls/ExteriorWalls/OutsideFaces` in the building scene or `Hinge/DoorMesh` in a door scene. The first matching rule wins. `in` limits a rule to the `building` scene or to `doors`. Nodes matched by no rule keep Godot's default layer. |
| `scripts` | `building` is attached to the building scene's root node, `door` to each door scene's root, so every door instance has it (the door's description then names the attached script), and `elevator` to each elevator scene's root. Door children are not added to elevator scenes. |
| `doorChildren` | Scenes instanced as children of every door scene's root, with the given node names. A child such as an interaction area can size itself from the root's `door_width`/`door_height` metadata. A name that collides with an exported door node (`Frame`, `Hinge`, `Hinge2`, `Panel`, `InteractionArea`, …) is an error. |

Paths are `res://` project paths, or paths relative to the exported scene (no `..`). Unknown fields, a wrong version, invalid names or paths, and out-of-range layer masks are errors. The CLI exits with code 2 before writing anything, and the web editor refuses the file with the same message.

## Checking

`godot-check --assets` checks the tool's own output and deliberately rejects scripts and project resources. Run it on a plain export (without `--game-layer`). **Render in Godot** in the web editor likewise renders the plain export. A game-layer export is meant to be opened inside the game project, where the referenced files exist. `game-layer-engine-tests.mjs` (engine suite) loads one in a small Godot project and checks the materials, layers, scripts and door children.
