class_name GreetingCardTest
extends GdUnitTestSuite

func test_formats_trimmed_name() -> void:
	var subject := GreetingCard.new()
	assert_str(subject.format_greeting("  Ada  ")).is_equal("Hello, Ada!")
	subject.free()

func test_blank_name_uses_friend() -> void:
	var subject := GreetingCard.new()
	assert_str(subject.format_greeting("   ")).is_equal("Hello, friend!")
	subject.free()

func test_scene_renders_default_greeting() -> void:
	var runner := scene_runner("res://main.tscn")
	assert_str(runner.find_child("Output").text).is_equal("Hello, DevRelay!")
