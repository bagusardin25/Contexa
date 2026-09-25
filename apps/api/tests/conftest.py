import json
from collections.abc import Callable, Iterator
from typing import Any

import httpx
import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app

ORIGIN = "http://localhost:3000"

README = b"""# Notewave

Realtime collaborative notes for students.

## Realtime sync

Changes are broadcast through one Supabase Realtime channel per note, so collaborators
receive updates in roughly 150 ms.

## Conflict handling

Each note row carries a version column. Writes use optimistic locking: the client sends
the version it last read, and the update is rejected when the stored version has changed.

## Roadmap

Q4 2026: student pilot with three partner campuses. Pricing will be evaluated afterwards.
"""

QUESTION_ANALYSIS = {
    "source_language": "en",
    "translation": "Bagaimana aplikasi Anda menangani concurrent updates?",
    "technical_terms_preserved": ["concurrent updates"],
    "type": "question",
    "requires_answer": True,
    "confidence": 0.95,
    "search_keywords": ["concurrent updates", "optimistic locking", "version column"],
}

STATEMENT_ANALYSIS = {
    "source_language": "en",
    "translation": "Selamat datang kembali, semuanya.",
    "technical_terms_preserved": [],
    "type": "statement",
    "requires_answer": False,
    "confidence": 0.97,
    "search_keywords": [],
}

ANSWER = {
    "question_summary": "Bagaimana aplikasi menangani pembaruan bersamaan?",
    "answer_preferred_language": "Kami memakai optimistic locking dengan kolom version.",
    "answer_target_language": "We use optimistic locking with a version column.",
    "used_chunk_ids": ["C1"],
    "confidence_note": "Berdasarkan README.md bagian Conflict handling.",
}


class FakeLLM:
    """Stands in for the LLM Gateway and answers by structured-output schema name."""

    def __init__(self) -> None:
        self.requests: list[dict[str, Any]] = []
        self.headers: list[httpx.Headers] = []
        self.responses: dict[str, dict[str, Any] | Callable[[dict[str, Any]], dict[str, Any]]] = {
            "turn_analysis": QUESTION_ANALYSIS,
            "grounded_answer": ANSWER,
        }
        self.failing: set[str] = set()

    def handler(self, request: httpx.Request) -> httpx.Response:
        payload = json.loads(request.content)
        self.requests.append(payload)
        self.headers.append(request.headers)
        name = payload["response_format"]["json_schema"]["name"]
        if name in self.failing:
            return httpx.Response(504, json={"error": "upstream timeout"})
        body = self.responses[name]
        content = body(payload) if callable(body) else body
        return httpx.Response(
            200,
            json={"choices": [{"message": {"role": "assistant", "content": json.dumps(content)}}]},
        )

    def calls(self, name: str) -> list[dict[str, Any]]:
        return [r for r in self.requests if r["response_format"]["json_schema"]["name"] == name]


class FakeTokens:
    def __init__(self) -> None:
        self.requests: list[httpx.Request] = []

    def handler(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        return httpx.Response(200, json={"token": "temp-token-123", "expires_in_seconds": 60})


def build_client(fake_llm: FakeLLM, fake_tokens: FakeTokens, **overrides: Any) -> TestClient:
    settings = Settings(
        _env_file=None,
        assemblyai_api_key=overrides.pop("assemblyai_api_key", "test-key"),
        cors_origins=ORIGIN,
        **overrides,
    )
    app = create_app(
        settings,
        llm_transport=httpx.MockTransport(fake_llm.handler),
        streaming_transport=httpx.MockTransport(fake_tokens.handler),
    )
    return TestClient(app)


@pytest.fixture
def fake_llm() -> FakeLLM:
    return FakeLLM()


@pytest.fixture
def fake_tokens() -> FakeTokens:
    return FakeTokens()


@pytest.fixture
def client(fake_llm: FakeLLM, fake_tokens: FakeTokens) -> Iterator[TestClient]:
    with build_client(fake_llm, fake_tokens) as test_client:
        yield test_client


def make_pdf(pages: list[str]) -> bytes:
    """A minimal valid PDF with one line of Helvetica text per page."""
    objects: dict[int, str] = {
        1: "<< /Type /Catalog /Pages 2 0 R >>",
        3: "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    }
    kids = []
    next_id = 4
    for text in pages:
        page_id, content_id = next_id, next_id + 1
        next_id += 2
        stream = f"BT /F1 12 Tf 72 720 Td ({text}) Tj ET"
        objects[content_id] = f"<< /Length {len(stream)} >>\nstream\n{stream}\nendstream"
        objects[page_id] = (
            "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
            f"/Resources << /Font << /F1 3 0 R >> >> /Contents {content_id} 0 R >>"
        )
        kids.append(f"{page_id} 0 R")
    objects[2] = f"<< /Type /Pages /Kids [{' '.join(kids)}] /Count {len(kids)} >>"

    out = b"%PDF-1.4\n"
    offsets = {}
    for number in sorted(objects):
        offsets[number] = len(out)
        out += f"{number} 0 obj\n{objects[number]}\nendobj\n".encode()
    xref = len(out)
    size = max(objects) + 1
    out += f"xref\n0 {size}\n0000000000 65535 f \n".encode()
    for number in range(1, size):
        out += f"{offsets[number]:010d} 00000 n \n".encode()
    out += f"trailer\n<< /Size {size} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode()
    return out
