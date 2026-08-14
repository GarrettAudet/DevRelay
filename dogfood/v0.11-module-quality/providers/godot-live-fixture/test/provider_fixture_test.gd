class_name ProviderFixtureTest
extends GdUnitTestSuite

func test_increment_is_deterministic() -> void:
	var subject := ProviderFixtureCounter.new()
	assert_int(subject.increment()).is_equal(1)
	assert_int(subject.increment(4)).is_equal(5)
	subject.free()

func test_scene_contract() -> void:
	var runner := scene_runner("res://main.tscn")
	assert_object(runner.find_child("Status")).is_not_null()
	assert_str(runner.find_child("Status").text).is_equal("DevRelay Godot provider conformance")
