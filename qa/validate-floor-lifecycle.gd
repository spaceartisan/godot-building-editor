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

func height_hit(hit: Dictionary, expected: float, message: String) -> void:
	check(not hit.is_empty(), message + ": missing contact")
	if not hit.is_empty():
		var contact: Vector3 = hit.position
		check(absf(contact.y - expected) < 0.02, message + ": wrong height " + str(contact.y))

func run_checks() -> void:
	var cases: Array = JSON.parse_string(FileAccess.get_file_as_string("res://cases.json"))
	for item: Dictionary in cases:
		var packed: PackedScene = load(item.scene)
		check(packed != null, "Missing floor lifecycle scene")
		if packed == null:
			continue
		var instance: Node3D = packed.instantiate()
		root.add_child(instance)
		await physics_frame
		await physics_frame
		var world: World3D = instance.get_world_3d()
		var floor_count: int = 3 if item.third else 2
		check(instance.find_children("Floor_*", "Node3D", false, false).size() == floor_count, "Wrong floor count")
		check(instance.find_children("Staircase_*", "Node3D", true, false).size() == floor_count - 1, "Wrong connected stair count")
		for index: int in range(1, floor_count + 1):
			var walls: String = "Floor_%02d/Geometry/Walls/" % index
			check(instance.has_node(walls + "ExteriorWalls/OutsideFaces"), "Missing separate outside shell")
			check(instance.has_node(walls + "ExteriorWalls/InsideFaces"), "Missing separate inside shell")
			if index < 3 or not item.narrow:
				check(instance.has_node(walls + "InteriorWalls/SideAFaces"), "Missing interior Side A")
				check(instance.has_node(walls + "InteriorWalls/SideBFaces"), "Missing interior Side B")
		for mesh_node: MeshInstance3D in instance.find_children("*", "MeshInstance3D", true, false):
			check(mesh_node.material_override == null, "Unexpected material override")
			for surface: int in range(mesh_node.mesh.get_surface_count()):
				check(mesh_node.mesh.surface_get_material(surface) == null, "Unexpected material resource")
		# Full-height lower partitions and the original stair flight stay intact.
		for endpoints: Array in [[Vector3(0, 2.89, 4.5), Vector3(0, 2.89, 5.5)], [Vector3(-2.5, 2.89, 3), Vector3(-1.5, 2.89, 3)]]:
			check(not ray(world, endpoints[0], endpoints[1]).is_empty(), "Original story seam missing")
		height_hit(ray(world, Vector3(1, 3.38, 0), Vector3(1, 1, 0)), 1.49, "Original stair cut/ramp")
		# Covered roofs move up; exposed parts of a smaller top story stay low.
		height_hit(ray(world, Vector3(3, 12, 0), Vector3(3, 3, 0)), 8.88 if item.third else 5.9, "East roof exposure")
		height_hit(ray(world, Vector3(-3, 12, 0), Vector3(-3, 3, 0)), 8.88 if item.third and not item.narrow else 5.9, "West roof exposure")
		# A solid slab and a stair hole replace the former top ceiling and roof.
		height_hit(ray(world, Vector3(3, 6.3, 0), Vector3(3, 5.4, 0)), 5.96 if item.third else 5.9, "Solid slab/restored roof")
		height_hit(ray(world, Vector3(1, 6.3, 0), Vector3(1, 4, 0)), 4.47 if item.third else 5.9, "New stair cut/restored roof")
		# The story ceiling hangs at wall top − ceiling thickness whether or not a
		# floor is added above (uniform ceiling height; the stair opening stays cut).
		height_hit(ray(world, Vector3(3, 5.5, 0), Vector3(3, 6.2, 0)), 5.66, "Ceiling underside")
		var opening: Dictionary = ray(world, Vector3(1, 5.5, 0), Vector3(1, 6.2, 0))
		check(opening.is_empty() == bool(item.third), "Stair opening / restored ceiling mismatch")
		# Above the old roof, below the new slab top: only the added wall skirts occupy this band.
		var exterior_seam: Dictionary = ray(world, Vector3(3, 5.93, 4.5), Vector3(3, 5.93, 5.5))
		check(exterior_seam.is_empty() != bool(item.third), "Exterior upper band mismatch")
		var interior_seam: Dictionary = ray(world, Vector3(-2.5, 5.93, 3), Vector3(-1.5, 5.93, 3))
		check(interior_seam.is_empty() != bool(item.third and not item.narrow), "Interior upper band mismatch")
		var top_ceiling: Dictionary = ray(world, Vector3(3, 8, 0), Vector3(3, 9.2, 0))
		if item.third:
			height_hit(top_ceiling, 8.64, "Top ceiling")
		else:
			check(top_ceiling.is_empty(), "Removed story left collision")
		instance.free()
	print("FLOOR LIFECYCLE: ", cases.size(), " cases; ", rays, " physics rays; ", failures, " failures")
	quit(0 if failures == 0 else 1)
