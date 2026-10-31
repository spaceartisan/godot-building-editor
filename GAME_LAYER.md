# Game layer: per-game export setup

> Start with the [README](README.md) (what the tool makes, and its **Scope**: what stays in Godot) and [LLM_GUIDE.md](LLM_GUIDE.md) (workflow, recipes and the export names table). This page is a reference for one part.

Exports keep material slots empty and attach no scripts. That is the default and does not change. A game usually needs the same setup after every re-export, though: materials on named surfaces, render layers, a script on the building and on each door, and extra child scenes in each door. A **game layer** file describes that setup once, and the exporter applies it to every export, so no post-processing script is needed.

- CLI: `node cli.mjs export FILE --out NEW_DIR --game-layer my-game.layer.json` (also `package`).
- Web editor: **Godot Export → Game layer…** loads the same file. The editor remembers it in this browser, shows what it contains, and applies it to **Export Godot package**. **Clear game layer** removes it.

Without a game layer, exports are byte-for-byte unchanged. Exported surfaces carry normals, tangents and UV1, so normal-mapped and triplanar materials need no post-processing.

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
    {"part": "roof", "layers": 2},
    {"part": "ridge", "layers": 2},
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
| `nodeMaterials` | Ordered rules `{match, part, surface, material, in}` that set materials on matching `MeshInstance3D` nodes. A rule selects nodes by `match` (node path pattern), by `part` (the node's `metadata/building_part`: `roof`, `ridge`, `post`, `beam`, `step`, `floor`, `exterior_wall`, … listed in [LLM_GUIDE.md](LLM_GUIDE.md#exported-node-and-file-names)), or both. `{"part": "post", "material": "res://materials/oak.tres"}` colours every porch post whatever its label. With `surface`, one surface is overridden (`surface_material_override`); a node without that surface is skipped. Per-room floors and walls with `slabsByRoom`: `{"match": "*FloorSlab_Kitchen", "surface": "TopFaces", "material": "res://materials/quarry_tile.tres"}`, `{"match": "*Faces_Bathroom", "material": "res://materials/wall_tile.tres"}`. **Without `surface`**, the whole node (`material_override`): this is how to colour parts whose surfaces have no name, such as plain gable/shed roof slabs, ridge caps, porch posts and steps (`{"part": "roof", "material": "res://materials/shingles.tres"}`). `match` works as in `layers`. These take precedence over `materials`. |
| `layers` | Ordered rules `{match, part, layers, in}` that set `layers` (the render layer bitmask, 1–1048575) on `MeshInstance3D` nodes. `part` selects by `metadata/building_part`, as in `nodeMaterials`. `match` is a node path pattern relative to the scene root (`*` matches anything, including `/`), for example `Floor_01/Geometry/Walls/ExteriorWalls/OutsideFaces` in the building scene or `Hinge/DoorMesh` in a door scene. The first matching rule wins. `in` limits a rule to the `building` scene or to `doors`. Nodes matched by no rule keep Godot's default layer. |
| `scripts` | `building` is attached to the building scene's root node, `door` to each door scene's root, so every door instance has it (the door's description then names the attached script), and `elevator` to each elevator scene's root. Door children are not added to elevator scenes. |
| `groups` | Ordered rules `{match, part, groups, in}` that add Godot groups to matching nodes (any node, not only meshes), keeping the groups the export already gives them. `{"part": "roof", "groups": ["roofs"]}`. The Unreal counterpart is the `unreal` block's `tags`. |
| `unreal` | The same setup for Unreal Engine, below. Ignored by the Godot export. |
| `doorChildren` | Scenes instanced as children of every door scene's root, with the given node names. A child such as an interaction area can size itself from the root's `door_width`/`door_height` metadata. A name that collides with an exported door node (`Frame`, `Hinge`, `Hinge2`, `Panel`, `InteractionArea`, …) is an error. |

Paths are `res://` project paths, or paths relative to the exported scene (no `..`). Unknown fields, a wrong version, invalid names or paths, and out-of-range layer masks are errors. The CLI exits with code 2 before writing anything, and the web editor refuses the file with the same message.

## Unreal Engine: the `unreal` block

One game layer file can carry both engines' setup. Its optional `unreal` block is validated with the rest of the file (CLI `--game-layer`, web **Game layer…**) and applied in Unreal after importing the `.glb` export, by `unreal/building_studio_setup.py --glb FILE --game-layer FILE` ([GLTF.md](GLTF.md)). Paths are Unreal object paths (`/Game/…`, `/Engine/…`, `/Script/Module.Class`; Blueprint classes end in `_C`).

```json
"unreal": {
  "materials": {"OutsideFaces": "/Game/Materials/M_Siding", "Glass": "/Game/Materials/M_Glass"},
  "nodeMaterials": [{"part": "roof", "material": "/Game/Materials/M_Shingles"}],
  "tags": [{"part": "door_leaf", "tags": ["door"]}],
  "collisionProfiles": [{"layer": 4, "profile": "Door"}, {"part": "roof", "profile": "BlockAll"}],
  "scripts": {"door": "/Game/Blueprints/BC_Door.BC_Door_C", "elevator": "/Game/Blueprints/BC_Lift.BC_Lift_C"},
  "doorChildren": [{"name": "Use", "actor": "/Game/Blueprints/BP_Use.BP_Use_C"}]
}
```

| Godot field | Unreal field | In Unreal |
| --- | --- | --- |
| `materials` | `materials` | Every imported mesh slot of that name (on the actor's mesh component) |
| `nodeMaterials` | `nodeMaterials` | Same rules (`match` on the Godot node path, `part`, `surface` = slot name, `in`); without `surface`, every slot of the node |
| `groups` | `tags` | Actor tags. Groups the export gives (`building_lights`, `sight_transparent`, …) always become tags too |
| collision layers from the export profile | `collisionProfiles` | Collision profile on carrier meshes, by node rule or by the Godot collision `layer` bitmask they carry |
| `scripts` | `scripts` | A component of that class added to the building, door and elevator root actors |
| `doorChildren` | `doorChildren` | An actor of that class attached to each door root, labelled `<door>_<name>` |
| `layers` | (none) | Unreal has no render-layer bitmask on meshes; use `tags` |

**Nanite.** Interchange builds every imported mesh as Nanite. The setup script turns Nanite off on any mesh that ends up with a translucent material (the `Glass` placeholder, or a translucent material you bind), because Nanite cannot draw translucency and a cooked build would show the default material. Opaque and masked materials you bind stay on Nanite meshes, so enable **Used with Nanite** on them (or their parent material); otherwise Unreal logs "missing usage flag Nanite" and a cooked build draws the default material. Godot has no Nanite, so nothing corresponds on that side.

A game layer is not applied at glTF export: `export --format glb --game-layer` is refused and points here.

## Checking

`godot-check --assets` checks the tool's own output and deliberately rejects scripts and project resources. Run it on a plain export (without `--game-layer`). **Render in Godot** in the web editor likewise renders the plain export. A game-layer export is meant to be opened inside the game project, where the referenced files exist. `game-layer-engine-tests.mjs` (engine suite) loads one in a small Godot project and checks the materials, layers, scripts and door children.
