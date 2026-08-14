class_name ProviderFixtureCounter
extends Node

var value := 0

func increment(amount: int = 1) -> int:
	value += amount
	return value

