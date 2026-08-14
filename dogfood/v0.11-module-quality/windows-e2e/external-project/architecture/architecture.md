# Greeting Card architecture

One Godot Control scene owns a pure formatting function and one Label output. GdUnit4 verifies the function and scene. No network, persistence, secrets, or external runtime service is used.

Decision: keep formatting pure and local so the fixture is deterministic, inspectable, and independently verifiable.
