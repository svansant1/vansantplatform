from __future__ import annotations

from typing import Any


def _tag_context(finding: dict[str, Any]) -> list[str]:
    path_lower = finding["path"].lower()
    reasons_lower = " ".join(finding.get("reasons", [])).lower()
    ext = finding.get("extension", "")

    tags: list[str] = []

    if "startup" in path_lower:
        tags.append("persistence")

    if ext in (".ps1", ".cmd", ".bat", ".vbs"):
        tags.append("script execution")

    if "temp" in path_lower:
        tags.append("temporary execution")

    if "downloads" in path_lower:
        tags.append("user download")

    if "encoded" in reasons_lower or "base64" in reasons_lower:
        tags.append("encoded command")

    if "execution-policy bypass" in reasons_lower or "executionpolicy" in reasons_lower:
        tags.append("execution policy bypass")

    if "hidden" in reasons_lower and ("window" in reasons_lower or "execution" in reasons_lower):
        tags.append("hidden execution")

    if "recently modified" in reasons_lower:
        tags.append("recent file")

    if (
        "webclient" in reasons_lower
        or "downloadstring" in reasons_lower
        or "invoke-webrequest" in reasons_lower
    ):
        tags.append("network download")

    if "double-extension" in reasons_lower:
        tags.append("double extension")

    if "bitsadmin" in reasons_lower or "certutil" in reasons_lower:
        tags.append("lolbin abuse")

    if "trusted digital signature" in reasons_lower or "valid digital signature" in reasons_lower:
        tags.append("signed software")

    if "known installer" in reasons_lower:
        tags.append("installer context")

    if "local reputation" in reasons_lower:
        tags.append("learned safe")

    if "parent process" in reasons_lower:
        tags.append("parent process context")

    return tags


def _determine_verdict(score: int, tags: list[str]) -> str:
    if "persistence" in tags or "encoded command" in tags:
        return "Likely Malicious"

    if score >= 75:
        return "Likely Malicious"

    if score >= 50:
        return "Suspicious"

    if score >= 30:
        return "Review"

    return "Safe"


def _generate_explanation(finding: dict[str, Any], tags: list[str]) -> str:
    parts: list[str] = []

    if "script execution" in tags:
        parts.append("This file can execute commands directly on the system.")

    if "encoded command" in tags:
        parts.append("It contains obfuscated or base64-encoded instructions, a common evasion technique.")

    if "execution policy bypass" in tags:
        parts.append("It attempts to bypass PowerShell execution policy restrictions.")

    if "hidden execution" in tags:
        parts.append("It is configured to run without a visible window, hiding its activity from the user.")

    if "network download" in tags:
        parts.append("It attempts to download content from the internet.")

    if "lolbin abuse" in tags:
        parts.append("It uses a trusted system binary (certutil or BITSAdmin) to download or decode a payload.")

    if "temporary execution" in tags:
        parts.append("It is located in a temporary directory, which is unusual for legitimate software.")

    if "user download" in tags and "recent file" in tags:
        parts.append("It was recently placed in the Downloads folder.")

    if "persistence" in tags:
        parts.append("It is configured to run at startup, which may indicate persistence behaviour.")

    if "double extension" in tags:
        parts.append("Its filename uses a double extension to disguise itself as a document.")

    if "signed software" in tags:
        parts.append("A digital signature lowers confidence that this is malicious, especially when the signer is a trusted vendor.")

    if "installer context" in tags:
        parts.append("The path and filename look like a known installer or updater extraction pattern, so Shield lowered the score.")

    if "learned safe" in tags:
        parts.append("Local reputation lowered the score because similar files were previously marked safe.")

    if "parent process context" in tags:
        parts.append("Parent process context was considered because the launch chain can separate normal installer activity from suspicious script-driven execution.")

    if not parts:
        parts.append("No strong malicious indicators were detected, but the file warrants review.")

    return " ".join(parts)


def analyze_finding(finding: dict[str, Any]) -> dict[str, Any]:
    tags = _tag_context(finding)
    verdict = _determine_verdict(finding["score"], tags)
    explanation = _generate_explanation(finding, tags)

    return {
        **finding,
        "context_tags": tags,
        "verdict": verdict,
        "explanation": explanation,
    }
