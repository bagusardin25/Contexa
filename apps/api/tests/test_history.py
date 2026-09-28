"""Meeting history: identity, save/list/get/delete, owner isolation, and search.

The database tests need Postgres with pgvector; they create a throwaway database per module:

    CONTEXA_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:54329/postgres uv run pytest
"""

import asyncio
import json
import os
import uuid
from collections.abc import Iterator
from typing import Any
from urllib.parse import urlsplit, urlunsplit

import httpx
import pytest
from fastapi.testclient import TestClient

from app.api.history import meeting_passages
from app.models.history import MeetingIn

from .conftest import FakeEmbeddings, FakeLLM, FakeTokens, build_client

TEST_DATABASE_URL = os.environ.get("CONTEXA_TEST_DATABASE_URL", "")
needs_database = pytest.mark.skipif(
    not TEST_DATABASE_URL, reason="set CONTEXA_TEST_DATABASE_URL to a Postgres with pgvector"
)

DEVICE_A = {"X-Contexa-Device": "a" * 43}
DEVICE_B = {"X-Contexa-Device": "b" * 43}


def meeting(**overrides: Any) -> dict[str, Any]:
    body: dict[str, Any] = {
        "title": "Notewave demo day",
        "startedAt": "2026-09-26T10:00:00Z",
        "endedAt": "2026-09-26T10:05:30Z",
        "speakerLanguage": "en",
        "displayLanguage": "id",
        "turns": [
            {
                "id": "s1-t0",
                "speaker": "A",
                "text": "Welcome back, everyone.",
                "translation": "Selamat datang kembali, semuanya.",
                "type": "statement",
                "requiresAnswer": False,
                "startedAtMs": 300,
            },
            {
                "id": "s1-t1",
                "speaker": "B",
                "text": "How much does the Pro plan cost per month?",
                "translation": None,
                "type": "question",
                "requiresAnswer": True,
                "startedAtMs": 3000,
            },
            {
                "id": "s1-t2",
                "speaker": "B",
                "text": "And what happens when two people edit the same note?",
                "translation": None,
                "type": "question",
                "requiresAnswer": True,
                "startedAtMs": 9000,
            },
        ],
        "answers": [
            {
                "turnId": "s1-t2",
                "questionSummary": "Apa yang terjadi saat dua orang mengedit catatan yang sama?",
                "answerPreferredLanguage": "Kami memakai optimistic locking dengan kolom version.",
                "answerTargetLanguage": "We use optimistic locking with a version column.",
                "style": "professional",
                "sources": ["notewave-architecture.md · Conflict handling"],
            }
        ],
        "recap": {
            "summary": "Tim membahas demo Notewave.",
            "keyPoints": ["Optimistic locking"],
            "actionItems": [],
            "openQuestions": [],
        },
    }
    body.update(overrides)
    return body


def test_passages_put_recap_and_answers_first_and_keep_translations() -> None:
    passages = meeting_passages(MeetingIn.model_validate(meeting()))
    assert [p.kind for p in passages] == ["recap", "answer", "turn", "turn", "turn"]
    assert passages[0].text == "Tim membahas demo Notewave.\nOptimistic locking"
    answer = passages[1]
    assert answer.ref == "s1-t2" and answer.at_ms == 9000
    assert "optimistic locking with a version column" in answer.text
    first_turn = passages[2]
    assert first_turn.text == "Welcome back, everyone.\nSelamat datang kembali, semuanya."
    assert (first_turn.speaker, first_turn.ref, first_turn.at_ms) == ("A", "s1-t0", 300)


def test_passages_are_capped() -> None:
    turns = [{"id": f"t{i}", "text": f"Turn number {i}", "startedAtMs": i} for i in range(700)]
    passages = meeting_passages(MeetingIn.model_validate(meeting(turns=turns, answers=[])))
    assert len(passages) == 500 and passages[0].kind == "recap"


def test_history_is_off_without_a_database(fake_llm: FakeLLM, fake_tokens: FakeTokens) -> None:
    with build_client(fake_llm, fake_tokens) as client:
        assert client.get("/health").json()["historyEnabled"] is False
        responses = [
            client.put("/api/meetings/meeting-0001", json=meeting(), headers=DEVICE_A),
            client.get("/api/meetings", headers=DEVICE_A),
            client.get("/api/meetings/meeting-0001", headers=DEVICE_A),
            client.delete("/api/meetings/meeting-0001", headers=DEVICE_A),
            client.get("/api/meetings/search", params={"q": "pricing"}, headers=DEVICE_A),
        ]
    for response in responses:
        assert response.status_code == 503
        assert response.json()["detail"] == "History isn't set up on this server (DATABASE_URL)."


def test_an_unreachable_database_turns_history_off(
    fake_llm: FakeLLM, fake_tokens: FakeTokens, caplog: pytest.LogCaptureFixture
) -> None:
    # Nothing listens on port 1: the API still starts, without history.
    dsn = "postgresql://postgres:hunter2-secret@127.0.0.1:1/postgres"
    with build_client(fake_llm, fake_tokens, database_url=dsn) as client:
        health = client.get("/health").json()
        assert health["status"] == "ok" and health["historyEnabled"] is False
        assert client.get("/api/meetings", headers=DEVICE_A).status_code == 503
    # The log says why, without the password.
    logged = [r.getMessage() for r in caplog.records if "history is off" in r.getMessage()]
    assert len(logged) == 1 and "Error" in logged[0]
    assert "hunter2-secret" not in caplog.text


def test_cors_allows_the_history_headers_and_put(
    fake_llm: FakeLLM, fake_tokens: FakeTokens
) -> None:
    with build_client(fake_llm, fake_tokens) as client:
        response = client.options(
            "/api/meetings/meeting-0001",
            headers={
                "Origin": "http://localhost:3000",
                "Access-Control-Request-Method": "PUT",
                "Access-Control-Request-Headers": "authorization,content-type,x-contexa-device",
            },
        )
    assert response.status_code == 200
    assert "PUT" in response.headers["access-control-allow-methods"]
    allowed = response.headers["access-control-allow-headers"].lower()
    assert "authorization" in allowed and "x-contexa-device" in allowed


@pytest.fixture(scope="module")
def database_url() -> Iterator[str]:
    """A throwaway database on the test server, dropped afterwards."""
    if not TEST_DATABASE_URL:
        pytest.skip("set CONTEXA_TEST_DATABASE_URL to a Postgres with pgvector")
    import asyncpg

    name = f"contexa_test_{uuid.uuid4().hex[:12]}"

    async def admin(sql: str) -> None:
        connection = await asyncpg.connect(TEST_DATABASE_URL)
        try:
            await connection.execute(sql)
        finally:
            await connection.close()

    asyncio.run(admin(f"create database {name}"))
    parts = urlsplit(TEST_DATABASE_URL)
    try:
        yield urlunsplit(parts._replace(path=f"/{name}"))
    finally:
        asyncio.run(admin(f"drop database if exists {name} with (force)"))


class FakeSupabase:
    """`GET /auth/v1/user`: "good-token" is user u-123, anything else is rejected."""

    def __init__(self) -> None:
        self.requests: list[httpx.Request] = []

    def handler(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        assert request.url.path == "/auth/v1/user"
        if request.headers.get("apikey") != "anon-key":
            return httpx.Response(401, json={"message": "No API key found in request"})
        if request.headers.get("authorization") == "Bearer good-token":
            return httpx.Response(200, json={"id": "u-123", "email": "someone@example.com"})
        return httpx.Response(401, json={"message": "invalid JWT"})


@pytest.fixture
def history(database_url: str, fake_llm: FakeLLM, fake_tokens: FakeTokens) -> Iterator[TestClient]:
    with build_client(fake_llm, fake_tokens, database_url=database_url) as client:
        yield client


def new_id() -> str:
    return f"meeting-{uuid.uuid4().hex[:12]}"


@needs_database
def test_save_list_get_delete(history: TestClient) -> None:
    assert history.get("/health").json()["historyEnabled"] is True
    meeting_id = new_id()
    saved = history.put(f"/api/meetings/{meeting_id}", json=meeting(), headers=DEVICE_A)
    assert saved.status_code == 200, saved.text
    assert saved.json() == {"id": meeting_id, "passages": 5, "embedded": False}

    listed = history.get("/api/meetings", headers=DEVICE_A).json()["meetings"]
    mine = next(item for item in listed if item["id"] == meeting_id)
    assert mine == {
        "id": meeting_id,
        "title": "Notewave demo day",
        "startedAt": "2026-09-26T10:00:00Z",
        "endedAt": "2026-09-26T10:05:30Z",
        "turnCount": 3,
        "questionCount": 2,
        "summary": "Tim membahas demo Notewave.",
        "speakerLanguage": "en",
        "displayLanguage": "id",
    }

    detail = history.get(f"/api/meetings/{meeting_id}", headers=DEVICE_A).json()
    assert detail["title"] == "Notewave demo day"
    assert detail["data"]["turns"][1]["text"] == "How much does the Pro plan cost per month?"
    assert detail["data"]["answers"][0]["sources"] == [
        "notewave-architecture.md · Conflict handling"
    ]
    assert detail["data"]["recap"]["keyPoints"] == ["Optimistic locking"]

    # Saving again (say, after Retry recap) replaces it.
    again = meeting(title="Renamed", recap=None)
    assert history.put(f"/api/meetings/{meeting_id}", json=again, headers=DEVICE_A).json() == {
        "id": meeting_id,
        "passages": 4,
        "embedded": False,
    }
    listed = history.get("/api/meetings", headers=DEVICE_A).json()["meetings"]
    assert [item["title"] for item in listed if item["id"] == meeting_id] == ["Renamed"]

    assert history.delete(f"/api/meetings/{meeting_id}", headers=DEVICE_A).status_code == 204
    assert history.get(f"/api/meetings/{meeting_id}", headers=DEVICE_A).status_code == 404
    assert history.delete(f"/api/meetings/{meeting_id}", headers=DEVICE_A).status_code == 404


@needs_database
def test_owners_only_see_their_own_meetings(history: TestClient) -> None:
    meeting_id = new_id()
    assert history.put(f"/api/meetings/{meeting_id}", json=meeting(), headers=DEVICE_A).is_success
    assert history.get(f"/api/meetings/{meeting_id}", headers=DEVICE_B).status_code == 404
    listed = history.get("/api/meetings", headers=DEVICE_B).json()["meetings"]
    assert meeting_id not in [item["id"] for item in listed]
    hits = history.get("/api/meetings/search", params={"q": "Pro plan"}, headers=DEVICE_B).json()[
        "hits"
    ]
    assert meeting_id not in [hit["meetingId"] for hit in hits]
    # B can't overwrite or delete A's meeting by guessing its id.
    stolen = history.put(f"/api/meetings/{meeting_id}", json=meeting(title="B"), headers=DEVICE_B)
    assert stolen.status_code == 404
    assert history.delete(f"/api/meetings/{meeting_id}", headers=DEVICE_B).status_code == 404
    detail = history.get(f"/api/meetings/{meeting_id}", headers=DEVICE_A).json()
    assert detail["title"] == "Notewave demo day"


@needs_database
def test_identity_is_required_and_checked(history: TestClient) -> None:
    for headers in ({}, {"X-Contexa-Device": "too-short"}, {"X-Contexa-Device": "a b" * 20}):
        response = history.get("/api/meetings", headers=headers)
        assert response.status_code == 401
        assert "device key" in response.json()["detail"]
    # Without Supabase on the server, a bearer token is ignored for the device key.
    both = {"Authorization": "Bearer whatever", **DEVICE_A}
    assert history.get("/api/meetings", headers=both).status_code == 200


@needs_database
def test_validation(history: TestClient) -> None:
    assert history.put("/api/meetings/short", json=meeting(), headers=DEVICE_A).status_code == 422
    naive = meeting(startedAt="2026-09-26T10:00:00")
    assert history.put(f"/api/meetings/{new_id()}", json=naive, headers=DEVICE_A).status_code == 422
    empty = history.get("/api/meetings/search", params={"q": "   "}, headers=DEVICE_A)
    assert empty.status_code == 422


@needs_database
def test_signed_in_users_are_checked_with_supabase(
    database_url: str, fake_llm: FakeLLM, fake_tokens: FakeTokens
) -> None:
    supabase = FakeSupabase()
    with build_client(
        fake_llm,
        fake_tokens,
        database_url=database_url,
        supabase_url="https://project.supabase.co/",
        supabase_anon_key="anon-key",
        supabase=supabase.handler,
    ) as client:
        signed_in = {"Authorization": "Bearer good-token", **DEVICE_A}
        meeting_id = new_id()
        saved = client.put(f"/api/meetings/{meeting_id}", json=meeting(), headers=signed_in)
        assert saved.is_success
        listed = client.get("/api/meetings", headers=signed_in).json()["meetings"]
        assert meeting_id in [item["id"] for item in listed]
        # The same browser signed out (device key only) is someone else.
        assert client.get(f"/api/meetings/{meeting_id}", headers=DEVICE_A).status_code == 404
        # A rejected token is an error, not a silent switch to the device key.
        expired = client.get("/api/meetings", headers={"Authorization": "Bearer old", **DEVICE_A})
        assert expired.status_code == 401
        assert expired.json()["detail"] == "Your sign-in has expired. Sign in again."
    # Checked once per token, then cached.
    tokens = [r.headers["authorization"] for r in supabase.requests]
    assert tokens == ["Bearer good-token", "Bearer old"]
    assert str(supabase.requests[0].url) == "https://project.supabase.co/auth/v1/user"


@needs_database
def test_search_by_meaning_finds_an_english_turn_from_an_indonesian_query(
    database_url: str,
    fake_llm: FakeLLM,
    fake_tokens: FakeTokens,
    fake_embeddings: FakeEmbeddings,
) -> None:
    device = {"X-Contexa-Device": uuid.uuid4().hex + uuid.uuid4().hex}
    with build_client(
        fake_llm, fake_tokens, embeddings=fake_embeddings, database_url=database_url
    ) as client:
        meeting_id = new_id()
        saved = client.put(f"/api/meetings/{meeting_id}", json=meeting(), headers=device).json()
        assert saved == {"id": meeting_id, "passages": 5, "embedded": True}
        assert fake_embeddings.requests[-1]["input"][2] == (
            "Welcome back, everyone.\nSelamat datang kembali, semuanya."
        )
        # No word in common with "How much does the Pro plan cost per month?".
        results = client.get(
            "/api/meetings/search", params={"q": "berapa harganya"}, headers=device
        ).json()
    assert results["semantic"] is True
    top = results["hits"][0]
    assert top["text"] == "How much does the Pro plan cost per month?"
    assert (top["meetingId"], top["kind"], top["turnId"], top["atMs"]) == (
        meeting_id,
        "turn",
        "s1-t1",
        3000,
    )
    assert top["title"] == "Notewave demo day" and top["score"] > 0.9
    assert json.dumps(results, ensure_ascii=False).count("Welcome back") == 0


@needs_database
def test_search_by_words_without_embeddings(history: TestClient) -> None:
    device = {"X-Contexa-Device": uuid.uuid4().hex + uuid.uuid4().hex}
    meeting_id = new_id()
    assert history.put(f"/api/meetings/{meeting_id}", json=meeting(), headers=device).is_success
    results = history.get(
        "/api/meetings/search", params={"q": "optimistic locking"}, headers=device
    ).json()
    assert results["semantic"] is False
    kinds = {hit["kind"] for hit in results["hits"]}
    assert kinds == {"answer", "recap"}
    answer = next(hit for hit in results["hits"] if hit["kind"] == "answer")
    assert answer["turnId"] == "s1-t2" and answer["speaker"] is None
    # LIKE wildcards in the query are plain characters.
    none = history.get("/api/meetings/search", params={"q": "%"}, headers=device).json()
    assert none["hits"] == []


@needs_database
def test_saved_without_vectors_when_embeddings_fail(
    database_url: str,
    fake_llm: FakeLLM,
    fake_tokens: FakeTokens,
    fake_embeddings: FakeEmbeddings,
) -> None:
    fake_embeddings.failing = True
    device = {"X-Contexa-Device": uuid.uuid4().hex + uuid.uuid4().hex}
    with build_client(
        fake_llm, fake_tokens, embeddings=fake_embeddings, database_url=database_url
    ) as client:
        meeting_id = new_id()
        saved = client.put(f"/api/meetings/{meeting_id}", json=meeting(), headers=device).json()
        assert saved["embedded"] is False
        # The query can't be embedded either: words still find it.
        search = client.get("/api/meetings/search", params={"q": "Pro plan"}, headers=device)
        results = search.json()
    assert results["semantic"] is False
    assert results["hits"][0]["text"] == "How much does the Pro plan cost per month?"
