extends SceneTree
# Reachability probe for an exported building scene (Godot 4.5).
# Bakes a navigation mesh from the scene's static collision (door panels are
# removed so doorways count as open), then asks the navigation server for a
# path from START to every target in targets.json. This is a navmesh
# approximation of character traversal, not a CharacterBody3D simulation.

var map_rid: RID
var frames := 0
var bake_iteration := -1
var targets := []
var start := Vector3.ZERO
var report := {}
var cfg
var building: Node3D

func _initialize() -> void:
	cfg = JSON.parse_string(FileAccess.get_file_as_string("res://targets.json"))
	var s = cfg["start"]
	start = Vector3(s[0], s[1], s[2])
	targets = cfg["targets"]
	var packed: PackedScene = load("res://assets/" + cfg["scene"])
	building = packed.instantiate()
	get_root().add_child(building)

func _bake() -> void:
	var doors := []
	for n in building.find_children("*", "", true, false):
		if n.scene_file_path.find("/doors/") != -1:
			doors.append(n)
	for n in doors:
		n.get_parent().remove_child(n)
		n.free()
	var removed := doors.size()
	var nav := NavigationMesh.new()
	nav.geometry_parsed_geometry_type = NavigationMesh.PARSED_GEOMETRY_STATIC_COLLIDERS
	nav.cell_size = 0.1
	nav.cell_height = 0.05
	nav.agent_radius = cfg["agent"]["radius"]
	nav.agent_height = cfg["agent"]["height"]
	nav.agent_max_climb = cfg["agent"]["max_climb"]
	nav.agent_max_slope = cfg["agent"]["max_slope"]
	var src := NavigationMeshSourceGeometryData3D.new()
	NavigationServer3D.parse_source_geometry_data(nav, src, building)
	NavigationServer3D.bake_from_source_geometry_data(nav, src)
	var region := NavigationRegion3D.new()
	region.navigation_mesh = nav
	get_root().add_child(region)
	map_rid = get_root().get_world_3d().navigation_map
	bake_iteration = NavigationServer3D.map_get_iteration_id(map_rid)
	var vs := nav.get_vertices()
	var aabb := AABB(vs[0], Vector3.ZERO) if vs.size() else AABB()
	for v in vs:
		aabb = aabb.expand(v)
	report["navBounds"] = [aabb.position.x, aabb.position.y, aabb.position.z, aabb.end.x, aabb.end.y, aabb.end.z]
	NavigationServer3D.map_set_cell_size(map_rid, nav.cell_size)
	NavigationServer3D.map_set_cell_height(map_rid, nav.cell_height)
	report["doorPanelsRemoved"] = removed
	report["navPolygons"] = nav.get_polygon_count()
	report["agent"] = cfg["agent"]

func _process(_delta: float) -> bool:
	frames += 1
	if frames == 1:
		_bake()
	if frames < 4 or NavigationServer3D.map_get_iteration_id(map_rid) <= bake_iteration + 1:
		if frames > 600:
			push_error("navigation map never synchronized")
			quit(3)
			return true
		return false
	report["mapRegions"] = NavigationServer3D.map_get_regions(map_rid).size()
	report["iteration"] = NavigationServer3D.map_get_iteration_id(map_rid)
	var from := NavigationServer3D.map_get_closest_point(map_rid, start)
	report["start"] = [start.x, start.y, start.z]
	report["startSnap"] = [from.x, from.y, from.z]
	var results := []
	var unreachable := 0
	for t in targets:
		var p := Vector3(t["at"][0], t["at"][1], t["at"][2])
		var origin := from
		if t.has("from"):
			origin = NavigationServer3D.map_get_closest_point(map_rid, Vector3(t["from"][0], t["from"][1], t["from"][2]))
		var snap := NavigationServer3D.map_get_closest_point(map_rid, p)
		var path := NavigationServer3D.map_get_path(map_rid, origin, snap, true)
		var end := path[path.size() - 1] if path.size() > 0 else origin
		var covered := Vector2(snap.x - p.x, snap.z - p.z).length() < 0.6 and absf(snap.y - p.y) < 0.35
		var arrived := path.size() > 0 and end.distance_to(snap) < 0.3
		var length := 0.0
		for i in range(1, path.size()):
			length += path[i - 1].distance_to(path[i])
		var within: bool = not t.has("maxLength") or length <= float(t["maxLength"])
		var ok: bool = covered and arrived and within
		if not ok:
			unreachable += 1
		results.append({"name": t["name"], "ok": ok, "floorCovered": covered, "pathArrives": arrived, "withinMaxLength": within, "maxLength": t.get("maxLength", null),
			"snap": [snap.x, snap.y, snap.z], "end": [end.x, end.y, end.z], "pathLength": length})
	report["results"] = results
	report["unreachable"] = unreachable
	print("REACHABILITY_JSON " + JSON.stringify(report))
	quit(0 if unreachable == 0 else 1)
	return true
