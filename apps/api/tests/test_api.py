from typing import Any
from urllib.parse import parse_qs, urlparse

import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from .conftest import (
    ORIGIN,
    README,
    STATEMENT_ANALYSIS,
    FakeLLM,
    FakeTokens,
    build_client,
    make_pdf,
)


def create_session(client: TestClient, **config: Any) -> str:
    response = client.post("/api/sessions", json={"displayLanguage": "id", **config})
    assert response.status_code == 201
    return response.json()["id"]


def upload(client: TestClient, session_id: str, name: str, data: bytes):
    return client.post(f"/api/sessions/{session_id}/documents", files={"file": (name, data)})


def turn(turn_id: str, text: str, **extra: Any) -> dict[str, Any]:
    return {
        "type": "turn_final",
        "turn": {
            "id": turn_id,
            "speaker": "B",
            "text": text,
            "detectedLanguage": "en",
            "startedAtMs": 1000,
            "endedAtMs": 4000,
            **extra,
        },
    }


def receive_until(ws, event_type: str, limit: int = 10) -> list[dict[str, Any]]:
    events = []
    for _ in range(limit):
        events.append(ws.receive_json())
        if events[-1]["type"] == event_type:
            return events
    raise AssertionError(f"never received {event_type}: {events}")


def test_health(client: TestClient) -> None:
    assert client.get("/health").json() == {
        "status": "ok",
        "assemblyaiConfigured": True,
        "llmModel": "claude-sonnet-4-6",
        "llmAnalysisModel": "claude-haiku-4-5",
    }


def test_create_and_get_session_uses_camel_case(client: TestClient) -> None:
    session_id = create_session(client, speakerLanguage="id", title="Demo")
    body = client.get(f"/api/sessions/{session_id}").json()
    assert body["speechModel"] == "whisper-rt"
    assert body["config"] == {
        "title": "Demo",
        "speakerLanguage": "id",
        "displayLanguage": "id",
        "responseLanguage": "auto",
        "speakerLabels": True,
    }
    assert client.get("/api/sessions/ses_missing").status_code == 404
    assert client.post("/api/sessions", json={"displayLanguage": "fr"}).status_code == 422


def test_stream_token(client: TestClient, fake_tokens: FakeTokens) -> None:
    session_id = create_session(client, speakerLanguage="ja")
    body = client.post(f"/api/sessions/{session_id}/stream-token").json()

    assert body["token"] == "temp-token-123"
    assert body["speechModel"] == "universal-3-5-pro"
    query = parse_qs(urlparse(body["websocketUrl"]).query)
    assert query["token"] == ["temp-token-123"]
    assert query["sample_rate"] == ["16000"]

    request = fake_tokens.requests[0]
    assert request.url.path == "/v3/token"
    assert request.url.params["expires_in_seconds"] == "60"
    assert request.headers["authorization"] == "test-key"


def test_stream_token_limits_and_errors(fake_llm: FakeLLM, fake_tokens: FakeTokens) -> None:
    with build_client(fake_llm, fake_tokens, streaming_tokens_per_session=1) as client:
        session_id = create_session(client)
        assert client.post(f"/api/sessions/{session_id}/stream-token").status_code == 200
        assert client.post(f"/api/sessions/{session_id}/stream-token").status_code == 429

        ended = create_session(client)
        client.post(f"/api/sessions/{ended}/end")
        assert client.post(f"/api/sessions/{ended}/stream-token").status_code == 409

    with build_client(fake_llm, fake_tokens, assemblyai_api_key=None) as client:
        session_id = create_session(client)
        response = client.post(f"/api/sessions/{session_id}/stream-token")
        assert response.status_code == 503
        assert "ASSEMBLYAI_API_KEY" in response.json()["detail"]
        assert client.get("/health").json()["assemblyaiConfigured"] is False


def test_document_upload_lifecycle(client: TestClient) -> None:
    session_id = create_session(client)

    ready = upload(client, session_id, "README.md", README)
    assert ready.status_code == 201
    assert ready.json()["status"] == "ready" and ready.json()["chunkCount"] >= 4

    pdf = upload(client, session_id, "architecture.pdf", make_pdf(["Optimistic locking"])).json()
    assert pdf["status"] == "ready" and pdf["kind"] == "pdf"

    fake = upload(client, session_id, "fake.pdf", b"not really a pdf").json()
    assert fake["status"] == "failed" and "valid PDF" in fake["error"]

    documents = client.get(f"/api/sessions/{session_id}").json()["documents"]
    assert [d["name"] for d in documents] == ["README.md", "architecture.pdf", "fake.pdf"]

    doc_id = ready.json()["id"]
    assert client.delete(f"/api/sessions/{session_id}/documents/{doc_id}").status_code == 204
    assert client.delete(f"/api/sessions/{session_id}/documents/{doc_id}").status_code == 404


@pytest.mark.parametrize(
    ("name", "data", "status"),
    [("malware.exe", b"MZ", 415), ("empty.txt", b"", 400), ("big.txt", b"x" * 2048, 413)],
)
def test_document_upload_rejections(
    fake_llm: FakeLLM, fake_tokens: FakeTokens, name: str, data: bytes, status: int
) -> None:
    with build_client(fake_llm, fake_tokens, max_upload_bytes=1024) as client:
        session_id = create_session(client)
        assert upload(client, session_id, name, data).status_code == status


def test_socket_question_flow_is_grounded(client: TestClient, fake_llm: FakeLLM) -> None:
    session_id = create_session(client)
    upload(client, session_id, "README.md", README)

    with client.websocket_connect(f"/ws/sessions/{session_id}", headers={"origin": ORIGIN}) as ws:
        ws.send_json(turn("t1", "How does your application handle concurrent updates?"))
        events = receive_until(ws, "suggestion_ready")

    assert [e["type"] for e in events] == [
        "translation_done",
        "turn_classified",
        "suggestion_started",
        "suggestion_evidence",
        "suggestion_ready",
    ]
    translation, classified, started, evidence, ready = events
    assert translation["turnId"] == "t1"
    assert translation["result"]["targetLanguage"] == "id"
    assert translation["result"]["technicalTermsPreserved"] == ["concurrent updates"]
    assert classified["classification"] == {
        "type": "question",
        "requiresAnswer": True,
        "confidence": 0.95,
    }
    assert started["trigger"] == "auto" and started["createdAtMs"] == 4000

    top = evidence["evidence"][0]
    assert top["documentName"] == "README.md" and top["location"] == "Conflict handling"
    assert "optimistic locking" in top["highlights"]

    answer = ready["answer"]
    assert answer["targetLanguage"] == "en" and answer["preferredLanguage"] == "id"
    assert answer["usedContext"] == [{"documentId": top["documentId"], "chunkId": top["chunkId"]}]

    # The answer prompt carried the retrieved excerpt, labelled C1.
    prompt = fake_llm.calls("grounded_answer")[0]["messages"][1]["content"]
    assert "[C1] README.md · Conflict handling" in prompt

    transcript = client.get(f"/api/sessions/{session_id}/turns").json()
    assert transcript["turns"][0]["suggestionId"] == ready["suggestionId"]
    assert "searchKeywords" not in transcript["turns"][0]
    assert transcript["suggestions"][0]["stage"] == "ready"


def test_socket_statement_waits_for_manual_request(client: TestClient, fake_llm: FakeLLM) -> None:
    fake_llm.responses["turn_analysis"] = STATEMENT_ANALYSIS
    session_id = create_session(client)

    with client.websocket_connect(f"/ws/sessions/{session_id}", headers={"origin": ORIGIN}) as ws:
        ws.send_json(turn("t1", "Welcome back, everyone."))
        assert [e["type"] for e in receive_until(ws, "turn_classified")] == [
            "translation_done",
            "turn_classified",
        ]
        ws.send_json({"type": "request_answer", "turnId": "t1"})
        events = receive_until(ws, "suggestion_ready")

    assert events[0]["trigger"] == "manual"
    assert events[1]["evidence"] == []  # no documents: nothing to cite
    assert fake_llm.calls("grounded_answer")[0]["messages"][1]["content"].count("No excerpt") == 1
    assert events[2]["answer"]["usedContext"] == []


def test_socket_failures_stay_isolated(client: TestClient, fake_llm: FakeLLM) -> None:
    fake_llm.failing = {"turn_analysis", "grounded_answer"}
    session_id = create_session(client)

    with client.websocket_connect(f"/ws/sessions/{session_id}", headers={"origin": ORIGIN}) as ws:
        ws.send_json(turn("t1", "Could you share the demo link?"))
        events = receive_until(ws, "suggestion_failed")
        types = [e["type"] for e in events]
        assert types[:2] == ["translation_failed", "turn_classified"]
        # Heuristic fallback still recognises the request, so an answer is attempted.
        assert events[1]["classification"]["requiresAnswer"] is True
        assert "HTTP 504" in events[-1]["message"]

        fake_llm.failing = set()
        ws.send_json({"type": "retry_translation", "turnId": "t1"})
        assert ws.receive_json()["type"] == "translation_done"
        ws.send_json({"type": "request_answer", "turnId": "t1"})
        retried = receive_until(ws, "suggestion_ready")

    suggestions = client.get(f"/api/sessions/{session_id}/turns").json()["suggestions"]
    # The failed attempt is replaced, not kept alongside the new one.
    assert [s["id"] for s in suggestions] == [retried[-1]["suggestionId"]]


def test_socket_ignores_duplicates_and_rejects_bad_input(
    client: TestClient, fake_llm: FakeLLM
) -> None:
    fake_llm.responses["turn_analysis"] = STATEMENT_ANALYSIS
    session_id = create_session(client)

    with client.websocket_connect(f"/ws/sessions/{session_id}", headers={"origin": ORIGIN}) as ws:
        ws.send_text("not json")
        assert ws.receive_json() == {"type": "error", "message": "Invalid message."}
        ws.send_json({"type": "turn_final", "turn": {"id": "bad id!", "text": "x"}})
        assert ws.receive_json()["type"] == "error"

        ws.send_json(turn("t1", "Welcome back."))
        receive_until(ws, "turn_classified")
        ws.send_json(turn("t1", "Welcome back."))  # resent after a reconnect
        ws.send_json({"type": "request_answer", "turnId": "missing"})
        assert ws.receive_json() == {"type": "error", "message": "Unknown turn: missing."}
        ws.send_json(turn("t2", "Thanks."))
        assert receive_until(ws, "turn_classified")[-1]["turnId"] == "t2"

    assert len(fake_llm.calls("turn_analysis")) == 2
    assert client.get(f"/api/sessions/{session_id}").json()["turnCount"] == 2


def test_socket_rejects_foreign_origins_and_unknown_sessions(client: TestClient) -> None:
    session_id = create_session(client)
    with pytest.raises(WebSocketDisconnect):
        with client.websocket_connect(
            f"/ws/sessions/{session_id}", headers={"origin": "https://evil.example"}
        ):
            pass
    with pytest.raises(WebSocketDisconnect):
        with client.websocket_connect("/ws/sessions/ses_missing", headers={"origin": ORIGIN}):
            pass


def test_answer_endpoint(client: TestClient) -> None:
    session_id = create_session(client)
    upload(client, session_id, "README.md", README)
    with client.websocket_connect(f"/ws/sessions/{session_id}", headers={"origin": ORIGIN}) as ws:
        ws.send_json(turn("t1", "How do you handle concurrent updates?"))
        ready = receive_until(ws, "suggestion_ready")[-1]

    # An existing suggestion is returned instead of generating a second one.
    body = client.post(f"/api/sessions/{session_id}/answer", json={"turnId": "t1"}).json()
    assert body["id"] == ready["suggestionId"] and body["stage"] == "ready"
    missing = client.post(f"/api/sessions/{session_id}/answer", json={"turnId": "nope"})
    assert missing.status_code == 404


def test_translation_skipped_when_already_in_display_language(
    client: TestClient, fake_llm: FakeLLM
) -> None:
    fake_llm.responses["turn_analysis"] = {**STATEMENT_ANALYSIS, "translation": ""}
    session_id = create_session(client, displayLanguage="en")
    with client.websocket_connect(f"/ws/sessions/{session_id}", headers={"origin": ORIGIN}) as ws:
        ws.send_json(turn("t1", "Welcome back."))
        assert ws.receive_json()["type"] == "turn_classified"
    system_prompt = fake_llm.calls("turn_analysis")[0]["messages"][0]["content"]
    assert 'translation: ""' in system_prompt


def test_analysis_and_answers_use_their_own_models(client: TestClient, fake_llm: FakeLLM) -> None:
    session_id = create_session(client)
    with client.websocket_connect(f"/ws/sessions/{session_id}", headers={"origin": ORIGIN}) as ws:
        ws.send_json(turn("t1", "How do you handle concurrent updates?"))
        receive_until(ws, "suggestion_ready")

    assert fake_llm.calls("turn_analysis")[0]["model"] == "claude-haiku-4-5"
    assert fake_llm.calls("turn_analysis")[0]["max_tokens"] == 1200
    assert fake_llm.calls("grounded_answer")[0]["model"] == "claude-sonnet-4-6"


def test_empty_fast_model_falls_back_to_the_main_model(
    fake_llm: FakeLLM, fake_tokens: FakeTokens
) -> None:
    with build_client(fake_llm, fake_tokens, assemblyai_llm_fast_model="") as client:
        assert client.get("/health").json()["llmAnalysisModel"] == "claude-sonnet-4-6"
        session_id = create_session(client)
        with client.websocket_connect(
            f"/ws/sessions/{session_id}", headers={"origin": ORIGIN}
        ) as ws:
            ws.send_json(turn("t1", "How do you handle concurrent updates?"))
            receive_until(ws, "suggestion_ready")
    assert fake_llm.calls("turn_analysis")[0]["model"] == "claude-sonnet-4-6"


def test_hallucinated_citations_are_dropped(client: TestClient, fake_llm: FakeLLM) -> None:
    fake_llm.responses["grounded_answer"] = {
        "question_summary": "?",
        "answer_preferred_language": "Jawaban",
        "answer_target_language": "Answer",
        "used_chunk_ids": ["C1", "C9", "C1"],
        "confidence_note": "note",
    }
    session_id = create_session(client)
    upload(client, session_id, "README.md", README)
    with client.websocket_connect(f"/ws/sessions/{session_id}", headers={"origin": ORIGIN}) as ws:
        ws.send_json(turn("t1", "How do you handle concurrent updates?"))
        ready = receive_until(ws, "suggestion_ready")[-1]
    assert len(ready["answer"]["usedContext"]) == 1
