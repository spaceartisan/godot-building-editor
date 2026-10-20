extends SceneTree

# Lean-to porch roofs: vertical rays through each porch must first hit the
# expected surface (lean-to top or underside, or the main roof) at the height
# the shared geometry predicts, within a tolerance.
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
		for ray: Dictionary in item.rays:
			rays += 1
			var from := Vector3(ray.from[0], ray.from[1], ray.from[2])
			var to := Vector3(ray.to[0], ray.to[1], ray.to[2])
			var hit := space.intersect_ray(PhysicsRayQueryParameters3D.create(from, to))
			var y := -1000.0 if hit.is_empty() else float(hit.position.y)
			check(not hit.is_empty() and y >= float(ray.min) and y <= float(ray.max), "%s %s: first hit %s at y %s, expected %s to %s" % [item.scene, ray.label, "nothing" if hit.is_empty() else str((hit.collider as Node).name), y, ray.min, ray.max])
		scene.free()
	print("LEAN-TO CHECK: %d buildings; %d physics rays; %d failures" % [cases.size(), rays, failures])
	quit(1 if failures else 0)
