from typing import Any, Dict, List, Optional


def build_response(
    mode: str,
    answer: str,
    explanation: str = "",
    code: str = "",
    sources: Optional[List[str]] = None,
    suggestions: Optional[List[str]] = None,
    confidence: float = 0.0,
    learned_topics: Optional[List[str]] = None,
) -> Dict[str, Any]:
    return {
        "mode": mode,
        "answer": answer.strip() if answer else "",
        "explanation": explanation.strip() if explanation else "",
        "code": code.rstrip() if code else "",
        "sources": sources or [],
        "suggestions": suggestions or [],
        "confidence": confidence,
        "learned_topics": learned_topics or [],
    }
