# Contexa: handoff for the next agent

Written 2026-09-26 (Saturday) by the previous Claude Code session, which ran out of budget
mid-feature. Deadline: **Wednesday 30 September 2026, 11:00 EDT (22:00 WIB)**, AssemblyAI Voice
Agent Hackathon on lablab.ai.

## 0. Read this first

- Repo `bagusardin25/Contexa`. All recent work is on branch **`claude/eager-keller-qcurbs`**.
  `main` is at `521cea7` and behind. Push to `main` only when the owner explicitly asks (it was
  fast-forwarded twice on request, never force-pushed).
- The owner writes in Indonesian and wants short, direct replies with a clear recommendation.
  Code, comments, docs, and commit messages are in English.
- Before touching the voice pipeline, read `README.md`, `apps/api/README.md`,
  `apps/web/README.md`, and `docs/ASSEMBLYAI_IMPLEMENTATION_AND_HACKATHON_GUIDE.md`.
- `apps/web/AGENTS.md`: this is Next.js 16 with breaking changes; check
  `apps/web/node_modules/next/dist/docs/` before using a framework API you're unsure of.
- **Nothing has run against real keys yet.** Every test uses fakes. Ask the owner early for the
  output of `cd apps/api && uv run python -m scripts.smoke_assemblyai` (checks AssemblyAI streaming,
  the LLM, and embeddings with the real `.env`).
- The owner has no paid AssemblyAI plan: speech-to-text runs on free AssemblyAI credits; the LLM
  runs on a free tier (Groq recommended: `LLM_PROVIDER=groq`, see `apps/api/.env.example`).

## 1. The product

Live webinar/meeting copilot. Browser captures a tab, the microphone, or a local recording, streams
16 kHz PCM16 straight to AssemblyAI (Universal-3.5 Pro, or `whisper-rt` for Indonesian) with a
short-lived token from the FastAPI backend. Final turns go to the API over a WebSocket, which
translates and classifies each turn with a fast LLM, retrieves passages from the user's documents
(BM25, now fused with embeddings), and drafts a grounded answer plus a ready-to-say version. When
the session stops, it writes a recap. Keyterms from the documents are sent to AssemblyAI.

## 2. State of the branch

Commits, newest first: the commit adding this file (WIP: semantic retrieval, link import, DB
module), `07a2b74` recap / recording source / answer styles / preview fallback / TTS, `521cea7`
docs for free LLM tiers, `e40526b` provider label + free-tier model handling, `023d165`
provider-agnostic LLM, `07d3e07` local setup docs, `df34eab` live pipeline in the web app.

### Done and verified (unit tests + browser E2E: 23 scenarios in 3 LLM modes, all green)

Live pipeline with reconnects and API-restart recovery. Any LLM provider:
- `groq`, `openrouter`, `gemini`, `openai`, `custom`, or `assemblyai` (the LLM Gateway).
- Structured-output fallbacks, 429 retry, and reasoning-model handling.

Session features:
- Recap at Stop (`POST /api/recap`).
- **Audio file** source.
- Answer styles (Concise, Professional, Technical, Casual) with redraft.
- **Listen** (Web Speech API).

Resilience:
- The API status check retries while a sleeping free-tier API wakes up.
- `/session?preview` opens a scripted preview even when an API is configured.

### Done and unit-tested, NOT yet verified in the browser (in the last commit)

1. **Semantic retrieval** (API: `app/llm/embeddings.py`, `app/rag/vectors.py`, `app/rag/hybrid.py`,
   `app/documents/ingest.py`, pipeline `_retrieve`).
   - Uses any OpenAI-compatible `/embeddings` API. Vectors stay in memory per session and are
     fused with BM25 by reciprocal rank fusion.
   - Settings:

     | Setting | Default / notes |
     |---|---|
     | `EMBEDDING_PROVIDER` | `none`, `gemini`, `openai`, or `custom`. Empty follows `LLM_PROVIDER` when it is `gemini` or `openai` |
     | `EMBEDDING_API_KEY` | |
     | `EMBEDDING_MODEL` | `gemini-embedding-001` / `text-embedding-3-small` |
     | `EMBEDDING_BASE_URL` | |
     | `EMBEDDING_DIMENSIONS` | |
     | `RETRIEVAL_MIN_SIMILARITY` | 0.5 |

   - Groq users need `EMBEDDING_PROVIDER=gemini` plus a free Gemini key.
   - `/health` now returns `embeddingModel` (null when off). Documents get `embedded`.
   - The smoke test has an embeddings check.
   - TODO: show "· semantic search on {embeddingModel}" in the web's API status success line (add
     `embeddingModel: string | null` to `ApiHealth` in `apps/web/lib/api/client.ts`).
2. **Link import** (API: `app/documents/{html,fetch,importing}.py`,
   `POST /api/sessions/{id}/documents/import` with body `{url, documentId?}`).
   - Accepts a web page, PDF, or Markdown/text file.
   - A GitHub repo becomes **one** document (`kind: "repo"`) whose sections are README + docs
     files; a `blob` URL becomes a single file.
   - SSRF guard on every hop: http(s) only, default ports, public IPs only, capped sizes.
   - Status codes: 422 = bad link or private address, 413 = too big, 415 = not a document, 429 =
     GitHub rate limit, 409 = duplicate id or too many documents, 502/504 = fetch failed.
   - A missing GitHub repo returns 422 on purpose: the web client treats 404 as "session lost →
     recreate".
   - Settings: `MAX_IMPORT_BYTES` (5 MB), `MAX_REPO_DOWNLOAD_BYTES` (30 MB), `GITHUB_TOKEN`,
     `GITHUB_API_BASE_URL`, `IMPORT_ALLOW_PRIVATE_HOSTS` (tests only).
   - Web side:
     - `store.addLink(url)` → `LiveUploader.importLink` → `api.importDocument`.
     - "Paste a link" form in `components/session/context-panel.tsx`.
     - Imported documents show their source link, and are re-imported when the API session is
       recreated.
     - Disabled in preview.

Backend: 126 pytest tests pass (`uv run pytest`), ruff clean. Web: `npm run lint` and
`npx tsc --noEmit` clean.

### Started, NOT wired, NOT tested

- `apps/api/app/store/database.py`: asyncpg + pgvector store for meeting history.
  - Uses the `contexa` schema with RLS on and no policies, so Supabase's public REST API can't read
    it. Auto-migrates on connect.
  - Methods: `save_meeting`, `list_meetings`, `get_meeting`, `delete_meeting`, `search_semantic`
    (`<=>` cosine, filtered by `owner` and `embedding_model`), `search_text`.
  - The `vector` column has no fixed dimension, because models differ (Gemini 3072, OpenAI 1536).
  - `asyncpg` is already in `pyproject.toml`.

### Not started

Meeting history endpoints and web UI, the floating window (PiP), docs for the new settings,
deployment, video, slides.

## 3. Remaining work, in order

If time runs short, cut in this order: the floating window, then semantic *search of history*
(keep plain list/detail), then the whole history feature. Never cut: the real-key smoke test,
deployment, and the demo video.

### 3.1 Verify link import and semantic retrieval in the browser (1–2 h)

Extend the E2E harness in `e2e/` (see section 4):

- `e2e/fake_assemblyai.py`:
  - `GET /pages/notewave`: an HTML page with `<title>`, `<main>`, and `<h2>` sections. Put in a
    fact the sample docs don't have, e.g. pricing.
  - `GET /github/repos/{owner}/{repo}/zipball`: 302 to `/github/codeload/{owner}/{repo}.zip`, which
    serves a zip built in memory (`{root}/README.md`, `{root}/docs/architecture.md`).
  - `POST /v1/embeddings`: deterministic "concept" vectors. Copy `fake_vector` / `CONCEPTS` from
    `apps/api/tests/conftest.py`.
- `e2e/servers.sh`: when starting the API, add `IMPORT_ALLOW_PRIVATE_HOSTS=true
  GITHUB_API_BASE_URL=http://127.0.0.1:8100/github`. For a semantic mode, add
  `EMBEDDING_PROVIDER=custom EMBEDDING_BASE_URL=http://127.0.0.1:8100/v1 EMBEDDING_API_KEY=fake-key
  EMBEDDING_MODEL=fake-embed`.
- New scenarios:
  - Paste `http://127.0.0.1:8100/pages/notewave` → the document is Ready with its source link.
  - Paste `https://github.com/acme/notewave` → a `repo` document.
  - Ask a question only the imported page answers → the evidence cites it.
  - A private address shows the API's reason.
  - Removing the document works.
  - With embeddings on, make the fake LLM return empty `search_keywords` for an Indonesian
    question: only semantic search finds the passage. The context panel footer then says "and by
    meaning".

### 3.2 Meeting history on Postgres + pgvector (about a day)

**API**

- Settings:
  - `DATABASE_URL` (SecretStr). Supabase: Project Settings → Database → Connection string; prefer
    the session pooler, port 5432. The transaction pooler also works: `statement_cache_size=0` is
    set.
  - `SUPABASE_URL` and `SUPABASE_ANON_KEY` (the publishable key, the same values as the web's
    `NEXT_PUBLIC_SUPABASE_*`), used only to verify access tokens.
- `app/main.py` lifespan:
  - If `database_url` is set: `db = Database(dsn); await db.connect()`. On failure, log and run with
    history off; never crash.
  - Store it in `app.state.database`.
  - `/health` gets `historyEnabled`.
  - Add `injectable auth_transport` for tests.
- CORS: add `PUT` to `allow_methods`, and `Authorization` and `X-Contexa-Device` to
  `allow_headers`.
- Owner (`app/api/auth.py`):
  - `Authorization: Bearer <Supabase access token>` → `GET {SUPABASE_URL}/auth/v1/user` with header
    `apikey: <anon key>` and the bearer → `user:{id}`. Cache 5 minutes by sha256(token). Answer 401
    "Sign in again" when invalid.
  - Otherwise `X-Contexa-Device` (32–128 chars `[A-Za-z0-9_-]`) → `device:{sha256(key)[:40]}`.
  - Otherwise 401.
- Models (`app/models/history.py`, `CamelModel`):

  | Model | Fields |
  |---|---|
  | `MeetingTurn` | `id`, `speaker`, `text` ≤4000, `translation` ≤8000 or null, `type` or null, `requiresAnswer`, `startedAtMs` |
  | `MeetingAnswer` | `turnId`, `questionSummary`, `answerPreferredLanguage`, `answerTargetLanguage`, `style` or null, `sources: list[str]` ≤10 |
  | `MeetingIn` | `title` ≤120, `startedAt`, `endedAt`, `speakerLanguage`, `displayLanguage`, `turns` ≤2000, `answers` ≤500, `recap: RecapOut \| null` |
- Router `app/api/history.py`. Every route returns 503 "History isn't set up on this server
  (DATABASE_URL)." when there is no database.
  - `PUT /api/meetings/{id}` (id `^[A-Za-z0-9_-]{8,64}$`):
    - Passages: turn = text + translation; answer = summary + both answers; recap = summary + lists.
      At most 500.
    - Embed passages when embeddings are on; if that fails, save without vectors.
    - Call `db.save_meeting(owner, id, fields=…, data=body.model_dump(mode="json", by_alias=True),
      passages=…, vectors=…, embedding_model=…)`.
    - `MeetingConflict` → 404.
    - Returns `{id, passages, embedded}`.
    - PUT is idempotent (resaved after Retry recap).
  - `GET /api/meetings` → `{meetings: [{id, title, startedAt, endedAt, turnCount, questionCount,
    summary, speakerLanguage, displayLanguage}]}`.
  - `GET /api/meetings/{id}` → the fields + `data`, or 404.
  - `DELETE /api/meetings/{id}` → 204 or 404.
  - `GET /api/meetings/search?q=` (1–300 chars) → `{semantic, hits: [{meetingId, title, startedAt,
    kind, speaker, text, atMs, score}]}`.
    - With embeddings: embed `q`, run `search_semantic` (keep score ≥ 0.3), fuse by RRF with
      `search_text`.
    - Without: `search_text` only.
    - Limit 20.
- Tests (`tests/test_history.py`):
  - `pytest.mark.skipif` unless `CONTEXA_TEST_DATABASE_URL` is set. Per module, create a throwaway
    database (`create database contexa_test_<hex>`) and drop it after.
  - Cover:
    - save / list / get / delete;
    - owner isolation: B can't read A, and B's PUT of A's id → 404;
    - semantic search with `FakeEmbeddings`, where an Indonesian query finds an English turn;
    - text fallback without embeddings;
    - 503 without a DB, and 401 without identity;
    - the Supabase path with a MockTransport for `/auth/v1/user`.
- Local Postgres 16 + pgvector (Ubuntu 24.04 container, as root):

  ```bash
  apt-get install -y postgresql-16-pgvector
  mkdir -p /tmp/pg && chown postgres:postgres /tmp/pg
  su postgres -s /bin/bash -c "/usr/lib/postgresql/16/bin/initdb -D /tmp/pg/data -A trust -U postgres \
    && /usr/lib/postgresql/16/bin/pg_ctl -D /tmp/pg/data -l /tmp/pg/server.log \
       -o '-p 54329 -c listen_addresses=127.0.0.1 -k /tmp/pg' start"
  export CONTEXA_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:54329/postgres
  ```

**Web**

- `lib/history/identity.ts`:
  - The device key lives in localStorage `contexa-device-key`: 32 random bytes, base64url, wrapped
    in try/catch.
  - `historyHeaders()`: a Supabase session (via `lib/supabase` browser client
    `auth.getSession()`) sends `Authorization: Bearer`; otherwise `X-Contexa-Device`.
- `lib/history/client.ts`: `save`, `list`, `get`, `remove`, `search` against `API_URL`. A 503 means
  history is off.
- Store (`lib/session/store.ts`):
  - `meetingId` (`crypto.randomUUID()`) is set when a session first reaches `listening` and reset
    by `newSession`.
  - `history: {status: "off" | "idle" | "saving" | "saved" | "failed", message?}`.
  - `saveToHistory()` builds `MeetingIn` from turns, ready suggestions, and the recap. Call it after
    Stop once the recap settles (ready or failed), and again after a successful Retry recap.
  - Config `saveHistory` (default true). The setup switch "Save to history" only shows when
    `/health` says `historyEnabled`: let `ApiStatus` push it into the store.
  - Preview: history off.
- Session-ended card (`components/session/conversation-panel.tsx`), under the recap: "Saving…",
  "Saved to history · Open" (link `/history?id=…`), or the failure reason + Retry.
- `/history` page: `app/history/page.tsx` renders a client component inside `<Suspense>` (it reads
  `useSearchParams`).
  - Header: logo, New session, theme toggle, user menu.
  - Search: "Search every session, by meaning" → hits with meeting title, date, and snippet; a
    click opens the detail scrolled to that turn.
  - List: title, date, duration, turns, questions, 2-line summary.
  - Detail (`?id=`):
    - The recap: extract a presentational `RecapView` from `RecapCard` in `conversation-panel.tsx`.
    - The transcript with translations, and answers under their questions.
    - Export .md: write `meetingToMarkdown`; `lib/session/export.ts` has the format.
    - Delete, with confirmation.
  - Empty, off, and error states.
  - Link it from the session header and the landing nav.

### 3.3 Floating window: Document Picture-in-Picture (about 3 h, chosen instead of a browser extension)

- Show a "Pop out" button in `components/session/control-bar.tsx` while live, only when
  `"documentPictureInPicture" in window` (Chrome and Edge desktop).
- Opening it:
  - Call `documentPictureInPicture.requestWindow({width: 380, height: 520})`.
  - Copy every `<link rel=stylesheet>` and `<style>` from `document.head` into the new window.
  - Copy `document.documentElement.className` (the `dark` theme).
  - Render with `createPortal(<FloatingView/>, win.document.body)`; the portal keeps React context,
    so the session store works.
  - Clear state on the window's `pagehide`.
- `FloatingView`: status pill, the last 3 turns with translations, and the active suggestion's
  ready-to-say with Copy and Listen.
- E2E: stub
  `window.documentPictureInPicture = {requestWindow: async () => window.open("", "_blank", "width=380,height=520")}`
  with `addInitScript`, then assert the popup's content.

### 3.4 Docs

- Root `README.md`: env table, free setup, status list.
- `apps/api/README.md`: config table, plus HTTP routes for import and meetings.
- `apps/web/README.md`: link import, history, pop-out.
- `apps/api/.env.example`: `EMBEDDING_*`, `GITHUB_TOKEN`, `DATABASE_URL`, `SUPABASE_URL`,
  `SUPABASE_ANON_KEY`.

### 3.5 Deploy

**API.** Use a Render web service or Fly.io.
- Command: `uv sync --frozen && uv run uvicorn app.main:app --host 0.0.0.0 --port $PORT`.
- Run **one worker**: sessions live in memory. Consider adding a `Dockerfile` or `render.yaml`.
- Env: `ASSEMBLYAI_API_KEY`, `LLM_*`, `EMBEDDING_*`, `CORS_ORIGINS=https://<vercel domain>`,
  `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and optionally `GITHUB_TOKEN`.
- Render's free plan sleeps: the web already says "Waking up" and offers the preview.

**Web.** Deploy to Vercel with project root `apps/web`.
- `NEXT_PUBLIC_API_URL=https://<api host>` is inlined at **build** time.
- Also set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
- Add the Vercel domain to Supabase Auth redirect URLs.

### 3.6 Submission

- Demo video: use the **Audio file** source with a recorded English or Japanese question, so the
  run is repeatable. Show the transcript, translation, answer with evidence, style redraft, Listen,
  recap, link import, and history.
- Also needed: slides, README polish, and the lablab form.

## 4. How to run and test

```bash
# API
cd apps/api && uv sync && uv run pytest && uv run ruff check . && uv run ruff format --check .
# Web
cd apps/web && npm install && npm run lint && npx tsc --noEmit
```

The browser E2E harness is in `e2e/`:
- `fake_assemblyai.py` is a fake AssemblyAI (token + v3 streaming WebSocket; turns are driven by the
  audio actually received) plus an OpenAI-compatible LLM.
  - Control endpoints: `/__control/reset`, `/__control/llm?mode=ok|fail|no_schema|rate_limit|reasoning_cut`,
    `/__control/drop`, `/__control/reject?count=`, `/__control/slow_token?seconds=`,
    `/__control/log`.
- `servers.sh start|stop fake|api|api-nokey|api-nollm|web` (ports 8100 / 8000 / 3000), with
  `LLM_MODE=assemblyai|openrouter|groq`.
- `suite.js` runs 23 Playwright scenarios.

```bash
cd apps/web && rm -rf .next && NEXT_PUBLIC_API_URL=http://localhost:8000 npm run build
cd ../../e2e && ./servers.sh start fake && LLM_MODE=groq ./servers.sh start api && ./servers.sh start web
NODE_PATH=$(npm root -g) LLM_MODE=groq node suite.js            # all scenarios
NODE_PATH=$(npm root -g) LLM_MODE=groq node suite.js "01 " "22 "  # a subset, by name prefix
```

Playwright is installed globally and Chromium sits at `/opt/pw-browsers` in Claude Code cloud
containers. Never rebuild `.next` while a suite is running: the web server serves from it.

## 5. Gotchas learned the hard way

**Web**
- A 404 from the Contexa API means "session unknown" to the web client (it recreates the session
  and re-uploads documents). Don't use 404 for other errors on session routes.
- `NEXT_PUBLIC_API_URL` selects live vs preview at build time. `/session?preview` switches at
  runtime via `useSyncExternalStore` in `lib/session/mode.ts`; mode changes use a full page load.
- `eslint-plugin-react-hooks` forbids synchronous `setState` in effects. Use the
  `{attempt, result}` pattern from `components/session/api-status.tsx`.

**E2E / Playwright**
- Next's route announcer is also `role="alert"`: filter alerts by text.
- Headless mic prompts hang: grant the permission in the context, or stub `getUserMedia` to
  simulate a denial.
- The browser logs expected network failures (e.g. 502/503 from a deliberately failing recap).
  Filter those, not script errors.

**API**
- Tests: the autouse `isolated_env` fixture removes every `Settings` env var. Use
  `json.dumps(..., ensure_ascii=False)` when asserting on "·".
- LLM gateway: per-model fallbacks (json_schema → json_object → prompt), temperature and
  `reasoning_effort` drops, and `max_completion_tokens` for OpenAI. `reasoning_effort` is never
  sent to OpenRouter (its `require_parameters` would narrow routing).
- Supabase exposes the `public` schema over REST. That is why history uses the `contexa` schema
  with RLS on.
