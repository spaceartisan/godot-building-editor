# Unreal Engine setup for a Building Studio .glb after "Import Into Level": the
# Unreal side of a game layer (GAME_LAYER.md, its "unreal" block) plus what
# Godot scenes get at export. See GLTF.md. Run it in the editor's Output Log
# with the imported building in the level:
#
#   py "C:/path/to/unreal/building_studio_setup.py" --glb C:/path/to/smithy.glb --game-layer C:/path/to/game.layer.json
#
# --glb FILE         The imported .glb. Unreal keeps glTF extras only on mesh
#                    assets, so node data (groups, parts, collision layers,
#                    trigger boxes, door and elevator roots) is read from it.
#                    Actors are matched by label: the .glb node names are unique.
# --root LABEL       The imported root actor (default: the .glb root node's name).
# --game-layer FILE  A game layer; its "unreal" block is applied (validate it
#                    first with the CLI: node cli.mjs export ... --game-layer FILE).
# --materials FILE   Shorthand: JSON {"slot name": "/Game/Material/Path"}.
# --light-scale K    Multiply imported point-light intensities by K.
#
# Always, as in the Godot export:
# - moving parts (Hinge, Hinge2, Panel, Curtain, Car, car and landing door
#   leaves) and everything attached below them become Movable;
# - Godot groups (building_lights, sight_transparent, ...) become actor tags,
#   including groups of the collision shapes a mesh carries;
# - each door InteractionArea (GET PROBED) becomes a TriggerBox child actor.
# From the "unreal" block: materials by slot, nodeMaterials rules, tags rules,
# collisionProfiles rules, scripts (a component class added to the building,
# door and elevator roots) and doorChildren (actors attached to each door root).
# Running it again does not duplicate tags, triggers, components or children.
import argparse, fnmatch, json, re, struct, sys
import unreal

MOVING = re.compile(r"^(Hinge2?|Panel|Curtain|Car|CarDoorLeft|CarDoorRight|DoorLeft|DoorRight)$")

def read_glb(path):
    with open(path, "rb") as fh:
        data = fh.read()
    magic, version, _ = struct.unpack_from("<III", data, 0)
    if magic != 0x46546C67 or version != 2:
        raise ValueError("Not a glTF 2 binary: %s" % path)
    length, kind = struct.unpack_from("<II", data, 12)
    if kind != 0x4E4F534A:
        raise ValueError("First GLB chunk is not JSON")
    return json.loads(data[20:20 + length])

def glb_nodes(gltf):
    # Each node with its Godot name, extras, scene kind and path inside its scene
    # (the building, or a door or elevator scene), as game-layer rules see it.
    nodes = gltf["nodes"]
    out = []
    def walk(index, scene_kind, scene_path, parent):
        node = nodes[index]
        extras = node.get("extras", {})
        godot = extras.get("godot_name", node["name"])
        kind, path = scene_kind, scene_path
        if parent is not None and "door_style" in extras:
            kind, path = "door", "."
        elif parent is not None and "building_elevator_id" in extras:
            kind, path = "elevator", "."
        elif parent is None:
            path = "."
        else:
            path = godot if scene_path == "." else scene_path + "/" + godot
        entry = {"label": node["name"], "godot": godot, "extras": extras, "kind": kind, "path": path,
                 "root": path == ".", "mesh": "mesh" in node, "parent": parent}
        out.append(entry)
        for child in node.get("children", []):
            if not nodes[child]["name"].startswith(("UBX_", "UCX_")):
                walk(child, kind, path, entry)
    walk(gltf["scenes"][0]["nodes"][0], "building", ".", None)
    return out

def selects(rule, node):
    scope = rule.get("in")
    if scope and scope != ("doors" if node["kind"] == "door" else "building"):
        return False
    if "match" in rule and not fnmatch.fnmatchcase(node["path"], rule["match"].replace("[", "[[]")):
        return False
    if "part" in rule and rule["part"] != node["extras"].get("building_part"):
        return False
    return True

def actors_under(root_label):
    actors = unreal.get_editor_subsystem(unreal.EditorActorSubsystem).get_all_level_actors()
    roots = [a for a in actors if a.get_actor_label() == root_label]
    if not roots:
        raise ValueError("No actor labelled %s in the level; pass --root" % root_label)
    by_label = {}
    def walk(actor):
        by_label.setdefault(actor.get_actor_label(), actor)
        for child in actor.get_attached_actors():
            walk(child)
    walk(roots[0])
    return by_label

def make_movable(actor):
    changed = 0
    stack = [actor]
    while stack:
        a = stack.pop()
        root = a.get_editor_property("root_component")
        if root and root.get_editor_property("mobility") != unreal.ComponentMobility.MOVABLE:
            root.set_mobility(unreal.ComponentMobility.MOVABLE)
            changed += 1
        stack.extend(a.get_attached_actors())
    return changed

def add_tags(actor, tags):
    have = [str(t) for t in actor.tags]
    new = [t for t in tags if t not in have]
    if new:
        actor.tags = list(actor.tags) + [unreal.Name(t) for t in new]
    return len(new)

def load_material(path, cache):
    if path not in cache:
        material = unreal.EditorAssetLibrary.load_asset(path)
        if not isinstance(material, unreal.MaterialInterface):
            raise ValueError("Not a material: %s" % path)
        cache[path] = material
    return cache[path]

def to_unreal(v, scale=100.0):
    # Godot/glTF (x, y up, z) metres -> Unreal (x, y, z up) centimetres.
    return unreal.Vector(v[0] * scale, v[2] * scale, v[1] * scale)

def attached_child(parent, label):
    for child in parent.get_attached_actors():
        if child.get_actor_label() == label:
            return child
    return None

def add_component(actor, class_path):
    cls = unreal.load_class(None, class_path)
    if cls is None:
        raise ValueError("Unknown component class: %s" % class_path)
    if any(c.get_class() == cls for c in actor.get_components_by_class(unreal.ActorComponent)):
        return False
    subsystem = unreal.get_engine_subsystem(unreal.SubobjectDataSubsystem)
    handles = subsystem.k2_gather_subobject_data_for_instance(actor)
    params = unreal.AddNewSubobjectParams(parent_handle=handles[0], new_class=cls, blueprint_context=None)
    _, fail = subsystem.add_new_subobject(params)
    if not fail.is_empty():
        raise ValueError("Could not add %s to %s: %s" % (class_path, actor.get_actor_label(), fail))
    return True

def setup(glb, root=None, layer=None, light_scale=None):
    gltf = read_glb(glb)
    nodes = glb_nodes(gltf)
    actors = actors_under(root or nodes[0]["label"])
    unreal_layer = (layer or {}).get("unreal", {})
    report = {"movable": 0, "tags": 0, "slots": 0, "profiles": 0, "triggers": 0, "components": 0, "children": 0, "lights": 0, "missing": []}
    materials = {}
    actor_space = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
    for node in nodes:
        actor = actors.get(node["label"])
        if actor is None:
            report["missing"].append(node["label"])
            continue
        extras = node["extras"]
        if MOVING.match(node["godot"]):
            report["movable"] += make_movable(actor)
        # Groups on the node, and on the collision shapes this mesh carries (window sight_transparent, ...).
        tags = list(extras.get("godot_groups", [])) + list(extras.get("collision_groups", []))
        for rule in unreal_layer.get("tags", []):
            if selects(rule, node):
                tags += rule["tags"]
        report["tags"] += add_tags(actor, tags)
        component = actor.get_component_by_class(unreal.StaticMeshComponent) if node["mesh"] else None
        if component:
            slots = [str(s) for s in component.get_material_slot_names()]
            for index, slot in enumerate(slots):
                path = unreal_layer.get("materials", {}).get(slot)
                if path:
                    component.set_material(index, load_material(path, materials))
                    report["slots"] += 1
            for rule in unreal_layer.get("nodeMaterials", []):
                if selects(rule, node):
                    for index, slot in enumerate(slots):
                        if rule.get("surface") in (None, slot):
                            component.set_material(index, load_material(rule["material"], materials))
                            report["slots"] += 1
            if "collision_pieces" in extras:
                for rule in unreal_layer.get("collisionProfiles", []):
                    by_layer = "layer" not in rule or (rule["layer"] & int(extras.get("collision_layer", 1)))
                    by_node = ("match" not in rule and "part" not in rule) or selects(rule, node)
                    if by_layer and by_node:
                        component.set_collision_profile_name(rule["profile"])
                        report["profiles"] += 1
                        break
        if "trigger_size" in extras and attached_child(actor, node["label"] + "_Trigger") is None:
            trigger = actor_space.spawn_actor_from_class(unreal.TriggerBox, actor.get_actor_location())
            trigger.set_actor_label(node["label"] + "_Trigger")
            trigger.attach_to_actor(actor, unreal.Name(), unreal.AttachmentRule.KEEP_RELATIVE, unreal.AttachmentRule.KEEP_RELATIVE, unreal.AttachmentRule.KEEP_RELATIVE, False)
            trigger.set_actor_relative_location(to_unreal(extras.get("trigger_center", [0, 0, 0])), False, False)
            trigger.set_actor_relative_rotation(unreal.Rotator(0, 0, 0), False, False)
            size = extras["trigger_size"]
            trigger.collision_component.set_box_extent(unreal.Vector(size[0] * 50, size[2] * 50, size[1] * 50))
            add_tags(trigger, ["building_trigger"] + list(extras.get("godot_groups", [])))
            report["triggers"] += 1
        if node["root"]:
            script = unreal_layer.get("scripts", {}).get(node["kind"])
            if script and add_component(actor, script):
                report["components"] += 1
            if node["kind"] == "door":
                for child in unreal_layer.get("doorChildren", []):
                    label = node["label"] + "_" + child["name"]
                    if attached_child(actor, label) is None:
                        cls = unreal.load_class(None, child["actor"])
                        if cls is None:
                            raise ValueError("Unknown actor class: %s" % child["actor"])
                        spawned = actor_space.spawn_actor_from_class(cls, actor.get_actor_location())
                        spawned.set_actor_label(label)
                        spawned.attach_to_actor(actor, unreal.Name(), unreal.AttachmentRule.SNAP_TO_TARGET, unreal.AttachmentRule.SNAP_TO_TARGET, unreal.AttachmentRule.KEEP_WORLD, False)
                        report["children"] += 1
        if light_scale:
            for light in actor.get_components_by_class(unreal.PointLightComponent):
                light.set_intensity(light.get_editor_property("intensity") * light_scale)
                report["lights"] += 1
    return report

def main(argv):
    parser = argparse.ArgumentParser(prog="building_studio_setup.py")
    parser.add_argument("--glb", required=True)
    parser.add_argument("--root")
    parser.add_argument("--game-layer")
    parser.add_argument("--materials")
    parser.add_argument("--light-scale", type=float)
    args = parser.parse_args(argv)
    layer = {}
    if args.game_layer:
        with open(args.game_layer) as fh:
            layer = json.load(fh)
    if args.materials:
        with open(args.materials) as fh:
            layer.setdefault("unreal", {}).setdefault("materials", {}).update(json.load(fh))
    report = setup(args.glb, args.root, layer, args.light_scale)
    unreal.log("Building Studio setup: " + json.dumps(report))
    return report

if __name__ == "__main__":
    main(sys.argv[1:])
