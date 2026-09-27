extends SceneTree
# Renders screenshots of an exported building scene in Godot itself.
# The scene is loaded unmodified (empty materials render as Godot's default
# grey). Only a camera, a sun and ambient light are added for viewing.
# Reads res://views.json: {"scene": "...", "views": [{"name", "eye": [x,y,z], "look": [x,y,z], "fov"}]}

var cfg
var camera: Camera3D
var index := 0
var wait := 0

func _initialize() -> void:
	cfg = JSON.parse_string(FileAccess.get_file_as_string("res://views.json"))
	var packed: PackedScene = load("res://assets/" + cfg["scene"])
	get_root().add_child(packed.instantiate())
	var env := Environment.new()
	env.background_mode = Environment.BG_SKY
	var sky := Sky.new()
	sky.sky_material = ProceduralSkyMaterial.new()
	env.sky = sky
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = Color(0.55, 0.57, 0.62)
	env.ambient_light_energy = 0.45
	env.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	var world_env := WorldEnvironment.new()
	world_env.environment = env
	get_root().add_child(world_env)
	var sun := DirectionalLight3D.new()
	sun.rotation_degrees = Vector3(-50, -35, 0)
	sun.light_energy = 0.75
	sun.shadow_enabled = true
	sun.directional_shadow_max_distance = 120.0
	get_root().add_child(sun)
	camera = Camera3D.new()
	camera.far = 400.0
	get_root().add_child(camera)
	camera.make_current()
	wait = -10  # let the window settle before the first view is aimed and captured

func _aim() -> void:
	var v = cfg["views"][index]
	camera.fov = v.get("fov", 60.0)
	camera.global_position = Vector3(v["eye"][0], v["eye"][1], v["eye"][2])
	camera.look_at(Vector3(v["look"][0], v["look"][1], v["look"][2]), Vector3.UP)
	wait = 1

func _process(_delta: float) -> bool:
	wait += 1
	if wait == 0:
		_aim()
	if wait < 6:
		return false
	var v = cfg["views"][index]
	var img := get_root().get_texture().get_image()
	img.save_png("res://out/" + v["name"] + ".png")
	print("RENDERED " + v["name"])
	index += 1
	if index >= cfg["views"].size():
		quit(0)
		return true
	_aim()
	return false
