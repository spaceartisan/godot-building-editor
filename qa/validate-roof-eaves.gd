extends SceneTree

# Thick walls under sloped roofs: a ray dropped onto the outer top edge of each
# eave wall must hit the roof surface above the wall top, not the wall itself
# (Dirtscape: 0.3 m walls under a 38 degree gable poked through the roof).
var failures: int = 0
var rays: int = 0

func _initialize() -> void:
	call_deferred("run_checks")

func check(condition: bool, message: String) -> void:
	if not condition:
		failures += 1
		push_error(message)

func run_checks() -> void:
	var cases: Array = JSON.parse_string(FileAccess.get_file_as_string("res://cases.json"))
	for item: Dictionary in cases:
		var scene: Node3D = (load(item.scene) as PackedScene).instantiate()
		root.add_child(scene)
		await physics_frame
		await physics_frame
		var space := scene.get_world_3d().direct_space_state
		for p: Array in item.points:
			rays += 1
			var hit := space.intersect_ray(PhysicsRayQueryParameters3D.create(Vector3(p[0], 30, p[1]), Vector3(p[0], 0, p[1])))
			check(not hit.is_empty() and float(hit.position.y) > float(item.wallTop) + 0.003, "%s: at (%s, %s) the first hit is %s at %s, not the roof above the wall top %s" % [item.scene, p[0], p[1], "" if hit.is_empty() else str((hit.collider as Node).name), "-" if hit.is_empty() else str(hit.position.y), item.wallTop])
		scene.free()
	print("ROOF EAVE CHECK: %d buildings; %d physics rays; %d failures" % [cases.size(), rays, failures])
	quit(1 if failures else 0)
