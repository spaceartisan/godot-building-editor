# unreal-check: the Unreal counterpart of godot-check --assets. Run by
# unreal-check.mjs in a disposable Unreal project (UnrealEditor-Cmd
# -run=pythonscript). For each exported .glb it imports the building into the
# level (Interchange "Import Into Level"), runs unreal/building_studio_setup.py
# without a game layer, and checks:
# - every glTF mesh node became a static mesh actor with the same named slots;
# - building_part and the other extras reached the mesh assets as metadata;
# - every UBX_/UCX_ piece became simple collision on its carrier, and none was
#   left as a stray actor;
# - lights became point lights, moving parts are Movable, door trigger boxes exist;
# - no Nanite mesh has a translucent material (glass meshes have Nanite off);
# - elevator physics probes, as godot-check runs them: with the car moved to
#   each stop a downward trace finds the car floor at the stop height; closed
#   landing doors block the opening; with the landing and car doors slid open
#   by leaf_travel, no door leaf blocks the way into the car.
# Writes a JSON report to BUILDING_UNREAL_REPORT.
import importlib.util, json, os, traceback
import unreal

job = json.load(open(os.environ["BUILDING_UNREAL_JOB"]))
spec = importlib.util.spec_from_file_location("building_studio_setup", job["setup"])
bs = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bs)
COLLISION = ("UBX_", "UCX_")

def leaves(actor):
    out = []
    stack = [actor]
    while stack:
        a = stack.pop()
        out.append(a)
        stack.extend(a.get_attached_actors())
    return out

def trace(world, start, end):
    result = unreal.SystemLibrary.line_trace_single(world, start, end, unreal.TraceTypeQuery.TRACE_TYPE_QUERY1, False, [], unreal.DrawDebugTrace.NONE, True)
    if result is None:  # nothing hit
        return False, None, None
    hit = result.to_tuple()
    return hit[0], hit[4], hit[9]

_imported = []

def check_file(path, index):
    report = {"file": os.path.basename(path), "meshes": 0, "collisionPieces": 0, "naniteOff": 0, "lights": 0, "elevators": 0, "stops": 0, "rays": 0, "failures": []}
    fail = lambda message: report["failures"].append(message)
    gltf = bs.read_glb(path)
    params = unreal.ImportAssetParameters()
    params.is_automated = True
    content = "/Game/BuildingStudioCheck/%d" % index
    # A fresh level per building, so two files' buildings (often the same root name,
    # all at the origin) cannot meet; if no new level opens, remove the previous ones.
    level_actors = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
    if not unreal.get_editor_subsystem(unreal.LevelEditorSubsystem).new_level("/Game/BuildingStudioCheck/Level_%d" % index):
        for actor in _imported:
            if unreal.SystemLibrary.is_valid(actor):
                level_actors.destroy_actor(actor)
    before = set(level_actors.get_all_level_actors())
    if not unreal.InterchangeManager.get_interchange_manager_scripted().import_scene(content, unreal.InterchangeManager.create_source_data(path), params):
        fail("Interchange import failed")
        return report
    nodes = bs.glb_nodes(gltf)
    new = [a for a in level_actors.get_all_level_actors() if a not in before]
    _imported[:] = new
    roots = [a for a in new if a.get_actor_label() == nodes[0]["label"]]
    if not roots:
        fail("No %s actor after import" % nodes[0]["label"])
        return report
    # This import's own root actor, never an earlier building with the same label.
    setup = bs.setup(path, roots[0])
    if setup["missing"]:
        fail("Nodes without an actor: %s" % ", ".join(setup["missing"][:10]))
    actors = bs.actors_under(roots[0])
    raw = gltf["nodes"]
    stray = [a.get_actor_label() for a in actors.values() if a.get_actor_label().startswith(COLLISION)]
    if stray:
        fail("Collision pieces left as actors: %s" % ", ".join(stray[:10]))
    metadata = {}
    for asset in unreal.EditorAssetLibrary.list_assets(content, recursive=True):
        mesh = unreal.EditorAssetLibrary.load_asset(asset)
        if isinstance(mesh, unreal.StaticMesh):
            metadata[mesh.get_name()] = {str(k): str(v) for k, v in unreal.EditorAssetLibrary.get_metadata_tag_values(mesh).items()}
    for gi, node in enumerate(raw):
        if node["name"].startswith(COLLISION) or "mesh" not in node:
            continue
        actor = actors.get(node["name"])
        component = actor.get_component_by_class(unreal.StaticMeshComponent) if actor else None
        if component is None or component.get_editor_property("static_mesh") is None:
            fail("%s: no static mesh actor" % node["name"])
            continue
        report["meshes"] += 1
        mesh = component.get_editor_property("static_mesh")
        expected = sorted(gltf["materials"][p["material"]]["name"] for p in gltf["meshes"][node["mesh"]]["primitives"] if "material" in p)
        slots = sorted(str(s) for s in component.get_material_slot_names())
        if slots != expected:
            fail("%s: material slots %s, expected %s" % (node["name"], slots, expected))
        extras = node.get("extras", {})
        tags = metadata.get(mesh.get_name(), {})
        if "building_part" in extras and not any(k.endswith(".building_part") for k in tags):
            fail("%s: building_part metadata missing" % node["name"])
        children = [raw[c]["name"] for c in node.get("children", [])]
        boxes = sum(1 for c in children if c.startswith("UBX_"))
        hulls = sum(1 for c in children if c.startswith("UCX_"))
        agg = mesh.get_editor_property("body_setup").get_editor_property("agg_geom")
        got = (len(agg.get_editor_property("box_elems")), len(agg.get_editor_property("convex_elems")))
        if got != (boxes, hulls):
            fail("%s: %d boxes and %d hulls of collision, expected %d and %d" % (node["name"], got[0], got[1], boxes, hulls))
        report["collisionPieces"] += boxes + hulls
        if bs.nanite_enabled(mesh):
            translucent = [m.get_name() for m in component.get_materials() if m and m.get_blend_mode() not in bs.OPAQUE]
            if translucent:
                fail("%s: Nanite mesh with translucent material %s" % (node["name"], ", ".join(translucent)))
        else:
            report["naniteOff"] += 1
    lights = sum(1 for n in raw if "KHR_lights_punctual" in n.get("extensions", {}))
    found = sum(1 for a in actors.values() if a.get_component_by_class(unreal.PointLightComponent))
    report["lights"] = found
    if found != lights:
        fail("%d point lights, expected %d" % (found, lights))
    for node in nodes:
        actor = actors.get(node["label"])
        if actor and bs.MOVING.match(node["godot"]):
            for a in leaves(actor):
                if a.get_editor_property("root_component").get_editor_property("mobility") != unreal.ComponentMobility.MOVABLE:
                    fail("%s is not Movable" % a.get_actor_label())
        if actor and "trigger_size" in node["extras"] and bs.attached_child(actor, node["label"] + "_Trigger") is None:
            fail("%s: no trigger box" % node["label"])
    world = unreal.EditorLevelLibrary.get_editor_world()
    for node in [n for n in nodes if n["kind"] == "elevator" and n["root"]]:
        report["elevators"] += 1
        inside = [n for n in nodes if n["parent"] is not None and is_under(n, node)]
        by = lambda godot: [actors[n["label"]] for n in inside if n["godot"] == godot and n["label"] in actors]
        cars = by("Car")
        if not cars:
            fail("%s: no Car actor" % node["label"])
            continue
        car = cars[0]
        car_travel = float(next(n for n in inside if n["godot"] == "Car")["extras"].get("leaf_travel", 0)) * 100
        stops = sorted((n for n in inside if n["godot"].startswith("Stop_")), key=lambda n: n["godot"])
        landings = {n["godot"].replace("Landing_", ""): n for n in inside if n["godot"].startswith("Landing_")}
        bottom = min(actors[s["label"]].get_actor_location().z for s in stops) if stops else 0
        home = car.get_actor_location()
        for stop in stops:
            report["stops"] += 1
            spot = actors[stop["label"]].get_actor_location()
            car.set_actor_location(unreal.Vector(home.x, home.y, spot.z), False, False)
            hit, at, who = trace(world, unreal.Vector(spot.x, spot.y, spot.z + 100), unreal.Vector(spot.x, spot.y, spot.z - 100))
            report["rays"] += 1
            on_car = who is not None and (who == car or who in leaves(car))
            if not hit or abs(at.z - spot.z) > 2 or not (on_car or abs(spot.z - bottom) < 1):
                fail("%s %s: car floor not found at the stop height" % (node["label"], stop["godot"]))
            landing = landings.get(stop["godot"].replace("Stop_", ""))
            if landing is None:
                continue
            land = actors[landing["label"]]
            doors = [a for a in leaves(land) if bs.MOVING.match(_godot(nodes, a))]
            if len(doors) < 2:
                fail("%s: landing doors missing" % landing["label"])
                continue
            mid = (doors[0].get_actor_location() + doors[1].get_actor_location()) * 0.5
            mid = unreal.Vector(mid.x, mid.y, spot.z + 100)
            across = land.get_actor_right_vector() * 120
            car.set_actor_location(unreal.Vector(home.x, home.y, spot.z + 100000), False, False)
            # A leaf's collision rides on the mesh actor under it: the whole subtree is the door.
            door_parts = [a for d in doors for a in leaves(d)]
            # One ray through each closed leaf's centre: a ray along the seam where the two
            # leaves' boxes meet hits or misses by rounding (it missed with 2.2 m doors).
            for d in doors:
                c = d.get_actor_location()
                c = unreal.Vector(c.x, c.y, spot.z + 100)
                hit, _, who = trace(world, c - across, c + across)
                report["rays"] += 1
                if not hit or who not in leaves(d):
                    fail("%s: closed landing door %s does not block its half of the opening (hit %s)" % (landing["label"], _godot(nodes, d), who.get_actor_label() if who else "nothing"))
            car.set_actor_location(unreal.Vector(home.x, home.y, spot.z), False, False)
            travel = float(landing["extras"].get("leaf_travel", 0)) * 100
            moved = []
            for leaf, amount in [(d, travel) for d in doors] + [(d, car_travel) for d in leaves(car) if _godot(nodes, d) in ("CarDoorLeft", "CarDoorRight")]:
                rel = leaf.get_editor_property("root_component").get_editor_property("relative_location")
                sign = 1 if rel.x >= 0 else -1
                leaf.set_actor_relative_location(unreal.Vector(rel.x + sign * amount, rel.y, rel.z), False, False)
                moved.append((leaf, rel))
            hit, _, who = trace(world, mid - across, mid + across)
            report["rays"] += 1
            car_doors = [a for d in leaves(car) if _godot(nodes, d) in ("CarDoorLeft", "CarDoorRight") for a in leaves(d)]
            if hit and who is not None and (who in door_parts or who in car_doors):
                fail("%s: an open door leaf still blocks the way into the car (hit %s)" % (landing["label"], who.get_actor_label()))
            for leaf, rel in moved:
                leaf.set_actor_relative_location(rel, False, False)
        car.set_actor_location(home, False, False)
    return report

def is_under(node, ancestor):
    p = node["parent"]
    while p is not None:
        if p is ancestor:
            return True
        p = p["parent"]
    return False

_godot_by_label = {}
def _godot(nodes, actor):
    if not _godot_by_label:
        for n in nodes:
            _godot_by_label[n["label"]] = n["godot"]
    return _godot_by_label.get(actor.get_actor_label(), actor.get_actor_label())

result = {"engine": unreal.SystemLibrary.get_engine_version(), "files": []}
for i, path in enumerate(job["files"]):
    _godot_by_label.clear()
    try:
        result["files"].append(check_file(path, i))
    except Exception:
        result["files"].append({"file": os.path.basename(path), "failures": ["Check crashed: " + traceback.format_exc().strip().splitlines()[-1]]})
with open(os.environ["BUILDING_UNREAL_REPORT"], "w") as fh:
    json.dump(result, fh, indent=1)
