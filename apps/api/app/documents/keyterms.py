"""Keyterms for AssemblyAI keyterms prompting, taken from the session's documents.

Uploaded documents name the project's jargon: product names, acronyms, identifiers.
Sending them as `keyterms_prompt` helps Universal-3.5 Pro transcribe those words
correctly, so the documents improve the transcript as well as the answers.
"""

import json
import re
from collections import Counter
from collections.abc import Sequence
from dataclasses import dataclass, field

from app.rag.tokenize import STOPWORDS

from .parsing import Section

# AssemblyAI streaming limits: at most 100 keyterms per session, 50 characters each.
MAX_SESSION_KEYTERMS = 100
MAX_KEYTERM_CHARS = 50
MAX_DOCUMENT_KEYTERMS = 40
# The list travels in the WebSocket URL; keep it well under common URL length limits.
MAX_KEYTERMS_JSON_CHARS = 2000

_FENCED_CODE = re.compile(r"^[ \t]*```.*?^[ \t]*```[ \t]*$", re.DOTALL | re.MULTILINE)
_CODE_SPAN = re.compile(r"`([^`\n]{2,50})`")
# WebSocket, FastAPI, PostgreSQL, AssemblyAI, iOS
_MIXED_CASE = re.compile(r"\b[A-Za-z]*[a-z][A-Z][A-Za-z0-9]*\b")
# API, JWT, BM25, PCM16, Q4, APIs
_ACRONYM = re.compile(r"\b[A-Z][A-Z0-9]{1,6}s?\b")
# Next.js, gpt-5, pcm_s16le, Universal-3.5
_IDENTIFIER = re.compile(r"\b[A-Za-z][A-Za-z0-9]*(?:[._-][A-Za-z0-9]+)+\b")
# Supabase, Supabase Realtime, Notewave
_CAPITALIZED = re.compile(r"\b[A-Z][a-z]{2,}(?:[ \t]+[A-Z][a-z]{2,}){0,2}\b")
_IDENTIFIER_TAIL = re.compile(r"[._-][A-Za-z0-9]")
_LOWERCASE_WORD = re.compile(r"\b[a-z][a-z]+\b")

_GENERIC_ACRONYMS = frozenset(
    "OK AM PM TV US UK EU FAQ TBD TODO FYI NOTE ETC TIP INFO WARNING II III IV VI".split()
)
_FILE_EXTENSIONS = frozenset(
    "md markdown txt json yml yaml toml lock pdf docx png jpg jpeg svg css html py ts tsx".split()
)
_SPAN_EXCLUDED = set("/\\=(){}[]<>$;:")
# A capitalized word right after one of these starts a sentence, a list item, a checkbox
# ("- [ ] First run"), a link text, or a table cell.
_SENTENCE_BREAK = set(".!?:;#*-•>|\"'(“[]")


@dataclass
class _Candidate:
    first: int
    score: float = 0.0
    forms: Counter[str] = field(default_factory=Counter)


def _clean(term: str) -> str:
    return " ".join(term.split()).strip(" .,;:!?\"'()[]")


def _starts_sentence(text: str, start: int) -> bool:
    # Newlines are skipped on purpose: Markdown wraps sentences across lines.
    before = text[:start].rstrip()
    return not before or before[-1] in _SENTENCE_BREAK


def _identifier_ok(token: str) -> bool:
    letters = sum(ch.isalpha() for ch in token)
    if len(token) < 4 or letters < 2:
        return False
    if "." in token and token.rsplit(".", 1)[1].lower() in _FILE_EXTENSIONS:
        return False
    return any(ch.isdigit() for ch in token) or "_" in token or "." in token


def extract_keyterms(sections: Sequence[Section], limit: int = MAX_DOCUMENT_KEYTERMS) -> list[str]:
    """The document's most distinctive terms, best first.

    Precise rather than exhaustive: technical tokens (mixed case, acronyms, identifiers),
    Markdown code spans, and capitalized names used mid-sentence. A name the document also
    writes in lower case is ordinary vocabulary and is skipped.
    """
    texts = [_FENCED_CODE.sub(" ", section.text) for section in sections]
    # Words the prose itself uses in lower case (code spans aside): ordinary vocabulary.
    lowercase_words: set[str] = set()
    for text in texts:
        lowercase_words.update(_LOWERCASE_WORD.findall(_CODE_SPAN.sub(" ", text)))

    candidates: dict[str, _Candidate] = {}

    def add(term: str, weight: float, position: int) -> None:
        term = _clean(term)
        if not term or len(term) > MAX_KEYTERM_CHARS or not any(ch.isalpha() for ch in term):
            return
        candidate = candidates.setdefault(term.lower(), _Candidate(first=position))
        candidate.score += weight
        candidate.forms[term] += 1

    names: dict[str, list[tuple[int, bool]]] = {}
    offset = 0
    for text in texts:
        for match in _CODE_SPAN.finditer(text):
            span = match.group(1).strip()
            if len(span.split()) > 4 or _SPAN_EXCLUDED.intersection(span):
                continue
            if span.isalpha() and span.islower() and span in lowercase_words:
                continue  # `notes` next to "shared notes": a plain word, not jargon
            add(span, 3, offset + match.start())
        for match in _MIXED_CASE.finditer(text):
            if match.group().lower() not in STOPWORDS:
                add(match.group(), 2, offset + match.start())
        for match in _ACRONYM.finditer(text):
            token = match.group()
            if token not in _GENERIC_ACRONYMS and token.lower() not in STOPWORDS:
                add(token, 2, offset + match.start())
        for match in _IDENTIFIER.finditer(text):
            if _identifier_ok(match.group()):
                add(match.group(), 2, offset + match.start())
        for match in _CAPITALIZED.finditer(text):
            if _IDENTIFIER_TAIL.match(text, match.end()):
                continue  # "Next" in "Next.js" is part of an identifier, not a name
            words, start = match.group().split(), match.start()
            # "The Supabase client": drop leading function words so the name is judged alone.
            while words and words[0].lower() in STOPWORDS:
                if len(words) > 1:
                    start = text.index(words[1], start + len(words[0]))
                words = words[1:]
            if words:
                occurrence = (offset + start, _starts_sentence(text, start))
                names.setdefault(" ".join(words), []).append(occurrence)
        offset += len(text) + 2

    # The title names the product ("# Notewave architecture"); a title word the body also
    # uses, always capitalized, counts as a name even where it starts sentences.
    title = next((section.heading for section in sections if section.heading), "")
    heading_words = {
        word
        for phrase in _CAPITALIZED.findall(title)
        for word in phrase.split()
        if word.lower() not in STOPWORDS
    }
    for name, occurrences in names.items():
        mid_sentence = any(not initial for _, initial in occurrences)
        titled = name in heading_words
        if not (mid_sentence or titled) or (" " not in name and name.lower() in lowercase_words):
            continue
        for position, _ in occurrences:
            add(name, 1.5, position)

    ranked = sorted(candidates.values(), key=lambda c: (-c.score, c.first))
    return [candidate.forms.most_common(1)[0][0] for candidate in ranked[:limit]]


def merge_keyterms(
    per_document: Sequence[Sequence[str]], limit: int = MAX_SESSION_KEYTERMS
) -> list[str]:
    """One session list: round-robin by rank so no single document takes every slot."""
    merged: list[str] = []
    seen: set[str] = set()
    size = 2  # the enclosing "[]"
    depth = max((len(terms) for terms in per_document), default=0)
    for rank in range(depth):
        for terms in per_document:
            if rank >= len(terms):
                continue
            term = terms[rank][:MAX_KEYTERM_CHARS]
            if term.lower() in seen:
                continue
            cost = len(json.dumps(term, ensure_ascii=False)) + 1
            if len(merged) >= limit or size + cost > MAX_KEYTERMS_JSON_CHARS:
                return merged
            seen.add(term.lower())
            merged.append(term)
            size += cost
    return merged
