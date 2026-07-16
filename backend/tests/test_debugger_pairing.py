import unittest
from datetime import datetime, timezone

from app.services.debugger_pairing import (
    PAIR_CODES,
    create_pair_session,
    get_pair_session,
    mark_pair_connected,
)


class DebuggerPairingTests(unittest.TestCase):
    def setUp(self):
        PAIR_CODES.clear()

    def test_pair_codes_are_unique_and_bounded(self):
        sessions = [create_pair_session() for _ in range(100)]
        codes = {session["code"] for session in sessions}
        self.assertEqual(len(codes), 100)
        self.assertTrue(all(len(code) == 6 for code in codes))

    def test_connected_session_receives_token_and_extended_expiration(self):
        created = create_pair_session()
        connected = mark_pair_connected(created["code"], "Test PC")
        self.assertIsNotNone(connected)
        assert connected is not None
        self.assertTrue(connected["connected"])
        self.assertGreater(len(connected["device_token"]), 30)
        self.assertGreater(
            datetime.fromisoformat(connected["connected_expires_at"]),
            datetime.now(timezone.utc),
        )
        self.assertIsNotNone(get_pair_session(created["code"]))

    def test_pair_code_cannot_be_claimed_twice(self):
        created = create_pair_session()
        self.assertIsNotNone(mark_pair_connected(created["code"], "First PC"))
        self.assertIsNone(mark_pair_connected(created["code"], "Second PC"))


if __name__ == "__main__":
    unittest.main()
