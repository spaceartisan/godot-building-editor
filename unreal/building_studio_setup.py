# Unreal Engine setup for a Building Studio .glb after "Import Into Level"
# (the Unreal counterpart of a game layer; see GLTF.md). Run it in the editor's
# Python console or Output Log ("py" command), with the editor's level holding
# the imported building:
#
#   py "C:/path/to/unreal/building_studio_setup.py" --content /Game/Buildings/smithy --materials C:/path/to/materials.json
#
# --content        Content folder the .glb was imported into (its static meshes).
# --materials FILE JSON {"slot name": "/Game/Path/To/Material", ...}: every
#                  imported static mesh slot with that name (OutsideFaces,
#                  TopFaces, Door, roof, post, ...) gets that material. Slots
#                  not in the file keep their imported grey placeholder.
# --root LABEL     Only touch actors under this imported root actor (default:
#                  every actor in the level).
# --light-scale K  Multiply imported point-light intensities by K (Unreal reads
#                  Godot's light energy as candelas, which is dim).
#
# Moving parts are always made Movable, with everything attached below them,
# so they can be rotated or moved at runtime: door Hinge/Hinge2, custom door
# Panel, roll-up Curtain, elevator Car, and car and landing door leaves
# (CarDoorLeft/Right, DoorLeft/Right). Imported actors are Static otherwise.
import argparse, json, re, sys
import unreal

MOVING = re.compile(r"^(Hinge2?|Panel|Curtain|Car|CarDoorLeft|CarDoorRight|DoorLeft|DoorRight)(_\d+)?$")

def _descendants(actor):
    out = []
    for child in actor.get_attached_actors():
        out.append(child)
        out.extend(_descendants(child))
    return out

def _under(actor, root):
    while actor:
        if actor == root:
            return True
        actor = actor.get_attach_parent_actor()
    return False

def level_actors(root_label=None):
    actors = unreal.get_editor_subsystem(unreal.EditorActorSubsystem).get_all_level_actors()
    if not root_label:
        return actors
    roots = [a for a in actors if a.get_actor_label() == root_label]
    if not roots:
        raise ValueError("No actor labelled %s in the level" % root_label)
    return [a for a in actors if _under(a, roots[0])]

def make_moving_parts_movable(actors):
    changed = set()
    for actor in actors:
        if MOVING.match(actor.get_actor_label()):
            for a in [actor] + _descendants(actor):
                root = a.get_editor_property("root_component")
                if root and root.get_editor_property("mobility") != unreal.ComponentMobility.MOVABLE:
                    root.set_mobility(unreal.ComponentMobility.MOVABLE)
                    changed.add(a.get_actor_label())
    return sorted(changed)

def bind_materials(content_path, materials):
    loaded = {}
    for slot, path in materials.items():
        material = unreal.EditorAssetLibrary.load_asset(path)
        if not isinstance(material, unreal.MaterialInterface):
            raise ValueError("Not a material: %s (for slot %s)" % (path, slot))
        loaded[slot] = material
    bound = 0
    for path in unreal.EditorAssetLibrary.list_assets(content_path, recursive=True):
        mesh = unreal.EditorAssetLibrary.load_asset(path)
        if not isinstance(mesh, unreal.StaticMesh):
            continue
        changed = False
        for index, slot in enumerate(mesh.get_editor_property("static_materials")):
            name = str(slot.get_editor_property("material_slot_name"))
            if name in loaded:
                mesh.set_material(index, loaded[name])
                bound += 1
                changed = True
        if changed:
            unreal.EditorAssetLibrary.save_loaded_asset(mesh)
    return bound

def scale_lights(actors, factor):
    scaled = 0
    for actor in actors:
        for light in actor.get_components_by_class(unreal.PointLightComponent):
            light.set_intensity(light.get_editor_property("intensity") * factor)
            scaled += 1
    return scaled

def main(argv):
    parser = argparse.ArgumentParser(prog="building_studio_setup.py")
    parser.add_argument("--content")
    parser.add_argument("--materials")
    parser.add_argument("--root")
    parser.add_argument("--light-scale", type=float)
    args = parser.parse_args(argv)
    actors = level_actors(args.root)
    movable = make_moving_parts_movable(actors)
    unreal.log("Building Studio setup: %d actors made Movable" % len(movable))
    result = {"movable": movable}
    if args.materials:
        if not args.content:
            parser.error("--materials needs --content")
        with open(args.materials) as fh:
            result["slots_bound"] = bind_materials(args.content, json.load(fh))
        unreal.log("Building Studio setup: %d material slots bound" % result["slots_bound"])
    if args.light_scale:
        result["lights_scaled"] = scale_lights(actors, args.light_scale)
        unreal.log("Building Studio setup: %d point lights scaled by %g" % (result["lights_scaled"], args.light_scale))
    return result

if __name__ == "__main__":
    main(sys.argv[1:])
