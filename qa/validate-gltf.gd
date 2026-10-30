extends SceneTree

# glTF export read back by Godot's own importer (GLTFDocument), compared with
# the .tscn export of the same building: the same visual meshes at the same
# world bounds, the same triangle count under each surface/material name,
# front faces that agree with the stored normals after import, lights at the
# same places, and building_part metadata on every mesh (glTF extras). UBX_/
# UCX_ collision meshes are Unreal's convention; Godot imports them as plain
# meshes, so they are counted separately.
var failures: int = 0

func _initialize() -> void:
	call_deferred("run_checks")

func check(condition: bool, message: String) -> void:
	if not condition:
		failures += 1
		push_error(message)

func is_collision(node: Node) -> bool:
	return node.name.begins_with("UBX_") or node.name.begins_with("UCX_")

func surface_name(mi: MeshInstance3D, s: int) -> String:
	var mat := mi.mesh.surface_get_material(s)
	if mat != null and mat.resource_name != "":
		return mat.resource_name
	if mi.mesh is ArrayMesh:
		var n := (mi.mesh as ArrayMesh).surface_get_name(s)
		if n != "":
			return n
	return str(mi.get_meta("building_part", "Default"))

func summary(root_node: Node, imported: bool) -> Dictionary:
	var bounds: Array[String] = []
	var tris := {}
	var lights: Array[String] = []
	var parts := 0
	var meshes := 0
	var collision := 0
	var facing_bad := 0
	for node in root_node.find_children("*", "MeshInstance3D", true, false):
		var mi := node as MeshInstance3D
		if mi.mesh == null:
			continue
		if is_collision(mi):
			collision += 1
			continue
		meshes += 1
		var aabb := mi.global_transform * mi.mesh.get_aabb()
		bounds.append("%.3f,%.3f,%.3f|%.3f,%.3f,%.3f" % [aabb.position.x, aabb.position.y, aabb.position.z, aabb.end.x, aabb.end.y, aabb.end.z])
		var extras: Dictionary = mi.get_meta("extras", {}) if imported else {}
		if (imported and extras.has("building_part")) or (not imported and mi.has_meta("building_part")):
			parts += 1
		for s in mi.mesh.get_surface_count():
			var arrays := mi.mesh.surface_get_arrays(s)
			var pos: PackedVector3Array = arrays[Mesh.ARRAY_VERTEX]
			var nrm: PackedVector3Array = arrays[Mesh.ARRAY_NORMAL]
			var idx: PackedInt32Array = arrays[Mesh.ARRAY_INDEX] if arrays[Mesh.ARRAY_INDEX] != null else PackedInt32Array()
			var count := idx.size() if idx.size() > 0 else pos.size()
			var key := surface_name(mi, s)
			tris[key] = int(tris.get(key, 0)) + count / 3
			# Godot's front faces are clockwise: (v2 - v0) x (v1 - v0) points out of them.
			for t in range(0, count, 3):
				var i0 := idx[t] if idx.size() > 0 else t
				var i1 := idx[t + 1] if idx.size() > 0 else t + 1
				var i2 := idx[t + 2] if idx.size() > 0 else t + 2
				var face := (pos[i2] - pos[i0]).cross(pos[i1] - pos[i0])
				if face.length() < 1e-5:
					continue
				if face.normalized().dot(nrm[i0]) < 0.99:
					facing_bad += 1
	for node in root_node.find_children("*", "OmniLight3D", true, false):
		var p := (node as Node3D).global_position
		lights.append("%.3f,%.3f,%.3f" % [p.x, p.y, p.z])
	bounds.sort()
	lights.sort()
	return {"bounds": bounds, "tris": tris, "lights": lights, "parts": parts, "meshes": meshes, "collision": collision, "facing_bad": facing_bad}

func run_checks() -> void:
	var cases: Array = JSON.parse_string(FileAccess.get_file_as_string("res://cases.json"))
	var meshes := 0
	var triangles := 0
	var lights := 0
	var collision := 0
	for c: Dictionary in cases:
		var scene_root: Node = (load(c.tscn) as PackedScene).instantiate()
		root.add_child(scene_root)
		var doc := GLTFDocument.new()
		var state := GLTFState.new()
		# 64 = EditorSceneFormatImporter.IMPORT_FORCE_DISABLE_MESH_COMPRESSION: compressed
		# attributes re-quantize normals on sloped faces, which would hide what the file holds.
		var err := doc.append_from_file(ProjectSettings.globalize_path(c.glb), state, 64)
		check(err == OK, "%s: GLTFDocument.append_from_file failed (%d)" % [c.glb, err])
		if err != OK:
			continue
		var gltf_root: Node = doc.generate_scene(state)
		root.add_child(gltf_root)
		var a := summary(scene_root, false)
		var b := summary(gltf_root, true)
		var where: String = c.glb
		check(a.meshes == b.meshes, "%s: %d meshes in the .tscn, %d imported" % [where, a.meshes, b.meshes])
		check(a.bounds == b.bounds, "%s: mesh world bounds differ" % where)
		check(a.tris == b.tris, "%s: triangles per surface differ: %s vs %s" % [where, str(a.tris), str(b.tris)])
		check(a.lights == b.lights, "%s: light positions differ" % where)
		check(a.parts == b.parts, "%s: building_part on %d meshes, %d imported" % [where, a.parts, b.parts])
		check(b.facing_bad == 0, "%s: %d imported triangles face away from their normals" % [where, b.facing_bad])
		check(a.facing_bad == b.facing_bad or a.facing_bad == 0, "%s: facing differs" % where)
		meshes += b.meshes
		lights += b.lights.size()
		collision += b.collision
		for k in b.tris:
			triangles += int(b.tris[k])
		scene_root.queue_free()
		gltf_root.queue_free()
	print("GLTF CHECK: %d cases; %d meshes; %d triangles; %d lights; %d collision meshes; %d failures" % [cases.size(), meshes, triangles, lights, collision, failures])
	quit(1 if failures > 0 else 0)
