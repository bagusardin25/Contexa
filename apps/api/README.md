# Contexa API

FastAPI backend for Contexa: AssemblyAI streaming tokens, final-turn translation and
question detection, documents from files and links, hybrid retrieval (BM25 + embeddings),
keyterms, grounded answer suggestions, the session recap, and the meeting history. The LLM
calls go to the AssemblyAI LLM Gateway or to any OpenAI-compatible API (Groq, OpenRouter,
Gemini, OpenAI, a local server).

## Architecture

```text
Browser ──audio (PCM16, 16 kHz)──► AssemblyAI Streaming STT  ◄── keyterms_prompt
   │  ▲                                   │                    (from the documents)
   │  └──────── partial + final turns ────┘
   │
   ├─ POST  /api/sessions/{id}/documents      parse → chunk → index → embed → keyterms
   ├─ POST  /api/sessions/{id}/documents/import   fetch a page, PDF, or GitHub repo, then the same
   ├─ PATCH /api/sessions/{id}                languages chosen before Start
   ├─ POST  /api/sessions/{id}/stream-token   short-lived token + WebSocket URL
   └─ WS    /ws/sessions/{id}                 final turns in, results out
                     │
                     ▼
        turn analysis (LLM, fast model, one structured call)
          → translation + classification + search keywords
        if the turn needs an answer:
          → retrieve chunks (BM25 + embeddings, fused) → grounded answer (LLM, main model)

   POST /api/recap                  the recap, once the session stops
   PUT  /api/meetings/{id}          the finished session → Postgres + pgvector (history)
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
- Retrieval: BM25 finds exact names and identifiers; embeddings find passages that say the same
  thing in other words or another language. Both rankings are merged by reciprocal rank fusion,
  and a semantic match must clear `RETRIEVAL_MIN_SIMILARITY`. Vectors stay in memory with the
  session; when embeddings fail, BM25 still answers.
- Link import: every hop (redirects included) must be http(s) on a default port and resolve
  only to public addresses; bodies are streamed with a size cap. A GitHub repository is one
  zipball request and becomes one document whose sections are its README and docs files.

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
| `LLM_TIMEOUT_SECONDS` | `15` | Per LLM (and embeddings) call |
| `MAX_UPLOAD_BYTES` | `10485760` | Per document |
| `EMBEDDING_PROVIDER` | (follows `LLM_PROVIDER` for `gemini`/`openai`, else `none`) | Semantic search: `gemini`, `openai`, `custom`, or `none` |
| `EMBEDDING_API_KEY` | (none; the LLM key when the provider is the same) | The embeddings provider's key, e.g. a free Gemini key next to Groq |
| `EMBEDDING_MODEL` | `gemini-embedding-001` / `text-embedding-3-small` | Embedding model |
| `EMBEDDING_BASE_URL` | (provider default) | Required for `custom` (any OpenAI-compatible `/embeddings`) |
| `EMBEDDING_DIMENSIONS` | (model default) | Shorter vectors, where the model supports it |
| `RETRIEVAL_MIN_SIMILARITY` | `0.5` | Cosine similarity a passage needs before an answer may cite it |
| `MAX_IMPORT_BYTES` | `5242880` | Largest page or file a link may bring |
| `MAX_REPO_DOWNLOAD_BYTES` | `31457280` | Largest GitHub zipball |
| `GITHUB_TOKEN` | (none) | Private repositories, and more than 60 GitHub downloads an hour |
| `DATABASE_URL` | (none) | Postgres with pgvector for the meeting history; empty = history off |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | (none) | Check Supabase access tokens, so a signed-in user's history follows the account |

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
| `POST` | `/api/sessions` | Create a session (`speakerLanguage`, `displayLanguage`, `responseLanguage`, `speakerLabels`, `answerStyle`, `title`) |
| `GET` | `/api/sessions/{id}` | Session, speech model, documents, turn count, current `keyterms` |
| `PATCH` | `/api/sessions/{id}` | Change any of the settings above; unsent fields stay |
| `POST` | `/api/sessions/{id}/reset` | New conversation: turns and answers cleared, documents kept |
| `POST` | `/api/sessions/{id}/end` | Mark the session ended |
| `GET` | `/api/sessions/{id}/turns` | Stored transcript and suggestions |
| `POST` | `/api/sessions/{id}/stream-token` | AssemblyAI token plus a ready-to-open `websocketUrl` and the `keyterms` it carries |
| `POST` | `/api/sessions/{id}/documents` | Upload PDF, DOCX, MD, or TXT (multipart `file`, optional `documentId`, max 10 MB); returns status, chunks, and `keyterms` |
| `DELETE` | `/api/sessions/{id}/documents/{docId}` | Remove a document from retrieval and keyterms |
| `POST` | `/api/sessions/{id}/answer` | Manual "Generate answer" for a turn (`{"turnId": "...", "style": "technical"}`; a new `style` redrafts an existing answer) |
| `POST` | `/api/sessions/{id}/documents/import` | A document from a link (`{"url": "...", "documentId": "..."}`): a web page, a PDF or Markdown file, or a GitHub repository (README + docs; a `blob` URL is one file). 422 bad link or private address, 413 too big, 415 not a document, 429 GitHub rate limit, 409 duplicate id or too many documents, 502/504 fetch failed. A missing repository is 422, not 404 (404 means "unknown session" to the web app). |
| `POST` | `/api/recap` | Recap of a finished conversation from the transcript the browser sends (`title`, `language`, `turns` with `speaker`, `text`, `type`): `summary`, `keyPoints`, `actionItems`, `openQuestions`. 503 without an LLM, 502 with the provider's reason. |
| `PUT` | `/api/meetings/{id}` | Save a finished session to the history (`title`, `startedAt`, `endedAt`, `speakerLanguage`, `displayLanguage`, `turns`, `answers`, `recap`); idempotent, so it is saved again after Retry recap. Passages are embedded when embeddings are on. Returns `{id, passages, embedded}`. |
| `GET` | `/api/meetings` | The owner's saved sessions, newest first (no transcripts) |
| `GET` | `/api/meetings/{id}` | One session, with everything the browser saved under `data` |
| `DELETE` | `/api/meetings/{id}` | Delete a session: 204, or 404 |
| `GET` | `/api/meetings/search?q=` | Search every saved session: pgvector nearest passages fused with Postgres full-text matches. `{semantic, hits: [{meetingId, title, startedAt, kind, speaker, text, atMs, turnId, score}]}` |
| `GET` | `/health` | Liveness, whether AssemblyAI is configured, the LLM provider, its models, any configuration problem, `embeddingModel` (null = keyword search only), and `historyEnabled` |

The `/api/meetings` routes answer 503 when `DATABASE_URL` isn't set (or the database couldn't be
reached at startup). The owner is a signed-in Supabase user (`Authorization: Bearer <access
token>`, checked with Supabase's `/auth/v1/user` and cached for 5 minutes), or else the
browser's device key (`X-Contexa-Device`, 32 to 128 characters, stored hashed). Neither is
401. Another owner's session answers 404, including a `PUT` to its id.

Tables live in a `contexa` schema with row level security on and no policies, so Supabase's
public REST API can't read them; the API connects as a privileged role and filters by owner.
The schema is created on first connect (`create extension if not exists vector` included).

## WebSocket protocol: `/ws/sessions/{id}`

The origin must be listed in `CORS_ORIGINS`.

Browser → server:

```json
{"type": "turn_final", "turn": {"id": "s1-t7", "speaker": "B", "text": "How do you handle concurrent updates?", "detectedLanguage": "en", "startedAtMs": 41000, "endedAtMs": 44800}}
{"type": "request_answer", "turnId": "s1-t7"}
{"type": "request_answer", "turnId": "s1-t7", "style": "concise"}
{"type": "retry_translation", "turnId": "s1-t7"}
```

A `turn_final` for a turn the server already has is ignored, so clients can safely re-send.
`request_answer` returns the existing answer unless it failed or names another `style`
(`concise`, `professional`, `technical`, `casual`; the session's `answerStyle` by default),
which drafts a replacement.

Server → browser. These match `SessionEvent` in `apps/web/types/session.ts`:

`translation_done`, `translation_failed`, `turn_classified`, `suggestion_started`,
`suggestion_evidence`, `suggestion_ready`, `suggestion_failed`, and `error` for invalid
messages.

## Layout

```text
app/
  api/           REST routes, the WebSocket, meeting history, sign-in checks
  assemblyai/    speech-model routing, streaming tokens
  conversation/  final-turn pipeline (analysis → retrieval → answer) and the session recap
  documents/     upload validation, parsing, chunking, keyterms, link import (SSRF-guarded)
  rag/           tokenizer, BM25 index, in-memory vectors, hybrid search (RRF)
  llm/           LLM and embeddings clients (OpenAI-compatible or the LLM Gateway), prompts
  models/        Pydantic contracts (API, events, LLM structured outputs, history)
  store/         in-memory session store; Postgres + pgvector history (asyncpg)
scripts/         smoke test for the first live run
tests/           pytest suite with a fake LLM, embeddings, web, and token endpoint
```

The history tests (`tests/test_history.py`) need Postgres with pgvector and are skipped
without it:

```bash
docker run -d --name contexa-pg -e POSTGRES_HOST_AUTH_METHOD=trust -p 127.0.0.1:54329:5432 pgvector/pgvector:pg16
CONTEXA_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:54329/postgres uv run pytest
```

## Operations

- Live sessions live in memory (12-hour TTL), so run **one worker**; the web app recreates a
  session and re-uploads its documents after a restart. Saved sessions live in Postgres.
- Without `DATABASE_URL`, or when the database can't be reached at startup, the API runs
  without history (logged, and `historyEnabled: false` on `/health`).
- Deployment: see [docs/DEPLOY.md](../../docs/DEPLOY.md).
