from app.mythos_engine import SVANSAIMythosEngine


def test_mythos_engine_progression():
    engine = SVANSAIMythosEngine()

    first = engine.snapshot()
    assert first["stress_level"] == 0
    assert first["integrity"] == 100
    assert first["mode"] == "NORMAL_OPERATION"

    for _ in range(4):
        engine.update_state(False, "blocked by firewall")

    state = engine.snapshot()
    assert state["stress_level"] == 80
    assert state["integrity"] == 60
    assert state["failed_attempts"] == 4
    assert state["mode"] == "DECEPTION_PROTOCOL_ACTIVE"
    assert state["hidden_log"]
    assert "fictional" in state["disclaimer"].lower()
