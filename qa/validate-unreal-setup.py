# engine-unreal suite: unreal/building_studio_setup.py with a full game-layer
# "unreal" block, in a disposable project (UnrealEditor-Cmd -run=pythonscript).
# Imports each .glb, runs the setup twice and writes per-building facts to
# BUILDING_UNREAL_REPORT: groups as tags, Movable moving parts, door trigger
# boxes, slot and part materials, collision profiles, door and elevator
# components, door children, and that the second run added nothing.
import importlib.util, json, os
import unreal

job = json.load(open(os.environ["BUILDING_UNREAL_JOB"]))
spec = importlib.util.spec_from_file_location("building_studio_setup", job["setup"])
bs = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bs)
layer = job["layer"]
out = {"buildings": {}}
for index, path in enumerate(job["files"]):
    unreal.get_editor_subsystem(unreal.LevelEditorSubsystem).new_level("/Game/SetupCheck/Level_%d" % index)
    params = unreal.ImportAssetParameters()
    params.is_automated = True
    unreal.InterchangeManager.get_interchange_manager_scripted().import_scene("/Game/SetupCheck/%d" % index, unreal.InterchangeManager.create_source_data(path), params)
    first = bs.setup(path, None, layer, 8.0)
    second = bs.setup(path, None, layer, None)
    nodes = bs.glb_nodes(bs.read_glb(path))
    actors = bs.actors_under(nodes[0]["label"])
    c = {"first": first, "second": second, "group_nodes": 0, "group_tagged": 0, "moving": 0, "moving_static": 0, "door_roots": 0, "door_components": 0,
         "door_children": 0, "elevator_roots": 0, "elevator_components": 0, "trigger_nodes": 0, "triggers": 0, "outside_slots": 0, "outside_bound": 0,
         "door_leaves": 0, "door_leaves_bound": 0, "layer4_carriers": 0, "layer4_profiled": 0, "roof_tagged": 0, "roofs": 0}
    material = lambda comp, i: comp.get_material(i).get_path_name() if comp.get_material(i) else ""
    for n in nodes:
        a = actors.get(n["label"])
        if not a:
            continue
        extras = n["extras"]
        groups = extras.get("godot_groups", []) + extras.get("collision_groups", [])
        tags = [str(t) for t in a.tags]
        if groups:
            c["group_nodes"] += 1
            c["group_tagged"] += all(g in tags for g in groups)
        if bs.MOVING.match(n["godot"]):
            stack = [a]
            while stack:
                x = stack.pop()
                c["moving"] += 1
                c["moving_static"] += x.get_editor_property("root_component").get_editor_property("mobility") != unreal.ComponentMobility.MOVABLE
                stack.extend(x.get_attached_actors())
        if n["root"] and n["kind"] == "door":
            c["door_roots"] += 1
            c["door_components"] += a.get_component_by_class(unreal.ArrowComponent) is not None
            c["door_children"] += sum(1 for ch in a.get_attached_actors() if ch.get_actor_label().endswith("_Use") and isinstance(ch, unreal.TargetPoint))
        if n["root"] and n["kind"] == "elevator":
            c["elevator_roots"] += 1
            c["elevator_components"] += a.get_component_by_class(unreal.BillboardComponent) is not None
        if "trigger_size" in extras:
            c["trigger_nodes"] += 1
            c["triggers"] += bs.attached_child(a, n["label"] + "_Trigger") is not None
        if extras.get("building_part") == "roof":
            c["roofs"] += 1
            c["roof_tagged"] += "roofs" in tags
        comp = a.get_component_by_class(unreal.StaticMeshComponent) if n["mesh"] else None
        if comp:
            slots = [str(s) for s in comp.get_material_slot_names()]
            for i, slot in enumerate(slots):
                if slot == "OutsideFaces":
                    c["outside_slots"] += 1
                    c["outside_bound"] += material(comp, i).startswith(layer["unreal"]["materials"]["OutsideFaces"])
            if extras.get("building_part") == "door_leaf":
                c["door_leaves"] += 1
                c["door_leaves_bound"] += all(material(comp, i).startswith("/Engine/EngineMaterials/WorldGridMaterial") for i in range(len(slots)))
            if "collision_pieces" in extras and int(extras.get("collision_layer", 1)) & 4:
                c["layer4_carriers"] += 1
                c["layer4_profiled"] += str(comp.get_collision_profile_name()) == "BlockAllDynamic"
    out["buildings"][os.path.basename(path)] = c
with open(os.environ["BUILDING_UNREAL_REPORT"], "w") as fh:
    json.dump(out, fh, indent=1, default=str)
