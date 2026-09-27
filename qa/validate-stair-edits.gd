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
		check(packed != null, "Cannot load edited scene")
		if packed == null:
			continue
		var instance: Node3D = packed.instantiate()
		root.add_child(instance)
		await physics_frame
		await physics_frame
		var world: World3D = instance.get_world_3d()
		var heading: Vector3 = {"north": Vector3(0, 0, -1), "south": Vector3(0, 0, 1), "east": Vector3(1, 0, 0), "west": Vector3(-1, 0, 0)}[item.direction]
		var side: Vector3 = Vector3(-heading.z, 0, heading.x)
		var centre: Vector3 = Vector3(item.x, item.bottomY, item.z)
		var half_run: float = item.run / 2.0
		var half_width: float = item.width / 2.0
		var top_y: float = item.bottomY + item.rise
		for lateral: float in [-half_width + 0.05, 0.0, half_width - 0.05]:
			for fraction: float in [0.0, 0.02, 0.25, 0.5, 0.75, 0.98, 1.0]:
				var point: Vector3 = centre + heading * ((fraction - 0.5) * item.run) + side * lateral
				var expected_y: float = item.bottomY + fraction * item.rise
				# Start above the upper slab: a stale hole or ceiling must fail.
				var hit: Dictionary = ray(world, Vector3(point.x, top_y + 0.4, point.z), Vector3(point.x, expected_y - 0.4, point.z))
				check(not hit.is_empty(), item.scene + ": missing ramp support")
				if not hit.is_empty():
					var contact: Vector3 = hit.position
					check(absf(contact.y - expected_y) < 0.06, item.scene + ": wrong ramp height " + str(fraction) + " got " + str(contact.y))
			for is_top: bool in [false, true]:
				var distance: float = (half_run + 0.08) * (1.0 if is_top else -1.0)
				var point: Vector3 = centre + heading * distance + side * lateral
				var expected_y: float = top_y if is_top else item.bottomY
				var hit: Dictionary = ray(world, Vector3(point.x, expected_y + 0.2, point.z), Vector3(point.x, expected_y - 0.3, point.z))
				check(not hit.is_empty(), item.scene + ": missing landing")
				if not hit.is_empty():
					var contact: Vector3 = hit.position
					check(absf(contact.y - expected_y) < 0.06, item.scene + ": wrong landing height")
		var under_centre: Vector3 = centre + Vector3(0, 0.5, 0)
		var under_hit: Dictionary = ray(world, under_centre - side * (half_width + 0.2), under_centre + side * (half_width + 0.2))
		check(under_hit.is_empty() != bool(item.blockBelow), item.scene + ": underside blocking mismatch")
		var stair: Node3D = instance.find_child("Staircase_*", true, false) as Node3D
		check(stair != null, "Missing edited stair node")
		if stair != null:
			check(stair.has_node("Steps") == (item.style == "steps"), "Wrong stair visual style")
			check(stair.has_node("UnderStairBlockerMesh") == bool(item.blockBelow), "Wrong blocker mesh state")
		var band_y: float = top_y - 0.11
		check(not ray(world, Vector3(0, band_y, 4.5), Vector3(0, band_y, 5.5)).is_empty(), "Exterior story seam lost")
		check(not ray(world, Vector3(-2.5, band_y, 0), Vector3(-1.5, band_y, 0)).is_empty(), "Interior story seam lost")
		if item.direction in ["east", "west"]:
			var restored: Dictionary = ray(world, Vector3(1, top_y + 0.2, -1.8), Vector3(1, top_y - 0.3, -1.8))
			check(not restored.is_empty(), "Old stair opening was not filled")
			if not restored.is_empty():
				var contact: Vector3 = restored.position
				check(absf(contact.y - top_y) < 0.06, "Old opening has wrong floor height")
		instance.free()
	print("STAIR CHECK: ", cases.size(), " cases; ", rays, " physics rays; ", failures, " failures")
	quit(0 if failures == 0 else 1)
