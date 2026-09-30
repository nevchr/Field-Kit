extends Node

var checks: Array[String] = []
var errors: Array[String] = []
var imported_sounds: Array[Dictionary] = []

func _check(condition: bool, description: String) -> void:
	if condition:
		checks.append(description)
	else:
		errors.append(description)

func run(scene: Node3D) -> void:
	var report_path := ""
	var capture_path := ""
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--report="):
			report_path = arg.substr(9)
		if arg.begins_with("--capture="):
			capture_path = arg.substr(10)
	_check(scene.sample_errors.is_empty(), "manifest and every referenced resource load without errors")
	_check(scene.textures.size() >= 2 and scene.sounds.size() >= 1, "the exported sample pack contains textures and audio")
	var imported: Array[Dictionary] = []
	for index in scene.textures.size():
		var item: Dictionary = scene.textures[index]
		var texture: Texture2D = item.resource
		var image := texture.get_image()
		_check(texture.get_width() == int(item.manifest.width) and texture.get_height() == int(item.manifest.height), "imported texture %d has its exported dimensions" % index)
		_check(image != null and not image.is_empty(), "imported texture %d has actual decoded pixels" % index)
		var image_path := report_path.get_base_dir().path_join("imported-texture-%d.png" % index)
		if image != null:
			image.convert(Image.FORMAT_RGBA8)
			_check(image.save_png(image_path) == OK, "imported texture %d can be inspected outside Godot" % index)
		imported.append({"source": item.manifest.path, "image": image_path})
	for index in scene.sounds.size():
		var item: Dictionary = scene.sounds[index]
		var stream: AudioStreamWAV = item.resource
		_check(stream.mix_rate == 48000 and stream.format == AudioStreamWAV.FORMAT_16_BITS, "imported sound %d is 48 kHz PCM16" % index)
		_check(stream.stereo == (int(item.manifest.channels) == 2) and abs(stream.get_length() - float(item.manifest.duration)) < 0.003, "imported sound %d retains its channels and processed duration" % index)
		_check(stream.loop_mode == AudioStreamWAV.LOOP_FORWARD and stream.loop_end > 0, "imported sound %d loops the complete processed stream" % index)
		var data_path := report_path.get_base_dir().path_join("imported-sound-%d.pcm" % index)
		var data_file := FileAccess.open(data_path, FileAccess.WRITE)
		data_file.store_buffer(stream.data)
		data_file.close()
		imported_sounds.append({"source": item.manifest.path, "data": data_path})
	if not errors.is_empty():
		_finish(report_path, imported)
		return
	scene.texture_picker.select(1)
	scene.texture_picker.item_selected.emit(1)
	var material_match := true
	for material in scene.surfaces:
		material_match = material_match and material.albedo_texture == scene.textures[1].resource and material.texture_repeat
	_check(material_match, "the texture picker changes all three repeating material surfaces")
	await get_tree().create_timer(0.25).timeout
	var initial_position: Vector3 = scene.player.position
	Input.action_press("walk_forward")
	await get_tree().create_timer(0.3).timeout
	Input.action_release("walk_forward")
	await get_tree().physics_frame
	_check(scene.player.position.z < initial_position.z - 0.5, "walking input moves the real colliding player")
	Input.action_press("jump")
	await get_tree().physics_frame
	await get_tree().physics_frame
	Input.action_release("jump")
	_check(scene.player.velocity.y > 0, "jump input lifts the player from the floor")
	await get_tree().create_timer(0.75).timeout
	var button := InputEventMouseButton.new()
	button.button_index = MOUSE_BUTTON_RIGHT
	button.pressed = true
	Input.parse_input_event(button)
	await get_tree().process_frame
	var motion := InputEventMouseMotion.new()
	motion.relative = Vector2(80, 0)
	motion.button_mask = MOUSE_BUTTON_MASK_RIGHT
	Input.parse_input_event(motion)
	await get_tree().process_frame
	button = InputEventMouseButton.new()
	button.button_index = MOUSE_BUTTON_RIGHT
	button.pressed = false
	Input.parse_input_event(button)
	_check(abs(scene.yaw) > 0.1, "right-drag input orbits the camera")
	for beacon in scene.beacons:
		scene.player.position = beacon.position
		scene.player.velocity = Vector3.ZERO
		await get_tree().physics_frame
		await get_tree().physics_frame
	_check(scene.collected == 3, "the scene collects all three markers through proximity checks")
	scene._reset_walk()
	_check(scene.collected == 0 and scene.beacons.all(func(beacon): return beacon.visible), "reset restores the player and all markers")
	scene.play_button.pressed.emit()
	_check(scene.audio.playing, "the play control starts actual imported WAV playback")
	var duration: float = scene.audio.stream.get_length()
	await get_tree().create_timer(duration + 0.35).timeout
	var playback: float = scene.audio.get_playback_position()
	_check(scene.audio.playing and playback > 0 and playback < duration, "playback advances through the loop boundary and remains inside the clip")
	if not capture_path.is_empty():
		await RenderingServer.frame_post_draw
		var image := get_viewport().get_texture().get_image()
		_check(image != null and not image.is_empty() and image.save_png(capture_path) == OK, "the running 3D scene produces a captured frame")
	scene.play_button.pressed.emit()
	_check(not scene.audio.playing, "the pause control stops playback")
	# Let the audio thread retire its stopped playback before shutting down the engine.
	await get_tree().create_timer(0.2).timeout
	_finish(report_path, imported)

func _finish(report_path: String, imported: Array[Dictionary]) -> void:
	var report := {"engine": Engine.get_version_info().string, "renderer": RenderingServer.get_current_rendering_method(), "display": DisplayServer.get_name(), "checks": checks, "errors": errors, "importedTextures": imported, "importedSounds": imported_sounds, "audioDriver": AudioServer.get_driver_name()}
	var file := FileAccess.open(report_path, FileAccess.WRITE)
	if file != null:
		file.store_string(JSON.stringify(report, "  "))
		file.close()
	print("GODOT_DEMO_RESULTS " + JSON.stringify(report))
	get_tree().quit(0 if errors.is_empty() else 1)
