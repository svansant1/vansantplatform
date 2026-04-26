from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel, Field

router = APIRouter(prefix="/browser", tags=["browser-bridge"])

_BROWSER_STATE: dict[str, Any] = {
    "tabs": [],
    "updated_at": None,
}


class BrowserTab(BaseModel):
    id: int | None = None
    title: str | None = None
    url: str | None = None


class BrowserTabsUpdateRequest(BaseModel):
    tabs: list[BrowserTab] = Field(default_factory=list)


@router.post("/tabs/update")
async def update_tabs(payload: BrowserTabsUpdateRequest) -> dict[str, Any]:
    _BROWSER_STATE["tabs"] = [tab.model_dump() for tab in payload.tabs]
    _BROWSER_STATE["updated_at"] = datetime.now(timezone.utc).isoformat()
    return {
        "ok": True,
        "count": len(_BROWSER_STATE["tabs"]),
        "updated_at": _BROWSER_STATE["updated_at"],
    }


@router.get("/tabs")
async def get_tabs() -> dict[str, Any]:
    return {
        "ok": True,
        "tabs": _BROWSER_STATE["tabs"],
        "updated_at": _BROWSER_STATE["updated_at"],
    }
