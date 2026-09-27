extends SceneTree
var failures: int = 0
var rays_checked: int = 0
func _initialize() -> void:
	call_deferred("run_checks")
func run_checks() -> void:
	var cases: Array = JSON.parse_string(FileAccess.get_file_as_string("res://cases.json"))
	for item: Dictionary in cases:
		var packed: PackedScene = load(item.scene)
		var instance: Node3D = packed.instantiate()
		root.add_child(instance)
		await physics_frame
		await physics_frame
		var space: PhysicsDirectSpaceState3D = instance.get_world_3d().direct_space_state
		for sample: Dictionary in item.rays:
			var start: Vector3 = Vector3(sample.from[0], sample.from[1], sample.from[2])
			var finish: Vector3 = Vector3(sample.to[0], sample.to[1], sample.to[2])
			var hit: Dictionary = space.intersect_ray(PhysicsRayQueryParameters3D.create(start, finish, 1))
			rays_checked += 1
			var correct: bool = not hit.is_empty() == sample.hit
			if not hit.is_empty() and sample.hit:
				var expected: Vector3 = Vector3(sample.point[0], sample.point[1], sample.point[2])
				correct = correct and hit.position.distance_to(expected) < 0.003
			if not correct:
				failures += 1
				push_error(item.scene + " from " + str(start) + " returned " + str(hit))
		instance.free()
	print("ROOF JUNCTION CHECK: ", cases.size(), " scenes; ", rays_checked, " rays; ", failures, " failures.")
	quit(0 if failures == 0 else 1)
