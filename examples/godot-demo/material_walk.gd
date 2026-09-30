extends Node3D

const PACK_ROOT := "res://assets/field-kit/"
var textures: Array[Dictionary] = []
var sounds: Array[Dictionary] = []
var surfaces: Array[StandardMaterial3D] = []
var beacons: Array[MeshInstance3D] = []
var player := CharacterBody3D.new()
var camera := Camera3D.new()
var audio := AudioStreamPlayer.new()
var texture_picker := OptionButton.new()
var sound_picker := OptionButton.new()
var play_button := Button.new()
var counter := Label.new()
var status := Label.new()
var yaw := 0.0
var collected := 0
var sample_errors: Array[String] = []

func _ready() -> void:
	_load_pack()
	_build_world()
	_build_interface()
	add_child(audio)
	audio.volume_db = -20.0
	if not textures.is_empty():
		_select_texture(0)
	if not sounds.is_empty():
		_select_sound(0)
	_reset_walk()
	if "--verify" in OS.get_cmdline_user_args():
		_verify.call_deferred()

func _load_pack() -> void:
	var manifest_path := PACK_ROOT + "manifest.json"
	if not FileAccess.file_exists(manifest_path):
		sample_errors.append("Missing assets/field-kit/manifest.json. Copy a Field Kit folder export there.")
		return
	var manifest = JSON.parse_string(FileAccess.get_file_as_string(manifest_path))
	if not manifest is Dictionary or manifest.get("schemaVersion") != 1 or not manifest.get("assets") is Array:
		sample_errors.append("This demo needs a Field Kit schema 1 asset pack.")
		return
	for item in manifest.assets:
		if not item is Dictionary:
			continue
		var relative := str(item.get("path", ""))
		if ".." in relative or "\\" in relative or ":" in relative:
			sample_errors.append("Invalid pack reference: " + relative)
			continue
		if item.get("type") == "texture" and relative.begins_with("textures/") and relative.ends_with(".png"):
			var texture := load(PACK_ROOT + relative) as Texture2D
			if texture == null:
				sample_errors.append("Could not import " + relative)
			else:
				textures.append({"name": str(item.get("name", relative)), "resource": texture, "manifest": item})
		elif item.get("type") == "sound" and relative.begins_with("sounds/") and relative.ends_with(".wav"):
			var stream := load(PACK_ROOT + relative) as AudioStreamWAV
			if stream == null:
				sample_errors.append("Could not import " + relative)
			elif stream.format != AudioStreamWAV.FORMAT_16_BITS:
				sample_errors.append("Set WAV import compression to PCM, then reimport: " + relative)
			else:
				# Loop the complete processed WAV; the Field Kit crossfade is already baked in.
				stream.loop_begin = 0
				stream.loop_end = stream.data.size() / (4 if stream.stereo else 2)
				stream.loop_mode = AudioStreamWAV.LOOP_FORWARD
				sounds.append({"name": str(item.get("name", relative)), "resource": stream, "manifest": item})

func _material(color: Color, textured := false, repeat := 1.0) -> StandardMaterial3D:
	var material := StandardMaterial3D.new()
	material.albedo_color = color
	material.roughness = 0.88
	if textured:
		material.texture_repeat = true
		material.uv1_scale = Vector3(repeat, repeat, 1)
		surfaces.append(material)
	return material

func _box(size: Vector3, location: Vector3, material: Material, collision := true) -> MeshInstance3D:
	var mesh := BoxMesh.new()
	mesh.size = size
	var instance := MeshInstance3D.new()
	instance.mesh = mesh
	instance.material_override = material
	instance.position = location
	add_child(instance)
	if collision:
		var body := StaticBody3D.new()
		var shape := CollisionShape3D.new()
		var bounds := BoxShape3D.new()
		bounds.size = size
		shape.shape = bounds
		body.add_child(shape)
		instance.add_child(body)
	return instance

func _build_world() -> void:
	var environment := WorldEnvironment.new()
	environment.environment = Environment.new()
	environment.environment.background_mode = Environment.BG_COLOR
	environment.environment.background_color = Color("dfe6d6")
	environment.environment.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	environment.environment.ambient_light_color = Color.WHITE
	environment.environment.ambient_light_energy = 0.35
	add_child(environment)
	var sun := DirectionalLight3D.new()
	sun.rotation_degrees = Vector3(-52, -28, 0)
	sun.light_energy = 0.8
	sun.shadow_enabled = true
	add_child(sun)
	_box(Vector3(18, 0.4, 18), Vector3(0, -0.2, 0), _material(Color.WHITE, true, 5))
	var edging := _material(Color("87967a"))
	_box(Vector3(18.4, 0.7, 0.4), Vector3(0, 0.15, -9.1), edging)
	_box(Vector3(18.4, 0.7, 0.4), Vector3(0, 0.15, 9.1), edging)
	_box(Vector3(0.4, 0.7, 18), Vector3(-9.1, 0.15, 0), edging)
	_box(Vector3(0.4, 0.7, 18), Vector3(9.1, 0.15, 0), edging)
	_box(Vector3(2.5, 0.3, 2.5), Vector3(-3, 0.15, -1), _material(Color("d6cbb7")))
	_box(Vector3(1.6, 1.6, 1.6), Vector3(-3, 1.1, -1), _material(Color.WHITE, true))
	_box(Vector3(2.5, 0.3, 2.5), Vector3(3, 0.15, -1), _material(Color("d6cbb7")))
	var sphere := MeshInstance3D.new()
	var sphere_mesh := SphereMesh.new()
	sphere_mesh.radius = 0.9
	sphere_mesh.height = 1.8
	sphere.mesh = sphere_mesh
	sphere.position = Vector3(3, 1.2, -1)
	sphere.material_override = _material(Color.WHITE, true, 2)
	add_child(sphere)
	var sphere_body := StaticBody3D.new()
	var sphere_shape := CollisionShape3D.new()
	var sphere_bounds := SphereShape3D.new()
	sphere_bounds.radius = 0.9
	sphere_shape.shape = sphere_bounds
	sphere_body.add_child(sphere_shape)
	sphere.add_child(sphere_body)
	for location in [Vector3(-5, 0.8, -4), Vector3(5, 0.8, -4), Vector3(5, 0.8, 4)]:
		var beacon := _box(Vector3(0.42, 0.42, 0.42), location, _material(Color("dfb765")), false)
		beacons.append(beacon)
	var player_shape := CollisionShape3D.new()
	var capsule := CapsuleShape3D.new()
	capsule.radius = 0.25
	capsule.height = 1.1
	player_shape.shape = capsule
	player.add_child(player_shape)
	var player_mesh := MeshInstance3D.new()
	var capsule_mesh := CapsuleMesh.new()
	capsule_mesh.radius = 0.25
	capsule_mesh.height = 1.1
	player_mesh.mesh = capsule_mesh
	player_mesh.material_override = _material(Color("304b38"))
	player.add_child(player_mesh)
	add_child(player)
	add_child(camera)
	camera.fov = 56
	camera.current = true
	for action in ["walk_left", "walk_right", "walk_forward", "walk_back", "jump"]:
		InputMap.add_action(action)
	var keys := {"walk_left": [KEY_A, KEY_LEFT], "walk_right": [KEY_D, KEY_RIGHT], "walk_forward": [KEY_W, KEY_UP], "walk_back": [KEY_S, KEY_DOWN], "jump": [KEY_SPACE]}
	for action in keys:
		for key in keys[action]:
			var event := InputEventKey.new()
			event.physical_keycode = key
			InputMap.action_add_event(action, event)

func _panel_style(color: Color) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = color
	style.set_corner_radius_all(8)
	style.set_border_width_all(1)
	style.border_color = Color("c8d0bd")
	style.content_margin_left = 16
	style.content_margin_right = 16
	style.content_margin_top = 12
	style.content_margin_bottom = 12
	return style

func _build_interface() -> void:
	var layer := CanvasLayer.new()
	add_child(layer)
	var ui := Control.new()
	ui.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	ui.mouse_filter = Control.MOUSE_FILTER_IGNORE
	layer.add_child(ui)
	var theme := Theme.new()
	theme.default_font_size = 16
	for type in ["Label", "Button", "OptionButton"]:
		theme.set_color("font_color", type, Color("263d2d"))
		theme.set_color("font_hover_color", type, Color("263d2d"))
	for type in ["Button", "OptionButton"]:
		for state in ["normal", "hover", "pressed", "focus"]:
			theme.set_stylebox(state, type, _panel_style(Color("e6ebdd") if state != "normal" else Color("f9f8f1")))
	theme.set_stylebox("panel", "PanelContainer", _panel_style(Color("f9f8f1")))
	ui.theme = theme
	var header := PanelContainer.new()
	header.position = Vector2(24, 24)
	header.custom_minimum_size = Vector2(510, 0)
	ui.add_child(header)
	var heading := VBoxContainer.new()
	heading.add_theme_constant_override("separation", 5)
	header.add_child(heading)
	var eyebrow := Label.new()
	eyebrow.text = "FIELD KIT  /  GODOT DEMO"
	eyebrow.add_theme_font_size_override("font_size", 13)
	heading.add_child(eyebrow)
	var title := Label.new()
	title.text = "Material Walk"
	title.add_theme_font_size_override("font_size", 30)
	heading.add_child(title)
	var subtitle := Label.new()
	subtitle.text = "Actual Field Kit exports · synthetic sample assets"
	heading.add_child(subtitle)
	var instructions := Label.new()
	instructions.text = "WASD / arrows to walk · Space to jump\nHold right mouse and drag to orbit · Find 3 gold markers"
	instructions.add_theme_font_size_override("font_size", 14)
	heading.add_child(instructions)
	var controls := PanelContainer.new()
	controls.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_LEFT)
	controls.offset_left = 24
	controls.offset_top = -290
	controls.offset_right = 534
	controls.offset_bottom = -24
	ui.add_child(controls)
	var rows := VBoxContainer.new()
	rows.add_theme_constant_override("separation", 9)
	controls.add_child(rows)
	var material_label := Label.new()
	material_label.text = "Texture · applied to floor, cube and sphere"
	rows.add_child(material_label)
	for item in textures:
		texture_picker.add_item(item.name)
	texture_picker.disabled = textures.is_empty()
	texture_picker.item_selected.connect(_select_texture)
	rows.add_child(texture_picker)
	var audio_row := HBoxContainer.new()
	audio_row.add_theme_constant_override("separation", 8)
	rows.add_child(audio_row)
	for item in sounds:
		sound_picker.add_item(item.name)
	sound_picker.disabled = sounds.is_empty()
	sound_picker.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	sound_picker.item_selected.connect(_select_sound)
	audio_row.add_child(sound_picker)
	play_button.text = "Play loop"
	play_button.disabled = sounds.is_empty()
	play_button.pressed.connect(_toggle_sound)
	audio_row.add_child(play_button)
	status.text = "Sound starts paused · quiet playback"
	status.add_theme_font_size_override("font_size", 13)
	rows.add_child(status)
	var footer := HBoxContainer.new()
	footer.add_theme_constant_override("separation", 16)
	rows.add_child(footer)
	counter.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	footer.add_child(counter)
	var reset := Button.new()
	reset.text = "Reset walk"
	reset.pressed.connect(_reset_walk)
	footer.add_child(reset)
	if not sample_errors.is_empty():
		status.text = "\n".join(sample_errors)
		status.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		push_error(status.text)

func _select_texture(index: int) -> void:
	for material in surfaces:
		material.albedo_texture = textures[index].resource

func _select_sound(index: int) -> void:
	var was_playing := audio.playing
	audio.stop()
	audio.stream = sounds[index].resource
	if was_playing:
		audio.play()

func _toggle_sound() -> void:
	if audio.playing:
		audio.stop()
	else:
		audio.play()
	play_button.text = "Pause loop" if audio.playing else "Play loop"
	status.text = "Looping processed WAV · 48 kHz PCM16" if audio.playing else "Sound paused · quiet playback"

func _reset_walk() -> void:
	player.position = Vector3(0, 0.58, 5.5)
	player.velocity = Vector3.ZERO
	yaw = 0.0
	collected = 0
	for beacon in beacons:
		beacon.show()
	counter.text = "Markers found  0 / 3"
	_update_camera()

func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventMouseMotion and Input.is_mouse_button_pressed(MOUSE_BUTTON_RIGHT):
		yaw -= event.relative.x * 0.006
	if event is InputEventKey and event.pressed and event.keycode == KEY_ESCAPE:
		get_viewport().gui_release_focus()

func _update_camera() -> void:
	camera.position = player.position + Vector3(sin(yaw) * 10, 7.5, cos(yaw) * 10)
	camera.look_at(player.position + Vector3(0, 0.4, -2.2).rotated(Vector3.UP, yaw), Vector3.UP)

func _physics_process(delta: float) -> void:
	var direction := Input.get_vector("walk_left", "walk_right", "walk_forward", "walk_back")
	var movement := Vector3(direction.x, 0, direction.y).rotated(Vector3.UP, yaw)
	player.velocity.x = movement.x * 4.5
	player.velocity.z = movement.z * 4.5
	if not player.is_on_floor():
		player.velocity.y -= 18 * delta
	elif Input.is_action_just_pressed("jump") and get_viewport().gui_get_focus_owner() == null:
		player.velocity.y = 6
	player.move_and_slide()
	if player.position.y < -8:
		_reset_walk()
	for beacon in beacons:
		beacon.rotate_y(delta)
		if beacon.visible and player.position.distance_to(beacon.position) < 0.85:
			beacon.hide()
			collected += 1
			counter.text = "Markers found  %d / 3" % collected
			if collected == 3:
				counter.text = "All 3 found. Try another texture."
	_update_camera()

func _verify() -> void:
	# The standalone verifier runs the same scene and controls; it never substitutes media.
	var verifier = load("res://verify.gd").new()
	add_child(verifier)
	verifier.run(self)
