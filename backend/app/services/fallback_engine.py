import re
from typing import Any, Dict, List, Optional

from services.response_schema import build_response


def generate_basic_suggestions(prompt: str) -> List[str]:
    lower_prompt = prompt.lower()

    if "python" in lower_prompt or "code" in lower_prompt or "program" in lower_prompt:
        return [
            "Explain this code",
            "Improve this code",
            "Turn this into a bigger project",
        ]

    if "operating system" in lower_prompt or "computer" in lower_prompt:
        return [
            "Explain this more simply",
            "Give me next steps",
            "Learn this topic",
        ]

    if "network" in lower_prompt:
        return [
            "Explain networking basics",
            "Show a real example",
            "Learn this topic",
        ]

    return [
        "Explain this more simply",
        "Give me next steps",
        "Learn this topic",
    ]


def calculate_basic_confidence(knowledge_count: int, source_count: int) -> float:
    base = 0.35
    knowledge_bonus = min(knowledge_count * 0.12, 0.35)
    source_bonus = min(source_count * 0.08, 0.25)
    return round(min(base + knowledge_bonus + source_bonus, 0.95), 2)


def build_local_fallback_response(
    prompt: str,
    config: dict,
    knowledge: list,
    web_results: Optional[list] = None,
) -> Dict[str, Any]:
    ai_name = config.get("aiName", "SVANSAI")
    lower_prompt = prompt.lower().strip()

    matched_knowledge = knowledge[:3]
    matched_web = web_results[:3] if web_results else []

    sources: List[str] = []
    answer = ""
    explanation = ""
    code = ""
    mode = "general"

    if matched_knowledge:
        for item in matched_knowledge:
            title = item.get("title", "Untitled")
            if title not in sources:
                sources.append(title)

    elif matched_web:
        for item in matched_web:
            title = item.get("title", "Untitled")
            if title not in sources:
                sources.append(title)

    if (
        "write " in lower_prompt
        or "code" in lower_prompt
        or "program" in lower_prompt
        or "script" in lower_prompt
        or "build a " in lower_prompt
        or "create a " in lower_prompt
    ):
        mode = "code"

        if "python" in lower_prompt and "hello world" in lower_prompt:
            code = 'print("Hello, World!")'
            answer = "Here is a simple Python hello world program."
            explanation = "This prints Hello, World! to the console."

        elif "javascript" in lower_prompt and "hello world" in lower_prompt:
            code = 'console.log("Hello, World!");'
            answer = "Here is a simple JavaScript hello world program."
            explanation = "This prints Hello, World! to the console."

        elif "html" in lower_prompt:
            code = """<!DOCTYPE html>
<html>
<head>
  <title>Hello</title>
</head>
<body>
  <h1>Hello, World!</h1>
</body>
</html>"""
            answer = "Here is a simple HTML example."
            explanation = "This renders Hello, World! in the browser."

        else:
            answer = (
                f"{ai_name} recognizes this as a coding request, "
                "but needs either stronger retrieved context or a clearer coding target."
            )
            explanation = "Specify the language, framework, and exact goal for a better code response."

    elif (
        "name " in lower_prompt
        or "list " in lower_prompt
        or "types of" in lower_prompt
        or "examples of" in lower_prompt
    ):
        mode = "list"

        if "operating system" in lower_prompt:
            answer = "Three operating systems are Windows, Linux, and macOS."
        elif "programming language" in lower_prompt:
            answer = "Three programming languages are Python, JavaScript, and Java."
        elif "network protocol" in lower_prompt:
            answer = "Three network protocols are TCP, UDP, and HTTP."
        else:
            if matched_knowledge:
                combined = " ".join(
                    item.get("content", "")
                    for item in matched_knowledge
                    if item.get("content")
                )
                combined = re.sub(r"<.*?>", "", combined).strip()
                if combined:
                    sentences = [s.strip() for s in combined.split(".") if s.strip()]
                    answer = sentences[0] + "." if sentences else ""
            if not answer:
                answer = f"{ai_name} recognizes this as a list-style question, but needs stronger context for a better list."

    elif "what is" in lower_prompt or lower_prompt.startswith("what "):
        mode = "definition"

        combined = ""
        if matched_knowledge:
            combined = " ".join(
                item.get("content", "")
                for item in matched_knowledge
                if item.get("content")
            )
        elif matched_web:
            combined = " ".join(
                item.get("description", "")
                for item in matched_web
                if item.get("description")
            )

        combined = re.sub(r"<.*?>", "", combined).strip()
        if combined:
            sentences = [s.strip() for s in combined.split(".") if s.strip()]
            answer = ". ".join(sentences[:2]).strip()
            if answer and not answer.endswith("."):
                answer += "."
        else:
            answer = (
                f"{ai_name} understands this as a definition-style question, "
                "but does not yet have enough strong stored knowledge to give a deeper explanation."
            )

    elif "how" in lower_prompt:
        mode = "how_to"
        answer = (
            "A strong approach is to break the task into smaller steps, use available knowledge, "
            "and build toward the clearest next action."
        )

    elif "why" in lower_prompt:
        mode = "explanation"
        answer = "This typically comes down to purpose, function, or cause based on the available knowledge."

    elif "explain" in lower_prompt:
        mode = "explanation"
        answer = "Here is a simplified explanation based on the current stored knowledge and context."

    elif "compare" in lower_prompt or " vs " in lower_prompt:
        mode = "compare"
        answer = "This comparison should focus on purpose, strengths, weaknesses, and real-world use."

    elif "fix" in lower_prompt or "error" in lower_prompt or "bug" in lower_prompt:
        mode = "debug"
        answer = "This looks like a debugging request. A good response should identify the issue, cause, and next fix."

    else:
        mode = "general"
        if matched_knowledge:
            combined = " ".join(
                item.get("content", "")
                for item in matched_knowledge
                if item.get("content")
            )
            combined = re.sub(r"<.*?>", "", combined).strip()
            if combined:
                sentences = [s.strip() for s in combined.split(".") if s.strip()]
                answer = ". ".join(sentences[:2]).strip()
                if answer and not answer.endswith("."):
                    answer += "."
        if not answer:
            answer = f"{ai_name} generated this answer using available stored knowledge and context."

    confidence = calculate_basic_confidence(len(matched_knowledge), len(sources))
    suggestions = generate_basic_suggestions(prompt)

    return build_response(
        mode=mode,
        answer=answer,
        explanation=explanation,
        code=code,
        sources=sources,
        suggestions=suggestions,
        confidence=confidence,
        learned_topics=[],
    )
