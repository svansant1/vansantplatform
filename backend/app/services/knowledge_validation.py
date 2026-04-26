from typing import Any, Dict, List

TRUSTED_SOURCES = {
    "manual",
    "brave_ai_summary",
    "vector_search",
    "uploaded_file",
    "auto_learned_web",
}


def validate_knowledge_entry(
    entry: Dict[str, Any],
    existing_knowledge: List[Dict[str, Any]],
) -> Dict[str, Any]:
    score = 0
    source = (entry.get("source") or "").strip()
    title = (entry.get("title") or "").strip().lower()
    content = (entry.get("content") or "").strip()
    topic = (entry.get("topic") or "").strip().lower()

    if content:
        if len(content) > 80:
            score += 2
        if len(content) > 200:
            score += 2

    if title:
        score += 1

    if topic:
        score += 1

    if source in TRUSTED_SOURCES:
        score += 2

    corroboration_count = 0
    contradiction = False

    for item in existing_knowledge:
        existing_title = (item.get("title") or "").strip().lower()
        existing_topic = (item.get("topic") or "").strip().lower()
        existing_content = (item.get("content") or "").strip().lower()

        if title and title == existing_title:
            corroboration_count += 1
        elif topic and topic == existing_topic:
            corroboration_count += 1

        if (
            title
            and title == existing_title
            and content
            and existing_content
            and content.lower() != existing_content
        ):
            contradiction = True

    score += min(corroboration_count, 3)

    if contradiction:
        score -= 3

    if score >= 7 and not contradiction:
        validation_status = "trusted"
        confidence = 0.85
    elif score >= 4:
        validation_status = "unverified"
        confidence = 0.55
    else:
        validation_status = "weak"
        confidence = 0.30

    return {
        **entry,
        "validation_status": validation_status,
        "confidence": confidence,
        "corroboration_count": corroboration_count,
        "contradiction": contradiction,
    }
