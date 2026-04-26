from typing import Any, Dict, List, Optional

from app.services.fallback_engine import build_local_fallback_response
from app.services.retrieval_engine import extract_topic, retrieve_relevant_knowledge
from app.services.system_prompt import build_system_prompt


def build_prompt_context(
    user_prompt: str,
    config: Dict[str, Any],
    knowledge: List[Dict[str, Any]],
    web_results: Optional[List[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    topic = extract_topic(user_prompt)
    matched_knowledge = retrieve_relevant_knowledge(user_prompt, knowledge, top_k=5)
    system_prompt = build_system_prompt(config)

    context_chunks = []

    for item in matched_knowledge[:3]:
        title = item.get("title", "Untitled")
        content = item.get("content", "").strip()
        if content:
            context_chunks.append(f"[Knowledge] {title}: {content}")

    if web_results:
        for item in web_results[:3]:
            title = item.get("title", "Untitled")
            desc = item.get("description", "").strip()
            if desc:
                context_chunks.append(f"[Web] {title}: {desc}")

    combined_context = "\n\n".join(context_chunks).strip()

    return {
        "topic": topic,
        "system_prompt": system_prompt,
        "matched_knowledge": matched_knowledge,
        "combined_context": combined_context,
    }


def route_response(
    user_prompt: str,
    config: Dict[str, Any],
    knowledge: List[Dict[str, Any]],
    web_results: Optional[List[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    context = build_prompt_context(
        user_prompt=user_prompt,
        config=config,
        knowledge=knowledge,
        web_results=web_results,
    )

    # Current version uses robust local fallback/structured response.
    # Later this is where you can plug in an LLM call:
    # 1. system prompt
    # 2. user prompt
    # 3. retrieved context
    # 4. response schema
    response = build_local_fallback_response(
        prompt=user_prompt,
        config=config,
        knowledge=context["matched_knowledge"],
        web_results=web_results,
    )

    if not response.get("answer"):
        response["answer"] = "SVANSAI could not produce a strong answer yet."

    response["context"] = (
        f"SVANSAI generated this response using available stored knowledge and context on {context['topic']}."
    )

    return response
