import random
from typing import Dict, List, Any

# ================================
# AnswerMode Detection
# ================================


def detect_mode(question: str) -> str:
    question = question.lower()

    if "how" in question:
        return "how_to"

    if "what is" in question or "define" in question:
        return "definition"

    if "compare" in question or "vs" in question:
        return "compare"

    if "list" in question:
        return "list"

    if "fix" in question:
        return "debug"

    if "build" in question or "create" in question:
        return "plan"

    return "general"


# ================================
# Confidence Engine
# ================================


def calculate_confidence(sources: List[str], knowledge_matches: int) -> float:
    base = 0.4

    source_score = min(len(sources) * 0.1, 0.3)
    knowledge_score = min(knowledge_matches * 0.1, 0.3)

    return round(base + source_score + knowledge_score, 2)


# ================================
# Suggestion Engine
# ================================


def generate_suggestions(topic: str) -> List[str]:

    suggestions = {
        "operating systems": [
            "Learn how kernels work",
            "Understand process scheduling",
            "Study memory management",
        ],
        "networking": ["Learn TCP/IP", "Understand DNS", "Study firewalls"],
        "hardware": ["Learn CPU architecture", "Study RAM types", "Understand GPUs"],
    }

    return suggestions.get(
        topic.lower(),
        [
            "Learn related topics",
            "Deep dive into this subject",
            "Build a small project",
        ],
    )


# ================================
# Answer Builder
# ================================


def build_answer(
    question: str,
    answer: str,
    sources: List[str],
    topic: str,
    knowledge_matches: int = 1,
):

    mode = detect_mode(question)

    if not answer or len(answer.strip()) == 0:
        answer = generate_fallback_answer(question, topic)

    confidence = calculate_confidence(sources, knowledge_matches)

    suggestions = generate_suggestions(topic)

    return {
        "mode": mode,
        "answer": answer,
        "context": f"SVANSAI generated this using learned knowledge on {topic}",
        "sources": sources,
        "confidence": confidence,
        "suggestions": suggestions,
    }


def generate_fallback_answer(question: str, topic: str):

    question = question.lower()

    if "operating system" in question:
        return "Three common operating systems are Windows, Linux, and macOS."

    if "computer" in question:
        return "Computers work by processing instructions using hardware components such as the CPU, RAM, and storage, controlled by software like operating systems."

    if "network" in question:
        return "Networking allows computers to communicate using protocols like TCP/IP, DNS, and HTTP."

    return f"SVANSAI is still learning about {topic}, but related knowledge has been found and stored."
