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
		check(packed != null, "Missing platform scene")
		if packed == null:
			continue
		var instance: Node3D = packed.instantiate()
		root.add_child(instance)
		await physics_frame
		await physics_frame
		var world: World3D = instance.get_world_3d()
		var groups: Array[Node] = instance.find_children("Platforms", "Node3D", true, false)
		check(groups.size() == 1, item.scene + ": missing platform mesh group")
		if groups.size() == 1:
			var platform_mesh: MeshInstance3D = groups[0].get_child(0) as MeshInstance3D
			check(platform_mesh != null, item.scene + ": missing platform mesh")
			if platform_mesh != null:
				var bounds: AABB = platform_mesh.global_transform * platform_mesh.get_aabb()
				var expected_min: Vector3 = Vector3(item.platform.minX, item.platform.minY, item.platform.minZ)
				var expected_size: Vector3 = Vector3(item.platform.width, 0.18, item.platform.depth)
				check(bounds.position.distance_to(expected_min) < 0.001 and bounds.size.distance_to(expected_size) < 0.001, item.scene + ": platform mesh bounds differ from authored dimensions")
				check(platform_mesh.mesh.get_surface_count() == 3, item.scene + ": missing separate slab surfaces")
		for sample: Dictionary in item.samples:
			var down: Dictionary = ray(world, Vector3(sample.x, item.elevation + 1.2, sample.z), Vector3(sample.x, item.elevation - 1, sample.z))
			check(down.is_empty() == (sample.height == null), item.scene + ": floor/platform presence mismatch")
			if sample.height != null and not down.is_empty():
				var contact: Vector3 = down.position
				check(absf(contact.y - float(sample.height)) < 0.02, item.scene + ": wrong slab top height")
			# A short probe around story Y=0 must not hit an obsolete automatic
			# slab underneath/above the moved platform. Other authored slabs count.
			var at_level: Dictionary = ray(world, Vector3(sample.x, item.elevation + 0.05, sample.z), Vector3(sample.x, item.elevation - 0.05, sample.z))
			var at_zero: bool = sample.height != null and absf(float(sample.height) - item.elevation) < 0.001
			check(at_level.is_empty() != at_zero, item.scene + ": stale or missing automatic floor collision")
		var canopy: Dictionary = ray(world, Vector3(0.3, item.elevation + 8, 5.5), Vector3(0.3, item.elevation + 1.5, 5.5))
		check(not canopy.is_empty() == bool(item.roof), item.scene + ": wrong automatic roof coverage")
		instance.free()
	print("PLATFORM CHECK: ", cases.size(), " cases; ", rays, " physics rays; ", failures, " failures")
	quit(0 if failures == 0 else 1)
