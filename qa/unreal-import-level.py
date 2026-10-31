# engine-unreal suite helper for unreal-import (unreal-engine-tests.mjs).
# BUILDING_UNREAL_LEVEL_MODE=make: create and save the level BUILDING_UNREAL_LEVEL
# holding one existing actor ("ExistingTownLight") that an import must keep.
# BUILDING_UNREAL_LEVEL_MODE=inspect: reopen the saved level and write what the
# imports of BUILDING_UNREAL_ROOT left (content in BUILDING_UNREAL_CONTENT) to
# BUILDING_UNREAL_REPORT.
import json, os
import unreal

level = os.environ["BUILDING_UNREAL_LEVEL"]
levels = unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)
actors = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
if os.environ["BUILDING_UNREAL_LEVEL_MODE"] == "make":
    levels.new_level(level)
    actors.spawn_actor_from_class(unreal.PointLight, unreal.Vector(0, 0, 500)).set_actor_label("ExistingTownLight")
    unreal.EditorLoadingAndSavingUtils.save_dirty_packages(True, True)
else:
    levels.load_level(level)
    all_actors = actors.get_all_level_actors()
    name = os.environ["BUILDING_UNREAL_ROOT"]
    roots = []
    for root in (a for a in all_actors if a.get_actor_label() == name):
        top = root
        while top.get_attach_parent_actor() is not None:
            top = top.get_attach_parent_actor()
        location = root.get_actor_location()
        roots.append({"location": [location.x, location.y, location.z], "yaw": root.get_actor_rotation().yaw, "top": top.get_actor_label()})
    hinges = [a for a in all_actors if a.get_actor_label().startswith("Hinge")]
    report = {"roots": roots, "existing": any(a.get_actor_label() == "ExistingTownLight" for a in all_actors),
              "assets": len(unreal.EditorAssetLibrary.list_assets(os.environ["BUILDING_UNREAL_CONTENT"], recursive=True)),
              "scene_actors": sum(1 for a in all_actors if a.get_actor_label().endswith("_scene_0")),
              "hinges": len(hinges), "hinges_movable": all(h.get_editor_property("root_component").get_editor_property("mobility") == unreal.ComponentMobility.MOVABLE for h in hinges)}
    with open(os.environ["BUILDING_UNREAL_REPORT"], "w") as fh:
        json.dump(report, fh, indent=1)
