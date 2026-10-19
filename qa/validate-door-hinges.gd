extends SceneTree

# Hinged door leaves in Godot: rotating Hinge/Hinge2 (as a game's door script
# does) carries each leaf's collision with it, and closing again blocks the
# doorway. cases.json lists the door scenes.
var failures: int = 0
var rays: int = 0

func _initialize() -> void:
	call_deferred("run_checks")

func check(condition: bool, message: String) -> void:
	if not condition:
		failures += 1
		push_error(message)

func hit(world: World3D, a: Vector3, b: Vector3) -> String:
	rays += 1
	var r := world.direct_space_state.intersect_ray(PhysicsRayQueryParameters3D.create(a, b))
	return "" if r.is_empty() else str((r.collider as Node).get_parent().name)

func settle() -> void:
	for i in 3:
		await physics_frame

func run_checks() -> void:
	var scenes: Array = JSON.parse_string(FileAccess.get_file_as_string("res://cases.json"))
	var leaves := 0
	for scene: String in scenes:
		var door: Node3D = (load(scene) as PackedScene).instantiate()
		root.add_child(door)
		await settle()
		var world := door.get_world_3d()
		# Leaf layout from the scene itself: hinge X, and the leaf centre's offset from it.
		var hinges: Array[Dictionary] = []
		for name in ["Hinge", "Hinge2"]:
			var hinge := door.get_node_or_null(name) as Node3D
			if hinge == null:
				continue
			var shape := hinge.get_node("AnimatableBody3D/CollisionShape3D") as CollisionShape3D
			hinges.append({"name": name, "node": hinge, "x": hinge.position.x, "offset": shape.position.x, "y": shape.position.y})
		check(hinges.size() == int(door.get_meta("door_leaves")), "%s: door_leaves metadata does not match the hinges" % scene)
		for h in hinges:
			leaves += 1
			var leaf_x: float = h.x + h.offset
			check(hit(world, Vector3(leaf_x, h.y, 1), Vector3(leaf_x, h.y, -1)) == h.name, "%s closed: %s leaf missing" % [scene, h.name])
		for h in hinges:
			(h.node as Node3D).rotation_degrees.y = 90.0
		await settle()
		for h in hinges:
			var leaf_x: float = h.x + h.offset
			# Rotating +90 degrees about Y turns local +X into -Z: the leaf now stands at the hinge's X.
			check(hit(world, Vector3(leaf_x, h.y, 1), Vector3(leaf_x, h.y, -1)) != h.name, "%s open: %s collision stayed in the doorway" % [scene, h.name])
			check(hit(world, Vector3(h.x - 1.0, h.y, -h.offset), Vector3(h.x + 1.0, h.y, -h.offset)) == h.name, "%s open: %s collision did not follow the hinge" % [scene, h.name])
		for h in hinges:
			(h.node as Node3D).rotation_degrees.y = 0.0
		await settle()
		for h in hinges:
			var leaf_x: float = h.x + h.offset
			check(hit(world, Vector3(leaf_x, h.y, 1), Vector3(leaf_x, h.y, -1)) == h.name, "%s re-closed: %s leaf does not block" % [scene, h.name])
		door.free()
	print("DOOR HINGE CHECK: %d doors; %d leaves; %d physics rays; %d failures" % [scenes.size(), leaves, rays, failures])
	quit(1 if failures else 0)
