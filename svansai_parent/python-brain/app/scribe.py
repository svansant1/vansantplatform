import json
from pathlib import Path
from uuid import uuid4
from datetime import datetime, timezone

ARCHIVE = Path("/data/archive.jsonl")
ARCHIVE.parent.mkdir(parents=True, exist_ok=True)


def write_entry(question: str, answer: str, provider: str, confidence: float):
    payload = {
        "id": str(uuid4()),
        "question": question,
        "answer": answer,
        "provider": provider,
        "confidence": confidence,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    with ARCHIVE.open("a", encoding="utf-8") as f:
        f.write(json.dumps(payload) + "\n")
    return payload
