from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

SHIELD_DATA_ROOT = Path.home() / ".svans_shield"
ALLOWLIST_PATH = SHIELD_DATA_ROOT / "allowlist.json"

_hash_cache: set[str] | None = None


def _load_entries() -> list[dict[str, Any]]:
    if not ALLOWLIST_PATH.exists():
        return []

    try:
        with ALLOWLIST_PATH.open("r", encoding="utf-8") as file:
            data = json.load(file)
    except (OSError, json.JSONDecodeError):
        return []

    if not isinstance(data, list):
        return []

    return [entry for entry in data if isinstance(entry, dict) and "hash" in entry]


def _save_entries(entries: list[dict[str, Any]]) -> None:
    SHIELD_DATA_ROOT.mkdir(parents=True, exist_ok=True)

    with ALLOWLIST_PATH.open("w", encoding="utf-8") as file:
        json.dump(entries, file, indent=2)


def _load_hashes() -> set[str]:
    global _hash_cache

    if _hash_cache is not None:
        return _hash_cache

    _hash_cache = {str(entry["hash"]) for entry in _load_entries()}
    return _hash_cache


def is_known_safe(file_hash: str) -> bool:
    return file_hash in _load_hashes()


def get_reputation_adjustment(file_path: str | Path, file_hash: str) -> dict[str, Any]:
    path_obj = Path(file_path)
    file_name = path_obj.name.lower()
    parent_name = path_obj.parent.name.lower()
    path_lower = str(path_obj).lower()
    matching_entries: list[dict[str, Any]] = []

    for entry in _load_entries():
        if entry.get("hash") == file_hash:
            matching_entries.append(entry)
            continue

        learned_path = str(entry.get("path") or entry.get("note") or "").lower()
        learned_name = str(entry.get("name") or Path(learned_path).name).lower()

        if learned_name and learned_name == file_name:
            matching_entries.append(entry)
            continue

        if parent_name and parent_name in {"installer", "install", "update", "updates", "packages"}:
            if parent_name in learned_path:
                matching_entries.append(entry)
                continue

        if any(keyword in path_lower and keyword in learned_path for keyword in ("vscode", "electron", "vc_redist", "visual studio")):
            matching_entries.append(entry)

    repeat_count = len(matching_entries)

    if repeat_count >= 3:
        return {
            "score_delta": -25,
            "label": "Local reputation: similar files have repeatedly been marked safe",
            "matches": repeat_count,
        }

    if repeat_count >= 1:
        return {
            "score_delta": -12,
            "label": "Local reputation: this file or a similar installer artifact was marked safe before",
            "matches": repeat_count,
        }

    return {"score_delta": 0, "label": "", "matches": 0}


def mark_safe(file_hash: str, note: str = "") -> None:
    global _hash_cache

    entries = _load_entries()

    if any(entry.get("hash") == file_hash for entry in entries):
        return

    entries.append(
        {
            "hash": file_hash,
            "note": note,
            "path": note,
            "name": Path(note).name if note else "",
            "added_at": datetime.now(timezone.utc).isoformat(),
        }
    )
    _save_entries(entries)

    if _hash_cache is not None:
        _hash_cache.add(file_hash)


def remove_from_allowlist(file_hash: str) -> bool:
    global _hash_cache

    entries = _load_entries()
    new_entries = [e for e in entries if e.get("hash") != file_hash]

    if len(new_entries) == len(entries):
        return False

    _save_entries(new_entries)

    if _hash_cache is not None:
        _hash_cache.discard(file_hash)

    return True


def get_allowlist() -> list[dict[str, Any]]:
    return _load_entries()
