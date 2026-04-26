from typing import Any, Dict, List


def build_deep_answer(
    prompt: str,
    primary_topic: str,
    related_topics: List[str],
    matched_knowledge: List[Dict[str, Any]],
    web_results: List[Dict[str, Any]] | None = None,
) -> Dict[str, Any]:
    web_results = web_results or []

    answer_sections: List[str] = []
    sources: List[str] = []

    if primary_topic != "general":
        answer_sections.append(f"**Main Topic:** {primary_topic.title()}")

    if matched_knowledge:
        top_contents = []
        for item in matched_knowledge[:5]:
            title = item.get("title", "Untitled")
            content = (item.get("content") or "").strip()
            if title not in sources:
                sources.append(title)
            if content:
                top_contents.append(content)

        combined = " ".join(top_contents).strip()
        if combined:
            answer_sections.append(combined[:1800])

    if related_topics:
        answer_sections.append(
            "**Related Concepts:** " + ", ".join(related_topics[:10])
        )

    if web_results:
        web_titles = []
        for item in web_results[:3]:
            title = item.get("title", "Untitled")
            if title not in sources:
                sources.append(title)
            web_titles.append(title)

        if web_titles:
            answer_sections.append("**Supporting Sources:** " + ", ".join(web_titles))

    if not answer_sections:
        answer_sections.append(
            "SVANSAI found limited knowledge for this topic, but it recognizes the subject and needs deeper learning or more supporting context."
        )

    explanation = (
        f"SVANSAI expanded the question into the topic '{primary_topic}' and looked for related concepts to answer more deeply."
        if primary_topic != "general"
        else "SVANSAI generated a general response from the available knowledge."
    )

    suggestions = [
        "Go deeper into this topic",
        "Explain this more simply",
        "Give real examples",
        "Show related concepts",
    ]

    return {
        "answer": "\n\n".join(answer_sections).strip(),
        "explanation": explanation,
        "sources": sources,
        "suggestions": suggestions,
        "mode": "deep_answer",
        "confidence": 0.72 if matched_knowledge else 0.45,
    }
