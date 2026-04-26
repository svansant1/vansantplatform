import os
import psutil
from pathlib import Path
from typing import Any, Dict, List


SAFE_PROCESS_NAMES = {
    "system idle process",
    "system",
    "registry",
    "smss.exe",
    "csrss.exe",
    "wininit.exe",
    "services.exe",
    "lsass.exe",
    "explorer.exe",
    "chrome.exe",
    "msedge.exe",
    "firefox.exe",
    "code.exe",
    "python.exe",
    "node.exe",
    "docker desktop.exe",
}

SAFE_PATH_KEYWORDS = {
    "windows\\system32",
    "program files",
    "program files (x86)",
    "microsoft",
    "docker",
    "visual studio code",
    "python",
    "nodejs",
}


def get_system_stats() -> Dict[str, Any]:
    cpu_usage = psutil.cpu_percent(interval=0.2)
    memory = psutil.virtual_memory().percent

    return {
        "cpu_usage": cpu_usage,
        "memory": memory,
    }


def get_suspicious_processes() -> Dict[str, List[Dict[str, Any]]]:
    active_threats: List[Dict[str, Any]] = []
    watch_list: List[Dict[str, Any]] = []
    silent: List[Dict[str, Any]] = []

    for proc in psutil.process_iter(
        ["pid", "name", "cpu_percent", "memory_percent", "exe"]
    ):
        try:
            name = (proc.info.get("name") or "").lower()
            pid = proc.info.get("pid")
            cpu = proc.info.get("cpu_percent") or 0
            mem = round(proc.info.get("memory_percent") or 0, 2)
            exe = proc.info.get("exe") or ""

            if not name:
                continue

            reasons: List[str] = []
            score = 0
            exe_lower = exe.lower()

            if cpu > 80 and name not in SAFE_PROCESS_NAMES:
                reasons.append("Very high CPU usage from non-whitelisted process")
                score += 25

            if mem > 20 and name not in SAFE_PROCESS_NAMES:
                reasons.append("High memory usage from non-whitelisted process")
                score += 15

            if name == "svchost.exe" and "windows\\system32" not in exe_lower:
                reasons.append("svchost.exe running outside System32")
                score += 40

            if name in {"chrome.exe", "msedge.exe", "explorer.exe"} and not any(
                safe in exe_lower for safe in SAFE_PATH_KEYWORDS
            ):
                reasons.append("Common trusted process name running from unusual path")
                score += 30

            if exe_lower and ("temp" in exe_lower or "appdata" in exe_lower):
                reasons.append("Process executing from Temp/AppData")
                score += 20

            if name.endswith(".exe") and len(Path(name).stem) >= 8:
                stem = Path(name).stem
                letters = sum(c.isalpha() for c in stem)
                digits = sum(c.isdigit() for c in stem)
                if letters >= 4 and digits >= 2:
                    reasons.append("Random-looking executable name")
                    score += 10

            if score <= 0:
                continue

            risk = "low"
            if score >= 50:
                risk = "high"
            elif score >= 25:
                risk = "medium"

            threat = {
                "pid": pid,
                "name": proc.info.get("name") or "Unknown",
                "cpu_percent": cpu,
                "memory_percent": mem,
                "exe": exe or "Unavailable",
                "risk": risk,
                "score": score,
                "reasons": reasons,
            }

            if score >= 50:
                active_threats.append(threat)
            elif score >= 25:
                watch_list.append(threat)
            else:
                silent.append(threat)

        except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
            continue
        except Exception:
            continue

    active_threats.sort(key=lambda x: x["score"], reverse=True)
    watch_list.sort(key=lambda x: x["score"], reverse=True)
    silent.sort(key=lambda x: x["score"], reverse=True)

    return {
        "active": active_threats,
        "watch": watch_list,
        "silent": silent,
    }


def generate_intel_feed(threats: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    events = []

    for idx, threat in enumerate(threats[:10], start=1):
        primary_reason = (
            threat["reasons"][0]
            if threat["reasons"]
            else "Suspicious behavior detected"
        )

        lesson = "This process should be reviewed before termination."
        if "Temp/AppData" in primary_reason:
            lesson = (
                "Legitimate programs usually run from Program Files or System32, "
                "not Temp/AppData."
            )
        elif "svchost.exe" in threat["name"].lower():
            lesson = (
                "System processes using trusted names from unusual paths are a "
                "classic masquerading tactic."
            )
        elif "CPU" in primary_reason:
            lesson = (
                "Unexpected heavy CPU usage can indicate abuse such as mining, "
                "runaway scripts, or malware activity."
            )

        events.append(
            {
                "id": idx,
                "type": "DEFENSE",
                "title": f"Suspicious Process: {threat['name']}",
                "intel": primary_reason,
                "action": f"Risk: {threat['risk'].upper()} | PID: {threat['pid']}",
                "lesson": lesson,
                "path": threat["exe"],
            }
        )

    return events
