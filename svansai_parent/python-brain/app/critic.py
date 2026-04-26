BAD_PATTERNS = [
    "i am an ai",
    "i don't know",
    "i cannot help with that",
    "i couldn't generate a strong answer",
]


def should_save(answer: str) -> bool:
    text = answer.lower().strip()
    if len(text) < 25:
        return False
    return not any(pattern in text for pattern in BAD_PATTERNS)
