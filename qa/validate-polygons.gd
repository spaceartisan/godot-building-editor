extends SceneTree

var failures: int = 0
var ray_count: int = 0

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
		check(packed != null, "Missing polygon scene")
		if packed == null:
			continue
		var instance: Node3D = packed.instantiate()
		root.add_child(instance)
		await physics_frame
		await physics_frame
		check(instance.has_node("Floor_01/Geometry/Walls/ExteriorWalls/OutsideFaces"), "Missing exterior lighting shell")
		check(instance.has_node("Floor_01/Geometry/Walls/ExteriorWalls/InsideFaces"), "Missing interior lighting shell")
		if item.has("regions"):
			var actual_regions: Array = instance.get_node("Floor_01").get_meta("building_regions", [])
			check(actual_regions.size() == item.regions.size(), "Wrong exported region count")
			for region_index: int in mini(actual_regions.size(), item.regions.size()):
				var actual_region: Dictionary = actual_regions[region_index]
				var expected_region: Dictionary = item.regions[region_index]
				for field: String in ["id", "label", "kind", "effect"]:
					check(actual_region.get(field) == expected_region[field], "Wrong region metadata: " + field)
				for field: String in ["minX", "maxX", "minZ", "maxZ"]:
					check(actual_region.has(field) and absf(float(actual_region[field]) - float(expected_region[field])) < 0.00001, "Wrong region bounds")
				var actual_corners: Array = actual_region.get("polygon", [])
				check(actual_corners.size() == expected_region.polygon.size(), "Wrong polygon corner count")
				for corner_index: int in mini(actual_corners.size(), expected_region.polygon.size()):
					for axis: String in ["x", "z"]:
						check(absf(float(actual_corners[corner_index][axis]) - float(expected_region.polygon[corner_index][axis])) < 0.00001, "Wrong exported polygon corner")
		var space: PhysicsDirectSpaceState3D = instance.get_world_3d().direct_space_state
		for sample: Dictionary in item.rays:
			var start: Vector3 = Vector3(sample.from[0], sample.from[1], sample.from[2])
			var finish: Vector3 = Vector3(sample.to[0], sample.to[1], sample.to[2])
			var hit: Dictionary = space.intersect_ray(PhysicsRayQueryParameters3D.create(start, finish, 1))
			ray_count += 1
			check(not hit.is_empty() == sample.hit, item.scene + ": wrong collision at " + str(start))
			if not hit.is_empty() and sample.hit:
				var point: Vector3 = hit.position
				check(absf(point.y - sample.y) < 0.002, item.scene + ": wrong contact height " + str(point))
		instance.free()
	print("POLYGON CHECK: ", cases.size(), " cases; ", ray_count, " physics rays; ", failures, " failures")
	quit(0 if failures == 0 else 1)
