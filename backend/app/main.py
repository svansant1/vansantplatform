from fastapi import FastAPI, UploadFile, File, WebSocket, WebSocketDisconnect, Body
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

import asyncio
import os
import re
import subprocess
import threading
import time
from collections import Counter, deque
from pathlib import Path
from typing import Any, Dict, List, Optional

import chromadb
import psutil
import pypdf
import requests
from sentence_transformers import SentenceTransformer

from app.core.ai_logic import SVANSAI
from app.services.debugger import read_process_memory
from app.services.sentry import (
    get_system_stats,
    get_suspicious_processes,
    generate_intel_feed,
)
from app.services.intelligence_core import build_answer
from app.services.learning_engine import learn_daily_topics
from app.services.model_router import route_response
from app.services.retrieval_engine import extract_topic
from app.services.svansai_orchestrator import (
    orchestrate_svansai_response,
    validate_learned_entry,
)
from app.services.debugger_pairing import (
    create_pair_session,
    get_pair_session,
    mark_pair_connected,
)
from app.services.knowledge_store import load_knowledge_entries, merge_knowledge_entries
from app.api.debug_routes import router as debug_router

app = FastAPI()

app.include_router(debug_router)

conversation_memory = deque(maxlen=6)

browser_tabs_store: list[dict] = []

load_dotenv()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# =========================
# ENV / CONFIG
# =========================
BASE_DIR = Path(__file__).resolve().parent.parent

BRAVE_API_KEY = os.getenv("BRAVE_API_KEY", "")
BRAVE_AI_KEY = os.getenv("BRAVE_AI_KEY", "")
SERPAPI_KEY = os.getenv("SERPAPI_KEY", "")

BRAVE_LIMIT = int(os.getenv("BRAVE_LIMIT", "2000"))
SERPAPI_LIMIT = int(os.getenv("SERPAPI_LIMIT", "100"))
BRAVE_AI_LIMIT = int(os.getenv("BRAVE_AI_LIMIT", "2000"))

BRAVE_COUNT_FILE = BASE_DIR / os.getenv("BRAVE_COUNT_FILE", "brave_count.txt")
SERPAPI_COUNT_FILE = BASE_DIR / os.getenv("SERPAPI_COUNT_FILE", "serpapi_count.txt")
BRAVE_AI_COUNT_FILE = BASE_DIR / os.getenv("BRAVE_AI_COUNT_FILE", "brave_ai_count.txt")

MAX_TOPICS_PER_RUN = int(os.getenv("MAX_TOPICS_PER_RUN", "50"))


# =========================
# MODELS
# =========================
class SearchTopicRequest(BaseModel):
    topic: str


class LearnTopicRequest(BaseModel):
    topic: str


class AskRequest(BaseModel):
    prompt: str
    config: dict
    knowledge: list


class DebugRunRequest(BaseModel):
    command: str
    cwd: str | None = None


class FileReadRequest(BaseModel):
    path: str


class DebugAnalyzeRequest(BaseModel):
    terminal_output: str
    file_content: str | None = None
    file_path: str | None = None


class SandboxRunRequest(BaseModel):
    code: str
    input: str | None = ""


# =========================
# COUNT HELPERS
# =========================
def ensure_count_file(path: Path) -> None:
    if not path.exists():
        path.write_text("0", encoding="utf-8")


def read_count(path: Path) -> int:
    ensure_count_file(path)
    try:
        return int(path.read_text(encoding="utf-8").strip() or "0")
    except ValueError:
        return 0


def write_count(path: Path, value: int) -> None:
    path.write_text(str(value), encoding="utf-8")


def increment_count(path: Path) -> int:
    current = read_count(path) + 1
    write_count(path, current)
    return current


def remaining(limit: int, path: Path) -> int:
    return max(limit - read_count(path), 0)


def usage_status() -> Dict[str, Any]:
    return {
        "brave_search": {
            "used": read_count(BRAVE_COUNT_FILE),
            "remaining": remaining(BRAVE_LIMIT, BRAVE_COUNT_FILE),
            "limit": BRAVE_LIMIT,
        },
        "serpapi": {
            "used": read_count(SERPAPI_COUNT_FILE),
            "remaining": remaining(SERPAPI_LIMIT, SERPAPI_COUNT_FILE),
            "limit": SERPAPI_LIMIT,
        },
        "brave_ai": {
            "used": read_count(BRAVE_AI_COUNT_FILE),
            "remaining": remaining(BRAVE_AI_LIMIT, BRAVE_AI_COUNT_FILE),
            "limit": BRAVE_AI_LIMIT,
        },
    }


def can_use(limit: int, path: Path) -> bool:
    return read_count(path) < limit


def near_limit(limit: int, path: Path, threshold: float = 0.9) -> bool:
    used = read_count(path)
    return used >= int(limit * threshold)


# =========================
# SEARCH HELPERS
# =========================
def normalize_search_results(
    results: List[Dict[str, Any]], source: str
) -> List[Dict[str, Any]]:
    normalized = []
    for item in results:
        normalized.append(
            {
                "title": item.get("title", "Untitled"),
                "url": item.get("url", ""),
                "description": item.get("description", ""),
                "source": source,
            }
        )
    return normalized


def search_with_brave(topic: str, count: int = 5) -> Dict[str, Any]:
    if not BRAVE_API_KEY:
        return {"ok": False, "error": "Missing BRAVE_API_KEY"}

    if not can_use(BRAVE_LIMIT, BRAVE_COUNT_FILE):
        return {"ok": False, "error": "Brave Search limit reached"}

    url = "https://api.search.brave.com/res/v1/web/search"
    headers = {
        "Accept": "application/json",
        "X-Subscription-Token": BRAVE_API_KEY,
    }
    params = {
        "q": topic,
        "count": count,
    }

    try:
        response = requests.get(url, headers=headers, params=params, timeout=20)
        if response.status_code != 200:
            return {"ok": False, "error": response.text}

        data = response.json()
        increment_count(BRAVE_COUNT_FILE)

        web_results = data.get("web", {}).get("results", [])
        results = [
            {
                "title": item.get("title", "Untitled"),
                "url": item.get("url", ""),
                "description": item.get("description", ""),
            }
            for item in web_results
        ]

        return {
            "ok": True,
            "source": "brave",
            "results": normalize_search_results(results, "brave"),
        }
    except Exception as exc:
        return {"ok": False, "error": str(exc)}


def search_with_serpapi(topic: str, count: int = 5) -> Dict[str, Any]:
    if not SERPAPI_KEY:
        return {"ok": False, "error": "Missing SERPAPI_KEY"}

    if not can_use(SERPAPI_LIMIT, SERPAPI_COUNT_FILE):
        return {"ok": False, "error": "SerpAPI limit reached"}

    url = "https://serpapi.com/search.json"
    params = {
        "q": topic,
        "api_key": SERPAPI_KEY,
        "num": count,
        "engine": "google",
    }

    try:
        response = requests.get(url, params=params, timeout=20)
        if response.status_code != 200:
            return {"ok": False, "error": response.text}

        data = response.json()
        increment_count(SERPAPI_COUNT_FILE)

        organic = data.get("organic_results", [])
        results = [
            {
                "title": item.get("title", "Untitled"),
                "url": item.get("link", ""),
                "description": item.get("snippet", ""),
            }
            for item in organic
        ]

        return {
            "ok": True,
            "source": "serpapi",
            "results": normalize_search_results(results, "serpapi"),
        }
    except Exception as exc:
        return {"ok": False, "error": str(exc)}


def search_topic_with_failover(topic: str, count: int = 5) -> Dict[str, Any]:
    # Prefer Brave unless it's near limit, then prefer SerpAPI first
    brave_near = near_limit(BRAVE_LIMIT, BRAVE_COUNT_FILE)
    serp_near = near_limit(SERPAPI_LIMIT, SERPAPI_COUNT_FILE)

    search_order = []
    if not brave_near:
        search_order = [("brave", search_with_brave), ("serpapi", search_with_serpapi)]
    elif not serp_near:
        search_order = [("serpapi", search_with_serpapi), ("brave", search_with_brave)]
    else:
        search_order = [("brave", search_with_brave), ("serpapi", search_with_serpapi)]

    errors = []
    for name, fn in search_order:
        result = fn(topic, count=count)
        if result.get("ok"):
            result["failover_used"] = name != search_order[0][0]
            return result
        errors.append({name: result.get("error", "Unknown error")})

    return {
        "ok": False,
        "error": "All search providers failed",
        "details": errors,
    }


# =========================
# AI HELPERS
# =========================
def build_full_prompt(
    user_prompt: str, config: dict, knowledge: list, web_results: Optional[list] = None
) -> str:
    ai_name = config.get("aiName", "SVANSAI")
    role = config.get("role", "Standalone AI Assistant")
    purpose = config.get(
        "purpose",
        "SVANSAI is being built as an independent AI system created through VansantPlatform.",
    )
    system_prompt = config.get(
        "systemPrompt",
        "You are SVANSAI, an evolving AI assistant designed to help users learn, build, organize, and create.",
    )

    knowledge_lines = []
    for item in knowledge[:8]:
        knowledge_lines.append(
            f"- {item.get('title', 'Untitled')}: {item.get('content', '')}"
        )

    web_lines = []
    if web_results:
        for item in web_results[:5]:
            web_lines.append(
                f"- {item.get('title', 'Untitled')} | {item.get('url', '')} | {item.get('description', '')}"
            )

    memory_context = build_memory_context()

    prompt = f"""
You are {ai_name}.
Role: {role}
Purpose: {purpose}

System Instructions:
{system_prompt}

{memory_context}

Saved Knowledge:
{chr(10).join(knowledge_lines) if knowledge_lines else "No saved knowledge available."}

Fresh Search Results:
{chr(10).join(web_lines) if web_lines else "No fresh search results used."}

User Question:
{user_prompt}

Instructions:
- Answer clearly and directly.
- Keep the answer concise unless the user asks for details.
- Use saved knowledge first when relevant.
- Use search results only if they add useful context.
- If the request is about coding, programming, or building something technical. provide a practical answer.
- If the uswer as for code, provide code in markdown code fences.
- Be practical and organized.
- If knowledge is weak, say so honestly.
- Be helpful, structured, and straightforward.
"""
    return prompt.strip()


def ask_brave_ai(full_prompt: str) -> Dict[str, Any]:
    if not BRAVE_AI_KEY:
        return {"ok": False, "error": "Missing BRAVE_AI_KEY"}

    if not can_use(BRAVE_AI_LIMIT, BRAVE_AI_COUNT_FILE):
        return {"ok": False, "error": "Brave AI limit reached"}

    url = "https://api.search.brave.com/res/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {BRAVE_AI_KEY}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": "brave",
        "messages": [{"role": "user", "content": full_prompt}],
    }

    try:
        response = requests.post(url, headers=headers, json=payload, timeout=45)
        if response.status_code != 200:
            return {"ok": False, "error": response.text}

        data = response.json()
        increment_count(BRAVE_AI_COUNT_FILE)

        answer = data["choices"][0]["message"]["content"]
        return {"ok": True, "provider": "brave_ai", "answer": answer}
    except Exception as exc:
        return {"ok": False, "error": str(exc)}


def build_local_fallback_answer(
    prompt: str,
    config: dict,
    knowledge: list,
    web_results: Optional[list] = None,
) -> str:
    ai_name = config.get("aiName", "SVANSAI")
    lower_prompt = prompt.lower().strip()

    matched_knowledge = knowledge[:3]
    matched_web = web_results[:3] if web_results else []

    direct_answer = ""
    response = ""

    # ---------- Determine Question Type ----------

    if (
        "name " in lower_prompt
        or "list " in lower_prompt
        or "types of" in lower_prompt
        or "examples of" in lower_prompt
    ):
        if "operating system" in lower_prompt:
            direct_answer = "Three operating systems are Windows, Linux, and macOS."
        elif "network" in lower_prompt:
            direct_answer = "Three networking examples are TCP/IP, DNS, and HTTP."
        elif "programming language" in lower_prompt:
            direct_answer = (
                "Three programming languages are Python, JavaScript, and C++."
            )
        else:
            direct_answer = f"{ai_name} recognizes this as a list-style question, but needs stronger stored knowledge to build a better list."

    elif "what is" in lower_prompt or lower_prompt.startswith("what "):
        if matched_knowledge:
            combined = " ".join(
                item.get("content", "")
                for item in matched_knowledge
                if item.get("content")
            )

            if combined:
                combined = re.sub(r"<.*?>", "", combined)
                sentences = combined.split(".")
                direct_answer = ".".join(sentences[:2]).strip()

                if direct_answer and not direct_answer.endswith("."):
                    direct_answer += "."

        if not direct_answer and matched_web:
            combined = " ".join(
                item.get("description", "")
                for item in matched_web
                if item.get("description")
            )

            if combined:
                combined = re.sub(r"<.*?>", "", combined)
                sentences = combined.split(".")
                direct_answer = ".".join(sentences[:2]).strip()

                if direct_answer and not direct_answer.endswith("."):
                    direct_answer += "."

        if not direct_answer:
            direct_answer = (
                f"{ai_name} understands this as a definition-style question, "
                "but does not yet have enough strong stored knowledge to give a deeper explanation."
            )

    elif "how" in lower_prompt:
        direct_answer = (
            "A strong approach is to break the task into smaller steps, use available knowledge, "
            "and build toward the clearest next action."
        )

    elif "why" in lower_prompt:
        direct_answer = "This typically comes down to purpose, function, or cause based on the available knowledge."

    elif "explain" in lower_prompt:
        direct_answer = "Here is a simplified explanation based on the current stored knowledge and context."

    else:
        if matched_knowledge:
            content = matched_knowledge[0].get("content", "").strip()
            content = re.sub(r"<.*?>", "", content)

            if content:
                sentences = content.split(".")
                direct_answer = ".".join(sentences[:2]).strip()
                if direct_answer and not direct_answer.endswith("."):
                    direct_answer += "."
            else:
                direct_answer = f"{ai_name} generated this answer using available stored knowledge and context."
        else:
            direct_answer = f"{ai_name} generated this answer using available stored knowledge and context."

    # ---------- Build Final Response ----------

    response = direct_answer

    if matched_knowledge:
        response += "\n\nSources:"
        for item in matched_knowledge[:3]:
            title = item.get("title", "Untitled")
            response += f"\n• {title}"

    elif matched_web:
        response += "\n\nAdditional Context:"
        for item in matched_web[:2]:
            title = item.get("title", "Untitled")
            desc = item.get("description", "").strip()
            desc = re.sub(r"<.*?>", "", desc)
            short_desc = desc[:120] + ("..." if len(desc) > 120 else "")
            response += f"\n• {title}: {short_desc}"

    return response.strip()


def should_trigger_search(prompt: str, ranked_knowledge: list) -> bool:
    if not ranked_knowledge:
        return True

    trigger_words = [
        "latest",
        "current",
        "recent",
        "news",
        "find",
        "search",
        "learn",
        "research",
        "today",
        "update",
    ]
    lower = prompt.lower()

    if any(word in lower for word in trigger_words):
        return True

    first_item = ranked_knowledge[0]

    if isinstance(first_item, dict) and "score" in first_item:
        best_score = first_item["score"]
        return best_score < 2

    return False


def summarize_with_ai(topic: str, results: list) -> Optional[str]:
    if not BRAVE_AI_KEY:
        return None

    if not can_use(BRAVE_AI_LIMIT, BRAVE_AI_COUNT_FILE):
        return None

    combined_text = ""
    for item in results[:5]:
        title = item.get("title", "Untitled")
        description = item.get("description", "")
        combined_text += f"{title} - {description}\n"

    prompt = f"""
Summarize the following search results into one clean, structured explanation about "{topic}".

Search Results:
{combined_text}

Instructions:
- Write one clear summary
- Combine overlapping ideas
- Keep it informative and easy to understand
- Do not list the search results separately
"""

    url = "https://api.search.brave.com/res/v1/chat/completions"

    headers = {
        "Authorization": f"Bearer {BRAVE_AI_KEY}",
        "Content-Type": "application/json",
    }

    payload = {
        "model": "llama-3.1-70b",
        "messages": [{"role": "user", "content": prompt}],
    }

    try:
        response = requests.post(url, headers=headers, json=payload, timeout=45)

        if response.status_code != 200:
            return None

        data = response.json()
        increment_count(BRAVE_AI_COUNT_FILE)

        return data["choices"][0]["message"]["content"]
    except Exception:
        return None


def extract_keywords(text: str) -> List[str]:
    words = re.findall(r"\b[a-zA-Z0-9]+\b", text.lower())
    stop_words = {
        "the",
        "and",
        "for",
        "that",
        "this",
        "with",
        "from",
        "into",
        "your",
        "have",
        "will",
        "about",
        "what",
        "when",
        "where",
        "which",
        "would",
        "could",
        "should",
        "them",
        "they",
        "their",
        "there",
        "here",
        "how",
        "why",
        "who",
        "are",
        "you",
        "use",
        "using",
        "can",
        "all",
        "any",
        "not",
        "yet",
        "but",
        "get",
        "got",
        "too",
        "out",
        "now",
        "then",
        "was",
        "were",
        "been",
        "being",
        "more",
        "less",
        "like",
        "just",
    }
    return [word for word in words if len(word) > 2 and word not in stop_words]


def score_knowledge_item(prompt: str, item: dict) -> Dict[str, Any]:
    prompt_keywords = extract_keywords(prompt)
    title = item.get("title", "")
    content = item.get("content", "")
    topic = item.get("topic", "")
    source = item.get("source", "")

    searchable = f"{title} {content} {topic} {source}".lower()

    keyword_hits = 0
    matched_terms = []

    for word in prompt_keywords:
        if word in searchable:
            keyword_hits += 1
            matched_terms.append(word)

    title_bonus = 0
    for word in prompt_keywords:
        if word in title.lower():
            title_bonus += 2

    topic_bonus = 0
    for word in prompt_keywords:
        if word in topic.lower():
            topic_bonus += 2

    content_length_bonus = min(len(content) // 150, 3)

    score = keyword_hits + title_bonus + topic_bonus + content_length_bonus

    return {
        "item": item,
        "score": score,
        "matched_terms": list(set(matched_terms)),
    }


def rank_knowledge(
    prompt: str, knowledge: list, top_n: int = 5
) -> List[Dict[str, Any]]:
    ranked = [score_knowledge_item(prompt, item) for item in knowledge]
    ranked.sort(key=lambda x: x["score"], reverse=True)

    # Only keep useful matches first; if everything scores 0, still return a few items
    positive = [entry for entry in ranked if entry["score"] > 0]
    if positive:
        return positive[:top_n]

    return ranked[: min(top_n, len(ranked))]


model = SentenceTransformer("all-MiniLM-L6-v2", device="cpu")
print("Vector model running on CPU")

chroma_client = chromadb.PersistentClient(path="./chroma_db")
collection = chroma_client.get_or_create_collection(name="vansant_knowledge")


def build_vector_text(item: dict) -> str:
    title = item.get("title", "")
    content = item.get("content", "")
    topic = item.get("topic", "")
    source = item.get("source", "")
    return f"{title}\n\n{content}\n\nTopic: {topic}\nSource: {source}".strip()


def add_to_vector_db(item: dict):
    item_id = str(item["id"])
    text = build_vector_text(item)

    embedding = model.encode(text).tolist()

    collection.add(
        ids=[item_id],
        embeddings=[embedding],
        metadatas=[
            {
                "title": item.get("title", ""),
                "topic": item.get("topic", ""),
                "source": item.get("source", ""),
                "url": item.get("url", ""),
            }
        ],
        documents=[text],
    )


def vector_search(query_text: str, n_results: int = 3):
    try:
        query_embedding = model.encode(query_text).tolist()
        results = collection.query(
            query_embeddings=[query_embedding], n_results=n_results
        )
        return results
    except Exception as e:
        print("VECTOR SEARCH ERROR:", e)
        return None


def add_to_memory(role: str, message: str):
    conversation_memory.append({"role": role, "content": message})


def build_memory_context() -> str:
    if not conversation_memory:
        return ""

    memory_text = "Recent Conversation:\n"
    for msg in conversation_memory:
        memory_text += f"{msg['role']}: {msg['content']}\n"

        return memory_text.strip()


def build_auto_learned_entry(
    prompt: str,
    answer: str,
    web_results: list,
    search_used: Optional[str],
) -> Optional[dict]:
    if not web_results or not answer.strip():
        return None

    primary = web_results[0] if web_results else []

    clean_prompt = prompt.strip().rstrip("?.!").strip()
    title = f"{clean_prompt[:60].title()} Overview"

    return {
        "title": title,
        "content": "auto_learn_web",
        "source": clean_prompt.lower(),
        "url": primary.get("url", ""),
        "search_provider": search_used or "unknown",
    }


def should_auto_learn(search_used: Optional[str], ranked_knowledge_data: list) -> bool:
    if not search_used:
        return False
    if not ranked_knowledge_data:
        return True
    first_item = rank_knowledge[0]
    if isinstance(first_item, dict) and "score" in first_item:
        return first_item["score"] < 3

    return True


class ShieldScanRequest(BaseModel):
    folder_path: str


class ShieldQuarantineRequest(BaseModel):
    file_path: str


def background_svansai_learning_loop():
    while True:
        try:
            result = learn_daily_topics(
                search_fn=search_topic_with_failover,
                daily_goal=50,
                per_run=3,
            )
            print("[SVANSAI Learning]", result.get("message"))
        except Exception as error:
            print("[SVANSAI Learning Error]", error)

        time.sleep(30 * 60)


# =========================
# ROUTES
# =========================
@app.get("/")
def read_root():
    return {
        "message": "VansantPlatform backend running",
        "usage": usage_status(),
    }


@app.get("/usage")
def get_usage():
    return usage_status()


@app.post("/search-topic")
def search_topic(data: SearchTopicRequest):
    topic = data.topic.strip()
    if not topic:
        return {"ok": False, "error": "Topic is required"}

    result = search_topic_with_failover(topic, count=5)
    result["usage"] = usage_status()
    return result


@app.post("/learn-topic")
def learn_topic(data: LearnTopicRequest):
    topic = data.topic.strip()
    if not topic:
        return {"ok": False, "error": "Topic is required"}

    result = search_topic_with_failover(topic, count=5)
    if not result.get("ok"):
        result["usage"] = usage_status()
        return result

    search_results = result.get("results", [])
    summary = summarize_with_ai(topic, search_results)

    learned_entries = []

    if summary:
        learned_entries.append(
            {
                "title": f"{topic.title()} Overview",
                "content": summary,
                "url": "",
                "source": "brave_ai_summary",
                "topic": topic,
            }
        )
    else:
        for item in search_results[:MAX_TOPICS_PER_RUN]:
            learned_entries.append(
                {
                    "title": item.get("title", "Untitled"),
                    "content": item.get("description", ""),
                    "url": item.get("url", ""),
                    "source": item.get("source", "unknown"),
                    "topic": topic,
                }
            )

    return {
        "ok": True,
        "topic": topic,
        "provider_used": result.get("source"),
        "failover_used": result.get("failover_used", False),
        "summary_used": bool(summary),
        "learned_entries": learned_entries,
        "usage": usage_status(),
    }


@app.post("/ask")
def ask_svansai(data: AskRequest):
    prompt = data.prompt.strip()
    config = data.config or {}
    client_knowledge = data.knowledge or []
    server_knowledge = load_knowledge_entries()
    knowledge = merge_knowledge_entries(client_knowledge, server_knowledge)

    if not prompt:
        return {"ok": False, "error": "Prompt is required"}

    # 1. Start building the "Thoughts" string
    thoughts_log = []

    ranked_knowledge_data = rank_knowledge(prompt, knowledge, top_n=5)
    ranked_knowledge = [entry["item"] for entry in ranked_knowledge_data]

    # Vector search (semantic meaning search)
    vector_results = vector_search(prompt, n_results=3)
    vector_knowledge = []

    if vector_results and "documents" in vector_results:
        docs = vector_results["documents"][0]

        for doc in docs:
            vector_knowledge.append(
                {"title": "Vector Match", "content": doc, "source": "vector_search"}
            )

    if vector_knowledge:
        thoughts_log.append(f"Found {len(vector_knowledge)} semantic vector matches.")

    if ranked_knowledge:
        thoughts_log.append(f"Found {len(ranked_knowledge)} relevant local documents.")

    combined_knowledge = ranked_knowledge + vector_knowledge

    web_results = []
    search_used = None
    failover_used = False

    if should_trigger_search(prompt, ranked_knowledge):
        thoughts_log.append("Triggering web search for up-to-date information...")
        search_result = search_topic_with_failover(prompt, count=5)
        if search_result.get("ok"):
            web_results = search_result.get("results", [])
            search_used = search_result.get("source")
            failover_used = search_result.get("failover_used", False)
            thoughts_log.append(f"Search successful via {search_used}.")

    full_prompt = build_full_prompt(prompt, config, combined_knowledge, web_results)

    # Final thinking step
    thoughts_log.append("Synthesizing final response...")
    final_thoughts = " | ".join(thoughts_log)

    ai_result = ask_brave_ai(full_prompt)

    if ai_result.get("ok"):
        ai_answer = ai_result.get("answer", "").strip()

        structured = orchestrate_svansai_response(
            prompt=prompt,
            knowledge=combined_knowledge,
            web_results=web_results,
        )

        if ai_answer:
            structured["answer"] = ai_answer

        add_to_memory("user", prompt)
        add_to_memory("assistant", structured["answer"])

        learned_entry = None
        if should_auto_learn(search_used, ranked_knowledge_data):
            raw_learned_entry = build_auto_learned_entry(
                prompt=prompt,
                answer=structured["answer"],
                web_results=web_results,
                search_used=search_used,
            )
            if raw_learned_entry:
                learned_entry = validate_learned_entry(
                    raw_learned_entry,
                    combined_knowledge,
                )

        return {
            "ok": True,
            "provider": ai_result.get("provider"),
            "search_used": search_used,
            "failover_used": failover_used,
            "ranked_knowledge": ranked_knowledge_data,
            "answer": structured.get("answer", ""),
            "explanation": structured.get("explanation", ""),
            "code": "",
            "mode": structured.get("mode", "deep_answer"),
            "confidence": structured.get("confidence", 0.0),
            "sources": structured.get("sources", []),
            "thoughts": final_thoughts,
            "context": f"Primary topic: {structured.get('primary_topic', 'general')} | Related: {', '.join(structured.get('related_topics', [])[:8])}",
            "suggestions": structured.get("suggestions", []),
            "learned_entry": learned_entry,
            "usage": usage_status(),
        }

    fallback_response = orchestrate_svansai_response(
        prompt=prompt,
        knowledge=combined_knowledge,
        web_results=web_results,
    )

    add_to_memory("user", prompt)
    add_to_memory("assistant", fallback_response.get("answer", ""))

    learned_entry = None
    if should_auto_learn(search_used, ranked_knowledge_data):
        raw_learned_entry = build_auto_learned_entry(
            prompt=prompt,
            answer=fallback_response.get("answer", ""),
            web_results=web_results,
            search_used=search_used,
        )
        if raw_learned_entry:
            learned_entry = validate_learned_entry(
                raw_learned_entry,
                combined_knowledge,
            )

    return {
        "ok": True,
        "provider": "local_fallback",
        "search_used": search_used,
        "failover_used": failover_used,
        "ranked_knowledge": ranked_knowledge_data,
        "answer": fallback_response.get("answer", ""),
        "explanation": fallback_response.get("explanation", ""),
        "code": "",
        "mode": fallback_response.get("mode", "deep_answer"),
        "confidence": fallback_response.get("confidence", 0.0),
        "sources": fallback_response.get("sources", []),
        "thoughts": "Brave AI failed. Generating deep structured response from local context...",
        "context": f"Primary topic: {fallback_response.get('primary_topic', 'general')} | Related: {', '.join(fallback_response.get('related_topics', [])[:8])}",
        "suggestions": fallback_response.get("suggestions", []),
        "learned_entry": learned_entry,
        "usage": usage_status(),
    }


def build_final_answer(
    user_question: str, matched_knowledge: list, web_results: list | None = None
) -> dict:
    if matched_knowledge:
        top = matched_knowledge[0]
        content = top.get("content", "").strip()

        if content:
            answer = content.split(". ")[0].strip()
            if not answer.endswith("."):
                answer += "."
        else:
            answer = "I found related knowledge, but the stored content was empty."
    elif web_results:
        answer = "I found web results related to your question."
    else:
        answer = "I could not find a strong answer yet."

    suggestions = [
        "Explain this more simply",
        "Give me next steps",
        "Learn this topic",
    ]

    return {
        "answer": answer,
        "suggestions": suggestions,
    }


@app.post("/upload-knowledge")
async def upload_knowledge(file: UploadFile = File(...)):
    content = ""
    file_type = file.content_type

    try:
        if file_type == "text/plain":
            content = (await file.read()).decode("utf-8")
        elif file_type == "application/pdf":
            reader = pypdf.PdfReader(file.file)
            for page in reader.pages:
                content += page.extract_text() + "\n"
        else:
            return {"ok": False, "error": "Unsupported file type"}

        # We "chunk" the text so it's not one giant block
        # This helps the scoring and retrieval later
        chunks = [content[i : i + 800] for i in range(0, len(content), 800)]

        learned_entries = []
        for i, chunk in enumerate(chunks):
            learned_entries.append(
                {
                    "title": f"Upload: {file.filename} (Part {i+1})",
                    "content": chunk.strip(),
                    "source": "file_upload",
                    "topic": "document",
                }
            )

        return {"ok": True, "entries": learned_entries}
    except Exception as e:
        return {"ok": False, "error": str(e)}


@app.get("/api/debug/inspect/{pid}/{address}")
async def inspect_memory(pid: int, address: str):
    # Convert hex string (e.g., "0x4000") to integer
    addr_int = int(address, 16)
    raw_hex = read_process_memory(pid, addr_int)

    if not raw_hex:
        return {"error": "Could not access process memory. Try running as Admin."}

    # Here is where SVANSAI comes in
    # We send the raw_hex to your AI logic to explain what it means
    analysis = await analyze_with_svansai(raw_hex)

    return {"pid": pid, "address": address, "hex": raw_hex, "ai_analysis": analysis}


async def analyze_with_svansai(hex_data):
    # This calls your existing AI reasoning layer
    prompt = f"Analyze this raw memory hex from a running process and explain the logic: {hex_data}"
    # Replace this with your actual SVANSAI call logic
    return f"SVANSAI suggests this looks like a [Logic Pattern]. Potential Fix: Check pointer at {hex_data[:4]}."


@app.post("/api/debug/solve")
async def get_ai_solution(hex_dump: str, context: str):
    # This sends the data to your SVANSAI reasoning layer
    solution = build_answer(
        question=f"Analyze this memory hex: {hex_dump}", context=context
    )
    return {"patch": solution, "explanation": "Identified Null Pointer at offset..."}


@app.post("/debug/run")
def debug_run(data: DebugRunRequest):
    allowed_commands = {
        "run_frontend": ["npm.cmd", "run", "dev"],
        "build_frontend": ["npm.cmd", "run", "build"],
        "run_backend": ["python", "-m", "uvicorn", "app.main:app", "--reload"],
        "lint_frontend": ["npm.cmd", "run", "lint"],
        "test_debug": ["python", "-c", "print('DEBUG WORKING')"],
    }

    if data.command not in allowed_commands:
        return {"ok": False, "error": "Command not allowed"}

    try:
        project_root = Path(__file__).resolve().parents[2]

        if data.command in {"run_frontend", "build_frontend", "lint_frontend"}:
            cwd = str(project_root / "frontend")
        elif data.command == "run_backend":
            cwd = str(project_root / "backend")
        else:
            cwd = str(project_root)

        long_running = {"run_frontend", "run_backend"}

        if data.command in long_running:
            process = subprocess.Popen(
                allowed_commands[data.command],
                cwd=cwd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                shell=True,
            )

            return {
                "ok": True,
                "command": data.command,
                "message": "Process started",
                "cwd": cwd,
                "pid": process.pid,
            }

        result = subprocess.run(
            allowed_commands[data.command],
            cwd=cwd,
            capture_output=True,
            text=True,
            timeout=60,
            shell=True,
        )

        return {
            "ok": True,
            "command": data.command,
            "cwd": cwd,
            "stdout": result.stdout,
            "stderr": result.stderr,
            "returncode": result.returncode,
        }

    except subprocess.TimeoutExpired:
        return {"ok": False, "error": "Command timed out"}
    except Exception as e:
        return {"ok": False, "error": str(e)}


@app.post("/debug/read-file")
def debug_read_file(data: FileReadRequest):
    try:
        file_path = Path(data.path)

        if not file_path.exists() or not file_path.is_file():
            return {"ok": False, "error": "File not found"}

        content = file_path.read_text(encoding="utf-8", errors="ignore")

        return {
            "ok": True,
            "path": str(file_path),
            "content": content,
        }
    except Exception as e:
        return {"ok": False, "error": str(e)}


@app.post("/debug/analyze")
def debug_analyze(data: dict):
    terminal_output = data.get("terminal_output", "")
    issues = data.get("issues", [])

    if issues:
        total_errors = sum(1 for issue in issues if issue.get("severity") == "error")
        total_warnings = sum(
            1 for issue in issues if issue.get("severity") == "warning"
        )

        files = sorted(set(issue.get("file", "Unknown") for issue in issues))
        rules = sorted(set(issue.get("rule", "Unknown") for issue in issues))

        analysis = (
            f"SVANSAI Project-Wide Error Analysis\n\n"
            f"Total Issues Found:\n"
            f"- Errors: {total_errors}\n"
            f"- Warnings: {total_warnings}\n\n"
            f"Affected Files:\n"
            + "\n".join(f"- {file}" for file in files[:10])
            + "\n\nMain Issue Types:\n"
            + "\n".join(f"- {rule}" for rule in rules[:10])
            + "\n\nRecommended Fix Order:\n"
            "1. Fix blocking errors first\n"
            "2. Fix repeated rule violations across multiple files\n"
            "3. Clean warnings after errors are resolved\n\n"
            "Suggested next step:\n"
            "Select one issue from the Parsed Issues panel and click 'Analyze Selected Issue' for a targeted fix."
        )

        return {"ok": True, "analysis": analysis}

    if terminal_output:
        return {
            "ok": True,
            "analysis": (
                "SVANSAI reviewed the terminal output, but no structured issues were parsed.\n\n"
                "Suggested next step:\n"
                "Run Lint Frontend or Build Frontend, then click Parse Issues."
            ),
        }

    return {
        "ok": True,
        "analysis": "No terminal output or parsed issues available to analyze.",
    }


@app.get("/debug/processes")
def debug_list_processes():
    processes = []

    for proc in psutil.process_iter(["pid", "name", "exe"]):
        try:
            info = proc.info
            processes.append(
                {
                    "pid": info.get("pid"),
                    "name": info.get("name") or "Unknown",
                    "exe": info.get("exe") or "",
                }
            )
        except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
            continue

    processes.sort(key=lambda x: (x["name"] or "").lower())
    return {"ok": True, "processes": processes}


import re


@app.post("/debug/parse-issues")
def debug_parse_issues(data: dict):
    terminal_output = data.get("terminal_output", "")

    if not terminal_output:
        return {"ok": True, "issues": []}

    issues = []
    lines = terminal_output.splitlines()

    current_file = None

    file_line_pattern = re.compile(
        r"^([A-Za-z]:\\.*?\.(tsx|ts|js|jsx|py|java|cpp|c|cs|html|css))$"
    )
    issue_pattern = re.compile(r"^\s*(\d+):(\d+)\s+(error|warning)\s+(.+?)\s{2,}(.+)$")

    for line in lines:
        file_match = file_line_pattern.match(line.strip())
        if file_match:
            current_file = file_match.group(1)
            continue

        issue_match = issue_pattern.match(line)
        if issue_match and current_file:
            line_no = int(issue_match.group(1))
            col_no = int(issue_match.group(2))
            severity = issue_match.group(3)
            message = issue_match.group(4).strip()
            rule = issue_match.group(5).strip()

            issues.append(
                {
                    "file": current_file,
                    "line": line_no,
                    "column": col_no,
                    "severity": severity,
                    "message": message,
                    "rule": rule,
                }
            )

    return {"ok": True, "issues": issues}


@app.post("/debug/analyze-issue")
def analyze_issue(data: dict):
    issue = data.get("issue")
    source_code = data.get("source_code", "")
    file_path = data.get("file_path", "")

    if not issue:
        return {"ok": False, "error": "No issue provided"}

    issue_file = issue.get("file", "Unknown file")
    issue_line = issue.get("line", "Unknown line")
    issue_column = issue.get("column", "Unknown column")
    issue_severity = issue.get("severity", "unknown")
    issue_rule = issue.get("rule", "unknown")
    issue_message = issue.get("message", "No message provided")

    system_prompt = """
You are SVANSAI debugging assistant.

Analyze ONE selected issue only.

Return:
1. What is wrong
2. Why it happened
3. How to fix it
4. Suggested next step

Keep it clear, practical, and specific.
""".strip()

    prompt = f"""
Selected Issue:
File: {issue_file}
Line: {issue_line}
Column: {issue_column}
Severity: {issue_severity}
Rule: {issue_rule}
Message: {issue_message}

Loaded File Path:
{file_path or issue_file}

Source Code:
{source_code or "No source code was loaded."}
""".strip()

    full_prompt = f"{system_prompt}\n\n{prompt}"

    ai_result = ask_brave_ai(full_prompt)

    if ai_result.get("ok"):
        return {"ok": True, "analysis": ai_result.get("answer")}

    issue_message_lower = str(issue_message).lower()
    issue_rule_lower = str(issue_rule).lower()

    if "cannot find name" in issue_message_lower:
        analysis = (
            f"Selected Issue Analysis\n\n"
            f"What is wrong:\n"
            f"A variable, symbol, or function is being referenced but is not defined.\n\n"
            f"Why it happened:\n"
            f"The file is using a name that was never declared or imported.\n\n"
            f"How to fix it:\n"
            f"Open {issue_file} at line {issue_line} and either define the missing value or import the correct one.\n\n"
            f"Suggested next step:\n"
            f"Check the exact symbol on that line and replace it with the correct variable or import."
        )
    elif "set-state-in-effect" in issue_rule_lower or "setstate" in issue_message_lower:
        analysis = (
            f"Selected Issue Analysis\n\n"
            f"What is wrong:\n"
            f"State is being updated directly inside useEffect in a way React flags as unsafe.\n\n"
            f"Why it happened:\n"
            f"This pattern can cause cascading renders and unstable behavior.\n\n"
            f"How to fix it:\n"
            f"Move initialization logic outside the effect when possible, or restructure the effect to react only to external changes.\n\n"
            f"Suggested next step:\n"
            f"Open {issue_file} at line {issue_line} and review the setState call inside that effect."
        )
    elif "unexpected any" in issue_message_lower:
        analysis = (
            f"Selected Issue Analysis\n\n"
            f"What is wrong:\n"
            f"The selected line uses 'any', which violates the lint rules.\n\n"
            f"Why it happened:\n"
            f"The value or parameter was typed too loosely.\n\n"
            f"How to fix it:\n"
            f"Replace 'any' with a proper interface, object type, or union type.\n\n"
            f"Suggested next step:\n"
            f"Open {issue_file} at line {issue_line} and define a real TypeScript type for that value."
        )
    elif "assigned a value but never used" in issue_message_lower:
        analysis = (
            f"Selected Issue Analysis\n\n"
            f"What is wrong:\n"
            f"A variable is declared but never used.\n\n"
            f"Why it happened:\n"
            f"It is likely leftover code, incomplete logic, or a test variable.\n\n"
            f"How to fix it:\n"
            f"Remove the variable or use it meaningfully.\n\n"
            f"Suggested next step:\n"
            f"Open {issue_file} at line {issue_line} and remove the unused variable if it is not needed."
        )
    else:
        analysis = (
            f"Selected Issue Analysis\n\n"
            f"What is wrong:\n"
            f"{issue_message}\n\n"
            f"Why it happened:\n"
            f"This issue is tied to rule '{issue_rule}'.\n\n"
            f"How to fix it:\n"
            f"Open {issue_file} at line {issue_line} and fix the code that triggered this rule.\n\n"
            f"Suggested next step:\n"
            f"Use the loaded source code panel to inspect the exact line and draft a fix from there."
        )

    return {"ok": True, "analysis": analysis}


@app.post("/debug/draft-fix")
def debug_draft_fix(data: dict):
    issue = data.get("issue")
    source_code = data.get("source_code", "")
    file_path = data.get("file_path", "")

    if not issue:
        return {"ok": False, "error": "No issue provided"}

    if not source_code:
        return {"ok": False, "error": "No source code provided"}

    issue_file = issue.get("file", "Unknown file")
    issue_line = issue.get("line", "Unknown line")
    issue_column = issue.get("column", "Unknown column")
    issue_severity = issue.get("severity", "unknown")
    issue_rule = issue.get("rule", "unknown")
    issue_message = issue.get("message", "No message provided")

    system_prompt = """
You are SVANSAI in code-fix mode.

You are given:
- one selected issue
- the current file path
- the current source code

Return:
1. A short explanation of the fix
2. A corrected code suggestion
3. Keep the fix minimal and focused
4. Preserve the user's structure when possible

Do not use markdown code fences.
""".strip()

    prompt = f"""
Selected Issue:
File: {issue_file}
Line: {issue_line}
Column: {issue_column}
Severity: {issue_severity}
Rule: {issue_rule}
Message: {issue_message}

Current File Path:
{file_path or issue_file}

Current Source Code:
{source_code}
""".strip()

    full_prompt = f"{system_prompt}\n\n{prompt}"

    ai_result = ask_brave_ai(full_prompt)

    print("DRAFT FIX AI RESULT:", ai_result)
    print("DRAFT FIX ISSUE FILE:", issue_file)
    print("DRAFT FIX ISSUE LINE:", issue_line)
    print("DRAFT FIX ISSUE RULE:", issue_rule)
    print("DRAFT FIX ISSUE MESSAGE:", issue_message)

    if ai_result.get("ok"):
        return {"ok": True, "draft_fix": ai_result.get("answer")}

    issue_message_lower = str(issue_message).lower()
    issue_rule_lower = str(issue_rule).lower()

    fallback_fix = (
        f"SVANSAI could not generate an AI draft fix right now.\n\n"
        f"Selected issue summary:\n"
        f"- File: {issue_file}\n"
        f"- Line: {issue_line}\n"
        f"- Rule: {issue_rule}\n"
        f"- Message: {issue_message}\n\n"
        f"Suggested fallback:\n"
        f"Review the selected line and correct the issue manually."
    )
    if "cannot find name" in issue_message_lower:
        fallback_fix = (
            "Suggested Fix\n\n"
            "Problem:\n"
            "A symbol is being used without being defined.\n\n"
            "Fix Direction:\n"
            "Add the missing declaration or import the correct symbol.\n\n"
            f"Target:\n{issue_file}:{issue_line}"
        )
    elif "set-state-in-effect" in issue_rule_lower or "setstate" in issue_message_lower:
        fallback_fix = (
            "Suggested Fix\n\n"
            "Problem:\n"
            "A state update is being called directly inside useEffect.\n\n"
            "Fix Direction:\n"
            "Move initialization logic outside the effect if possible, or restructure the effect so it does not synchronously trigger repeated state updates.\n\n"
            f"Target:\n{issue_file}:{issue_line}"
        )
    elif "unexpected any" in issue_message_lower:
        fallback_fix = (
            "Suggested Fix\n\n"
            "Problem:\n"
            "The code uses 'any'.\n\n"
            "Fix Direction:\n"
            "Replace 'any' with a specific interface, object type, or union type.\n\n"
            f"Target:\n{issue_file}:{issue_line}"
        )
    elif "assigned a value but never used" in issue_message_lower:
        fallback_fix = (
            "Suggested Fix\n\n"
            "Problem:\n"
            "A variable is declared but never used.\n\n"
            "Fix Direction:\n"
            "Remove the variable or use it meaningfully.\n\n"
            f"Target:\n{issue_file}:{issue_line}"
        )

    return {"ok": True, "draft_fix": fallback_fix}


@app.get("/sentry/system-snapshot")
def sentry_system_snapshot():
    stats = get_system_stats()

    threat_data = get_suspicious_processes()
    threats = threat_data["active"]
    watch = threat_data["watch"]

    intel_feed = generate_intel_feed(threats)

    return {
        "cpu_usage": stats["cpu_usage"],
        "memory": stats["memory"],
        "threats": threats,
        "watch": watch,
        "intel_feed": intel_feed,
    }


@app.websocket("/ws/svansai")
async def system_intelligence_stream(websocket: WebSocket):
    await websocket.accept()

    try:
        while True:
            stats = get_system_stats()
            threats = get_suspicious_processes()
            intel_feed = generate_intel_feed(threats)

            await websocket.send_json(
                {
                    "cpu_usage": stats["cpu_usage"],
                    "memory": stats["memory"],
                    "threats": threats,
                    "intel_feed": intel_feed,
                }
            )

            await asyncio.sleep(2)
    except WebSocketDisconnect:
        pass


@app.get("/api/intelligence/learn")
def auto_learn():

    learned = learn_daily_topics()

    return {"status": "learning", "topics_learned": learned}


@app.post("/debugger/create-pair-code")
def debugger_create_pair_code():
    session = create_pair_session()

    return {
        "ok": True,
        "code": session["code"],
        "expires_at": session["expires_at"],
        "connected": session["connected"],
    }


@app.get("/debugger/pair-status/{code}")
def debugger_pair_status(code: str):
    session = get_pair_session(code)

    if not session:
        return {"ok": False, "error": "Code expired or not found"}

    return {
        "ok": True,
        "code": session["code"],
        "connected": session["connected"],
        "device_name": session["device_name"],
        "expires_at": session["expires_at"],
        "used": session["used"],
    }


@app.post("/debugger/connect")
def debugger_connect(data: dict):
    code = (data.get("code") or "").strip().upper()
    device_name = (data.get("device_name") or "Unknown Device").strip()

    if not code:
        return {"ok": False, "error": "Missing pairing code"}

    session = mark_pair_connected(code, device_name)

    if not session:
        return {"ok": False, "error": "Invalid, expired, or already used code"}

    return {
        "ok": True,
        "message": "Debugger connected successfully",
        "device_name": session["device_name"],
        "code": session["code"],
    }


@app.get("/learning/status")
def learning_status():
    entries = load_knowledge_entries()
    return {
        "ok": True,
        "knowledge_entries": len(entries),
        "message": "SVANSAI backend knowledge store is active.",
    }


@app.post("/browser/tabs")
async def receive_tabs(data: dict = Body(...)):
    global browser_tabs_store
    browser_tabs_store = data.get("tabs", [])
    return {"status": "received", "count": len(browser_tabs_store)}


@app.get("/browser/tabs")
async def get_tabs():
    return {"tabs": browser_tabs_store}


@app.post("/sandbox/run")
def sandbox_run(data: SandboxRunRequest):
    code = data.code.strip()
    stdin = data.input or ""

    if not code:
        return {"ok": False, "output": "No code provided."}

    blocked_tokens = [
        "import os",
        "import subprocess",
        "import socket",
        "import shutil",
        "open(",
        "__import__",
        "eval(",
        "exec(",
        "compile(",
        "globals(",
        "locals(",
        "input.__class__",
    ]

    lowered = code.lower()

    if any(token in lowered for token in blocked_tokens):
        return {
            "ok": False,
            "output": "Blocked unsafe code. This training sandbox only allows safe beginner Python.",
        }

    try:
        result = subprocess.run(
            ["python", "-c", code],
            input=stdin,
            capture_output=True,
            text=True,
            timeout=5,
        )

        return {
            "ok": result.returncode == 0,
            "output": result.stdout or result.stderr or "No output.",
        }

    except subprocess.TimeoutExpired:
        return {"ok": False, "output": "Execution timed out after 5 seconds."}
    except Exception as error:
        return {"ok": False, "output": str(error)}


@app.websocket("/sandbox/ws")
async def sandbox_terminal(websocket: WebSocket):
    await websocket.accept()

    process = None

    blocked_tokens = [
        "import os",
        "import subprocess",
        "import socket",
        "import shutil",
        "open(",
        "__import__",
        "eval(",
        "exec(",
        "compile(",
        "globals(",
        "locals(",
        "pip",
        "install",
    ]

    try:
        init_payload = await websocket.receive_json()
        code = (init_payload.get("code") or "").strip()

        if not code:
            await websocket.send_json({"type": "output", "data": "No code provided.\n"})
            await websocket.close()
            return

        lowered = code.lower()
        if any(token in lowered for token in blocked_tokens):
            await websocket.send_json(
                {
                    "type": "output",
                    "data": "Blocked unsafe code. This sandbox only allows safe beginner Python.\n",
                }
            )
            await websocket.close()
            return

        process = await asyncio.create_subprocess_exec(
            "python",
            "-u",
            "-c",
            code,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )

        async def read_stream(stream, stream_type: str):
            while True:
                chunk = await stream.read(1024)
                if not chunk:
                    break
                await websocket.send_json(
                    {
                        "type": stream_type,
                        "data": chunk.decode(errors="replace"),
                    }
                )

        stdout_task = asyncio.create_task(read_stream(process.stdout, "output"))
        stderr_task = asyncio.create_task(read_stream(process.stderr, "error"))

        while process.returncode is None:
            message = await websocket.receive_json()

            if message.get("type") == "input":
                value = message.get("data", "")

                if process.stdin:
                    process.stdin.write((value + "\n").encode())
                    await process.stdin.drain()

            elif message.get("type") == "stop":
                process.terminate()
                break

        await stdout_task
        await stderr_task

        await websocket.send_json(
            {
                "type": "done",
                "data": "\n[Process finished]\n",
            }
        )

    except WebSocketDisconnect:
        if process and process.returncode is None:
            process.terminate()

    except Exception as error:
        await websocket.send_json(
            {
                "type": "error",
                "data": f"\nSandbox error: {error}\n",
            }
        )

    finally:
        if process and process.returncode is None:
            process.terminate()
