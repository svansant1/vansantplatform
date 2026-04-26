from pydantic import BaseModel
from typing import Optional, Dict, Any


class IssueBase(BaseModel):
    severity: str
    message: str
    source: str


class IssueCreate(IssueBase):
    file_path: Optional[str] = None
    line: Optional[int] = None
    column: Optional[int] = None
    rule: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None


class IssueResponse(IssueBase):
    issue_id: str
    file_path: Optional[str]
    line: Optional[int]
    column: Optional[int]
    rule: Optional[str]
    status: str
    metadata: Optional[Dict[str, Any]]

    class Config:
        from_attributes = True
