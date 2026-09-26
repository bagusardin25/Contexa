import json

from app.documents.keyterms import (
    MAX_KEYTERM_CHARS,
    MAX_KEYTERMS_JSON_CHARS,
    extract_keyterms,
    merge_keyterms,
)
from app.documents.parsing import parse_document

from .conftest import README

TECH_DOC = b"""# Contexa architecture

The browser streams PCM16 audio to AssemblyAI over a WebSocket. The API is built with FastAPI
and deployed on Render; the web app runs Next.js 16 on Vercel.

## Retrieval

We rank chunks with BM25 and plan to add `pgvector` later. The Supabase client stores
sessions in PostgreSQL. See README.md and THE docs, e.g. the `speech_model` parameter.
Real-time matters. We also call gpt-5 through the gateway.

```python
someInternalVar = createStore()
```

WARNING: keep keys on the server. The US team agrees.
"""


def test_readme_keyterms_are_names_not_vocabulary() -> None:
    terms = extract_keyterms(parse_document(README, "md"))
    assert "Supabase Realtime" in terms and "Q4" in terms
    # Capitalized only because they start a sentence or a heading.
    assert not {"Changes", "Each", "Writes", "Pricing", "Conflict"} & set(terms)


def test_technical_terms_are_found_and_noise_is_not() -> None:
    terms = extract_keyterms(parse_document(TECH_DOC, "md"))
    expected = {
        "PCM16",
        "AssemblyAI",
        "WebSocket",
        "FastAPI",
        "Next.js",
        "Vercel",
        "Render",
        "BM25",
        "pgvector",
        "Supabase",
        "PostgreSQL",
        "speech_model",
        "gpt-5",
    }
    assert expected <= set(terms)
    noise = {
        "someInternalVar",  # fenced code isn't spoken
        "createStore",
        "README.md",  # file names
        "THE",
        "US",
        "WARNING",
        "e.g",
        "Real-time",
        "Next",  # part of Next.js, not a name
    }
    assert not noise & set(terms)


def test_extract_keyterms_respects_the_limit_and_ranks_repeats_first() -> None:
    doc = b"We run Kafka with ZooKeeper, and Kafka feeds Redis. Our Kafka cluster is big.\n"
    doc += b" ".join(f"myTerm{i}".encode() for i in range(60))
    terms = extract_keyterms(parse_document(doc, "txt"), limit=5)
    assert terms == ["Kafka", "ZooKeeper", "myTerm0", "myTerm1", "myTerm2"]


def test_merge_keyterms_round_robins_dedupes_and_caps() -> None:
    merged = merge_keyterms([["A", "B", "C"], ["b", "D"], ["E"]], limit=4)
    assert merged == ["A", "b", "E", "D"]

    long_terms = [[f"term-{i}-" + "x" * 60 for i in range(300)]]
    merged = merge_keyterms(long_terms)
    assert all(len(term) <= MAX_KEYTERM_CHARS for term in merged)
    assert len(json.dumps(merged, ensure_ascii=False)) <= MAX_KEYTERMS_JSON_CHARS
    assert merge_keyterms([]) == []
