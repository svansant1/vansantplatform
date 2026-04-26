import re
from typing import Any, Dict, List, Optional


def normalize_text(text: str) -> str:
    return re.sub(r"\s+", " ", text.strip().lower())


def extract_keywords(prompt: str) -> List[str]:
    words = re.findall(r"[a-zA-Z0-9_+#.-]+", prompt.lower())
    stop_words = {
        "the",
        "a",
        "an",
        "is",
        "are",
        "to",
        "in",
        "of",
        "for",
        "and",
        "or",
        "me",
        "you",
        "it",
        "this",
        "that",
        "how",
        "what",
        "why",
        "explain",
        "write",
        "show",
        "give",
        "name",
        "list",
    }
    return [w for w in words if w not in stop_words and len(w) > 2]


def score_knowledge_item(prompt: str, item: Dict[str, Any]) -> int:
    prompt_keywords = set(extract_keywords(prompt))

    title = normalize_text(item.get("title", ""))
    content = normalize_text(item.get("content", ""))
    topic = normalize_text(item.get("topic", ""))

    score = 0

    for keyword in prompt_keywords:
        if keyword in title:
            score += 5
        if keyword in topic:
            score += 4
        if keyword in content:
            score += 2

    return score


def retrieve_relevant_knowledge(
    prompt: str, knowledge: List[Dict[str, Any]], top_k: int = 5
) -> List[Dict[str, Any]]:
    scored = []

    for item in knowledge:
        score = score_knowledge_item(prompt, item)
        if score > 0:
            scored.append((score, item))

    scored.sort(key=lambda x: x[0], reverse=True)
    return [item for _, item in scored[:top_k]]


def extract_topic(prompt: str) -> str:
    lower_prompt = prompt.lower()

    if "operating system" in lower_prompt:
        return "operating systems"
    if "network" in lower_prompt:
        return "networking"
    if (
        "python" in lower_prompt
        or "javascript" in lower_prompt
        or "code" in lower_prompt
    ):
        return "programming"
    if "cpu" in lower_prompt or "ram" in lower_prompt or "gpu" in lower_prompt:
        return "hardware"
    if "virus" in lower_prompt or "malware" in lower_prompt or "threat" in lower_prompt:
        return "security"

    keywords = extract_keywords(prompt)
    return keywords[0] if keywords else "general"
