# Imports a Building Studio .glb into an existing Unreal Engine 5 project and
# level, places it, sets it up (building_studio_setup.py, with an optional game
# layer) and saves. The scripted form of "Import Into Level" plus the setup
# script; see GLTF.md. CLI: node cli.mjs unreal-import (runs this headless).
#
# In the editor's Output Log (the project open):
#   py "C:/path/to/unreal/building_studio_import.py" --glb C:/path/party_palace.glb --content /Game/Buildings/party_palace --level /Game/Maps/Town --location 0,0,0 --yaw 90 --replace
#
# Headless (the project closed in the editor):
#   UnrealEditor-Cmd.exe C:/path/Game.uproject -run=pythonscript -script="C:/path/unreal/building_studio_import.py --glb ... --content ..." -unattended -nop4 -nosplash
#
# --glb FILE          The .glb export (export --format glb).
# --content PATH      Content folder for its meshes and materials, e.g. /Game/Buildings/<name>.
# --level PATH        Level to open first (default: the level already open).
# --location X,Y,Z    Where to place the building root, in Unreal centimetres (default 0,0,0).
# --yaw DEGREES       Building rotation about Unreal Z (default 0).
# --replace           First remove what an earlier import of this building left:
#                     actors under roots with its name in the level, and the content folder.
# --game-layer FILE   Apply the game layer's "unreal" block (validate it with the CLI first).
# --light-scale K     Multiply point-light intensities by K.
# --no-save           Leave the level and assets unsaved (the default saves them).
# --report FILE       Write a JSON summary.
import argparse, importlib.util, json, os, sys
import unreal

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("building_studio_setup", os.path.join(HERE, "building_studio_setup.py"))
bs = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bs)

def vector(text):
    parts = [float(v) for v in text.split(",")]
    if len(parts) != 3:
        raise argparse.ArgumentTypeError("expected X,Y,Z")
    return unreal.Vector(*parts)

def subtree(actor):
    out = [actor]
    for child in actor.get_attached_actors():
        out.extend(subtree(child))
    return out

def run(args):
    actors = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
    if args.level:
        if not unreal.get_editor_subsystem(unreal.LevelEditorSubsystem).load_level(args.level):
            raise RuntimeError("Could not open level %s" % args.level)
    gltf = bs.read_glb(args.glb)
    root_name = gltf["nodes"][gltf["scenes"][0]["nodes"][0]]["name"]
    removed = 0
    if args.replace:
        # Each earlier copy: the building root, from its top actor down (Interchange
        # adds a "<file>_scene_0" parent above the root).
        tops = []
        for actor in actors.get_all_level_actors():
            if actor.get_actor_label() != root_name:
                continue
            top = actor
            while top.get_attach_parent_actor() is not None and top.get_attach_parent_actor().get_actor_label().endswith("_scene_0"):
                top = top.get_attach_parent_actor()
            if top not in tops:
                tops.append(top)
        for top in tops:
            for a in reversed(subtree(top)):
                actors.destroy_actor(a)
                removed += 1
        if unreal.EditorAssetLibrary.does_directory_exist(args.content):
            unreal.EditorAssetLibrary.delete_directory(args.content)
    before = set(actors.get_all_level_actors())
    params = unreal.ImportAssetParameters()
    params.is_automated = True
    if not unreal.InterchangeManager.get_interchange_manager_scripted().import_scene(args.content, unreal.InterchangeManager.create_source_data(args.glb), params):
        raise RuntimeError("Interchange could not import %s" % args.glb)
    new = [a for a in actors.get_all_level_actors() if a not in before]
    roots = [a for a in new if a.get_actor_label() == root_name]
    if not roots:
        raise RuntimeError("Imported, but found no %s actor in the level" % root_name)
    root = roots[0]
    # Place the whole import: its top actor (the scene actor Interchange adds, or the building root).
    top = root
    while top.get_attach_parent_actor() is not None:
        top = top.get_attach_parent_actor()
    top.set_actor_location(args.location, False, False)
    top.set_actor_rotation(unreal.Rotator(roll=0, pitch=0, yaw=args.yaw), False)  # keywords: positional order is roll, pitch, yaw
    layer = None
    if args.game_layer:
        with open(args.game_layer) as fh:
            layer = json.load(fh)
    report = bs.setup(args.glb, root, layer, args.light_scale)
    if not args.no_save:
        unreal.EditorLoadingAndSavingUtils.save_dirty_packages(True, True)
    result = {"root": root.get_actor_label(), "content": args.content, "level": args.level, "removed": removed,
              "actors": len(new), "location": [args.location.x, args.location.y, args.location.z], "yaw": args.yaw, "setup": report, "saved": not args.no_save}
    unreal.log("Building Studio import: " + json.dumps(result))
    if args.report:
        with open(args.report, "w") as fh:
            json.dump(result, fh, indent=1)
    return result

def main(argv):
    parser = argparse.ArgumentParser(prog="building_studio_import.py")
    parser.add_argument("--glb", required=True)
    parser.add_argument("--content", required=True)
    parser.add_argument("--level")
    parser.add_argument("--location", type=vector, default=unreal.Vector(0, 0, 0))
    parser.add_argument("--yaw", type=float, default=0.0)
    parser.add_argument("--replace", action="store_true")
    parser.add_argument("--game-layer")
    parser.add_argument("--light-scale", type=float)
    parser.add_argument("--no-save", action="store_true")
    parser.add_argument("--report")
    args = parser.parse_args(argv)
    if not args.content.startswith("/Game/"):
        parser.error("--content must be a /Game/... folder")
    return run(args)

if __name__ == "__main__":
    main(sys.argv[1:])
