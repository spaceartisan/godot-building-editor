extends SceneTree

# Exported tangents in Godot: every ArrayMesh surface in the building and door
# scenes declares ARRAY_FORMAT_TANGENT, and each triangle's tangent agrees with
# Godot's own SurfaceTool.generate_tangents() on the same surface (direction
# within 5 degrees, same binormal sign). Triangles whose UVs are degenerate
# have no defined tangent and are only checked for being perpendicular to the normal.
var failures: int = 0

func _initialize() -> void:
	call_deferred("run_checks")

func check(condition: bool, message: String) -> void:
	if not condition:
		failures += 1
		push_error(message)

func run_checks() -> void:
	var scenes: Array = JSON.parse_string(FileAccess.get_file_as_string("res://cases.json"))
	var surfaces := 0
	var vertices := 0
	var compared := 0
	var degenerate := 0
	for scene: String in scenes:
		var root_node: Node = (load(scene) as PackedScene).instantiate()
		for node in root_node.find_children("*", "MeshInstance3D", true, false):
			var mesh := (node as MeshInstance3D).mesh as ArrayMesh
			if mesh == null:
				continue
			for s in mesh.get_surface_count():
				surfaces += 1
				var where := "%s %s surface %d" % [scene, node.name, s]
				check((mesh.surface_get_format(s) & Mesh.ARRAY_FORMAT_TANGENT) != 0, where + ": no tangents")
				var ours: Array = mesh.surface_get_arrays(s)
				var st := SurfaceTool.new()
				st.create_from(mesh, s)
				st.generate_tangents()
				var theirs: Array = st.commit_to_arrays()
				var pos: PackedVector3Array = ours[Mesh.ARRAY_VERTEX]
				var nrm: PackedVector3Array = ours[Mesh.ARRAY_NORMAL]
				var uv: PackedVector2Array = ours[Mesh.ARRAY_TEX_UV]
				var t1: PackedFloat32Array = ours[Mesh.ARRAY_TANGENT]
				var t2: PackedFloat32Array = theirs[Mesh.ARRAY_TANGENT]
				check(t1.size() == pos.size() * 4 and t2.size() == t1.size(), where + ": tangent array size")
				if t1.size() != pos.size() * 4 or t2.size() != t1.size():
					continue
				for i in pos.size():
					vertices += 1
					var a := Vector3(t1[i * 4], t1[i * 4 + 1], t1[i * 4 + 2])
					check(absf(a.dot(nrm[i])) < 0.02, where + ": tangent not perpendicular to the normal at vertex %d" % i)
					var tri := i - i % 3
					var d1 := uv[tri + 1] - uv[tri]
					var d2 := uv[tri + 2] - uv[tri]
					if absf(d1.x * d2.y - d2.x * d1.y) < 1e-9:
						degenerate += 1
						continue
					compared += 1
					var b := Vector3(t2[i * 4], t2[i * 4 + 1], t2[i * 4 + 2])
					check(a.normalized().dot(b.normalized()) > cos(deg_to_rad(5.0)), where + ": tangent direction differs from generate_tangents at vertex %d: %s vs %s" % [i, a, b])
					check(signf(t1[i * 4 + 3]) == signf(t2[i * 4 + 3]), where + ": binormal sign differs at vertex %d" % i)
		root_node.free()
	print("TANGENT CHECK: %d scenes; %d surfaces; %d vertices; %d compared with generate_tangents; %d with degenerate UVs; %d failures" % [scenes.size(), surfaces, vertices, compared, degenerate, failures])
	quit(1 if failures else 0)
