# unreal-check --render: the Unreal counterpart of godot-check --render.
# unreal-check.mjs copies this file into a disposable project as
# Content/Python/init_unreal.py and starts the editor; it does nothing unless
# BUILDING_UNREAL_RENDER_JOB is set. For each .glb it opens a new level,
# imports the building (Interchange "Import Into Level"), runs
# building_studio_setup.py, adds a sun, sky light, atmosphere and a camera
# headlamp (a short-range light that travels with the camera, as in Godot),
# and takes 1280 x 800 screenshots of the given views. Views use Godot/glTF
# space (metres, Y up) and Godot's vertical field of view; eye-level views try
# their candidate eye points and use the first one not inside collision.
# Writes a manifest and quits the editor.
import importlib.util, json, math, os
import unreal

JOB_FILE = os.environ.get("BUILDING_UNREAL_RENDER_JOB")

SURFACE_COLORS = {
    "OutsideFaces": (0.55, 0.55, 0.57), "InsideFaces": (0.95, 0.45, 0.75), "EdgeFaces": (0.1, 0.85, 0.85),
    "SideAFaces": (1.0, 0.6, 0.2), "SideBFaces": (0.95, 0.9, 0.25), "TopFaces": (0.35, 0.8, 0.35),
    "BottomFaces": (0.3, 0.45, 0.95), "RoofFaces": (0.6, 0.35, 0.2), "RoofSideFaces": (0.75, 0.5, 0.3),
    "RoomFaces": (0.55, 0.4, 0.85), "InteriorEdgeFaces": (0.9, 0.15, 0.2), "roof": (0.6, 0.35, 0.2), "ridge": (0.75, 0.5, 0.3),
}

def to_unreal(p):
    return unreal.Vector(p[0] * 100.0, p[2] * 100.0, p[1] * 100.0)

def horizontal_fov(vertical_deg, width, height):
    return math.degrees(2 * math.atan(math.tan(math.radians(vertical_deg) / 2) * width / height))

# Unreal can run startup scripts twice; register the render only once per editor.
if JOB_FILE and not getattr(unreal, "_building_render_registered", False):
    unreal._building_render_registered = True
    job = json.load(open(JOB_FILE))
    spec = importlib.util.spec_from_file_location("building_studio_setup", job["setup"])
    bs = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(bs)
    actors = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
    state = {"tick": 0, "job": -1, "view": 0, "next": 60, "phase": "load", "manifest": [], "camera": None, "colors": {}}

    def color_material(name, rgb):
        if name not in state["colors"]:
            tools = unreal.AssetToolsHelpers.get_asset_tools()
            mi = tools.create_asset("MI_Color_" + name, "/Game/BuildingRenderColors", unreal.MaterialInstanceConstant, unreal.MaterialInstanceConstantFactoryNew())
            unreal.MaterialEditingLibrary.set_material_instance_parent(mi, unreal.EditorAssetLibrary.load_asset("/Engine/BasicShapes/BasicShapeMaterial"))
            unreal.MaterialEditingLibrary.set_material_instance_vector_parameter_value(mi, "Color", unreal.LinearColor(rgb[0], rgb[1], rgb[2], 1))
            state["colors"][name] = mi
        return state["colors"][name]

    def apply_surface_colors(nodes, by_label):
        for node in nodes:
            actor = by_label.get(node["label"])
            component = actor.get_component_by_class(unreal.StaticMeshComponent) if actor and node["mesh"] else None
            if not component:
                continue
            interior = "/InteriorWalls/" in "/" + node["path"] + "/"
            for i, slot in enumerate(str(s) for s in component.get_material_slot_names()):
                key = "InteriorEdgeFaces" if interior and slot == "EdgeFaces" else slot
                if key in SURFACE_COLORS:
                    component.set_material(i, color_material(key, SURFACE_COLORS[key]))

    def load_job():
        current = job["jobs"][state["job"]]
        # No new_level here: in the visible editor it can raise a modal save prompt.
        # Remove what the previous building added instead.
        for actor in state.get("added", []):
            if actor and unreal.SystemLibrary.is_valid(actor):
                actors.destroy_actor(actor)
        if state["job"] == 0:
            # The default level's ground plane, lights, sky and fog: Godot's renders have no
            # ground and add only their own sun, sky and headlamp, so neither does this.
            for actor in actors.get_all_level_actors():
                if not isinstance(actor, unreal.WorldSettings) and (actor.get_components_by_class(unreal.PrimitiveComponent) or actor.get_components_by_class(unreal.LightComponentBase)):
                    unreal.log("Building render: removing default %s %s" % (actor.get_class().get_name(), actor.get_actor_label()))
                    actors.destroy_actor(actor)
            # Screenshots come from the editor viewport: hide its grid (it lies at ground level).
            unreal.SystemLibrary.execute_console_command(unreal.EditorLevelLibrary.get_editor_world(), "ShowFlag.Grid 0")
        before = set(actors.get_all_level_actors())
        params = unreal.ImportAssetParameters()
        params.is_automated = True
        unreal.InterchangeManager.get_interchange_manager_scripted().import_scene("/Game/BuildingRender/%d" % state["job"], unreal.InterchangeManager.create_source_data(current["glb"]), params)
        gltf = bs.read_glb(current["glb"])
        nodes = bs.glb_nodes(gltf)
        bs.setup(current["glb"], nodes[0]["label"])
        if job["colorMode"] == "surfaces":
            apply_surface_colors(nodes, bs.actors_under(nodes[0]["label"]))
        sun = actors.spawn_actor_from_class(unreal.DirectionalLight, unreal.Vector(0, 0, 2000), unreal.Rotator(-40, -35, 0))
        sun.light_component.set_editor_property("intensity", 6.0)
        sun.light_component.set_editor_property("atmosphere_sun_light", True)  # lights the sky, as Godot's sun and sky do
        sky =actors.spawn_actor_from_class(unreal.SkyLight, unreal.Vector(0, 0, 1000))
        sky.light_component.set_editor_property("real_time_capture", True)
        # Movable lights render without baked lighting (no "Preview" shadows).
        for light in (sun, sky):
            light.get_editor_property("root_component").set_mobility(unreal.ComponentMobility.MOVABLE)
        actors.spawn_actor_from_class(unreal.SkyAtmosphere, unreal.Vector(0, 0, 0))
        # Light fog fills the view below the horizon (otherwise black with no ground), like Godot's sky.
        fog = actors.spawn_actor_from_class(unreal.ExponentialHeightFog, unreal.Vector(0, 0, -100000))
        fog.component.set_editor_property("fog_density", 0.05)
        camera = actors.spawn_actor_from_class(unreal.CameraActor, unreal.Vector(0, 0, 0))
        lamp = actors.spawn_actor_from_class(unreal.PointLight, unreal.Vector(0, 0, 0))
        lamp.point_light_component.set_editor_property("attenuation_radius", 1600.0)
        lamp.point_light_component.set_editor_property("intensity", 20.0)
        lamp.attach_to_actor(camera, unreal.Name(), unreal.AttachmentRule.SNAP_TO_TARGET, unreal.AttachmentRule.SNAP_TO_TARGET, unreal.AttachmentRule.KEEP_WORLD, False)
        lamp.set_actor_relative_location(unreal.Vector(0, 0, 35), False, False)
        state["camera"] = camera
        state["added"] = [a for a in actors.get_all_level_actors() if a not in before]

    def blocked(p):
        world = unreal.EditorLevelLibrary.get_editor_world()
        types = [unreal.ObjectTypeQuery.OBJECT_TYPE_QUERY1, unreal.ObjectTypeQuery.OBJECT_TYPE_QUERY2]
        for dy in (0.0, -0.8, -1.4):
            q = to_unreal([p[0], p[1] + dy, p[2]])
            result = unreal.SystemLibrary.sphere_overlap_actors(world, q, 5.0, types, None, [state["camera"]])
            hits = result[1] if isinstance(result, tuple) else result  # None when nothing overlaps
            if hits:
                return True
        return False

    def aim(view):
        eye = view["eye"]
        for c in view.get("candidates", []):
            if not blocked(c):
                eye = c
                break
        camera = state["camera"]
        start, target = to_unreal(eye), to_unreal(view["look"])
        camera.set_actor_location(start, False, False)
        camera.set_actor_rotation(unreal.MathLibrary.find_look_at_rotation(start, target), False)
        camera.camera_component.set_editor_property("field_of_view", horizontal_fov(view.get("fov", 60), job["width"], job["height"]))
        camera.camera_component.set_editor_property("aspect_ratio", job["width"] / job["height"])
        camera.camera_component.set_editor_property("constrain_aspect_ratio", True)
        return eye

    def tick(dt):
        # At most one step per engine frame (the callback can fire twice), and
        # waits in frames, so slow shader compiles or screenshots cannot be skipped.
        frame = unreal.SystemLibrary.get_frame_count()
        if frame == state.get("frame"):
            return
        state["frame"] = frame
        state["tick"] += 1
        if state["tick"] < state["next"]:
            return
        try:
            if state["phase"] == "saving":
                # The screenshot is written on a later frame; record it once the file exists.
                if os.path.exists(state["pending"]) and os.path.getsize(state["pending"]) > 0:
                    state["manifest"].append(state["entry"])
                    state["view"] += 1
                    state["phase"] = "aim"
                    state["next"] = state["tick"] + 5
                elif state["tick"] > state["deadline"]:
                    raise RuntimeError("screenshot not written: %s" % state["pending"])
                return
            if state["phase"] == "load":
                state["job"] += 1
                if state["job"] >= len(job["jobs"]):
                    with open(job["manifest"], "w") as fh:
                        json.dump(state["manifest"], fh, indent=1)
                    unreal.unregister_slate_post_tick_callback(handle)
                    unreal.SystemLibrary.quit_editor()
                    return
                load_job()
                state["view"] = 0
                state["phase"] = "aim"
                state["next"] = state["tick"] + 300
            elif state["phase"] == "aim":
                current = job["jobs"][state["job"]]
                if state["view"] >= len(current["views"]):
                    state["phase"] = "load"
                    state["next"] = state["tick"] + 30
                    return
                view = current["views"][state["view"]]
                state["eye"] = aim(view)
                state["phase"] = "shot"
                state["next"] = state["tick"] + 45
            elif state["phase"] == "shot":
                current = job["jobs"][state["job"]]
                view = current["views"][state["view"]]
                name = "%s__%s.png" % (current["name"], view["name"])
                state["pending"] = os.path.join(job["out"], name)
                unreal.AutomationLibrary.take_high_res_screenshot(job["width"], job["height"], state["pending"], state["camera"])
                state["entry"] = {"scene": current["name"], "file": name, "eye": state["eye"], "look": view["look"], "fov": view.get("fov", 60)}
                state["phase"] = "saving"
                state["deadline"] = state["tick"] + 3600
                state["next"] = state["tick"] + 2
        except Exception as error:
            unreal.log_error("Building render failed: %s" % error)
            unreal.unregister_slate_post_tick_callback(handle)
            unreal.SystemLibrary.quit_editor()

    handle = unreal.register_slate_post_tick_callback(tick)
