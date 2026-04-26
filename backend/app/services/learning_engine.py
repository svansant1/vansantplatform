from __future__ import annotations

import json
import random
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional
from urllib.parse import urlparse

import requests
from bs4 import BeautifulSoup

from app.services.knowledge_store import add_knowledge_entries, load_knowledge_entries

BASE_DIR = Path(__file__).resolve().parents[2]
DATA_DIR = BASE_DIR / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)

LEARNING_STATE_FILE = DATA_DIR / "svansai_learning_state.json"

# Add or remove domains as you want.
TRUSTED_DOMAINS = {
    "developer.mozilla.org",
    "docs.python.org",
    "python.org",
    "react.dev",
    "nextjs.org",
    "nodejs.org",
    "fastapi.tiangolo.com",
    "postgresql.org",
    "mysql.com",
    "mongodb.com",
    "kubernetes.io",
    "docker.com",
    "owasp.org",
    "nist.gov",
    "cisa.gov",
    "microsoft.com",
    "learn.microsoft.com",
    "support.microsoft.com",
    "aws.amazon.com",
    "cloud.google.com",
    "azure.microsoft.com",
    "ubuntu.com",
    "kernel.org",
    "gnu.org",
    "mit.edu",
    "stanford.edu",
    "harvard.edu",
    "nasa.gov",
    "nih.gov",
    "who.int",
    "cdc.gov",
    "pubmed.ncbi.nlm.nih.gov",
    "britannica.com",
    "investopedia.com",
    "worldbank.org",
    "imf.org",
}

TOPIC_BANK: Dict[str, List[str]] = {
    "programming": [
        "Python basics",
        "Python functions",
        "Python classes",
        "Python decorators",
        "Python async programming",
        "JavaScript fundamentals",
        "JavaScript closures",
        "TypeScript basics",
        "React state management",
        "React hooks",
        "Next.js routing",
        "FastAPI basics",
        "REST APIs",
        "GraphQL basics",
        "SQL fundamentals",
        "PostgreSQL indexing",
        "Data structures",
        "Algorithms",
        "Object-oriented programming",
        "Debugging techniques",
    ],
    "operating_systems": [
        "Operating systems overview",
        "Kernel architecture",
        "Process management",
        "Thread scheduling",
        "Memory management",
        "Virtual memory",
        "File systems",
        "Device drivers",
        "Linux commands",
        "Windows internals basics",
        "macOS architecture basics",
        "Permissions and access control",
        "System calls",
        "Interrupts",
        "Boot process",
    ],
    "networking": [
        "TCP/IP fundamentals",
        "DNS basics",
        "HTTP and HTTPS",
        "Routers and switches",
        "Ports and protocols",
        "Subnets",
        "NAT basics",
        "Firewalls",
        "OSI model",
        "Network latency",
        "Packet flow",
        "VPN basics",
        "Wi-Fi standards",
        "Load balancing",
    ],
    "security": [
        "Cybersecurity basics",
        "Malware types",
        "Ransomware basics",
        "Phishing awareness",
        "Endpoint security",
        "Antivirus fundamentals",
        "Encryption basics",
        "Hashing basics",
        "Authentication and authorization",
        "Zero trust basics",
        "OWASP Top 10",
        "Process injection basics",
        "Persistence mechanisms",
        "Startup entries on Windows",
    ],
    "hardware": [
        "CPU architecture basics",
        "RAM types",
        "GPU basics",
        "Motherboard components",
        "Power supplies",
        "SSD vs HDD",
        "Cooling systems",
        "BIOS vs UEFI",
        "PCIe basics",
        "Display outputs",
        "Drivers overview",
        "Thermal throttling",
    ],
    "cloud_devops": [
        "Cloud computing basics",
        "Docker containers",
        "Kubernetes basics",
        "CI/CD pipelines",
        "Infrastructure as code",
        "AWS basics",
        "Azure basics",
        "Google Cloud basics",
        "Monitoring and logging",
        "System design basics",
    ],
    "design_general": [
        "Graphic design fundamentals",
        "Typography basics",
        "Color theory",
        "UI design principles",
        "UX basics",
        "Responsive design",
        "Accessibility basics",
    ],
}

USER_AGENT = "SVANSAI-LearningBot/1.0"


def _read_state() -> Dict[str, Any]:
    if not LEARNING_STATE_FILE.exists():
        return {
            "date": "",
            "completed_today": 0,
            "cursor": 0,
        }

    try:
        return json.loads(LEARNING_STATE_FILE.read_text(encoding="utf-8"))
    except Exception:
        return {
            "date": "",
            "completed_today": 0,
            "cursor": 0,
        }


def _write_state(state: Dict[str, Any]) -> None:
    LEARNING_STATE_FILE.write_text(
        json.dumps(state, indent=2),
        encoding="utf-8",
    )


def _today_key() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def _flatten_topics() -> List[str]:
    topics: List[str] = []
    for values in TOPIC_BANK.values():
        topics.extend(values)
    return topics


def _rotate_topics(topics: List[str], seed_text: str) -> List[str]:
    randomizer = random.Random(seed_text)
    topics_copy = topics[:]
    randomizer.shuffle(topics_copy)
    return topics_copy


def get_learning_batch(daily_goal: int = 50, per_run: int = 3) -> List[str]:
    state = _read_state()
    today = _today_key()

    if state.get("date") != today:
        state = {
            "date": today,
            "completed_today": 0,
            "cursor": 0,
        }

    completed_today = int(state.get("completed_today", 0))
    cursor = int(state.get("cursor", 0))

    if completed_today >= daily_goal:
        _write_state(state)
        return []

    topics = _rotate_topics(_flatten_topics(), today)

    remaining = daily_goal - completed_today
    batch_size = min(per_run, remaining)

    batch = topics[cursor : cursor + batch_size]

    if len(batch) < batch_size:
        batch += topics[: batch_size - len(batch)]

    state["cursor"] = (cursor + batch_size) % max(len(topics), 1)
    _write_state(state)

    return batch


def mark_topics_completed(count: int) -> None:
    state = _read_state()
    today = _today_key()

    if state.get("date") != today:
        state = {
            "date": today,
            "completed_today": 0,
            "cursor": 0,
        }

    state["completed_today"] = int(state.get("completed_today", 0)) + count
    _write_state(state)


def domain_from_url(url: str) -> str:
    try:
        netloc = urlparse(url).netloc.lower().strip()
        return netloc.replace("www.", "")
    except Exception:
        return ""


def is_trusted_domain(url: str) -> bool:
    domain = domain_from_url(url)
    if not domain:
        return False

    if domain in TRUSTED_DOMAINS:
        return True

    return any(domain.endswith(f".{trusted}") for trusted in TRUSTED_DOMAINS)


def fetch_url_text(url: str, timeout: int = 15) -> str:
    headers = {"User-Agent": USER_AGENT}
    response = requests.get(url, headers=headers, timeout=timeout)
    response.raise_for_status()

    soup = BeautifulSoup(response.text, "html.parser")

    for tag in soup(["script", "style", "noscript", "header", "footer", "nav"]):
        tag.decompose()

    text = soup.get_text(separator=" ")
    text = " ".join(text.split())
    return text[:20000]


def extract_relevant_summary(topic: str, raw_text: str) -> str:
    if not raw_text:
        return ""

    sentences = raw_text.split(". ")
    topic_words = [word.lower() for word in topic.split() if len(word) > 2]

    scored: List[tuple[int, str]] = []
    for sentence in sentences:
        sentence_clean = sentence.strip()
        if len(sentence_clean) < 40:
            continue

        score = 0
        lower_sentence = sentence_clean.lower()

        for word in topic_words:
            if word in lower_sentence:
                score += 2

        if len(sentence_clean) > 100:
            score += 1

        if score > 0:
            scored.append((score, sentence_clean))

    scored.sort(key=lambda x: x[0], reverse=True)

    summary_sentences = [text for _, text in scored[:6]]
    summary = ". ".join(summary_sentences).strip()

    if summary and not summary.endswith("."):
        summary += "."

    return summary[:2500]


def build_learned_entry(
    topic: str,
    title: str,
    content: str,
    url: str,
    source: str,
) -> Dict[str, Any]:
    return {
        "title": title or topic,
        "content": content,
        "topic": topic,
        "url": url,
        "source": source,
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "validation_status": "trusted" if is_trusted_domain(url) else "unverified",
        "confidence": 0.85 if is_trusted_domain(url) else 0.55,
        "corroboration_count": 1,
        "contradiction": False,
    }


def filter_reliable_results(results: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    filtered = []
    for result in results:
        url = str(result.get("url") or "")
        if is_trusted_domain(url):
            filtered.append(result)
    return filtered


def learn_single_topic(
    topic: str,
    search_fn: Callable[[str, int], Dict[str, Any]],
) -> List[Dict[str, Any]]:
    search_result = search_fn(topic, 10)

    if not search_result or not search_result.get("ok"):
        return []

    raw_results = search_result.get("results", [])
    reliable_results = filter_reliable_results(raw_results)

    learned_entries: List[Dict[str, Any]] = []

    for result in reliable_results[:3]:
        url = str(result.get("url") or "")
        title = str(result.get("title") or topic)
        source = str(result.get("source") or domain_from_url(url) or "trusted_web")

        try:
            raw_text = fetch_url_text(url)
            summary = extract_relevant_summary(topic, raw_text)

            if not summary or len(summary) < 80:
                continue

            learned_entries.append(
                build_learned_entry(
                    topic=topic,
                    title=title,
                    content=summary,
                    url=url,
                    source=source,
                )
            )

            time.sleep(1)
        except Exception:
            continue

    return learned_entries


def learn_daily_topics(
    search_fn: Callable[[str, int], Dict[str, Any]],
    daily_goal: int = 50,
    per_run: int = 3,
) -> Dict[str, Any]:
    batch = get_learning_batch(daily_goal=daily_goal, per_run=per_run)
    if not batch:
        return {
            "ok": True,
            "learned_count": 0,
            "topics": [],
            "entries": [],
            "message": "Daily goal already reached.",
        }

    all_entries: List[Dict[str, Any]] = []
    completed = 0

    for topic in batch:
        entries = learn_single_topic(topic, search_fn=search_fn)
        if entries:
            all_entries.extend(entries)
        completed += 1

    if all_entries:
        add_knowledge_entries(all_entries)

    mark_topics_completed(completed)

    return {
        "ok": True,
        "learned_count": len(all_entries),
        "topics": batch,
        "entries": all_entries,
        "message": f"Processed {completed} topics and learned {len(all_entries)} entries.",
    }
