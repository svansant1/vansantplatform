from typing import Dict, List

TOPIC_GRAPH: Dict[str, List[str]] = {
    "operating systems": [
        "kernel",
        "process management",
        "memory management",
        "file systems",
        "device drivers",
        "user space",
        "system calls",
        "thread scheduling",
        "permissions",
        "windows",
        "linux",
        "macos",
    ],
    "networking": [
        "tcp/ip",
        "dns",
        "http",
        "routers",
        "switches",
        "firewalls",
        "ports",
        "subnets",
        "latency",
        "packets",
        "osi model",
    ],
    "programming": [
        "variables",
        "functions",
        "classes",
        "data structures",
        "algorithms",
        "debugging",
        "python",
        "javascript",
        "java",
        "c++",
        "apis",
    ],
    "hardware": [
        "cpu",
        "ram",
        "gpu",
        "motherboard",
        "storage",
        "power supply",
        "cooling",
        "bios",
        "uefi",
        "drivers",
    ],
    "security": [
        "malware",
        "viruses",
        "ransomware",
        "phishing",
        "firewalls",
        "encryption",
        "antivirus",
        "process injection",
        "persistence",
        "startup entries",
    ],
    "debugging": [
        "logs",
        "stack trace",
        "syntax error",
        "runtime error",
        "performance bottleneck",
        "memory leak",
        "process analysis",
        "network failures",
    ],
}

KEYWORD_TO_TOPIC = {
    "operating system": "operating systems",
    "os": "operating systems",
    "kernel": "operating systems",
    "linux": "operating systems",
    "windows": "operating systems",
    "macos": "operating systems",
    "network": "networking",
    "dns": "networking",
    "tcp": "networking",
    "http": "networking",
    "router": "networking",
    "switch": "networking",
    "python": "programming",
    "javascript": "programming",
    "java": "programming",
    "c++": "programming",
    "code": "programming",
    "programming": "programming",
    "cpu": "hardware",
    "ram": "hardware",
    "gpu": "hardware",
    "motherboard": "hardware",
    "virus": "security",
    "malware": "security",
    "threat": "security",
    "debug": "debugging",
    "error": "debugging",
    "bug": "debugging",
}


def detect_primary_topic(prompt: str) -> str:
    lower = prompt.lower()

    for keyword, topic in KEYWORD_TO_TOPIC.items():
        if keyword in lower:
            return topic

    return "general"


def expand_topic(topic: str) -> List[str]:
    return TOPIC_GRAPH.get(topic, [])


def build_topic_cluster(prompt: str) -> Dict[str, List[str] | str]:
    primary = detect_primary_topic(prompt)
    related = expand_topic(primary)
    return {
        "primary_topic": primary,
        "related_topics": related,
    }
