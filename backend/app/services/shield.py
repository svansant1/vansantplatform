import hashlib
import os
import re
import shutil
from datetime import datetime
from pathlib import Path
from typing import List, Dict, Any

THREAT_RULES = [
    {
        "name": "Double Extension Disguise",
        "score": 35,
        "description": "File pretends to be a document or image but ends in executable/script extension.",
    },
    {
        "name": "Startup Persistence",
        "score": 40,
        "description": "File exists in startup-related location.",
    },
    {
        "name": "Temp Executable Drop",
        "score": 20,
        "description": "Executable/script found in Temp or AppData.",
    },
]

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

SUSPICIOUS_FILENAMES = {
    "update.exe",
    "chrome_update.exe",
    "windows_update.exe",
    "invoice.exe",
    "document.exe",
    "security_update.exe",
    "patch.exe",
}

TRUSTED_FOLDERS = {
    "Microsoft",
    "VisualStudio",
    "AzureFunctionsTools",
    "node_modules",
    "Python",
    "pip",
    "npm",
    ".nuget",
    "__pycache__",
    "venv",
    ".venv",
}

TRUSTED_NAME_PATTERNS = [
    "docker desktop updater",
    "codesetup",
    "chrome installer",
    "firefox installer",
    "microsoft.build",
    "azurefunctionstools",
]

DOUBLE_EXTENSION_PATTERN = re.compile(
    r".+\.(pdf|doc|docx|xls|xlsx|jpg|jpeg|png|txt)\.(exe|bat|cmd|js|vbs|scr)$",
    re.IGNORECASE,
)


def sha256_file(file_path: str) -> str:
    hash_obj = hashlib.sha256()
    with open(file_path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            hash_obj.update(chunk)
    return hash_obj.hexdigest()


def is_hidden_windows(file_path: str) -> bool:
    name = os.path.basename(file_path)
    return name.startswith(".")


def looks_random_filename(filename: str) -> bool:
    stem = Path(filename).stem
    if len(stem) < 8:
        return False

    letters = sum(c.isalpha() for c in stem)
    digits = sum(c.isdigit() for c in stem)

    return letters >= 4 and digits >= 2


def is_likely_installer(path_lower: str) -> bool:
    installer_keywords = [
        "setup",
        "installer",
        "install",
        "update",
        "docker",
        "visualstudio",
        "microsoft",
        "wsl",
        "python",
        "node",
        "npm",
        "chrome",
        "edge",
        "firefox",
    ]

    return any(keyword in path_lower for keyword in installer_keywords)


def is_common_runtime(filename_lower):
    common = [
        "vcruntime",
        "msvcp",
        "concrt",
        "libcrypto",
        "libssl",
        "intel",
        "runtime",
        "visualc",
        "vc_redist",
        "directx",
    ]

    return any(x in filename_lower for x in common)


def assess_file(file_path: str) -> Dict[str, Any] | None:
    path_obj = Path(file_path)
    filename = path_obj.name
    suffix = path_obj.suffix.lower()
    filename_lower = filename.lower()
    full_path_lower = str(path_obj).lower()

    for pattern in TRUSTED_NAME_PATTERNS:
        if pattern in filename_lower:
            return None

    reasons: List[str] = []
    score = 0

    if is_likely_installer(full_path_lower):
        return None

    if is_common_runtime(filename_lower):
        score -= 15

    if suffix in SUSPICIOUS_EXTENSIONS:
        reasons.append(f"Executable file type detected: {suffix}")
        score += 10

    if filename.lower() in SUSPICIOUS_FILENAMES:
        reasons.append("Known suspicious deceptive filename")
        score += 25

    if DOUBLE_EXTENSION_PATTERN.match(filename):
        reasons.append("Double-extension disguise detected")
        score += 35

    if is_hidden_windows(file_path) and suffix in SUSPICIOUS_EXTENSIONS:
        reasons.append("Hidden executable/script file")
        score += 20

    if "appdata" in full_path_lower or "temp" in full_path_lower:
        if suffix in SUSPICIOUS_EXTENSIONS:
            reasons.append("Executable/script located in AppData or Temp")
            score += 5

    if "startup" in full_path_lower:
        reasons.append("File located in startup-related path")
        score += 25

    if looks_random_filename(filename):
        reasons.append("Filename looks randomly generated")
        score += 10

    if score == 0:
        return None

    if score >= 60:
        risk = "high"
    elif score >= 35:
        risk = "medium"
    elif score >= 15:
        risk = "low"
    else:
        return None
    try:
        file_hash = sha256_file(file_path)
    except Exception:
        file_hash = "Could not hash file"

    return {
        "name": filename,
        "path": str(path_obj),
        "extension": suffix or "none",
        "score": score,
        "risk": risk,
        "reasons": reasons,
        "sha256": file_hash,
    }


def scan_folder(folder_path: str) -> Dict[str, Any]:
    if not folder_path:
        return {"ok": False, "error": "No folder path provided"}

    path_obj = Path(folder_path)

    if not path_obj.exists() or not path_obj.is_dir():
        return {"ok": False, "error": "Folder does not exist"}

    findings: List[Dict[str, Any]] = []
    scanned_count = 0

    for root, _, files in os.walk(folder_path):
        for file in files:
            scanned_count += 1
            full_path = os.path.join(root, file)

            try:
                result = assess_file(full_path)
                if result:
                    findings.append(result)
            except Exception as exc:
                findings.append(
                    {
                        "name": file,
                        "path": full_path,
                        "extension": Path(file).suffix.lower() or "none",
                        "score": 0,
                        "risk": "unknown",
                        "reasons": [f"Error during scan: {str(exc)}"],
                        "sha256": "N/A",
                    }
                )

    findings.sort(key=lambda x: x["score"], reverse=True)

    return {
        "ok": True,
        "folder": str(path_obj),
        "scanned_count": scanned_count,
        "finding_count": len(findings),
        "findings": findings,
    }


def get_quick_scan_targets() -> List[Dict[str, str]]:
    user_profile = os.environ.get("USERPROFILE", "")
    appdata = os.environ.get("APPDATA", "")
    local_appdata = os.environ.get("LOCALAPPDATA", "")

    targets = [
        {"label": "Desktop", "path": os.path.join(user_profile, "Desktop")},
        {"label": "Downloads", "path": os.path.join(user_profile, "Downloads")},
        {"label": "Temp", "path": os.path.join(local_appdata, "Temp")},
        {"label": "AppData Roaming", "path": appdata},
        {"label": "AppData Local", "path": local_appdata},
        {
            "label": "Startup",
            "path": os.path.join(
                appdata,
                "Microsoft",
                "Windows",
                "Start Menu",
                "Programs",
                "Startup",
            ),
        },
    ]

    return [t for t in targets if t["path"] and Path(t["path"]).exists()]


def quarantine_file(file_path: str, quarantine_root: str) -> Dict[str, Any]:
    path_obj = Path(file_path)

    if not path_obj.exists() or not path_obj.is_file():
        return {"ok": False, "error": "File does not exist"}

    quarantine_dir = Path(quarantine_root)
    quarantine_dir.mkdir(parents=True, exist_ok=True)

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    target_name = f"{timestamp}__{path_obj.name}"
    target_path = quarantine_dir / target_name

    try:
        shutil.move(str(path_obj), str(target_path))
        return {
            "ok": True,
            "original_path": str(path_obj),
            "quarantine_path": str(target_path),
        }
    except Exception as exc:
        return {"ok": False, "error": str(exc)}


def scan_all_quick_targets() -> Dict[str, Any]:
    targets = get_quick_scan_targets()

    all_findings: List[Dict[str, Any]] = []
    scanned_count = 0
    scanned_targets: List[str] = []

    for target in targets:
        result = scan_folder(target["path"])

        if result.get("ok"):
            scanned_targets.append(target["label"])
            scanned_count += result.get("scanned_count", 0)

            for finding in result.get("findings", []):
                finding["scan_source"] = target["label"]
                all_findings.append(finding)

    all_findings.sort(key=lambda x: x["score"], reverse=True)

    return {
        "ok": True,
        "scanned_targets": scanned_targets,
        "scanned_count": scanned_count,
        "finding_count": len(all_findings),
        "findings": all_findings,
    }


def scan_all_quick_targets() -> Dict[str, Any]:
    targets = get_quick_scan_targets()

    preferred_labels = {"Desktop", "Downloads", "Temp", "Startup"}
    filtered_targets = [t for t in targets if t["label"] in preferred_labels]

    all_findings: List[Dict[str, Any]] = []
    scanned_count = 0
    scanned_targets: List[str] = []

    for target in filtered_targets:
        result = scan_folder(target["path"])

        if result.get("ok"):
            scanned_targets.append(target["label"])
            scanned_count += result.get("scanned_count", 0)

            for finding in result.get("findings", []):
                finding["scan_source"] = target["label"]
                all_findings.append(finding)

    all_findings.sort(key=lambda x: x["score"], reverse=True)

    return {
        "ok": True,
        "scanned_targets": scanned_targets,
        "scanned_count": scanned_count,
        "finding_count": len(all_findings),
        "findings": all_findings,
    }
