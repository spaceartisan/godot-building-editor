# Unreal Engine import check for a Building Studio .glb (export --format glb).
# Optional QA: Unreal is not a test dependency. Run with any UE 5 project that
# has the Python Editor Script Plugin and Interchange enabled (both default):
#
#   set GLB_CHECK_FILE=C:\path\to\building.glb
#   set GLB_CHECK_OUT=C:\path\to\report.json
#   UnrealEditor-Cmd.exe C:\path\to\Project.uproject -run=pythonscript -script=C:\path\to\qa\unreal-import-check.py -unattended -nop4 -nosplash
#
# It scene-imports the file with Interchange (actors in a level, as the editor's
# "Import Into Level" does) under /Game/BuildingStudioCheck/<name> and writes a
# JSON report: each static mesh's material slots, simple collision (boxes and
# convex hulls from UBX_/UCX_ meshes) and Interchange metadata (glTF extras),
# the actor tree with locations, and light actors.
import json, os, unreal

FILE = os.environ["GLB_CHECK_FILE"]
OUT = os.environ["GLB_CHECK_OUT"]
name = os.path.splitext(os.path.basename(FILE))[0]
dest = "/Game/BuildingStudioCheck/" + name
if unreal.EditorAssetLibrary.does_directory_exist(dest):
    unreal.EditorAssetLibrary.delete_directory(dest)

manager = unreal.InterchangeManager.get_interchange_manager_scripted()
params = unreal.ImportAssetParameters()
params.is_automated = True
imported = manager.import_scene(dest, unreal.InterchangeManager.create_source_data(FILE), params)

report = {"engine": unreal.SystemLibrary.get_engine_version(), "file": FILE, "imported": bool(imported), "meshes": {}, "materials": [], "actors": [], "lights": []}
for path in unreal.EditorAssetLibrary.list_assets(dest, recursive=True):
    asset = unreal.EditorAssetLibrary.load_asset(path)
    if isinstance(asset, unreal.StaticMesh):
        agg = asset.get_editor_property("body_setup").get_editor_property("agg_geom")
        bounds = asset.get_bounding_box()
        size = bounds.max - bounds.min
        report["meshes"][asset.get_name()] = {
            "slots": [str(m.get_editor_property("material_slot_name")) for m in asset.get_editor_property("static_materials")],
            "boxes": len(agg.get_editor_property("box_elems")),
            "convex": len(agg.get_editor_property("convex_elems")),
            "size_cm": [round(size.x, 1), round(size.y, 1), round(size.z, 1)],
            "metadata": {str(k): str(v) for k, v in unreal.EditorAssetLibrary.get_metadata_tag_values(asset).items()},
        }
    elif isinstance(asset, unreal.MaterialInterface):
        report["materials"].append(asset.get_name())

for actor in unreal.get_editor_subsystem(unreal.EditorActorSubsystem).get_all_level_actors():
    parent = actor.get_attach_parent_actor()
    loc = actor.get_actor_location()
    row = {"name": actor.get_actor_label(), "class": actor.get_class().get_name(), "parent": parent.get_actor_label() if parent else None,
           "location_cm": [round(loc.x, 1), round(loc.y, 1), round(loc.z, 1)]}
    for comp in actor.get_components_by_class(unreal.StaticMeshComponent):
        mesh = comp.get_editor_property("static_mesh")
        if mesh:
            row["mesh"] = mesh.get_name()
    for comp in actor.get_components_by_class(unreal.LightComponent):
        report["lights"].append({"actor": row["name"], "class": comp.get_class().get_name(), "intensity": comp.get_editor_property("intensity"),
                                 "radius_cm": comp.get_editor_property("attenuation_radius") if isinstance(comp, unreal.PointLightComponent) else None})
    report["actors"].append(row)

with open(OUT, "w") as fh:
    json.dump(report, fh, indent=1)
unreal.log("Building Studio glb check written: " + OUT)
