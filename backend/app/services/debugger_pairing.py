import secrets
from datetime import datetime, timedelta, timezone
from typing import Dict, Any

PAIR_CODES: Dict[str, Dict[str, Any]] = {}

PAIR_CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
PAIR_LENGTH = 6
PAIR_EXPIRATION_MINUTES = 5
CONNECTED_SESSION_HOURS = 12


def generate_pair_code() -> str:
    return "".join(secrets.choice(PAIR_CHARSET) for _ in range(PAIR_LENGTH))


def create_pair_session(user_id: str = "local-user") -> Dict[str, Any]:
    code = generate_pair_code()

    while code in PAIR_CODES:
        code = generate_pair_code()

    now_utc = datetime.now(timezone.utc)
    expires_at = now_utc + timedelta(minutes=PAIR_EXPIRATION_MINUTES)

    PAIR_CODES[code] = {
        "code": code,
        "user_id": user_id,
        "created_at": now_utc.isoformat(),
        "expires_at": expires_at.isoformat(),
        "used": False,
        "device_name": None,
        "connected": False,
        "device_token": None,
        "connected_expires_at": None,
    }

    return PAIR_CODES[code]


def get_pair_session(code: str) -> Dict[str, Any] | None:
    session = PAIR_CODES.get(code)
    if not session:
        return None

    expiration_field = (
        session.get("connected_expires_at")
        if session.get("connected")
        else session.get("expires_at")
    )
    expires_at = datetime.fromisoformat(expiration_field)
    if datetime.now(timezone.utc) > expires_at:
        del PAIR_CODES[code]
        return None

    return session


def mark_pair_connected(code: str, device_name: str) -> Dict[str, Any] | None:
    session = get_pair_session(code)
    if not session:
        return None

    if session["used"]:
        return None

    session["used"] = True
    session["connected"] = True
    session["device_name"] = device_name
    session["device_token"] = secrets.token_urlsafe(32)
    session["connected_expires_at"] = (
        datetime.now(timezone.utc) + timedelta(hours=CONNECTED_SESSION_HOURS)
    ).isoformat()
    return session
