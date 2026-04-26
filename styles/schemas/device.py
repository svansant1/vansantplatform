from pydantic import BaseModel
from typing import Optional, Dict, Any


class DeviceBase(BaseModel):
    device_name: str
    device_id: str
    status: str


class DeviceCreate(DeviceBase):
    ip_address: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None


class DeviceResponse(DeviceBase):
    ip_address: Optional[str]
    metadata: Optional[Dict[str, Any]]

    class Config:
        from_attributes = True
