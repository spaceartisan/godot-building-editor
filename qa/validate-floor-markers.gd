extends SceneTree

var failures: int = 0
var ray_count: int = 0
var marker_count: int = 0

func _initialize() -> void:
	call_deferred("run_checks")

func check(condition: bool, message: String) -> void:
	if not condition:
		failures += 1
		push_error(message)

func run_checks() -> void:
	var cases: Array = JSON.parse_string(FileAccess.get_file_as_string("res://cases.json"))
	for item: Dictionary in cases:
		var packed: PackedScene = load(item.scene)
		check(packed != null, "Missing floor/marker scene")
		if packed == null:
			continue
		var instance: Node3D = packed.instantiate()
		root.add_child(instance)
		await physics_frame
		await physics_frame
		var found: Dictionary = {}
		for candidate: Node in instance.find_children("*", "Marker3D", true, false):
			var marker_node: Marker3D = candidate as Marker3D
			var marker_id: String = marker_node.get_meta("building_marker_id", "")
			check(not found.has(marker_id), "Duplicate marker ID")
			found[marker_id] = marker_node
			check(not marker_node.has_meta("details"), "JSON notes leaked into marker metadata")
			check(marker_node.editor_description.is_empty(), "Notes must not be editor_description")
		check(found.size() == item.markers.size(), item.scene + ": marker count mismatch")
		for expected: Dictionary in item.markers:
			check(found.has(expected.id), "Missing marker " + expected.id)
			if not found.has(expected.id):
				continue
			var marker_node: Marker3D = found[expected.id]
			var point: Vector3 = Vector3(expected.x, expected.y, expected.z)
			check(marker_node.global_position.distance_to(point) < 0.0001, item.scene + ": wrong marker world position")
			check(marker_node.get_meta("building_marker_name") == expected.label, "Marker name did not survive export")
			marker_count += 1
		for i: int in item.levels.size():
			var level_node: Node3D = instance.get_node("Floor_%02d" % (i + 1))
			check(absf(level_node.position.y - item.levels[i]) < 0.0001, "Wrong floor elevation")
		var space: PhysicsDirectSpaceState3D = instance.get_world_3d().direct_space_state
		for sample: Dictionary in item.samples:
			var start: Vector3 = Vector3(sample.x, sample.y + 0.2, sample.z)
			var finish: Vector3 = Vector3(sample.x, sample.y - 0.4, sample.z)
			var hit: Dictionary = space.intersect_ray(PhysicsRayQueryParameters3D.create(start, finish, 1))
			ray_count += 1
			check(not hit.is_empty(), item.scene + ": missing floor contact")
			if not hit.is_empty():
				var point: Vector3 = hit.position
				check(absf(point.y - sample.y) < 0.02, "Wrong floor contact height")
		for height: float in item.bands:
			var hit: Dictionary = space.intersect_ray(PhysicsRayQueryParameters3D.create(Vector3(3.7, height, 0), Vector3(4.3, height, 0), 1))
			ray_count += 1
			check(not hit.is_empty(), "Missing wall collision across story band")
		instance.free()
	print("FLOOR MARKER CHECK: ", cases.size(), " cases; ", marker_count, " markers; ", ray_count, " physics rays; ", failures, " failures")
	quit(0 if failures == 0 else 1)
