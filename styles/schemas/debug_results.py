from pydantic import BaseModel
from typing import Optional, Dict, Any


class DebugCommandResult(BaseModel):
    ok: bool
    stdout: Optional[str] = None
    stderr: Optional[str] = None
    return_code: Optional[int] = None
    message: Optional[str] = None


class DebugSessionResult(BaseModel):
    ok: bool
    session_id: str
    status: str
    message: Optional[str] = None


class DebugOverviewResponse(BaseModel):
    ok: bool
    message: str
    capabilities: list[str]
