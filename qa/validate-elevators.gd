extends SceneTree

# Elevator export physics: the car moves between stop markers, its floor carries
# a body at each stop, upper floors have a hole at the shaft, closed landing
# doors block the opening and opened ones lead into the car.
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

func hit_path(hit: Dictionary) -> String:
	if hit.is_empty():
		return ""
	return String((hit.collider as Node).get_path())

func settle() -> void:
	await physics_frame
	await physics_frame

func run_checks() -> void:
	var item: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://case.json"))
	var packed: PackedScene = load(item.scene)
	check(packed != null, "Missing building scene")
	if packed == null:
		finish()
		return
	var building: Node3D = packed.instantiate()
	root.add_child(building)
	await settle()
	var world: World3D = building.get_world_3d()
	var elevator: Node3D = building.get_node_or_null("Elevators/" + String(item.node)) as Node3D
	check(elevator != null, "Missing elevator instance")
	if elevator == null:
		finish()
		return
	var car: Node3D = elevator.get_node("Car") as Node3D
	var stops: Array[Node] = elevator.get_node("Stops").get_children()
	check(stops.size() == item.stops.size(), "Wrong stop count")
	for i in stops.size():
		var marker: Marker3D = stops[i] as Marker3D
		check(marker != null and absf(marker.global_position.y - float(item.stops[i])) < 0.001, "Stop %d at the wrong height" % (i + 1))
	var x: float = item.x
	var z: float = item.z
	# The car floor carries a body at every stop.
	for i in stops.size():
		car.position = (stops[i] as Node3D).position
		await settle()
		var y: float = item.stops[i]
		var down: Dictionary = ray(world, Vector3(x, y + 1.2, z), Vector3(x, y - 0.5, z))
		check(not down.is_empty() and absf(down.position.y - y) < 0.02, "Car floor missing at stop %d" % (i + 1))
		# At the bottom stop the car floor is flush with the building slab; either may answer.
		check(i == 0 or hit_path(down).ends_with("/Car"), "Stop %d: hit %s instead of the car" % [i + 1, hit_path(down)])
	# With the car at the top, the shaft falls through to the bottom floor:
	# the upper floors' slabs have a hole at the shaft, the rest of the floor does not.
	car.position = (stops[stops.size() - 1] as Node3D).position
	await settle()
	var mid: float = item.stops[1]
	var well: Dictionary = ray(world, Vector3(x, mid + 1.0, z), Vector3(x, -1, z))
	check(not well.is_empty() and absf(well.position.y - float(item.stops[0])) < 0.02, "Floor 2 has no hole at the shaft: %s" % str(well.get("position")))
	var room: Dictionary = ray(world, Vector3(item.roomX, mid + 1.0, item.roomZ), Vector3(item.roomX, -1, item.roomZ))
	check(not room.is_empty() and absf(room.position.y - mid) < 0.02, "Floor 2 slab missing away from the shaft")
	# Closed landing doors block the opening on every floor; jambs are shaft walls.
	for i in stops.size():
		var y: float = float(item.stops[i]) + 1.0
		var door: Dictionary = ray(world, Vector3(x, y, item.approachZ), Vector3(x, y, z))
		check(not door.is_empty() and absf(door.position.z - float(item.leafZ)) < 0.02 and hit_path(door).contains("Landing_%02d/Door" % (i + 1)), "Landing %d doors: %s at %s" % [i + 1, hit_path(door), str(door.get("position"))])
		var jamb: Dictionary = ray(world, Vector3(item.jambX, y, item.approachZ), Vector3(item.jambX, y, z))
		check(not jamb.is_empty() and absf(jamb.position.z - float(item.shaftZ)) < 0.02 and hit_path(jamb).contains("ShaftBody"), "Landing %d jamb: %s" % [i + 1, hit_path(jamb)])
	# Car back at the bottom, landing doors slid open: the ray reaches the car's back wall.
	car.position = (stops[0] as Node3D).position
	var landing: Node3D = elevator.get_node("Landings/Landing_01") as Node3D
	var left: Node3D = landing.get_node("DoorLeft") as Node3D
	var right: Node3D = landing.get_node("DoorRight") as Node3D
	left.position.x -= float(item.leaf)
	right.position.x += float(item.leaf)
	await settle()
	var inside: Dictionary = ray(world, Vector3(x, 1.0, item.approachZ), Vector3(x, 1.0, item.farZ))
	check(not inside.is_empty() and absf(inside.position.z - float(item.backZ)) < 0.03 and hit_path(inside).ends_with("/Car"), "Open doors do not lead into the car: %s at %s" % [hit_path(inside), str(inside.get("position"))])
	finish()

func finish() -> void:
	print("ELEVATOR CHECK: %d physics rays; %d failures" % [rays, failures])
	quit(1 if failures else 0)
