extends SceneTree

var failures: int = 0
var rays: int = 0

func _initialize() -> void:
	call_deferred("run_checks")

func check(condition: bool, message: String) -> void:
	if not condition:
		failures += 1
		push_error(message)

func ray(world: World3D, start: Vector3, finish: Vector3) -> Dictionary:
	rays += 1
	return world.direct_space_state.intersect_ray(PhysicsRayQueryParameters3D.create(start, finish, 1))

func run_checks() -> void:
	var cases: Array = JSON.parse_string(FileAccess.get_file_as_string("res://cases.json"))
	for item: Dictionary in cases:
		var packed: PackedScene = load(item.scene)
		check(packed != null, "Missing lifecycle scene")
		if packed == null:
			continue
		var instance: Node3D = packed.instantiate()
		root.add_child(instance)
		await physics_frame
		await physics_frame
		var world: World3D = instance.get_world_3d()
		check(instance.find_children("Staircase_*", "Node3D", true, false).size() == int(item.count), "Wrong stair count after membership edit")
		for sample: Dictionary in item.samples:
			var down: Dictionary = ray(world, Vector3(sample.x, 3.38, sample.z), Vector3(sample.x, sample.height - 0.4, sample.z))
			check(not down.is_empty(), item.scene + ": missing floor/ramp")
			if not down.is_empty():
				var contact: Vector3 = down.position
				check(absf(contact.y - sample.height) < 0.06, item.scene + ": wrong floor/opening height")
			# The upper slab's bottom face is the lower room's ceiling surface.
			var up: Dictionary = ray(world, Vector3(sample.x, 2.5, sample.z), Vector3(sample.x, 3.18, sample.z))
			check(up.is_empty() == bool(sample.open), item.scene + ": wrong ceiling-side opening state")
			if not up.is_empty():
				var underside: Vector3 = up.position
				check(absf(underside.y - 2.8) < 0.06, item.scene + ": wrong restored ceiling-side height")
		check(not ray(world, Vector3(0, 2.89, 4.5), Vector3(0, 2.89, 5.5)).is_empty(), "Exterior story band missing")
		check(not ray(world, Vector3(-2.5, 2.89, 0), Vector3(-1.5, 2.89, 0)).is_empty(), "Interior story band missing")
		instance.free()
	print("LIFECYCLE CHECK: ", cases.size(), " cases; ", rays, " physics rays; ", failures, " failures")
	quit(0 if failures == 0 else 1)
