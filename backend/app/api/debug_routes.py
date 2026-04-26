from __future__ import annotations

from pathlib import Path
from typing import Optional

from fastapi import APIRouter
from pydantic import BaseModel, Field

router = APIRouter(prefix="/debug", tags=["debug"])


class ReadFileRequest(BaseModel):
    path: str = Field(..., min_length=1, max_length=4096)


class ReadFileResponse(BaseModel):
    ok: bool
    path: str
    content: str
    error: Optional[str] = None


def get_allowed_roots() -> list[Path]:
    """
    Return the filesystem roots that the debugger is allowed to read from.

    Update these paths to match your actual local workspace layout.
    """
    candidates = [
        Path(r"C:\Users\Shawn\OneDrive - DeVry University\Desktop\Vansant Platform"),
        Path(r"C:\Users\Shawn\Desktop\Vansant Platform"),
        Path.cwd(),
    ]

    roots: list[Path] = []
    for candidate in candidates:
        try:
            resolved = candidate.resolve()
            if resolved.exists():
                roots.append(resolved)
        except OSError:
            continue

    return roots


def resolve_debug_path(raw_path: str, allowed_roots: list[Path]) -> Path:
    """
    Resolve a user-supplied path safely against known allowed roots.

    Rules:
    - absolute paths are allowed only if they stay inside an allowed root
    - relative paths are attempted against each allowed root
    - parent traversal outside roots is rejected
    """
    requested = Path(raw_path.strip())

    if not raw_path.strip():
        raise ValueError("Path is required.")

    if requested.is_absolute():
        resolved = requested.resolve(strict=False)
        for root in allowed_roots:
            try:
                resolved.relative_to(root)
                return resolved
            except ValueError:
                continue
        raise ValueError("Absolute path is outside the allowed workspace.")

    for root in allowed_roots:
        candidate = (root / requested).resolve(strict=False)
        try:
            candidate.relative_to(root)
        except ValueError:
            continue

        if candidate.exists():
            return candidate

    # Fall back to first root for not-yet-existing relative forms, but still keep it jailed.
    if allowed_roots:
        candidate = (allowed_roots[0] / requested).resolve(strict=False)
        try:
            candidate.relative_to(allowed_roots[0])
            return candidate
        except ValueError as exc:
            raise ValueError("Relative path escapes the allowed workspace.") from exc

    raise ValueError("No allowed workspace roots are configured.")


@router.post("/read-file", response_model=ReadFileResponse)
async def read_file(request: ReadFileRequest) -> ReadFileResponse:
    allowed_roots = get_allowed_roots()

    if not allowed_roots:
        return ReadFileResponse(
            ok=False,
            path="",
            content="",
            error="No allowed workspace roots are configured on the backend.",
        )

    try:
        resolved_path = resolve_debug_path(request.path, allowed_roots)

        if not resolved_path.exists():
            return ReadFileResponse(
                ok=False,
                path=str(resolved_path),
                content="",
                error="File does not exist.",
            )

        if not resolved_path.is_file():
            return ReadFileResponse(
                ok=False,
                path=str(resolved_path),
                content="",
                error="Path is not a file.",
            )

        try:
            content = resolved_path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            content = resolved_path.read_text(encoding="utf-8", errors="replace")

        return ReadFileResponse(
            ok=True,
            path=str(resolved_path),
            content=content,
            error=None,
        )

    except Exception as exc:
        return ReadFileResponse(
            ok=False,
            path=request.path,
            content="",
            error=str(exc),
        )
