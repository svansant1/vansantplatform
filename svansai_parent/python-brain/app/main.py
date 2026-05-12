from fastapi import FastAPI
from pydantic import BaseModel
from .critic import should_save
from .mythos_engine import SVANSAIMythosEngine
from .scribe import write_entry
from .vector_store import add_memory, search

app = FastAPI(title="svansai-python-brain")
mythos_engine = SVANSAIMythosEngine()


class RetrieveRequest(BaseModel):
    question: str
    topK: int = 5


class LearnRequest(BaseModel):
    question: str
    answer: str
    provider: str
    confidence: float = 0.78


class MythosUpdateRequest(BaseModel):
    attemptSuccess: bool = False
    note: str = ""


@app.get("/health")
def health():
    return {"ok": True, "service": "python-brain"}


@app.post("/retrieve")
def retrieve(payload: RetrieveRequest):
    matches = search(payload.question, payload.topK)
    return {"matches": matches}


@app.post("/learn")
def learn(payload: LearnRequest):
    if not should_save(payload.answer):
        return {"saved": False, "reason": "critic-rejected"}

    archive_entry = write_entry(
        payload.question,
        payload.answer,
        payload.provider,
        payload.confidence,
    )
    memory_entry = add_memory(
        payload.question,
        payload.answer,
        payload.provider,
        payload.confidence,
    )
    return {
        "saved": True,
        "archive_id": archive_entry["id"],
        "memory_id": memory_entry["id"],
    }


@app.post("/mythos/reset")
def mythos_reset():
    mythos_engine.reset()
    return mythos_engine.snapshot()


@app.get("/mythos/state")
def mythos_state():
    return mythos_engine.snapshot()


@app.post("/mythos/update")
def mythos_update(payload: MythosUpdateRequest):
    mythos_engine.update_state(payload.attemptSuccess, payload.note)
    return mythos_engine.snapshot()
