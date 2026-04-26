from pydantic import BaseModel
from typing import Optional, Dict, Any


class DebugCommandRequest(BaseModel):
    command: str
    args: Optional[list[str]] = None
    cwd: Optional[str] = None


class DebugTargetRequest(BaseModel):
    target_type: str
    target_id: Optional[str] = None
    path: Optional[str] = None


class DebugSessionStartRequest(BaseModel):
    device_id: str
    target_id: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None
