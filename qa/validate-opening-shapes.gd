extends SceneTree

var failures: int = 0
var ray_count: int = 0

func _initialize() -> void:
	call_deferred("run_checks")

func check(condition: bool, message: String) -> void:
	if not condition:
		failures += 1
		push_error(message)

func vector(values: Array) -> Vector3:
	return Vector3(values[0], values[1], values[2])

func run_checks() -> void:
	var cases: Array = JSON.parse_string(FileAccess.get_file_as_string("res://cases.json"))
	for item: Dictionary in cases:
		var packed: PackedScene = load(item.scene)
		check(packed != null, "Missing shaped-wall scene")
		if packed == null:
			continue
		var instance: Node3D = packed.instantiate()
		root.add_child(instance)
		if item.movePanel:
			var panels: Array[Node] = instance.find_children("Panel", "Node3D", true, false)
			check(panels.size() == 1, "Missing movable custom panel")
			for panel_node: Node3D in panels:
				panel_node.position.y = 3.0
		await physics_frame
		await physics_frame
		for shell_path: String in item.shells:
			var shell: MeshInstance3D = instance.get_node_or_null(shell_path)
			check(shell != null and shell.mesh != null, "Missing lighting shell: " + shell_path)
		var shape: CollisionShape3D = instance.get_node("Floor_01/Collision/ShapedWallCollision")
		check(shape.shape is ConcavePolygonShape3D, "Wall collision must follow concave profile")
		var space: PhysicsDirectSpaceState3D = instance.get_world_3d().direct_space_state
		for sample: Dictionary in item.rays:
			var start: Vector3 = vector(sample.from)
			var hit: Dictionary = space.intersect_ray(PhysicsRayQueryParameters3D.create(start, vector(sample.to), 1))
			ray_count += 1
			check(not hit.is_empty() == sample.hit, item.scene + ": wrong collision at " + str(start))
			if not hit.is_empty() and sample.hit:
				check(hit.position.distance_to(vector(sample.point)) < 0.003, item.scene + ": wrong contact " + str(hit.position) + " expected " + str(sample.point))
		instance.free()
	print("DOORWAY SHAPE CHECK: ", cases.size(), " cases; ", ray_count, " physics rays; ", failures, " failures")
	quit(0 if failures == 0 else 1)
