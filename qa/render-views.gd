extends SceneTree
# Renders screenshots of exported building scenes in Godot itself.
# Scenes are loaded unmodified (empty material slots render as Godot's default
# grey); only a camera, sky, sun, ambient light and a camera headlamp are
# added for viewing. The headlamp (a short-range omni light that travels with
# the camera) lets eye-level views show enclosed rooms that the sun cannot
# reach; it falls off before exterior camera distances.
# res://render.json: {"scenes": ["assets/x.tscn"], "views": [...] | null, "extraViews": [...],
#   "width": 1280, "height": 800, "maxRegionViews": 64}
# Without explicit views, each scene gets four exterior diagonals, an aerial
# view and one eye-level view per labelled region (from the exporter's
# metadata/building_regions on each floor node).

var cfg
var jobs := []
var index := 0
var wait := -10
var camera: Camera3D
var current: Node3D
var current_path := ""
var manifest := []

func _initialize() -> void:
	cfg = JSON.parse_string(FileAccess.get_file_as_string("res://render.json"))
	var env := Environment.new()
	env.background_mode = Environment.BG_SKY
	var sky := Sky.new()
	sky.sky_material = ProceduralSkyMaterial.new()
	env.sky = sky
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = Color(0.55, 0.57, 0.62)
	env.ambient_light_energy = 0.45
	env.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	var world_env := WorldEnvironment.new()
	world_env.environment = env
	get_root().add_child(world_env)
	var sun := DirectionalLight3D.new()
	sun.rotation_degrees = Vector3(-50, -35, 0)
	sun.light_energy = 0.75
	sun.shadow_enabled = true
	sun.directional_shadow_max_distance = 250.0
	get_root().add_child(sun)
	camera = Camera3D.new()
	camera.far = 1000.0
	get_root().add_child(camera)
	camera.make_current()
	var headlamp := OmniLight3D.new()
	headlamp.omni_range = 16.0
	headlamp.omni_attenuation = 1.2
	headlamp.light_energy = 1.4
	headlamp.position = Vector3(0, 0.35, 0)
	camera.add_child(headlamp)
	for scene_path in cfg["scenes"]:
		var prefix: String = scene_path.get_file().get_basename()
		var multiple: bool = cfg["scenes"].size() > 1
		jobs.append({"scene": scene_path, "prefix": (prefix + "/") if multiple else ""})

func _slug(text: String) -> String:
	var out := ""
	for c in text.to_lower():
		out += c if (c >= "a" and c <= "z") or (c >= "0" and c <= "9") else "-"
	while out.find("--") != -1:
		out = out.replace("--", "-")
	return out.strip_edges().trim_prefix("-").trim_suffix("-")

func _auto_views(root: Node3D) -> Array:
	var box := AABB()
	var first := true
	for node in root.find_children("*", "MeshInstance3D", true, false):
		var mi := node as MeshInstance3D
		if mi.mesh == null:
			continue
		var b: AABB = mi.global_transform * mi.get_aabb()
		box = b if first else box.merge(b)
		first = false
	var c := box.get_center()
	var r: float = max(4.0, box.size.length() / 2.0)
	var views := []
	for pair in [["exterior-ne", 45.0], ["exterior-se", 135.0], ["exterior-sw", 225.0], ["exterior-nw", 315.0]]:
		var a := deg_to_rad(pair[1])
		views.append({"name": pair[0], "eye": [c.x + sin(a) * r * 1.9, c.y + r * 0.95, c.z - cos(a) * r * 1.9], "look": [c.x, c.y, c.z], "fov": 45.0})
	views.append({"name": "aerial", "eye": [c.x, c.y + r * 2.1, c.z + r * 0.6], "look": [c.x, c.y, c.z], "fov": 50.0})
	var region_views := 0
	var seen := {}
	var floors := []
	for child in root.get_children():
		if child is Node3D and child.has_meta("building_regions"):
			floors.append(child)
	for fi in floors.size():
		var floor_node: Node3D = floors[fi]
		var y: float = floor_node.global_position.y
		for region in floor_node.get_meta("building_regions"):
			var label: String = str(region.get("label", ""))
			if label == "" or region_views >= int(cfg.get("maxRegionViews", 64)):
				continue
			var key := "%d-%s" % [fi + 1, _slug(label)]
			if seen.has(key):
				continue
			seen[key] = true
			var cx := (float(region["minX"]) + float(region["maxX"])) / 2.0
			var cz := (float(region["minZ"]) + float(region["maxZ"])) / 2.0
			var along_x := float(region["maxX"]) - float(region["minX"]) >= float(region["maxZ"]) - float(region["minZ"])
			var half := (float(region["maxX"]) - float(region["minX"]) if along_x else float(region["maxZ"]) - float(region["minZ"])) / 2.0
			var look := Vector3(cx + (half if along_x else 0.0), y + 1.4, cz + (0.0 if along_x else half))
			# Candidate eye points back from the far wall; _aim uses the first one
			# not inside collision (a stair flight, railing or wall).
			var candidates := []
			for back in [0.6, 0.4, 0.8, 0.2, 0.0]:
				for side in [0.0, 0.3, -0.3]:
					var e := Vector3(cx - (half * back if along_x else side * half), y + 1.65, cz - (side * half if along_x else half * back))
					candidates.append([e.x, e.y, e.z])
			views.append({"name": "floor-%02d-%s" % [fi + 1, _slug(label)], "eye": candidates[0], "look": [look.x, look.y, look.z], "fov": 75.0, "candidates": candidates})
			region_views += 1
	return views

# Diagnostic mode: colour each exported surface by its name so shell seams,
# holes and misplaced faces stand out (scene files are not modified).
const SURFACE_COLORS := {
	"OutsideFaces": Color(0.55, 0.55, 0.57), "InsideFaces": Color(0.95, 0.45, 0.75),
	"EdgeFaces": Color(0.1, 0.85, 0.85), "SideAFaces": Color(1.0, 0.6, 0.2), "SideBFaces": Color(0.95, 0.9, 0.25),
	"TopFaces": Color(0.35, 0.8, 0.35), "BottomFaces": Color(0.3, 0.45, 0.95), "RoofFaces": Color(0.6, 0.35, 0.2),
	"RoofSideFaces": Color(0.75, 0.5, 0.3), "RoomFaces": Color(0.55, 0.4, 0.85),
	# Interior-wall EdgeFaces get their own colour so interior seams and caps
	# are not confused with exterior ones.
	"InteriorEdgeFaces": Color(0.9, 0.15, 0.2)
}
func _under(node: Node, ancestor_name: String) -> bool:
	var p := node.get_parent()
	while p != null:
		if str(p.name) == ancestor_name:
			return true
		p = p.get_parent()
	return false

func _apply_surface_colors(root: Node) -> void:
	var materials := {}
	for key in SURFACE_COLORS:
		var m := StandardMaterial3D.new()
		m.albedo_color = SURFACE_COLORS[key]
		materials[key] = m
	for node in root.find_children("*", "MeshInstance3D", true, false):
		var mi := node as MeshInstance3D
		if mi.mesh == null:
			continue
		var interior := _under(mi, "InteriorWalls")
		for i in mi.mesh.get_surface_count():
			var surface_name := ""
			if mi.mesh is ArrayMesh:
				surface_name = (mi.mesh as ArrayMesh).surface_get_name(i)
			if not materials.has(surface_name):
				surface_name = str(mi.name)
			if interior and surface_name == "EdgeFaces":
				surface_name = "InteriorEdgeFaces"
			if materials.has(surface_name):
				mi.set_surface_override_material(i, materials[surface_name])

# Empty material slots render opaque, which hides what a window looks onto.
# Render-only: exported "Glass" surfaces get a clear tinted material.
func _apply_glass(root: Node) -> void:
	var glass := StandardMaterial3D.new()
	glass.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	glass.albedo_color = Color(0.7, 0.85, 0.95, 0.18)
	glass.cull_mode = BaseMaterial3D.CULL_DISABLED
	for node in root.find_children("*", "MeshInstance3D", true, false):
		var mi := node as MeshInstance3D
		if mi.mesh is ArrayMesh:
			for i in mi.mesh.get_surface_count():
				if (mi.mesh as ArrayMesh).surface_get_name(i) == "Glass":
					mi.set_surface_override_material(i, glass)

func _load_job() -> void:
	if current:
		current.queue_free()
	var job = jobs[index]
	current = (load("res://" + job["scene"]) as PackedScene).instantiate()
	get_root().add_child(current)
	if cfg.get("colorMode", "") == "surfaces":
		_apply_surface_colors(current)
	_apply_glass(current)
	current_path = job["scene"]
	job["views"] = (cfg["views"] if cfg["views"] != null else _auto_views(current)) + cfg.get("extraViews", [])
	job["view"] = 0

func _blocked(p: Vector3) -> bool:
	var space := camera.get_world_3d().direct_space_state
	for dy in [0.0, -0.8, -1.4]:
		var q := PhysicsPointQueryParameters3D.new()
		q.position = p + Vector3(0, dy, 0)
		if not space.intersect_point(q, 1).is_empty():
			return true
	return false

func _aim(view) -> void:
	if view.has("candidates"):
		for c in view["candidates"]:
			var p := Vector3(c[0], c[1], c[2])
			if not _blocked(p):
				view["eye"] = c
				break
		view.erase("candidates")
	camera.fov = float(view.get("fov", 60.0))
	camera.global_position = Vector3(view["eye"][0], view["eye"][1], view["eye"][2])
	var target := Vector3(view["look"][0], view["look"][1], view["look"][2])
	var up := Vector3.UP if absf((target - camera.global_position).normalized().y) < 0.99 else Vector3.FORWARD
	camera.look_at(target, up)

func _process(_delta: float) -> bool:
	wait += 1
	if index >= jobs.size():
		print("RENDER_MANIFEST " + JSON.stringify(manifest))
		quit(0)
		return true
	if wait == 0:
		if not jobs[index].has("views"):
			_load_job()
			# Let physics register the scene's collision before choosing eye points.
			wait = -3
			return false
		_aim(jobs[index]["views"][jobs[index]["view"]])
	if wait < 6:
		return false
	var job = jobs[index]
	var view = job["views"][job["view"]]
	var name: String = job["prefix"] + str(view["name"]) + ".png"
	DirAccess.make_dir_recursive_absolute("res://out/" + name.get_base_dir())
	get_root().get_texture().get_image().save_png("res://out/" + name)
	manifest.append({"scene": job["scene"], "file": name, "eye": view["eye"], "look": view["look"], "fov": view.get("fov", 60.0)})
	job["view"] += 1
	if job["view"] >= job["views"].size():
		index += 1
	wait = -1
	return false
