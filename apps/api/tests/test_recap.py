from .conftest import ORIGIN, FakeLLM, FakeTokens, build_client

TURNS = [
    {"speaker": "A", "text": "Welcome back, everyone.", "type": "statement"},
    {
        "speaker": "B",
        "text": "How does your application handle concurrent updates?",
        "type": "question",
    },
]


def test_recap_of_a_finished_conversation(client, fake_llm: FakeLLM) -> None:
    response = client.post(
        "/api/recap",
        json={"title": "Demo day", "language": "id", "turns": TURNS},
        headers={"Origin": ORIGIN},
    )
    assert response.status_code == 200
    assert response.json() == {
        "summary": "Tim membahas cara Notewave menangani pembaruan bersamaan.",
        "keyPoints": ["Optimistic locking dengan kolom version", "Sinkronisasi lewat Supabase"],
        "actionItems": ["Speaker A: kirim dokumen arsitektur"],
        "openQuestions": ["Kapan harga diumumkan?"],
    }
    assert response.headers["access-control-allow-origin"] == ORIGIN

    call = fake_llm.calls("session_recap")[0]
    assert call["model"] == "claude-sonnet-4-6"  # the answer model: one call per session
    system, user = (message["content"] for message in call["messages"])
    assert "Write every field in Indonesian" in system
    assert "Conversation: Demo day" in user
    assert "[Speaker B] (question) How does your application handle" in user
    assert "left out" not in user


def test_long_transcripts_keep_the_latest_turns(client, fake_llm: FakeLLM) -> None:
    turns = [{"speaker": "A", "text": f"Point number {i}. " + "x" * 400} for i in range(60)]
    response = client.post("/api/recap", json={"language": "en", "turns": turns})
    assert response.status_code == 200
    user = fake_llm.calls("session_recap")[0]["messages"][1]["content"]
    assert "Point number 59." in user and "Point number 0." not in user
    assert "turns are left out for length" in user
    assert "Conversation: (untitled)" in user


def test_recap_items_are_capped(client, fake_llm: FakeLLM) -> None:
    fake_llm.responses["session_recap"] = {
        "summary": "s",
        "key_points": [f"p{i}" for i in range(9)] + ["  "],
        "action_items": [],
        "open_questions": [],
    }
    body = client.post("/api/recap", json={"turns": TURNS}).json()
    assert body["keyPoints"] == ["p0", "p1", "p2", "p3", "p4"]


def test_recap_failures_carry_the_reason(client, fake_llm: FakeLLM) -> None:
    fake_llm.failing.add("session_recap")
    response = client.post("/api/recap", json={"turns": TURNS})
    assert response.status_code == 502
    assert "returned HTTP 504" in response.json()["detail"]

    fake_llm.failing.clear()
    fake_llm.responses["session_recap"] = {"summary": "only a summary"}
    response = client.post("/api/recap", json={"turns": TURNS})
    assert response.status_code == 502
    assert response.json()["detail"] == "The model returned a recap in an unexpected shape."


def test_recap_without_an_llm_is_a_clear_503(fake_llm: FakeLLM, fake_tokens: FakeTokens) -> None:
    with build_client(fake_llm, fake_tokens, llm_provider="groq") as client:
        response = client.post("/api/recap", json={"turns": TURNS})
    assert response.status_code == 503
    assert response.json()["detail"] == "LLM_API_KEY is not configured on the server."
    assert fake_llm.requests == []


def test_recap_validates_the_transcript(client) -> None:
    assert client.post("/api/recap", json={"turns": []}).status_code == 422
    assert client.post("/api/recap", json={"turns": [{"text": ""}]}).status_code == 422
    assert client.post("/api/recap", json={"language": "xx", "turns": TURNS}).status_code == 422
