from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, List

BASE_DIR = Path(__file__).resolve().parents[2]
DATA_DIR = BASE_DIR / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)

KNOWLEDGE_FILE = DATA_DIR / "svansai_knowledge.json"


def _read_json(path: Path, default: Any) -> Any:
    if not path.exists():
        return default

    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default


def _write_json(path: Path, data: Any) -> None:
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")


def load_knowledge_entries() -> List[Dict[str, Any]]:
    data = _read_json(KNOWLEDGE_FILE, [])
    if isinstance(data, list):
        return data
    return []


def save_knowledge_entries(entries: List[Dict[str, Any]]) -> None:
    _write_json(KNOWLEDGE_FILE, entries)


def merge_knowledge_entries(
    client_entries: List[Dict[str, Any]],
    server_entries: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    merged: List[Dict[str, Any]] = []
    seen = set()

    for entry in [*client_entries, *server_entries]:
        title = str(entry.get("title", "")).strip().lower()
        topic = str(entry.get("topic", "")).strip().lower()
        key = (title, topic)

        if key in seen:
            continue

        seen.add(key)
        merged.append(entry)

    return merged


def add_knowledge_entries(new_entries: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    existing = load_knowledge_entries()
    combined = merge_knowledge_entries(new_entries, existing)
    save_knowledge_entries(combined)
    return combined
