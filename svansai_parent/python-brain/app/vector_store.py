from typing import List, Dict
from .embedder import embed

_MEMORY: List[Dict] = []


def add_memory(question: str, answer: str, provider: str, confidence: float):
    vector = embed(question + "\n" + answer)
    entry = {
        "id": f"mem-{len(_MEMORY)+1}",
        "question": question,
        "answer": answer,
        "provider": provider,
        "confidence": confidence,
        "vector": vector,
    }
    _MEMORY.append(entry)
    return entry


def search(question: str, top_k: int = 5):
    if not _MEMORY:
        return []

    qv = embed(question)

    def cosine(a, b):
        dot = sum(x * y for x, y in zip(a, b))
        na = sum(x * x for x in a) ** 0.5
        nb = sum(x * x for x in b) ** 0.5
        return 0 if na == 0 or nb == 0 else dot / (na * nb)

    ranked = []
    for entry in _MEMORY:
        score = cosine(qv, entry["vector"])
        ranked.append(
            {
                "id": entry["id"],
                "question": entry["question"],
                "answer": entry["answer"],
                "source": entry["provider"],
                "confidence": entry["confidence"],
                "score": score,
            }
        )

    ranked.sort(key=lambda x: x["score"], reverse=True)
    return ranked[:top_k]
