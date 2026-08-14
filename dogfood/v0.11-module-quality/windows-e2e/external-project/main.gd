class_name GreetingCard
extends Control

@onready var output: Label = $Output

func format_greeting(name: String) -> String:
	var normalized := name.strip_edges()
	if normalized.is_empty():
		normalized = "friend"
	return "Hello, %s!" % normalized

func _ready() -> void:
	output.text = format_greeting("DevRelay")
