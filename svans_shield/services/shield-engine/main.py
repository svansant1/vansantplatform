from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

import shield
import memory

app = FastAPI(
    title="SVANS Shield Engine",
    version="0.1.0",
    description="Local scan engine for SVANS Shield.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:4173",
        "http://localhost:4173",
    ],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


class ScanRequest(BaseModel):
    folder_path: str = Field(..., min_length=1, max_length=4096)


class QuarantineRequest(BaseModel):
    file_path: str = Field(..., min_length=1, max_length=4096)


class RestoreQuarantineRequest(BaseModel):
    record_id: str = Field(..., min_length=1, max_length=512)


class SettingsRequest(BaseModel):
    scan_mode: str | None = None
    show_low_risk: bool | None = None
    auto_quarantine: bool | None = None


class AllowlistAddRequest(BaseModel):
    sha256: str = Field(..., min_length=64, max_length=64, pattern=r"^[0-9a-fA-F]{64}$")
    note: str = Field(default="", max_length=512)


class AllowlistRemoveRequest(BaseModel):
    sha256: str = Field(..., min_length=64, max_length=64, pattern=r"^[0-9a-fA-F]{64}$")


@app.get("/health")
def health_check() -> dict[str, object]:
    return {"ok": True, "service": "svans-shield-engine"}


@app.get("/shield/targets")
def get_targets() -> dict[str, object]:
    return {"ok": True, "targets": shield.get_quick_scan_targets()}


@app.post("/shield/scan")
def scan_folder(request: ScanRequest) -> dict[str, object]:
    return shield.scan_folder(request.folder_path)


@app.get("/shield/scan-all")
def scan_all_quick_targets() -> dict[str, object]:
    return shield.scan_all_quick_targets()


@app.post("/shield/quarantine")
def quarantine_file(request: QuarantineRequest) -> dict[str, object]:
    return shield.quarantine_file(request.file_path)


@app.get("/shield/quarantine")
def get_quarantine_history() -> dict[str, object]:
    return shield.get_quarantine_history()


@app.post("/shield/quarantine/restore")
def restore_quarantine_file(request: RestoreQuarantineRequest) -> dict[str, object]:
    return shield.restore_quarantine_record(request.record_id)


@app.get("/shield/settings")
def get_settings() -> dict[str, object]:
    return shield.get_settings()


@app.post("/shield/settings")
def update_settings(request: SettingsRequest) -> dict[str, object]:
    updates = request.model_dump(exclude_none=True)
    return shield.update_settings(updates)


@app.get("/shield/allowlist")
def get_allowlist() -> dict[str, object]:
    return {"ok": True, "entries": memory.get_allowlist()}


@app.post("/shield/allowlist")
def add_to_allowlist(request: AllowlistAddRequest) -> dict[str, object]:
    memory.mark_safe(request.sha256, request.note)
    return {"ok": True}


@app.delete("/shield/allowlist")
def remove_from_allowlist(request: AllowlistRemoveRequest) -> dict[str, object]:
    removed = memory.remove_from_allowlist(request.sha256)
    return {"ok": True, "removed": removed}
