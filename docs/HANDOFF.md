# Contexa: handoff for the next agent

Updated 2026-09-26 (Saturday evening WIB) by the second Claude Code session. Deadline:
**Wednesday 30 September 2026, 11:00 EDT (22:00 WIB)**, AssemblyAI Voice Agent Hackathon on
lablab.ai. The owner's goal is to win: a stable, convincing demo beats more features.

## 0. Read this first

- Repo `bagusardin25/Contexa`. Work branch: **`claude/finish-contexa`** (from `main` at
  `8069a45`). Push to `main` only when the owner explicitly asks; never force-push.
- The owner writes in Indonesian and wants short, direct replies with a clear recommendation.
  Code, comments, docs, and commit messages are in English. Commit per feature.
- Root `.gitignore` ignores `*.md` except `README.md`: add new Markdown files with `git add -f`.
  `apps/web/AGENTS.md` is not in the repo; Next.js 16 docs are in
  `apps/web/node_modules/next/dist/docs/`.
- Before touching the voice pipeline, read `README.md`, `apps/api/README.md`,
  `apps/web/README.md`, and `docs/ASSEMBLYAI_IMPLEMENTATION_AND_HACKATHON_GUIDE.md`.
- Free tiers only: AssemblyAI free credits (speech), Groq (LLM), Gemini (embeddings), Supabase
  (auth + Postgres/pgvector), Render (API), Vercel (web).

## 1. The product

Live webinar/meeting copilot. The browser captures a tab, the microphone, or a recording and
streams 16 kHz PCM16 straight to AssemblyAI (Universal-3.5 Pro, or `whisper-rt` for
Indonesian) with a short-lived token from the FastAPI backend. Final turns go to the API over a
WebSocket, which translates and classifies each turn (fast LLM), retrieves passages from the
user's documents (BM25 fused with embeddings), and drafts a grounded answer plus a ready-to-say
version. Documents can be files or links (web page, PDF, GitHub repo). At Stop it writes a recap
and saves the session to a searchable history (Postgres + pgvector). "Pop out" shows the latest
turns and the answer in an always-on-top Document Picture-in-Picture window.

## 2. State

Commits on `claude/finish-contexa`, oldest first:

| Commit | What |
| --- | --- |
| `5bee045` | E2E for link import and semantic retrieval (scenarios 24-26); harness runs on Windows; API status names the embedding model |
| `5713801` | Meeting history: API (`/api/meetings*`, Supabase or device identity), web (`/history`, auto-save, Save to history switch), tests, scenarios 27-28, smoke test checks the DB |
| `8d5c0a0` | Pop-out floating window (Document PiP), scenario 29 |
| `765c3a8` | Shorter link placeholder |
| (next) | Docs for every new setting; deploy files (`apps/api/Dockerfile`, `render.yaml`, `docs/DEPLOY.md`) |

### Verified with fakes (no real keys)

- API: 139 pytest tests pass with Postgres + pgvector (`CONTEXA_TEST_DATABASE_URL`), 131 + 8
  skipped without it. Ruff clean.
- Web: lint, `tsc --noEmit`, and `next build` clean.
- Browser: 29 Playwright scenarios pass (`groq` + embeddings + history, and `assemblyai`,
  `openrouter` without history), on Windows (Git Bash).
- The API Docker image builds, keeps `.env` out, listens on `$PORT`, and connects to pgvector.
- Screenshots of the history pages (light, dark, mobile) and the pop-out were checked.

### Not verified yet

- **Anything with real keys.** The owner was asked to run
  `cd apps/api && uv run python -m scripts.smoke_assemblyai` (speech, LLM, embeddings, and now the
  history database and Supabase key) and share the output. Read it with them.
- Real Document PiP in desktop Chrome (the E2E stubs it with `window.open`).
- Supabase-signed-in history end to end (unit-tested with a mocked `/auth/v1/user`).
- The deployment itself: it needs the owner's Render, Vercel, and Supabase accounts
  (see `docs/DEPLOY.md`; the owner does the clicks, you help read logs).

## 3. Remaining work, in order

1. Real-key smoke test with the owner (above). Fix whatever it reports.
2. Deploy (owner, guided by `docs/DEPLOY.md`): Supabase → Render Blueprint → Vercel → set
   `CORS_ORIGINS` and Supabase redirect URLs → check `/health` and one mic session.
3. Demo video (owner): use the **Audio file** source with a recorded English or Japanese
   question, so the run is repeatable. Show transcript, translation, answer with evidence, a
   style redraft, Listen, Pop out, the recap, a pasted link (GitHub repo), and `/history` search
   in Indonesian. Warm the Render API a minute before recording.
4. Slides, README polish, and the lablab submission form.

## 4. How to run and test

```bash
# API
cd apps/api && uv sync && uv run pytest && uv run ruff check . && uv run ruff format --check .
# History tests need pgvector (Docker):
docker run -d --name contexa-pg -e POSTGRES_HOST_AUTH_METHOD=trust -p 127.0.0.1:54329:5432 pgvector/pgvector:pg16
CONTEXA_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:54329/postgres uv run pytest
# Web
cd apps/web && npm install && npm run lint && npx tsc --noEmit
```

Browser E2E: see `e2e/README.md`. Short version:

```bash
cd apps/web && rm -rf .next && NEXT_PUBLIC_API_URL=http://localhost:8000 npm run build
cd ../../e2e && ./servers.sh start fake && LLM_MODE=groq ./servers.sh start api && ./servers.sh start web
NODE_PATH=$(npm root -g) LLM_MODE=groq node suite.js
# everything on: embeddings and history (needs the pgvector container and a database)
docker exec contexa-pg psql -U postgres -c "create database contexa_e2e"
E2E_DATABASE_URL=postgresql://postgres@127.0.0.1:54329/contexa_e2e HISTORY=on EMBEDDINGS=on LLM_MODE=groq node suite.js
```

On the owner's Windows machine Playwright isn't global: install `playwright@1.62.1` in a
scratch folder (it matches the cached Chromium 1234) and point `NODE_PATH` at its
`node_modules`. Never rebuild `.next` while a suite runs.

## 5. Gotchas learned the hard way

**Web**
- A 404 from the Contexa API means "session unknown" to the web client (it recreates the session
  and re-uploads documents). Don't use 404 for other errors on session routes.
- `NEXT_PUBLIC_API_URL` selects live vs preview at build time. `/session?preview` switches at
  runtime via `useSyncExternalStore` in `lib/session/mode.ts`.
- `eslint-plugin-react-hooks` forbids synchronous `setState` in effects (use the
  `{attempt, result}` pattern of `api-status.tsx`) and mutating anything derived from state
  (the React Compiler's immutability rule): do DOM work on a state-held `Window` in a helper
  function, as `floating-window.tsx` does.
- The clipboard only accepts writes from the focused document: copy from the PiP window through
  its own `navigator` (`useCopy(ms, target)`).

**E2E / Playwright**
- `servers.sh` runs the API from `e2e/`, so a real `apps/api/.env` can't leak into the fakes.
- Next's route announcer is also `role="alert"`: filter alerts by text.
- Headless mic prompts hang: grant the permission, or stub `getUserMedia` for a denial.
- A scenario that stops a session must wait for its recap, or the recap's LLM call lands in the
  next scenario's fake log.
- Node's `fetch` to uvicorn can hit a just-closed keep-alive socket after a pause: `fakeFetch`
  retries once.

**API**
- Tests: the autouse `isolated_env` fixture removes every `Settings` env var. Use
  `json.dumps(..., ensure_ascii=False)` when asserting on "·".
- LLM gateway: per-model fallbacks (json_schema → json_object → prompt), temperature and
  `reasoning_effort` drops, `max_completion_tokens` for OpenAI; `reasoning_effort` is never sent
  to OpenRouter.
- History vectors are keyed by `model@dimensions`; the `vector` column has no fixed size.
- Supabase exposes the `public` schema over REST, which is why history uses the `contexa`
  schema with RLS on. Render can't reach Supabase's IPv6-only direct host: use the session pooler.

**Windows / git**
- `core.autocrlf` is on: `.gitattributes` keeps `*.sh` LF. Long heredocs in the Bash tool can
  fail to parse; write a script file instead. Avoid `git stash --keep-index` with partially
  staged files (the pop conflicts); stage exact blobs with `git update-index --cacheinfo`.
