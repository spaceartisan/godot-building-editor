extends SceneTree

var failures: int = 0
var scenes_checked: int = 0
var ray_checks: int = 0
var trimmed_mesh_checks: int = 0
var mesh_checks: int = 0
var collision_checks: int = 0
var material_surfaces: int = 0
var generic_mode: bool = OS.get_environment("BUILDING_CHECK_MODE") == "assets"
var allow_materials: bool = OS.get_environment("BUILDING_ALLOW_MATERIALS") == "1"

func _initialize() -> void:
	call_deferred("run_checks")

func collect_scenes(folder: String) -> Array[String]:
	var result: Array[String] = []
	var dir := DirAccess.open(folder)
	for file_name in dir.get_files():
		if file_name.ends_with(".tscn"):
			result.append(folder.path_join(file_name))
	for folder_name in dir.get_directories():
		if not folder_name.begins_with("."):
			result.append_array(collect_scenes(folder.path_join(folder_name)))
	return result

func check(condition: bool, message: String) -> void:
	if not condition:
		failures += 1
		push_error(message)

func ray(world: World3D, origin: Vector3, end: Vector3) -> Dictionary:
	ray_checks += 1
	var query := PhysicsRayQueryParameters3D.create(origin, end, 1)
	return world.direct_space_state.intersect_ray(query)

func check_collision(shape_node: CollisionShape3D) -> void:
	collision_checks += 1
	check(shape_node.shape != null, "Missing collision resource: " + str(shape_node.get_path()))
	if shape_node.shape is BoxShape3D:
		var dimensions = shape_node.shape.size
		check(dimensions.is_finite() and dimensions.x > 0 and dimensions.y > 0 and dimensions.z > 0, "Invalid collision box dimensions")
	elif shape_node.shape is ConcavePolygonShape3D:
		var faces = shape_node.shape.get_faces()
		check(faces.size() >= 3 and faces.size() % 3 == 0, "Empty/invalid triangle collision")
		for vertex in faces:
			check(vertex.is_finite(), "Non-finite collision vertex")
	elif shape_node.shape is ConvexPolygonShape3D:
		var points = shape_node.shape.points
		check(points.size() >= 4, "Empty/invalid convex collision")
		for vertex in points:
			check(vertex.is_finite(), "Non-finite convex vertex")

func check_roof_clearance(instance: Node3D, scene_path: String) -> void:
	# Isolate roof collisions so ceilings and wall bodies cannot hide either
	# an intrusion or a missing roof. Restore every shape after these probes.
	var saved: Dictionary = {}
	for node in instance.find_children("*", "CollisionShape3D", true, false):
		var shape_node = node as CollisionShape3D
		var roof_shape = shape_node.name.begins_with("Roof_") or shape_node.name.begins_with("RoofSection_") or shape_node.name.begins_with("ManualRoof_") or shape_node.name.begins_with("RidgeCap_")
		saved[shape_node] = shape_node.disabled
		shape_node.disabled = not roof_shape
	await physics_frame
	await physics_frame
	var world = instance.get_world_3d()
	if scene_path.ends_with("farmhouse.tscn") or scene_path.ends_with("twostory.tscn"):
		var wall_z = 6.0 if scene_path.ends_with("farmhouse.tscn") else 7.0
		for x in [-1.0, 0.0, 1.0]:
			check(ray(world, Vector3(x, 3.4, wall_z - 0.25), Vector3(x, 3.99, wall_z - 0.25)).is_empty(), "Porch roof intrudes into room: " + scene_path)
			check(not ray(world, Vector3(x, 4.6, wall_z + 0.2), Vector3(x, 3.4, wall_z + 0.2)).is_empty(), "Roof lost at exterior attachment: " + scene_path)
			check(not ray(world, Vector3(x, 4.2, wall_z + 2.2), Vector3(x, 3.4, wall_z + 2.2)).is_empty(), "Exposed porch overhang missing: " + scene_path)
	if scene_path.ends_with("roof_junctions.tscn"):
		for point in [Vector2(0, -3.75), Vector2(0, 3.75), Vector2(4.75, 0), Vector2(-4.75, 0)]:
			check(ray(world, Vector3(point.x, 2.5, point.y), Vector3(point.x, 4.2, point.y)).is_empty(), "Attached roof intrudes into taller host")
		for point in [Vector2(0, -4.2), Vector2(0, 4.2), Vector2(5.2, 0), Vector2(-5.2, 0)]:
			check(not ray(world, Vector3(point.x, 4.2, point.y), Vector3(point.x, 2.5, point.y)).is_empty(), "Trim removed exterior canopy")
		check(not ray(world, Vector3(5.3, 3.4, 3.8), Vector3(5.3, 2.5, 3.8)).is_empty(), "Partial attachment removed free corner overhang")
		check(not ray(world, Vector3(4.9, 2.86, 3.8), Vector3(5.2, 2.86, 3.8)).is_empty(), "Roof cut edge lacks collision cap")
	if scene_path.ends_with("roof_attachment.tscn"):
		for x in [-0.5, 0.0, 0.5]:
			check(ray(world, Vector3(x, 4.6, 0), Vector3(x, 3.8, 0)).is_empty(), "Canopy remains buried inside host roof")
			check(not ray(world, Vector3(x, 5, 5), Vector3(x, 3.8, 5)).is_empty(), "Attached canopy lost beyond host")
			check(ray(world, Vector3(x, 5, 7.1), Vector3(x, 2.9, 7.1)).is_empty(), "Flush edge retains roof overhang")
		check(not ray(world, Vector3(0, 6.5, 0), Vector3(0, 5.5, 0)).is_empty(), "Roof attachment removed the host ridge")
	for shape_node in saved:
		shape_node.disabled = saved[shape_node]
	await physics_frame

func run_checks() -> void:
	for scene_path in collect_scenes("res://assets"):
		var packed := load(scene_path) as PackedScene
		check(packed != null, "Cannot load: " + scene_path)
		if packed == null:
			continue
		var instance := packed.instantiate() as Node3D
		check(instance != null, "Expected a Node3D scene root: " + scene_path)
		if instance == null:
			continue
		root.add_child(instance)
		scenes_checked += 1
		for node in instance.find_children("*", "MeshInstance3D", true, false):
			var mesh_node := node as MeshInstance3D
			mesh_checks += 1
			check(mesh_node.mesh != null and mesh_node.mesh.get_surface_count() > 0, "Empty mesh: " + str(node.get_path()))
			if mesh_node.mesh != null:
				var mesh_faces = mesh_node.mesh.get_faces()
				check(mesh_faces.size() >= 3 and mesh_faces.size() % 3 == 0, "Empty/invalid mesh triangles: " + str(node.get_path()))
				for vertex in mesh_faces:
					check(vertex.is_finite(), "Non-finite mesh vertex")
				for surface_index in mesh_node.mesh.get_surface_count():
					if mesh_node.mesh.surface_get_material(surface_index) != null or mesh_node.get_surface_override_material(surface_index) != null:
						material_surfaces += 1
						check(generic_mode and allow_materials, "Material slot must be empty: " + str(node.get_path()))
			check(mesh_node.material_override == null or (generic_mode and allow_materials), "Material override must be empty")
		for node in instance.find_children("*", "CollisionShape3D", true, false):
			var shape_node = node as CollisionShape3D
			check_collision(shape_node)
			if shape_node.shape is ConcavePolygonShape3D and (shape_node.name.begins_with("Roof_") or shape_node.name.begins_with("ManualRoof_") or shape_node.name.begins_with("RoofSection_")):
				var mesh_name = str(shape_node.name).trim_suffix("_Collision")
				# Roof names can repeat between stories. Resolve inside the
				# collision body's story/root scope, not the first global match.
				var mesh_scope = shape_node.get_parent().get_parent()
				var mesh_node = mesh_scope.find_child(mesh_name, true, false) as MeshInstance3D
				check(mesh_node != null, "Trimmed roof mesh missing")
				if mesh_node != null:
					var visual_faces = mesh_node.mesh.get_faces()
					var collision_faces = shape_node.shape.get_faces()
					check(visual_faces.size() == collision_faces.size(), "Trimmed roof collision triangle count mismatch")
					for vertex_index in mini(visual_faces.size(), collision_faces.size()):
						check(mesh_node.to_global(visual_faces[vertex_index]).distance_to(shape_node.to_global(collision_faces[vertex_index])) < 0.0001, "Trimmed roof mesh/collision mismatch")
					trimmed_mesh_checks += 1
		if generic_mode:
			print("ASSET PASS ", scene_path)
			instance.free()
			continue
		if scene_path.ends_with("farmhouse.tscn") or scene_path.ends_with("twostory.tscn") or scene_path.ends_with("roof_junctions.tscn") or scene_path.ends_with("roof_attachment.tscn"):
			await check_roof_clearance(instance, scene_path)
		if scene_path.ends_with("l_shaped_outline.tscn") or scene_path.ends_with("u_shaped_outline.tscn") or scene_path.ends_with("courtyard_outline.tscn"):
			await physics_frame
			await physics_frame
			var world = instance.get_world_3d()
			var kept = [Vector2(-4, 3), Vector2(4, 3), Vector2(0, -3)]
			var empty = [Vector2(0, 3)]
			if scene_path.ends_with("l_shaped_outline.tscn"):
				kept = [Vector2(-3, 3), Vector2(3, -2)]
				empty = [Vector2(3, 3), Vector2(0.5, 0.5)]
			if scene_path.ends_with("courtyard_outline.tscn"):
				kept = [Vector2(-4, 0), Vector2(4, 0), Vector2(0, -3)]
				empty = [Vector2(0, 0), Vector2(-1.8, -1.8), Vector2(1.8, 1.8)]
			for point in kept:
				check(not ray(world, Vector3(point.x, 1, point.y), Vector3(point.x, -1, point.y)).is_empty(), "Concave footprint floor missing: " + scene_path)
				check(not ray(world, Vector3(point.x, 8, point.y), Vector3(point.x, 2, point.y)).is_empty(), "Concave footprint roof missing: " + scene_path)
			for point in empty:
				check(ray(world, Vector3(point.x, 8, point.y), Vector3(point.x, -1, point.y)).is_empty(), "Notch/courtyard filled by automatic surfaces: " + scene_path)
		if scene_path.ends_with("barn_v2.tscn"):
			await physics_frame
			await physics_frame
			var world := instance.get_world_3d()
			for x in [-2.8, 0.0, 2.8]:
				check(ray(world, Vector3(x, 1.4, 11), Vector3(x, 1.4, 9)).is_empty(), "Barn entrance blocked")
			check(not ray(world, Vector3(4, 1.4, 11), Vector3(4, 1.4, 9)).is_empty(), "Barn door jamb missing")
			check(not ray(world, Vector3(0, 4.3, 11), Vector3(0, 4.3, 9)).is_empty(), "Barn upper wall missing")
			for z in [-10.0, 10.0]:
				for x in [-4.0, 0.0, 4.0]:
					var hit := ray(world, Vector3(x, 7, z + 0.5), Vector3(x, 7, z - 0.5))
					check(not hit.is_empty(), "Barn gable collision missing")
					if not hit.is_empty():
						check(str(hit["collider"].name) == "ManualRoofCollision", "Barn gable probe hit unrelated geometry")
		if scene_path.ends_with("editable_junctions.tscn"):
			await physics_frame
			await physics_frame
			var world = instance.get_world_3d()
			for y in [1.4, 4.38]:
				check(ray(world, Vector3(-2.25, y, -0.5), Vector3(-2.25, y, 0.5)).is_empty(), "Moved wall passage blocked")
				check(not ray(world, Vector3(-3.6, y, -0.5), Vector3(-3.6, y, 0.5)).is_empty(), "Moved wall jamb collision missing")
				check(not ray(world, Vector3(1.3, y, 0), Vector3(0.7, y, 0)).is_empty(), "Moved junction collision missing")
				check(not ray(world, Vector3(0, y, 2), Vector3(1, y, 2)).is_empty(), "Moved diagonal wall collision missing")
			check(not ray(world, Vector3(-3.6, 2.89, -0.5), Vector3(-3.6, 2.89, 0.5)).is_empty(), "Edited inter-story wall band collision missing")
		if scene_path.ends_with("courtyard_regions.tscn"):
			await physics_frame
			await physics_frame
			var world := instance.get_world_3d()
			var metadata: Array = instance.get_node("Floor_01").get_meta("building_regions")
			check(metadata.size() == 4, "Region metadata missing")
			check(metadata[1]["effect"] == "void", "Courtyard intent missing")
			for x in [-1.8, 0.0, 1.8]:
				for z in [-1.8, 0.0, 1.8]:
					check(ray(world, Vector3(x, 8, z), Vector3(x, -1, z)).is_empty(), "Courtyard filled by floor/ceiling/roof collision")
			for x in [-4.0, 4.0]:
				check(not ray(world, Vector3(x, 1, 0), Vector3(x, -1, 0)).is_empty(), "Region wing floor missing")
				check(not ray(world, Vector3(x, 8, 0), Vector3(x, 2, 0)).is_empty(), "Region wing roof missing")
		if scene_path.ends_with("variable_levels.tscn"):
			await physics_frame
			await physics_frame
			var world := instance.get_world_3d()
			var flight_index := 0
			for stair_node in instance.find_children("Staircase_*", "Node3D", true, false):
				var stair := stair_node as Node3D
				var rise: float = 3.8 if flight_index == 0 else 2.62
				for distance in [-3.1, -3.0, -2.99, -1.5, 0.0, 1.5, 2.99, 3.0, 3.001, 3.03, 3.1]:
					var point := stair.to_global(Vector3(0, 0, -distance))
					var expected_y := stair.global_position.y + clampf((distance + 3.0) / 6.0, 0.0, 1.0) * rise
					var hit := ray(world, Vector3(point.x, expected_y + 0.4, point.z), Vector3(point.x, expected_y - 0.5, point.z))
					check(not hit.is_empty(), "Variable height stair unsupported")
					if not hit.is_empty():
						var hit_point: Vector3 = hit["position"]
						check(absf(hit_point.y - expected_y) < 0.06, "Variable height stair walking level incorrect")
				flight_index += 1
			check(flight_index == 2, "Variable level fixture must contain both flights")
			for band_y in [2.65, 5.31]:
				check(not ray(world, Vector3(0, band_y, 4.5), Vector3(0, band_y, 5.5)).is_empty(), "Variable story band collision missing")
		if scene_path.contains("stair_") or scene_path.contains("manual_upper_stairwell"):
			await physics_frame
			await physics_frame
			var stair := instance.find_child("Staircase_*", true, false) as Node3D
			check(stair != null, "Missing stair fixture")
			if stair != null:
				var world := instance.get_world_3d()
				# The generated fixture has a 4m run and a 2.98m rise.
				for distance in [-2.1, -2.0, -1.99, -1.0, 0.0, 1.0, 1.99, 2.0, 2.001, 2.03, 2.1]:
					var local_point := Vector3(0, 0, -distance)
					var point := stair.to_global(local_point)
					var expected_y: float = clampf((distance + 2.0) / 4.0, 0.0, 1.0) * 2.98
					# Probe from the walking level; above the lower entrance is
					# legitimately an upper-story floor, not a stair obstruction.
					var hit := ray(world, Vector3(point.x, expected_y + 0.5, point.z), Vector3(point.x, -0.5, point.z))
					check(not hit.is_empty(), scene_path + ": unsupported stair/landing at " + str(distance))
					if not hit.is_empty():
						var hit_point: Vector3 = hit["position"]
						check(absf(hit_point.y - expected_y) < 0.06, scene_path + ": unexpected walking height at " + str(distance) + " got " + str(hit_point.y))
				check(not ray(world, Vector3(0, 2.89, 4.5), Vector3(0, 2.89, 5.5)).is_empty(), scene_path + ": exterior story band has no collision")
				check(not ray(world, Vector3(-2.5, 2.89, 0), Vector3(-1.5, 2.89, 0)).is_empty(), scene_path + ": interior story band has no collision")
		print("SCENE PASS ", scene_path)
		instance.free()
	if generic_mode:
		check(scenes_checked > 0, "No asset scenes checked")
		if OS.get_environment("BUILDING_REQUIRE_COLLISION") == "1":
			check(collision_checks > 0, "No collision shapes found in asset set")
		print("ASSET_RESULT: ", JSON.stringify({"scenes": scenes_checked, "meshInstances": mesh_checks, "collisionShapes": collision_checks, "materialSurfaces": material_surfaces, "trimmedMeshComparisons": trimmed_mesh_checks, "physicsRays": 0, "failures": failures}))
	else:
		print("RESULT: ", scenes_checked, " scenes; ", ray_checks, " physics rays; ", trimmed_mesh_checks, " trimmed mesh/collision comparisons; ", failures, " failures")
	quit(1 if failures else 0)
