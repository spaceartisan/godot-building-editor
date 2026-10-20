extends SceneTree

# Game-facing metadata (Dirtscape): the root name, Floor_NN floor IDs,
# building_part on mesh nodes and exterior door Threshold markers, read back
# from the exported scene in Godot.
var failures: int = 0
var checks: int = 0

func _initialize() -> void:
	call_deferred("run_checks")

func check(condition: bool, message: String) -> void:
	checks += 1
	if not condition:
		failures += 1
		push_error(message)

func run_checks() -> void:
	var spec: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://cases.json"))
	var scene: Node3D = (load(spec.scene) as PackedScene).instantiate()
	root.add_child(scene)
	await process_frame
	check(scene.name == spec.root, "root is %s, expected %s" % [scene.name, spec.root])
	for path: String in spec.floors:
		var floor_node := scene.get_node_or_null(path)
		check(floor_node != null and str(floor_node.get_meta("building_floor_id", "")) == str(spec.floors[path]), "%s floor id is %s, expected %s" % [path, "-" if floor_node == null else str(floor_node.get_meta("building_floor_id", "")), spec.floors[path]])
	for path: String in spec.parts:
		var mesh := scene.get_node_or_null(path) as MeshInstance3D
		check(mesh != null and str(mesh.get_meta("building_part", "")) == str(spec.parts[path]), "%s part is %s, expected %s" % [path, "-" if mesh == null else str(mesh.get_meta("building_part", "")), spec.parts[path]])
	for item: Dictionary in spec.thresholds:
		var marker := scene.get_node_or_null(item.path) as Marker3D
		var door := scene.get_node_or_null(item.door) as Marker3D
		check(marker != null, "%s missing" % item.path)
		if marker == null or door == null:
			continue
		var expected := Vector3(item.position[0], item.position[1], item.position[2])
		var normal := Vector3(item.normal[0], item.normal[1], item.normal[2])
		check(marker.global_position.distance_to(expected) < 0.001, "%s at %s, expected %s" % [item.path, marker.global_position, expected])
		check((-marker.global_basis.z).distance_to(normal) < 0.001, "%s faces %s, expected %s" % [item.path, -marker.global_basis.z, normal])
		check((door.get_meta("outward_normal", Vector3.ZERO) as Vector3).distance_to(normal) < 0.001, "%s outward_normal %s, expected %s" % [item.door, door.get_meta("outward_normal", Vector3.ZERO), normal])
	scene.free()
	print("EXPORT METADATA CHECK: %d checks; %d failures" % [checks, failures])
	quit(1 if failures else 0)
