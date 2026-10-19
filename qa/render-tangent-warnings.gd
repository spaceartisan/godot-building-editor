# Renders an exported scene for 20 frames with a triplanar, normal-mapped
# material on every mesh; tangent-tests.mjs counts Godot's
# "requires tangents" warnings in the output.
extends SceneTree
func _initialize() -> void:
	call_deferred("run")
func run() -> void:
	var path: String = OS.get_cmdline_user_args()[0]
	var scene: Node3D = (load(path) as PackedScene).instantiate()
	root.add_child(scene)
	var mat := StandardMaterial3D.new()
	mat.uv1_triplanar = true
	mat.normal_enabled = true
	mat.normal_texture = NoiseTexture2D.new()
	for n in scene.find_children("*", "MeshInstance3D", true, false):
		(n as MeshInstance3D).material_override = mat
	var cam := Camera3D.new()
	root.add_child(cam)
	cam.position = Vector3(0, 3, 14)
	cam.look_at(Vector3(0, 1, 0))
	for i in 20:
		await process_frame
	print("frames done")
	quit()
