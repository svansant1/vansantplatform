from typing import Any, Dict, List

from services.deep_topic_engine import build_topic_cluster
from services.deep_answer_engine import build_deep_answer
from services.knowledge_validation import validate_knowledge_entry


def orchestrate_svansai_response(
    prompt: str,
    knowledge: List[Dict[str, Any]],
    web_results: List[Dict[str, Any]] | None = None,
) -> Dict[str, Any]:
    topic_cluster = build_topic_cluster(prompt)
    primary_topic = topic_cluster["primary_topic"]
    related_topics = topic_cluster["related_topics"]

    matched_knowledge = []

    lower_prompt = prompt.lower()
    for item in knowledge:
        title = (item.get("title") or "").lower()
        content = (item.get("content") or "").lower()
        topic = (item.get("topic") or "").lower()

        score = 0
        if primary_topic != "general" and primary_topic in topic:
            score += 5
        if primary_topic != "general" and primary_topic in title:
            score += 4
        if primary_topic != "general" and primary_topic in content:
            score += 3

        for rel in related_topics:
            rel_lower = rel.lower()
            if rel_lower in title:
                score += 2
            if rel_lower in content:
                score += 1

        if lower_prompt and any(
            word in content or word in title
            for word in lower_prompt.split()
            if len(word) > 3
        ):
            score += 1

        if score > 0:
            matched_knowledge.append((score, item))

    matched_knowledge.sort(key=lambda x: x[0], reverse=True)
    matched_knowledge = [item for _, item in matched_knowledge[:8]]

    deep_response = build_deep_answer(
        prompt=prompt,
        primary_topic=primary_topic,
        related_topics=related_topics,
        matched_knowledge=matched_knowledge,
        web_results=web_results or [],
    )

    return {
        "primary_topic": primary_topic,
        "related_topics": related_topics,
        "matched_knowledge": matched_knowledge,
        **deep_response,
    }


def validate_learned_entry(
    learned_entry: Dict[str, Any],
    existing_knowledge: List[Dict[str, Any]],
) -> Dict[str, Any]:
    return validate_knowledge_entry(learned_entry, existing_knowledge)
