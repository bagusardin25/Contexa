# Contexa API

FastAPI backend for Contexa: AssemblyAI streaming tokens, final-turn translation and
question detection through the AssemblyAI LLM Gateway, document parsing and retrieval,
and grounded answer suggestions.

## Architecture

```text
Browser ──audio (PCM16, 16 kHz)──► AssemblyAI Streaming STT
   │  ▲                                   │
   │  └──────── partial + final turns ────┘
   │
   ├─ POST /api/sessions/{id}/stream-token   short-lived token + WebSocket URL
   ├─ POST /api/sessions/{id}/documents      parse → chunk → index
   └─ WS   /ws/sessions/{id}                 final turns in, results out
                     │
                     ▼
        turn analysis (LLM Gateway, one structured call)
          → translation + classification + search keywords
        if the turn needs an answer:
          → retrieve chunks (BM25) → grounded answer (LLM Gateway)
```

- Audio goes from the browser straight to AssemblyAI with a token minted here. The raw
  `ASSEMBLYAI_API_KEY` never leaves the server.
- Only finalized turns (`end_of_turn = true`) reach the backend. Partials stay in the UI.
- Every step fails on its own. A failed translation or answer is reported as an event, and
  the transcript keeps flowing.
- Speech-model routing: English, Japanese, and mixed sessions use `universal-3-5-pro`.
  Indonesian and "other" sessions use `whisper-rt`.

## Develop

Requires Python 3.11+ and [uv](https://docs.astral.sh/uv/).

```bash
cp .env.example .env          # add ASSEMBLYAI_API_KEY
uv sync
uv run uvicorn app.main:app --reload --port 8000
uv run pytest                 # AssemblyAI is mocked; no key or network needed
uv run ruff check . && uv run ruff format --check .
```

Interactive docs: http://localhost:8000/docs. Without a key the server still starts. Token
and LLM calls then fail with a clear message, and turn classification falls back to a
heuristic.

## HTTP API

JSON is camelCase to match the web app's TypeScript types.

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/sessions` | Create a session (`speakerLanguage`, `displayLanguage`, `responseLanguage`, `speakerLabels`, `title`) |
| `GET` | `/api/sessions/{id}` | Session, speech model, documents, turn count |
| `POST` | `/api/sessions/{id}/end` | Mark the session ended |
| `GET` | `/api/sessions/{id}/turns` | Stored transcript and suggestions |
| `POST` | `/api/sessions/{id}/stream-token` | AssemblyAI token plus a ready-to-open `websocketUrl` |
| `POST` | `/api/sessions/{id}/documents` | Upload PDF, DOCX, MD, or TXT (multipart field `file`, max 10 MB) |
| `DELETE` | `/api/sessions/{id}/documents/{docId}` | Remove a document from retrieval |
| `POST` | `/api/sessions/{id}/answer` | Manual "Generate answer" for a turn (`{"turnId": "..."}`) |
| `GET` | `/health` | Liveness and whether AssemblyAI is configured |

## WebSocket protocol: `/ws/sessions/{id}`

The origin must be listed in `CORS_ORIGINS`.

Browser → server:

```json
{"type": "turn_final", "turn": {"id": "t7", "speaker": "B", "text": "How do you handle concurrent updates?", "detectedLanguage": "en", "startedAtMs": 41000, "endedAtMs": 44800}}
{"type": "request_answer", "turnId": "t7"}
{"type": "retry_translation", "turnId": "t7"}
```

Server → browser. These match `SessionEvent` in `apps/web/types/session.ts`:

`translation_done`, `translation_failed`, `turn_classified`, `suggestion_started`,
`suggestion_evidence`, `suggestion_ready`, `suggestion_failed`, and `error` for invalid
messages.

## Layout

```text
app/
  api/           REST routes and the WebSocket
  assemblyai/    speech-model routing, streaming tokens
  conversation/  final-turn pipeline (analysis → retrieval → answer)
  documents/     upload validation, parsing, chunking
  rag/           tokenizer and BM25 index (lexical fallback per PRD §16)
  llm/           LLM Gateway client and prompts
  models/        Pydantic contracts (API, events, LLM structured outputs)
  store/         in-memory session store
tests/           pytest suite with a fake LLM Gateway and token endpoint
```

## Not done yet

- Persistence in Supabase Postgres (sessions currently live in memory, 12-hour TTL).
- Embedding retrieval with pgvector. BM25 is the working fallback.
- Keyterm boosting for streaming, derived from uploaded documents.
- A real run against AssemblyAI. The API shapes follow the implementation guide and the
  current docs, but they haven't been exercised with a live key yet.
