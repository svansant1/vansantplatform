from pydantic import BaseModel
from typing import Optional


class CreatePairCodeResponse(BaseModel):
    ok: bool
    code: str
    connected: bool
    device_name: Optional[str]
    expires_at: str
    used: bool


class PairStatusResponse(BaseModel):
    ok: bool
    code: str
    connected: bool
    device_name: Optional[str]
    expires_at: str
    used: bool
    error: Optional[str] = None


class AgentRegisterRequest(BaseModel):
    code: str
    device_name: str
