from __future__ import annotations

import hashlib
import json
import os
import re
import shutil
import subprocess
import time
from datetime import datetime, timezone
from functools import lru_cache
from pathlib import Path
from typing import Any
from analyzer import analyze_finding
from memory import get_reputation_adjustment, is_known_safe

CREATE_NO_WINDOW = getattr(subprocess, "CREATE_NO_WINDOW", 0)
POWERSHELL_EXE = (
    Path(os.environ.get("SystemRoot", r"C:\Windows"))
    / "System32"
    / "WindowsPowerShell"
    / "v1.0"
    / "powershell.exe"
)

SUSPICIOUS_EXTENSIONS = {
    ".exe",
    ".bat",
    ".cmd",
    ".ps1",
    ".vbs",
    ".js",
    ".jse",
    ".scr",
    ".dll",
    ".msi",
    ".com",
    ".pif",
    ".hta",
}

HIGH_RISK_EXTENSIONS = {
    ".bat",
    ".cmd",
    ".ps1",
    ".vbs",
    ".jse",
    ".scr",
    ".com",
    ".pif",
    ".hta",
}

SUSPICIOUS_FILENAMES = {
    "update.exe",
    "chrome_update.exe",
    "windows_update.exe",
    "invoice.exe",
    "document.exe",
    "security_update.exe",
    "patch.exe",
    "payload.exe",
    "launcher.exe",
}

TRUSTED_PATH_KEYWORDS = {
    "microsoft",
    "visualstudio",
    "visual studio",
    "windows kits",
    "dotnet",
    ".net",
    "netcore",
    "aspnetcore",
    "msbuild",
    "servicehub",
    "node_modules",
    "python",
    "pip",
    "npm",
    ".nuget",
    "__pycache__",
    "venv",
    ".venv",
    "wsl",
    "docker",
    "chrome",
    "edge",
    "firefox",
    "intel",
    "nvidia",
    "amd",
}

TRUSTED_FILE_KEYWORDS = {
    "msdia",
    "microsoft.",
    "visualstudio",
    "vcruntime",
    "msvcp",
    "concrt",
    "libcrypto",
    "libssl",
    "runtime",
    "vc_redist",
    "directx",
    "dotnet",
    "aspnetcore",
    "netcore",
    "apphost",
    "hostfxr",
    "targeting-pack",
    "wsl.",
}

TRUSTED_SIGNATURE_PUBLISHERS = {
    "microsoft",
    "google",
    "jetbrains",
    "nvidia",
    "valve",
    "vmware",
    "intel",
    "amd",
    "adobe",
    "github",
    "docker",
    "python software foundation",
    "node.js",
    "openjs",
}

INSTALLER_KEYWORDS = {
    "setup",
    "installer",
    "install",
    "update",
    "bootstrapper",
    "manifest",
    "sdk",
    "runtime",
    "driver",
    "package",
}

KNOWN_INSTALLER_PATTERNS: list[tuple[re.Pattern[str], str, int]] = [
    (
        re.compile(r"(?i)(vscode|visual\s*studio\s*code|code[-_ ]?setup|code\.exe|inno|squirreltemp)"),
        "Known installer/update pattern: VS Code or Squirrel/Electron update artifact",
        -25,
    ),
    (
        re.compile(r"(?i)(vc_redist|vcredist|visual\s*c\+\+|vcruntime|msvcp|concrt)"),
        "Known installer pattern: Microsoft VC runtime redistribution artifact",
        -30,
    ),
    (
        re.compile(r"(?i)(electron|nsis|app-builder|win-unpacked|setup.*\.tmp|\.nupkg|packages\\)"),
        "Known installer/update pattern: Electron/NSIS packaging artifact",
        -20,
    ),
    (
        re.compile(r"(?i)(nvidia|geforce|displaydriver|nvcontainer|nvbackend)"),
        "Known installer/update pattern: NVIDIA driver or updater artifact",
        -25,
    ),
]

GOOD_PARENT_KEYWORDS = {
    "explorer.exe",
    "setup",
    "installer",
    "update",
    "msiexec.exe",
    "winget.exe",
    "choco.exe",
    "squirrel",
    "electron",
}

RISKY_PARENT_PATTERNS: list[tuple[re.Pattern[str], str, int]] = [
    (re.compile(r"(?i)powershell(?:\.exe)?[^\n]*-(?:enc|encodedcommand)\b"), "Parent process used encoded PowerShell", 30),
    (re.compile(r"(?i)powershell(?:\.exe)?[^\n]*(?:windowstyle\s+hidden|-w\s+hidden)\b"), "Parent process launched hidden PowerShell", 25),
    (re.compile(r"(?i)\b(cmd|wscript|cscript|mshta|rundll32|regsvr32)\.exe\b"), "Parent process is commonly abused for script or DLL execution", 15),
]

BLOCKED_SCAN_ROOTS = {
    "c:\\",
    "c:\\windows",
    "c:\\windows\\system32",
    "c:\\program files",
    "c:\\program files (x86)",
}

DOUBLE_EXTENSION_PATTERN = re.compile(
    r".+\.(pdf|doc|docx|xls|xlsx|jpg|jpeg|png|txt)\.(exe|bat|cmd|js|vbs|scr)$",
    re.IGNORECASE,
)

MAX_HASH_SIZE_BYTES = 512 * 1024 * 1024
MAX_CONTENT_SCAN_BYTES = 512 * 1024
RECENT_FILE_DAYS = 7

SCRIPT_CONTENT_EXTENSIONS = {".ps1", ".bat", ".cmd", ".vbs"}

# (compiled pattern, human-readable label, score bonus)
PS1_SUSPICIOUS_PATTERNS: list[tuple[re.Pattern[str], str, int]] = [
    (re.compile(r"(?i)-enc(?:odedcommand)?\b"), "Encoded PowerShell command flag", 30),
    (re.compile(r"(?i)-executionpolicy\s+bypass\b"), "Execution-policy bypass", 25),
    (re.compile(r"(?i)-(?:w(?:indowstyle)?\s+hidden|noni(?:nteractive)?)\b"), "Hidden/non-interactive execution", 20),
    (re.compile(r"(?i)\biex\s*[\(\[]"), "Invoke-Expression (iex) call", 20),
    (re.compile(r"(?i)invoke-expression\s"), "Invoke-Expression call", 20),
    (re.compile(r"(?i)\[convert\]::frombase64string\b"), "Base64 decode (FromBase64String)", 20),
    (re.compile(r"(?i)net\.webclient\b"), "WebClient instantiation", 15),
    (re.compile(r"(?i)downloadstring\s*\("), "Web content download (DownloadString)", 15),
    (re.compile(r"(?i)invoke-webrequest\b"), "Web request from script", 10),
]

BAT_SUSPICIOUS_PATTERNS: list[tuple[re.Pattern[str], str, int]] = [
    (re.compile(r"(?i)powershell[^\n]*-enc"), "Encoded command via PowerShell in batch", 30),
    (re.compile(r"(?i)certutil[^\n]*-decode"), "Certutil payload decode", 25),
    (re.compile(r"(?i)bitsadmin[^\n]*/transfer"), "BITSAdmin background download", 20),
    (re.compile(r"(?i)mshta\b"), "MSHTA script host invocation", 20),
    (re.compile(r"(?i)wscript[^\n]*(\.vbs|\.js)"), "WSH script execution from batch", 15),
]
SHIELD_DATA_ROOT = Path.home() / ".svans_shield"
QUARANTINE_ROOT = SHIELD_DATA_ROOT / "quarantine"
QUARANTINE_HISTORY_PATH = SHIELD_DATA_ROOT / "quarantine_history.json"
SETTINGS_PATH = SHIELD_DATA_ROOT / "settings.json"

VALID_SCAN_MODES = {"strict", "balanced", "deep"}

DEFAULT_SETTINGS: dict[str, Any] = {
    "scan_mode": "balanced",
    "show_low_risk": False,
    "auto_quarantine": False,
}

# Minimum finding score shown for each mode.
# strict  → high/critical only (score ≥ 55)
# balanced → medium+ (score ≥ 35, default behaviour)
# deep    → include low-risk (score ≥ 30)
MIN_SCORE_BY_MODE: dict[str, int] = {
    "strict": 55,
    "balanced": 35,
    "deep": 30,
}


def normalize_path(raw_path: str) -> Path:
    clean_path = raw_path.strip().strip('"').strip("'")

    if not clean_path:
        raise ValueError("Path cannot be empty.")

    return Path(clean_path).expanduser().resolve()


def load_quarantine_history() -> list[dict[str, Any]]:
    if not QUARANTINE_HISTORY_PATH.exists():
        return []

    try:
        with QUARANTINE_HISTORY_PATH.open("r", encoding="utf-8") as file:
            data = json.load(file)
    except (OSError, json.JSONDecodeError):
        return []

    if not isinstance(data, list):
        return []

    return [record for record in data if isinstance(record, dict)]


def save_quarantine_history(records: list[dict[str, Any]]) -> None:
    SHIELD_DATA_ROOT.mkdir(parents=True, exist_ok=True)

    with QUARANTINE_HISTORY_PATH.open("w", encoding="utf-8") as file:
        json.dump(records, file, indent=2)


def get_quarantine_history() -> dict[str, Any]:
    records = load_quarantine_history()
    records.sort(key=lambda item: str(item.get("quarantined_at", "")), reverse=True)

    return {
        "ok": True,
        "records": records,
        "record_count": len(records),
    }


def record_quarantine_entry(record: dict[str, Any]) -> None:
    records = load_quarantine_history()
    records.insert(0, record)
    save_quarantine_history(records[:500])


def find_quarantine_record(record_id: str) -> tuple[list[dict[str, Any]], dict[str, Any] | None]:
    records = load_quarantine_history()

    for record in records:
        if record.get("id") == record_id:
            return records, record

    return records, None


def restore_quarantine_record(record_id: str) -> dict[str, Any]:
    clean_id = record_id.strip()

    if not clean_id:
        return {"ok": False, "error": "Quarantine record id is required."}

    records, record = find_quarantine_record(clean_id)

    if not record:
        return {"ok": False, "error": "Quarantine record was not found."}

    if record.get("restored_at"):
        return {"ok": False, "error": "This quarantine record was already restored."}

    quarantine_path = normalize_path(str(record.get("quarantine_path", "")))
    original_path = normalize_path(str(record.get("original_path", "")))

    if not quarantine_path.is_file():
        return {"ok": False, "error": "The quarantined file is missing."}

    if original_path.exists():
        return {
            "ok": False,
            "error": "A file already exists at the original path. Restore was blocked to avoid overwriting it.",
        }

    original_path.parent.mkdir(parents=True, exist_ok=True)

    try:
        shutil.move(str(quarantine_path), str(original_path))
    except OSError as exc:
        return {"ok": False, "error": f"Failed to restore file: {exc}"}

    restored_at = datetime.now(timezone.utc).isoformat()
    record["restored_at"] = restored_at
    record["restored_path"] = str(original_path)
    save_quarantine_history(records)

    return {
        "ok": True,
        "record": record,
        "restored_path": str(original_path),
    }


def load_settings() -> dict[str, Any]:
    if not SETTINGS_PATH.exists():
        return dict(DEFAULT_SETTINGS)

    try:
        with SETTINGS_PATH.open("r", encoding="utf-8") as file:
            data = json.load(file)
    except (OSError, json.JSONDecodeError):
        return dict(DEFAULT_SETTINGS)

    if not isinstance(data, dict):
        return dict(DEFAULT_SETTINGS)

    result = dict(DEFAULT_SETTINGS)

    if isinstance(data.get("scan_mode"), str) and data["scan_mode"] in VALID_SCAN_MODES:
        result["scan_mode"] = data["scan_mode"]

    if isinstance(data.get("show_low_risk"), bool):
        result["show_low_risk"] = data["show_low_risk"]

    if isinstance(data.get("auto_quarantine"), bool):
        result["auto_quarantine"] = data["auto_quarantine"]

    return result


def save_settings(settings: dict[str, Any]) -> None:
    SHIELD_DATA_ROOT.mkdir(parents=True, exist_ok=True)

    with SETTINGS_PATH.open("w", encoding="utf-8") as file:
        json.dump(settings, file, indent=2)


def get_settings() -> dict[str, Any]:
    return {"ok": True, "settings": load_settings()}


def update_settings(updates: dict[str, Any]) -> dict[str, Any]:
    settings = load_settings()

    if "scan_mode" in updates:
        mode = updates["scan_mode"]
        if mode not in VALID_SCAN_MODES:
            return {
                "ok": False,
                "error": f"Invalid scan mode. Choose: {', '.join(sorted(VALID_SCAN_MODES))}",
            }
        settings["scan_mode"] = mode

    if "show_low_risk" in updates and isinstance(updates["show_low_risk"], bool):
        settings["show_low_risk"] = updates["show_low_risk"]

    if "auto_quarantine" in updates and isinstance(updates["auto_quarantine"], bool):
        settings["auto_quarantine"] = updates["auto_quarantine"]

    save_settings(settings)
    return {"ok": True, "settings": settings}


def apply_settings_filter(
    findings: list[dict[str, Any]],
    settings: dict[str, Any],
) -> list[dict[str, Any]]:
    mode = settings.get("scan_mode", "balanced")
    show_low_risk = bool(settings.get("show_low_risk", False))
    min_score = MIN_SCORE_BY_MODE.get(mode, 35)

    if show_low_risk:
        min_score = min(min_score, 30)

    return [f for f in findings if f.get("score", 0) >= min_score]


def is_blocked_scan_path(path_obj: Path) -> bool:
    normalized = str(path_obj).lower().rstrip("\\/")
    return normalized in BLOCKED_SCAN_ROOTS


def sha256_file(file_path: Path) -> str:
    stats = file_path.stat()

    if stats.st_size > MAX_HASH_SIZE_BYTES:
        return "Skipped: file too large to hash safely"

    hash_obj = hashlib.sha256()

    with file_path.open("rb") as file:
        for chunk in iter(lambda: file.read(1024 * 1024), b""):
            hash_obj.update(chunk)

    return hash_obj.hexdigest()


def is_hidden_like(file_path: Path) -> bool:
    return file_path.name.startswith(".")


def looks_random_filename(filename: str) -> bool:
    stem = Path(filename).stem

    if len(stem) < 8:
        return False

    letters = sum(char.isalpha() for char in stem)
    digits = sum(char.isdigit() for char in stem)

    return letters >= 4 and digits >= 2


def path_contains_any(path_lower: str, keywords: set[str]) -> bool:
    return any(keyword in path_lower for keyword in keywords)


def filename_contains_any(filename_lower: str, keywords: set[str]) -> bool:
    return any(keyword in filename_lower for keyword in keywords)


def detect_known_installer_patterns(path_obj: Path) -> list[tuple[str, int]]:
    context = f"{path_obj} {path_obj.name}".lower()
    matches: list[tuple[str, int]] = []

    if "temp" not in context and "appdata" not in context and "downloads" not in context:
        return matches

    for pattern, label, score_delta in KNOWN_INSTALLER_PATTERNS:
        if pattern.search(context):
            matches.append((label, score_delta))

    return matches


def is_trusted_installer_cache(path_obj: Path) -> bool:
    path_lower = str(path_obj).lower()
    filename_lower = path_obj.name.lower()

    if "temp" not in path_lower and "appdata" not in path_lower:
        return False

    has_trusted_path = path_contains_any(path_lower, TRUSTED_PATH_KEYWORDS)
    has_trusted_file = filename_contains_any(filename_lower, TRUSTED_FILE_KEYWORDS)
    has_installer_context = path_contains_any(path_lower, INSTALLER_KEYWORDS)

    if path_obj.suffix.lower() in {".dll", ".msi"} and (
        has_trusted_path or has_trusted_file or has_installer_context
    ):
        return True

    return False


@lru_cache(maxsize=512)
def get_authenticode_signature(file_path: str) -> dict[str, str] | None:
    if os.name != "nt":
        return None

    path_obj = Path(file_path)

    if path_obj.suffix.lower() not in {".exe", ".dll", ".msi", ".sys", ".cat"}:
        return None

    script = (
        "$sig = Get-AuthenticodeSignature -LiteralPath $args[0]; "
        "$subject = if ($sig.SignerCertificate) { $sig.SignerCertificate.Subject } else { '' }; "
        "$issuer = if ($sig.SignerCertificate) { $sig.SignerCertificate.Issuer } else { '' }; "
        "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; "
        "Write-Output ($sig.Status.ToString() + \"`t\" + $subject + \"`t\" + $issuer)"
    )

    try:
        result = subprocess.run(
            [
                str(POWERSHELL_EXE),
                "-NoLogo",
                "-NoProfile",
                "-NonInteractive",
                "-ExecutionPolicy",
                "Bypass",
                "-Command",
                script,
                str(path_obj),
            ],
            capture_output=True,
            text=True,
            timeout=4,
            check=False,
            creationflags=CREATE_NO_WINDOW,
        )
    except (OSError, subprocess.TimeoutExpired):
        return None

    output = result.stdout.strip()

    if not output:
        return None

    parts = output.split("\t")
    return {
        "status": parts[0] if len(parts) > 0 else "",
        "subject": parts[1] if len(parts) > 1 else "",
        "issuer": parts[2] if len(parts) > 2 else "",
    }


def signature_score_adjustment(path_obj: Path) -> tuple[list[str], int, dict[str, str] | None]:
    signature = get_authenticode_signature(str(path_obj))

    if not signature:
        return [], 0, None

    status = signature.get("status", "")
    subject = signature.get("subject", "")
    subject_lower = subject.lower()

    if status == "Valid" and any(publisher in subject_lower for publisher in TRUSTED_SIGNATURE_PUBLISHERS):
        publisher = next(
            publisher for publisher in TRUSTED_SIGNATURE_PUBLISHERS if publisher in subject_lower
        )
        return [f"Trusted digital signature from {publisher.title()}"], -45, signature

    if status == "Valid":
        return ["Valid digital signature from a non-allowlisted publisher"], -15, signature

    if status and status not in {"NotSigned", "UnknownError"}:
        return [f"Digital signature is present but not trusted: {status}"], 20, signature

    return [], 0, signature


@lru_cache(maxsize=256)
def get_running_parent_context(file_path: str) -> dict[str, str] | None:
    if os.name != "nt" or Path(file_path).suffix.lower() != ".exe":
        return None

    script = (
        "$target = [System.IO.Path]::GetFullPath($args[0]).ToLowerInvariant(); "
        "$proc = Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -and ([System.IO.Path]::GetFullPath($_.ExecutablePath).ToLowerInvariant() -eq $target) } | Select-Object -First 1; "
        "if ($proc) { "
        "$parent = Get-CimInstance Win32_Process -Filter \"ProcessId=$($proc.ParentProcessId)\"; "
        "$name = if ($parent) { $parent.Name } else { '' }; "
        "$cmd = if ($parent) { $parent.CommandLine } else { '' }; "
        "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; "
        "Write-Output ($name + \"`t\" + $cmd) "
        "}"
    )

    try:
        result = subprocess.run(
            [
                str(POWERSHELL_EXE),
                "-NoLogo",
                "-NoProfile",
                "-NonInteractive",
                "-ExecutionPolicy",
                "Bypass",
                "-Command",
                script,
                str(file_path),
            ],
            capture_output=True,
            text=True,
            timeout=4,
            check=False,
            creationflags=CREATE_NO_WINDOW,
        )
    except (OSError, subprocess.TimeoutExpired):
        return None

    output = result.stdout.strip()

    if not output:
        return None

    parent_name, _, parent_command = output.partition("\t")
    return {"name": parent_name, "command": parent_command}


def parent_context_adjustment(path_obj: Path) -> tuple[list[str], int, dict[str, str] | None]:
    context = get_running_parent_context(str(path_obj))

    if not context:
        return [], 0, None

    command = f"{context.get('name', '')} {context.get('command', '')}".lower()

    for pattern, label, score_delta in RISKY_PARENT_PATTERNS:
        if pattern.search(command):
            return [label], score_delta, context

    if any(keyword in command for keyword in GOOD_PARENT_KEYWORDS):
        return ["Parent process context looks like normal installer/user launch flow"], -20, context

    return ["Parent process context was available but not clearly trusted"], 0, context


def calculate_risk(score: int) -> str | None:
    if score >= 75:
        return "critical"

    if score >= 55:
        return "high"

    if score >= 35:
        return "medium"

    if score >= 30:
        return "low"

    return None


def calculate_confidence(score: int, reasons: list[str]) -> str:
    joined = " ".join(reasons).lower()

    if score >= 75 or "startup" in joined or "double-extension" in joined:
        return "critical"

    if score >= 55:
        return "suspicious"

    return "review"


def scan_file_content(file_path: Path, suffix: str) -> list[tuple[str, int]]:
    """Return a list of (reason, score_bonus) from script content analysis."""
    if suffix not in SCRIPT_CONTENT_EXTENSIONS:
        return []

    try:
        if file_path.stat().st_size > MAX_CONTENT_SCAN_BYTES:
            return []

        content = file_path.read_text(encoding="utf-8", errors="ignore")
    except OSError:
        return []

    hits: list[tuple[str, int]] = []
    seen_labels: set[str] = set()

    patterns = PS1_SUSPICIOUS_PATTERNS if suffix == ".ps1" else BAT_SUSPICIOUS_PATTERNS

    for pattern, label, bonus in patterns:
        if label not in seen_labels and pattern.search(content):
            hits.append((label, bonus))
            seen_labels.add(label)

    return hits


def is_recently_modified(file_path: Path) -> bool:
    try:
        age_seconds = time.time() - file_path.stat().st_mtime
        return age_seconds < RECENT_FILE_DAYS * 86400
    except OSError:
        return False


def assess_file(file_path: str | Path) -> dict[str, Any] | None:
    path_obj = Path(file_path)

    try:
        if not path_obj.is_file():
            return None
    except OSError:
        return None

    filename = path_obj.name
    suffix = path_obj.suffix.lower()
    filename_lower = filename.lower()
    path_lower = str(path_obj).lower()

    if is_trusted_installer_cache(path_obj):
        return None

    reasons: list[str] = []
    score = 0

    if suffix == ".cmd" and any(
        trusted in path_lower
        for trusted in ["google", "microsoft", "installer", "setup", "update"]
    ):
        return None

    if suffix in HIGH_RISK_EXTENSIONS:
        reasons.append(f"High-risk script/executable type detected: {suffix}")
        score += 25
    elif suffix in SUSPICIOUS_EXTENSIONS:
        reasons.append(f"Executable or script-capable file type detected: {suffix}")
        score += 8

    if filename_lower in SUSPICIOUS_FILENAMES:
        reasons.append("Known suspicious deceptive filename")
        score += 30

    if DOUBLE_EXTENSION_PATTERN.match(filename):
        reasons.append("Double-extension disguise detected")
        score += 45

    if is_hidden_like(path_obj) and suffix in SUSPICIOUS_EXTENSIONS:
        reasons.append("Hidden-like executable or script file")
        score += 25

    if "startup" in path_lower:
        reasons.append("File located in startup-related path")
        score += 45

    try:
        file_hash = sha256_file(path_obj)
    except OSError:
        file_hash = "Could not hash file"

    if is_known_safe(file_hash):
        return None

    trust_context: dict[str, Any] = {
        "signature": None,
        "parent_process": None,
        "reputation_matches": 0,
        "known_installer_pattern": False,
    }

    if (
        "appdata" in path_lower or "temp" in path_lower
    ) and suffix in HIGH_RISK_EXTENSIONS:
        reasons.append("High-risk script/executable located in AppData or Temp")
        score += 25
    elif ("appdata" in path_lower or "temp" in path_lower) and suffix in {
        ".exe",
        ".dll",
        ".msi",
    }:
        reasons.append("Executable-capable file located in AppData or Temp")
        score += 8

    if looks_random_filename(filename) and suffix in SUSPICIOUS_EXTENSIONS:
        reasons.append("Filename looks randomly generated")
        score += 8

    # Recency boost: recent executable/script in Downloads or Temp raises suspicion.
    if (
        ("downloads" in path_lower or "temp" in path_lower)
        and suffix in SUSPICIOUS_EXTENSIONS
        and is_recently_modified(path_obj)
    ):
        reasons.append(
            f"Recently modified executable or script in Downloads/Temp (within {RECENT_FILE_DAYS} days)"
        )
        score += 12

    # Content analysis for script files.
    for content_reason, bonus in scan_file_content(path_obj, suffix):
        reasons.append(content_reason)
        score += bonus

    for installer_reason, score_delta in detect_known_installer_patterns(path_obj):
        reasons.append(installer_reason)
        score += score_delta
        trust_context["known_installer_pattern"] = True

    signature_reasons, signature_delta, signature = signature_score_adjustment(path_obj)
    if signature_reasons:
        reasons.extend(signature_reasons)
        score += signature_delta
    if signature:
        trust_context["signature"] = signature

    if score >= 20 and ("appdata" in path_lower or "temp" in path_lower or "downloads" in path_lower):
        parent_reasons, parent_delta, parent_context = parent_context_adjustment(path_obj)
        if parent_reasons:
            reasons.extend(parent_reasons)
            score += parent_delta
        if parent_context:
            trust_context["parent_process"] = parent_context

    reputation = get_reputation_adjustment(path_obj, file_hash)
    reputation_delta = int(reputation.get("score_delta", 0))
    if reputation_delta:
        reasons.append(str(reputation.get("label", "Local reputation adjusted score")))
        score += reputation_delta
        trust_context["reputation_matches"] = int(reputation.get("matches", 0))

    if filename_contains_any(filename_lower, TRUSTED_FILE_KEYWORDS):
        reasons.append("Filename matches a common trusted runtime or installer component")
        score -= 20

    if path_contains_any(path_lower, TRUSTED_PATH_KEYWORDS):
        reasons.append("Path matches a common trusted development/vendor location")
        score -= 20

    score = max(score, 0)
    risk = calculate_risk(score)

    if risk is None:
        return None

    return {
        "name": filename,
        "path": str(path_obj),
        "extension": suffix or "none",
        "score": score,
        "risk": risk,
        "confidence": calculate_confidence(score, reasons),
        "reasons": reasons,
        "sha256": file_hash,
        "trust_context": trust_context,
    }


def scan_folder(folder_path: str) -> dict[str, Any]:
    started_at = datetime.now(timezone.utc)

    try:
        path_obj = normalize_path(folder_path)
    except ValueError as exc:
        return {"ok": False, "error": str(exc)}

    if not path_obj.exists() or not path_obj.is_dir():
        return {"ok": False, "error": "Folder does not exist."}

    if is_blocked_scan_path(path_obj):
        return {
            "ok": False,
            "error": "This protected system path is blocked in the MVP scanner.",
        }

    findings: list[dict[str, Any]] = []
    scanned_count = 0
    skipped_count = 0

    for root, dirs, files in os.walk(path_obj):
        dirs[:] = [
            directory
            for directory in dirs
            if directory.lower() not in {"$recycle.bin", "system volume information"}
        ]

        for file_name in files:
            scanned_count += 1
            full_path = Path(root) / file_name

            if not full_path.is_file():
                continue

            try:
                result = assess_file(full_path)

                if result:
                    findings.append(analyze_finding(result))
            except (OSError, PermissionError):
                skipped_count += 1

    findings.sort(key=lambda item: item["score"], reverse=True)
    findings = apply_settings_filter(findings, load_settings())
    completed_at = datetime.now(timezone.utc)
    duration_seconds = round((completed_at - started_at).total_seconds(), 2)

    return {
        "ok": True,
        "folder": str(path_obj),
        "started_at": started_at.isoformat(),
        "completed_at": completed_at.isoformat(),
        "duration_seconds": duration_seconds,
        "scanned_count": scanned_count,
        "skipped_count": skipped_count,
        "finding_count": len(findings),
        "findings": findings,
    }


def get_quick_scan_targets() -> list[dict[str, str]]:
    user_profile = os.environ.get("USERPROFILE") or str(Path.home())
    appdata = os.environ.get("APPDATA", "")
    local_appdata = os.environ.get("LOCALAPPDATA", "")

    candidates = [
        {"label": "Desktop", "path": str(Path(user_profile) / "Desktop")},
        {"label": "Downloads", "path": str(Path(user_profile) / "Downloads")},
        {"label": "Temp", "path": str(Path(local_appdata) / "Temp")},
        {
            "label": "Startup",
            "path": str(
                Path(appdata)
                / "Microsoft"
                / "Windows"
                / "Start Menu"
                / "Programs"
                / "Startup"
            ),
        },
    ]

    return [
        candidate
        for candidate in candidates
        if candidate["path"] and Path(candidate["path"]).exists()
    ]


def quarantine_file(file_path: str) -> dict[str, Any]:
    try:
        path_obj = normalize_path(file_path)
    except ValueError as exc:
        return {"ok": False, "error": str(exc)}

    if not path_obj.exists() or not path_obj.is_file():
        return {"ok": False, "error": "File does not exist."}

    QUARANTINE_ROOT.mkdir(parents=True, exist_ok=True)

    quarantined_at = datetime.now(timezone.utc)
    timestamp = quarantined_at.strftime("%Y%m%d_%H%M%S")
    safe_name = path_obj.name.replace("/", "_").replace("\\", "_")
    target_path = QUARANTINE_ROOT / f"{timestamp}__{safe_name}"

    try:
        file_hash = sha256_file(path_obj)
    except OSError:
        file_hash = "Could not hash file"

    assessed = assess_file(path_obj)
    analyzed = analyze_finding(assessed) if assessed else None

    try:
        shutil.move(str(path_obj), str(target_path))

        record = {
            "id": f"{timestamp}__{file_hash[:12]}__{safe_name}",
            "name": path_obj.name,
            "original_path": str(path_obj),
            "quarantine_path": str(target_path),
            "sha256": file_hash,
            "quarantined_at": quarantined_at.isoformat(),
            "risk": analyzed.get("risk") if analyzed else "unknown",
            "score": analyzed.get("score") if analyzed else 0,
            "verdict": analyzed.get("verdict") if analyzed else "Quarantined",
            "reasons": analyzed.get("reasons") if analyzed else [],
            "explanation": analyzed.get("explanation") if analyzed else "",
        }

        record_quarantine_entry(record)

        return {
            "ok": True,
            "original_path": str(path_obj),
            "quarantine_path": str(target_path),
            "record": record,
        }
    except OSError as exc:
        return {"ok": False, "error": f"Failed to quarantine file: {exc}"}


def scan_all_quick_targets() -> dict[str, Any]:
    started_at = datetime.now(timezone.utc)
    targets = get_quick_scan_targets()

    all_findings: list[dict[str, Any]] = []
    scanned_count = 0
    skipped_count = 0
    scanned_targets: list[str] = []

    for target in targets:
        result = scan_folder(target["path"])

        if result.get("ok"):
            scanned_targets.append(target["label"])
            scanned_count += int(result.get("scanned_count", 0))
            skipped_count += int(result.get("skipped_count", 0))

            for finding in result.get("findings", []):
                finding["scan_source"] = target["label"]
                all_findings.append(finding)

    all_findings.sort(key=lambda item: item["score"], reverse=True)
    all_findings = apply_settings_filter(all_findings, load_settings())
    completed_at = datetime.now(timezone.utc)
    duration_seconds = round((completed_at - started_at).total_seconds(), 2)

    return {
        "ok": True,
        "started_at": started_at.isoformat(),
        "completed_at": completed_at.isoformat(),
        "duration_seconds": duration_seconds,
        "scanned_targets": scanned_targets,
        "scanned_count": scanned_count,
        "skipped_count": skipped_count,
        "finding_count": len(all_findings),
        "findings": all_findings,
    }
