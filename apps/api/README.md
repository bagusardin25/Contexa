# Contexa API

FastAPI backend for Contexa: AssemblyAI streaming tokens, final-turn translation and
question detection, document parsing, retrieval, and keyterms, and grounded answer
suggestions. The LLM calls go to the AssemblyAI LLM Gateway or to any OpenAI-compatible API
(Groq, OpenRouter, Gemini, OpenAI, a local server).

## Architecture

```text
Browser ──audio (PCM16, 16 kHz)──► AssemblyAI Streaming STT  ◄── keyterms_prompt
   │  ▲                                   │                    (from the documents)
   │  └──────── partial + final turns ────┘
   │
   ├─ POST  /api/sessions/{id}/documents      parse → chunk → index → keyterms
   ├─ PATCH /api/sessions/{id}                languages chosen before Start
   ├─ POST  /api/sessions/{id}/stream-token   short-lived token + WebSocket URL
   └─ WS    /ws/sessions/{id}                 final turns in, results out
                     │
                     ▼
        turn analysis (LLM, fast model, one structured call)
          → translation + classification + search keywords
        if the turn needs an answer:
          → retrieve chunks (BM25) → grounded answer (LLM, main model)
```

- Audio goes from the browser straight to AssemblyAI with a token minted here. The raw
  `ASSEMBLYAI_API_KEY` never leaves the server.
- Only finalized turns (`end_of_turn = true`) reach the backend. Partials stay in the UI.
- Every step fails on its own. A failed translation or answer is reported as an event with
  the provider's reason, and the transcript keeps flowing.
- Speech-model routing: English, Japanese, and mixed sessions use `universal-3-5-pro`
  (speaker labels, keyterms; no `format_turns`, since it always formats). Indonesian and
  "other" sessions use `whisper-rt`.
- Keyterms: each document yields up to 40 distinctive terms (product names, acronyms,
  identifiers, code spans). The session merges them into `keyterms_prompt` (100 terms,
  50 characters each), so the transcript spells the project's jargon right.

## Develop

Requires Python 3.11+ and [uv](https://docs.astral.sh/uv/).

```bash
cp .env.example .env          # add ASSEMBLYAI_API_KEY and an LLM provider key
uv sync
uv run uvicorn app.main:app --reload --port 8000
uv run pytest                 # AssemblyAI and the LLM are mocked; no key or network needed
uv run ruff check . && uv run ruff format --check .
```

Interactive docs: http://localhost:8000/docs. Without keys the server still starts. Token
and LLM calls then fail with a clear message, and turn classification falls back to a
heuristic.

### Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `ASSEMBLYAI_API_KEY` | (none) | Required for streaming tokens (speech always runs on AssemblyAI) |
| `LLM_PROVIDER` | `assemblyai` | Who translates and answers: `groq`, `openrouter`, `gemini`, `openai`, `custom` (any OpenAI-compatible API), or `assemblyai` (the LLM Gateway on `ASSEMBLYAI_API_KEY`) |
| `LLM_API_KEY` | (none) | The provider's key; not used for `assemblyai` |
| `LLM_MODEL` | (none; `claude-sonnet-4-6` for `assemblyai`) | Grounded answers |
| `LLM_FAST_MODEL` | (none; `claude-haiku-4-5` for `assemblyai`) | Per-turn translation + question detection; empty = `LLM_MODEL` |
| `LLM_REASONING_EFFORT` | (none) | Sent as `reasoning_effort` (e.g. `low`) to reasoning models; not sent to OpenRouter |
| `LLM_BASE_URL` | (provider default) | Required for `custom`; replaces a named provider's URL |
| `CORS_ORIGINS` | `http://localhost:3000` | Allowed web origins (HTTP and WebSocket), comma-separated |
| `STREAMING_TOKEN_TTL_SECONDS` | `60` | How long a streaming token can be used to connect |
| `STREAMING_MAX_SESSION_SECONDS` | `3600` | Longest stream per token (caps billable time) |
| `STREAMING_TOKENS_PER_SESSION` | `30` | Tokens per session (each start or reconnect uses one) |
| `LLM_TIMEOUT_SECONDS` | `15` | Per LLM call |
| `MAX_UPLOAD_BYTES` | `10485760` | Per document |

The AssemblyAI LLM Gateway isn't part of AssemblyAI's free plan: free credits cover
speech-to-text only. On a free account, point the LLM at a free tier instead, e.g.
`LLM_PROVIDER=groq` (see `.env.example`). `ASSEMBLYAI_LLM_MODEL` and
`ASSEMBLYAI_LLM_FAST_MODEL` still set the gateway's models when `LLM_MODEL` is empty.

Every call asks for a strict JSON-schema structured output. What each model can't do is
learned from its refusals and remembered for that model: no JSON schema falls back to JSON
mode, then to the schema described in the prompt; a rejected `temperature` or
`reasoning_effort` is dropped; `max_completion_tokens` replaces `max_tokens` when the model
asks for it (always for OpenAI). A 429 is retried once after `Retry-After` (at most 5 s), and a
reply cut off at the token limit (reasoning models think first) is retried once with twice
the budget.

### First live run

```bash
uv run python -m scripts.smoke_assemblyai [--wav question.wav] [--skip-llm] [--languages en id]
```

Checks, with the server's own settings, prompts, schemas, and URLs: the streaming token, a
short stream per speech model (printing the `Turn` fields AssemblyAI sends), the LLM
provider's model list (with the current `:free` models on OpenRouter), one turn analysis on
the fast model, and one grounded answer on the main model. Each failure prints the reason
and a next step. The WAV must be 16 kHz mono PCM16
(`ffmpeg -i in.m4a -ar 16000 -ac 1 -sample_fmt s16 out.wav`).

## HTTP API

JSON is camelCase to match the web app's TypeScript types.

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/sessions` | Create a session (`speakerLanguage`, `displayLanguage`, `responseLanguage`, `speakerLabels`, `title`) |
| `GET` | `/api/sessions/{id}` | Session, speech model, documents, turn count, current `keyterms` |
| `PATCH` | `/api/sessions/{id}` | Change any of the settings above; unsent fields stay |
| `POST` | `/api/sessions/{id}/reset` | New conversation: turns and answers cleared, documents kept |
| `POST` | `/api/sessions/{id}/end` | Mark the session ended |
| `GET` | `/api/sessions/{id}/turns` | Stored transcript and suggestions |
| `POST` | `/api/sessions/{id}/stream-token` | AssemblyAI token plus a ready-to-open `websocketUrl` and the `keyterms` it carries |
| `POST` | `/api/sessions/{id}/documents` | Upload PDF, DOCX, MD, or TXT (multipart `file`, optional `documentId`, max 10 MB); returns status, chunks, and `keyterms` |
| `DELETE` | `/api/sessions/{id}/documents/{docId}` | Remove a document from retrieval and keyterms |
| `POST` | `/api/sessions/{id}/answer` | Manual "Generate answer" for a turn (`{"turnId": "..."}`) |
| `GET` | `/health` | Liveness, whether AssemblyAI is configured, and the LLM provider, its models, and any configuration problem |

## WebSocket protocol: `/ws/sessions/{id}`

The origin must be listed in `CORS_ORIGINS`.

Browser → server:

```json
{"type": "turn_final", "turn": {"id": "s1-t7", "speaker": "B", "text": "How do you handle concurrent updates?", "detectedLanguage": "en", "startedAtMs": 41000, "endedAtMs": 44800}}
{"type": "request_answer", "turnId": "s1-t7"}
{"type": "retry_translation", "turnId": "s1-t7"}
```

A `turn_final` for a turn the server already has is ignored, so clients can safely re-send.

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
  documents/     upload validation, parsing, chunking, keyterms
  rag/           tokenizer and BM25 index (lexical fallback per PRD §16)
  llm/           LLM client (AssemblyAI LLM Gateway or OpenAI-compatible) and prompts
  models/        Pydantic contracts (API, events, LLM structured outputs)
  store/         in-memory session store
scripts/         smoke test for the first live run
tests/           pytest suite with a fake LLM and token endpoint
```

## Not done yet

- A run against AssemblyAI and an LLM provider with real keys (use the smoke test above).
- Persistence in Supabase Postgres. Sessions live in memory (12-hour TTL), so run a single
  worker; the web app recreates a session and re-uploads documents after a restart.
- Embedding retrieval with pgvector. BM25 is the working fallback.
