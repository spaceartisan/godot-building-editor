# Game layer: per-game export setup

> Start with the [README](README.md) (what the tool makes, and its **Scope**: what stays in Godot) and [LLM_GUIDE.md](LLM_GUIDE.md) (workflow, recipes and the export names table). This page is a reference for one part.

Exports keep material slots empty and attach no scripts. That is the default and does not change. A game usually needs the same setup after every re-export, though: materials on named surfaces, render layers, physics layers by part, a script on the building and on each door, and extra child scenes in each door. A **game layer** file describes that setup once, and the exporter applies it to every export, so no post-processing script is needed.

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
  "collision": [
    {"part": "floor", "layer": 1},
    {"part": "exterior_wall", "layer": 2},
    {"part": "interior_wall", "layer": 2}
  ],
  "scripts": {
    "building": "res://scripts/building.gd",
    "door": "res://scripts/door.gd",
    "elevator": "res://scripts/elevator.gd"
  },
  "doorChildren": [
    {"name": "UVResidue", "scene": "res://scenes/uv_residue_receiver.tscn"},
    {"name": "Parts", "scene": "res://scenes/door_parts_double.tscn", "door": {"leaves": 2}},
    {"name": "Parts", "scene": "res://scenes/door_parts.tscn"}
  ]
}
```

All sections are optional.

| Field | What it does |
| --- | --- |
| `materials` | Surface name → material resource. Every exported mesh surface with that name gets the material, in the building scene and in door scenes. Surface names are the ones in the exported meshes: exterior `OutsideFaces`/`InsideFaces`/`EdgeFaces`, interior `SideAFaces`/`SideBFaces`/`EdgeFaces`, slab `TopFaces`/`BottomFaces`/`EdgeFaces`, ceiling `RoomFaces`/`RoofSideFaces`/`EdgeFaces`, roof `RoofFaces`/`RoofSideFaces`, railings `Railing`, window `Frame`/`Glass`, door `Frame`/`Door`/`Hardware`, elevator `ShaftOutside`/`ShaftInside`/`ShaftEdges`, `CarFloor`/`CarWalls`/`CarCeiling` and door leaves `Door`, and so on. Open an export in a text editor and search for `"name":` to list them, or see the export names table in [LLM_GUIDE.md](LLM_GUIDE.md#exported-node-and-file-names) for node names (porches, roofs, ridge caps). Unmapped surfaces keep empty slots; when the layer has a `materials` map, `export`/`package` (and the web editor's export status) print a note listing the named surfaces it leaves without a material (whole-node `nodeMaterials` rules may still cover them). |
| `nodeMaterials` | Ordered rules `{match, part, surface, material, in}` that set materials on matching `MeshInstance3D` nodes. A rule selects nodes by `match` (node path pattern), by `part` (the node's `metadata/building_part`: `roof`, `ridge`, `post`, `beam`, `step`, `floor`, `exterior_wall`, … listed in [LLM_GUIDE.md](LLM_GUIDE.md#exported-node-and-file-names)), or both. `{"part": "post", "material": "res://materials/oak.tres"}` colours every porch post whatever its label. With `surface`, one surface is overridden (`surface_material_override`); a node without that surface is skipped. Per-room floors and walls with `slabsByRoom`: `{"match": "*FloorSlab_Kitchen", "surface": "TopFaces", "material": "res://materials/quarry_tile.tres"}`, `{"match": "*Faces_Bathroom", "material": "res://materials/wall_tile.tres"}`. **Without `surface`**, the whole node (`material_override`): this is how to colour parts whose surfaces have no name, such as plain gable/shed roof slabs, ridge caps, porch posts and steps (`{"part": "roof", "material": "res://materials/shingles.tres"}`). `match` works as in `layers`. These take precedence over `materials`. A rule with a `door` filter applies only in the door scenes it fits (see **Door filters** below), for example a material whose UVs suit wide doors: `{"part": "door_leaf", "material": "res://materials/door_wide.tres", "door": {"minWidth": 1.2}}` before the general door rule. |
| `layers` | Ordered rules `{match, part, layers, in}` that set `layers` (the render layer bitmask, 1–1048575) on `MeshInstance3D` nodes. `part` selects by `metadata/building_part`, as in `nodeMaterials`. `match` is a node path pattern relative to the scene root (`*` matches anything, including `/`), for example `Floor_01/Geometry/Walls/ExteriorWalls/OutsideFaces` in the building scene or `Hinge/DoorMesh` in a door scene. The first matching rule wins. `in` limits a rule to the `building` scene or to `doors`. Nodes matched by no rule keep Godot's default layer. |
| `collision` | Ordered rules `{part, layer, mask, in}` that set physics layers by part (`layer` 1–4294967295, `mask` 0–4294967295; without `mask` the body keeps its mask). The first rule whose `part` fits wins. Each floor exports one `Collision` body holding its walls, floor, ceiling, gables, roof slabs, windows, posts and so on: shapes whose part a rule names move to a sibling `StaticBody3D` named `Collision_Layer<N>` with that layer and mask (`Collision_Layer<N>_Mask<M>` when two rules share a layer with different masks), and the rest stay in `Collision`. The building-level `ManualRoofCollision`, `ManualFloorCollision` and `ManualCeilingCollision` bodies split the same way. Bodies of their own part get the layer in place: `stair` (`WalkableRamp`), `stair_blocker` (`UnderStairBlocker`), `door_leaf` and `door_frame` in door scenes, `elevator_car`, `elevator_door` and `elevator_shaft` in elevator scenes. `{"part": "exterior_wall", "layer": 2}` with `{"part": "floor", "layer": 1}` lets an agent with mask 1 pass through walls but not fall through floors. Shaped-wall collision is one shape per floor for all its shaped walls and counts as `exterior_wall`. Rules select by part only, so the Unreal setup can apply them to the same parts. The `metadata/building_part` values are in [LLM_GUIDE.md](LLM_GUIDE.md#exported-node-and-file-names). |
| `scripts` | `building` is attached to the building scene's root node, `door` to each door scene's root, so every door instance has it (the door's description then names the attached script), and `elevator` to each elevator scene's root. Door children are not added to elevator scenes. |
| `groups` | Ordered rules `{match, part, groups, in}` that add Godot groups to matching nodes (any node, not only meshes), keeping the groups the export already gives them. `{"part": "roof", "groups": ["roofs"]}`. The Unreal counterpart is the `unreal` block's `tags`. |
| `unreal` | The same setup for Unreal Engine, below. Ignored by the Godot export. |
| `doorChildren` | Scenes instanced as children of every door scene's root, with the given node names. A child such as an interaction area can size itself from the root's `door_width`/`door_height` metadata. A name that collides with an exported door node (`Frame`, `Hinge`, `Hinge2`, `Panel`, `InteractionArea`, …) is an error. With a `door` filter, a child goes only to the doors it fits. Several entries may share a name when the earlier ones have a filter: each door gets the first that fits, so a double-door animation scene (`"door": {"leaves": 2}`) can come before the single-door one. |

**Door filters.** `nodeMaterials` rules and `doorChildren` entries (and the same fields in the `unreal` block) take an optional `door` object: `leaves` (1 or 2), `style` (`exterior`, `room`, `closet`, `rollup`, `custom`, or a list of them) and `minWidth`/`maxWidth` (metres, inclusive), all optional but at least one. It matches the door scene's root metadata `door_leaves`, `door_style` and `door_width`, so it applies only in door scenes. Door panel UVs follow the panel's size, so one material looks stretched differently on a 0.95 m door and a 1.5 m double door; a width filter gives each size its own material.

Paths are `res://` project paths, or paths relative to the exported scene (no `..`). Unknown fields, a wrong version, invalid names or paths, and out-of-range layer masks are errors. The CLI exits with code 2 before writing anything, and the web editor refuses the file with the same message.

## Unreal Engine: the `unreal` block

One game layer file can carry both engines' setup. Its optional `unreal` block is validated with the rest of the file (CLI `--game-layer`, web **Game layer…**) and applied in Unreal after importing the `.glb` export, by `unreal/building_studio_setup.py --glb FILE --game-layer FILE` ([GLTF.md](GLTF.md)). Paths are Unreal object paths (`/Game/…`, `/Engine/…`, `/Script/Module.Class`; Blueprint classes end in `_C`).

```json
"unreal": {
  "materials": {"OutsideFaces": "/Game/Materials/M_Siding", "Glass": "/Game/Materials/M_Glass"},
  "nodeMaterials": [{"part": "roof", "material": "/Game/Materials/M_Shingles"}],
  "tags": [{"part": "door_leaf", "tags": ["door"]}],
  "collisionProfiles": [{"layer": 4, "profile": "Door"}, {"layer": 2, "profile": "Wall"}, {"part": "roof", "profile": "BlockAll"}],
  "scripts": {"door": "/Game/Blueprints/BC_Door.BC_Door_C", "elevator": "/Game/Blueprints/BC_Lift.BC_Lift_C"},
  "doorChildren": [{"name": "Use", "actor": "/Game/Blueprints/BP_Use.BP_Use_C"}, {"name": "Pair", "actor": "/Game/Blueprints/BP_Pair.BP_Pair_C", "door": {"leaves": 2}}]
}
```

| Godot field | Unreal field | In Unreal |
| --- | --- | --- |
| `materials` | `materials` | Every imported mesh slot of that name (on the actor's mesh component) |
| `nodeMaterials` | `nodeMaterials` | Same rules (`match` on the Godot node path, `part`, `surface` = slot name, `in`, `door`); without `surface`, every slot of the node |
| `groups` | `tags` | Actor tags. Groups the export gives (`building_lights`, `sight_transparent`, …) always become tags too |
| `collision` (top level, read by both engines) | `collisionProfiles` | Collision profile on carrier meshes, by node rule or by `layer`: the layer the top-level `collision` rules give the carrier's part, else the Godot layer the export carries. In the `.glb` each wall, floor, ceiling and gable piece rides on a mesh of its own part (`OutsideFaces`, `SideAFaces`, `FloorSlab`, `Ceiling`, …), so `{"layer": 2, "profile": "Wall"}` reaches the walls only |
| `scripts` | `scripts` | A component of that class added to the building, door and elevator root actors |
| `doorChildren` | `doorChildren` | An actor of that class attached to each door root, labelled `<door>_<name>`; a `door` filter as in Godot |
| `layers` | (none) | Unreal has no render-layer bitmask on meshes; use `tags` |

**Nanite.** Interchange builds every imported mesh as Nanite. The setup script turns Nanite off on any mesh that ends up with a translucent material (the `Glass` placeholder, or a translucent material you bind), because Nanite cannot draw translucency and a cooked build would show the default material. Opaque and masked materials you bind stay on Nanite meshes, so enable **Used with Nanite** on them (or their parent material); otherwise Unreal logs "missing usage flag Nanite" and a cooked build draws the default material. Godot has no Nanite, so nothing corresponds on that side.

A game layer is not applied at glTF export: `export --format glb --game-layer` is refused and points here.

## Checking

`godot-check --assets` checks the tool's own output and deliberately rejects scripts and project resources. Run it on a plain export (without `--game-layer`). **Render in Godot** in the web editor likewise renders the plain export. A game-layer export is meant to be opened inside the game project, where the referenced files exist. `game-layer-engine-tests.mjs` (engine suite) loads one in a small Godot project and checks the materials, layers, scripts and door children, and casts physics rays to check that walls and floors answer only on their own collision layers. The Unreal engine suite runs the setup script with the same `collision` rules and checks the profiles on wall and floor carriers and door-filtered children.
