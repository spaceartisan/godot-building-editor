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
		check(packed != null, "Missing platform lifecycle scene")
		if packed == null:
			continue
		var instance: Node3D = packed.instantiate()
		root.add_child(instance)
		await physics_frame
		await physics_frame
		var world: World3D = instance.get_world_3d()
		var slab_count: int = 0
		for group: Node in instance.find_children("Platforms", "Node3D", true, false):
			for child: Node in group.get_children():
				if child is MeshInstance3D:
					var mesh_node: MeshInstance3D = child as MeshInstance3D
					if mesh_node.mesh.get_surface_count() == 3 and mesh_node.mesh.surface_get_name(0) == "TopFaces":
						slab_count += 1
		check(slab_count == int(item.count), item.scene + ": wrong platform mesh count")
		for sample: Dictionary in item.samples:
			var down: Dictionary = ray(world, Vector3(sample.x, 1.2, sample.z), Vector3(sample.x, -1, sample.z))
			check(down.is_empty() == (sample.height == null), item.scene + ": floor/platform presence mismatch")
			if sample.height != null and not down.is_empty():
				var contact: Vector3 = down.position
				check(absf(contact.y - float(sample.height)) < 0.02, item.scene + ": wrong restored slab height")
			var at_level: Dictionary = ray(world, Vector3(sample.x, 0.05, sample.z), Vector3(sample.x, -0.05, sample.z))
			var at_zero: bool = sample.height != null and absf(float(sample.height)) < 0.001
			check(at_level.is_empty() != at_zero, item.scene + ": stale or missing slab at story level")
		var canopy: Dictionary = ray(world, Vector3(0.3, 8, 5.5), Vector3(0.3, 1.5, 5.5))
		check((not canopy.is_empty()) == bool(item.roof), item.scene + ": wrong retained/removed roof")
		var post: Dictionary = ray(world, Vector3(-2.3, 1, 6), Vector3(-1.7, 1, 6))
		check((not post.is_empty()) == bool(item.support), item.scene + ": wrong retained/removed support collision")
		check((not instance.find_children("*_Post_*", "MeshInstance3D", true, false).is_empty()) == bool(item.support), item.scene + ": wrong support mesh state")
		instance.free()
	print("PLATFORM LIFECYCLE: ", cases.size(), " cases; ", rays, " physics rays; ", failures, " failures")
	quit(0 if failures == 0 else 1)
