# Contexa

Real-time multilingual conversation copilot, built for the AssemblyAI Voice Agent Hackathon (lablab.ai).

Contexa listens to a live webinar or meeting, transcribes it with AssemblyAI streaming
speech-to-text, and translates every finished turn into your language. When someone asks you a
question, it drafts a grounded answer from your own documents, ready to say in the speaker's
language.

> Translation tells you what was said. Contexa helps you participate.

## How it works

```text
Browser tab / mic ──PCM16 16 kHz──► AssemblyAI Streaming STT (Universal-3.5 Pro / Whisper)
        │                              ▲ keyterms_prompt: names and terms from your documents
        │◄────── partial + final turns ┘
        │
        └── final turns ──► Contexa API (FastAPI)
                              ├─ translate + classify   (LLM, fast model)
                              ├─ retrieve evidence      (BM25 + embeddings over your documents)
                              └─ grounded answer        (LLM: your language + ready-to-say)
                                        │
                     session ends ──► recap (LLM) ──► history (Postgres + pgvector)
```

- Audio goes from the browser straight to AssemblyAI with a short-lived token from the API.
  The API key never reaches the browser.
- Your documents do double duty: their passages ground the answers, and their product names
  and technical terms go to AssemblyAI as keyterms, so the transcript spells them right.
  Adding or removing a document mid-session updates the stream without reconnecting.
  Documents can be files (PDF, DOCX, Markdown, TXT) or links: a web page, a PDF on the web, or
  a GitHub repository (its README and docs).
- Retrieval fuses keyword search (BM25) with semantic search (embeddings, e.g. Gemini's free
  tier), so a question asked in Indonesian or in other words still finds the right passage.
- Partial transcripts only update the screen. Translation, question detection, and retrieval
  run on finished turns; the per-turn analysis uses a fast model, answers a stronger one.
- Speech always runs on AssemblyAI. The LLM is your choice: the AssemblyAI LLM Gateway, or any
  OpenAI-compatible API (Groq, OpenRouter, Gemini, OpenAI, a local server), so the whole app
  runs on free tiers.
- Each step fails on its own, so the live transcript keeps working if an answer fails.
- When the session stops, one more LLM call writes a recap: summary, key points, action items,
  and open questions, in your language. The session is then saved to your history (Postgres
  with pgvector, e.g. Supabase), where every session can be searched by meaning.
- **Pop out** keeps the latest turns and the ready-to-say answer in a small always-on-top
  window over your meeting (Document Picture-in-Picture, Chrome and Edge).

## Repository structure

```text
Contexa/
├── apps/
│   ├── web/                    Next.js 16 frontend
│   │   ├── app/                routes: / (landing page), /session (live workspace),
│   │   │                       /history, /login, /register, password reset, /auth/callback
│   │   ├── components/
│   │   │   ├── ui/             shadcn/ui-style primitives
│   │   │   ├── landing/        landing page sections
│   │   │   ├── auth/           sign-in forms, Google button, header account menu
│   │   │   ├── session/        workspace: setup, transcript, copilot, context, controls,
│   │   │   │                   floating window
│   │   │   └── history/        saved sessions: list, search, one session in full
│   │   ├── hooks/              small client hooks
│   │   ├── lib/
│   │   │   ├── session/        live transport (capture → AssemblyAI → API), preview
│   │   │   │                   transport, audio capture, Zustand store
│   │   │   ├── api/            API client and the shared backend session
│   │   │   ├── documents/      upload validation, live and preview uploaders, samples
│   │   │   ├── history/        history API client, device identity, saved-session builder
│   │   │   ├── supabase/       Supabase clients for browser, server, and proxy
│   │   │   └── auth/           form validation, error messages, safe redirects
│   │   ├── public/
│   │   │   ├── audio/          AudioWorklet: 16 kHz PCM16 frames for AssemblyAI
│   │   │   └── samples/        sample project documents (Notewave)
│   │   ├── proxy.ts            refreshes the session for pages that read it on the server
│   │   └── types/              session types and the SessionEvent union
│   └── api/                    FastAPI backend
│       ├── app/
│       │   ├── api/            REST routes, the WebSocket, history, and sign-in checks
│       │   ├── assemblyai/     speech-model routing, streaming tokens
│       │   ├── conversation/   final-turn pipeline (analysis → retrieval → answer)
│       │   ├── documents/      upload validation, parsing, chunking, keyterms, link import
│       │   ├── rag/            tokenizer, BM25 index, vectors, hybrid (RRF) search
│       │   ├── llm/            LLM and embeddings clients (OpenAI-compatible) and prompts
│       │   ├── models/         Pydantic contracts (API, events, LLM outputs)
│       │   ├── store/          in-memory session store; Postgres + pgvector history
│       │   ├── config.py       settings from environment variables
│       │   └── main.py         app factory
│       ├── scripts/            smoke test for the first live run against AssemblyAI
│       ├── tests/              pytest suite (AssemblyAI mocked)
│       └── .env.example
├── e2e/                        browser tests: fake AssemblyAI/LLM/web server + Playwright suite
├── docs/
│   ├── PRD.md                  product requirements
│   └── ASSEMBLYAI_IMPLEMENTATION_AND_HACKATHON_GUIDE.md
│                               guardrails for the voice pipeline; read before touching AssemblyAI code
└── README.md
```

## Status

- [x] Web UI: landing page, session setup, live transcript, response copilot, document context,
      error states, light and dark themes
- [x] API: streaming tokens, turn analysis (translation + question detection), document
      parsing, BM25 retrieval, grounded answers, WebSocket protocol
- [x] Optional sign-in with Google or email and password (Supabase Auth). `/session` stays open
      without an account; the API doesn't check sign-in yet.
- [x] Web app wired to the API: tab and microphone capture, AssemblyAI streaming, document
      uploads, keyterms from documents, live translations and answers, reconnects and recovery.
      Without `NEXT_PUBLIC_API_URL` the UI runs a clearly labelled scripted preview.
- [x] LLM provider of your choice: AssemblyAI LLM Gateway, Groq, OpenRouter, Gemini, OpenAI, or
      any OpenAI-compatible API, with fallbacks for models without structured outputs
- [x] Session recap (summary, key points, action items, open questions), a recording as a third
      audio source, and a scripted preview at `/session?preview` for when the API is asleep
- [x] Answer styles (Concise, Professional, Technical, Casual) with one-click redrafts, and
      **Listen** to hear the ready-to-say answer (browser text-to-speech)
- [x] Documents from links: web pages, PDFs on the web, and GitHub repositories (README + docs),
      with an SSRF guard on every hop
- [x] Semantic retrieval: embeddings (Gemini's free tier, OpenAI, or any OpenAI-compatible API)
      fused with BM25 by reciprocal rank fusion
- [x] Meeting history in Postgres + pgvector (Supabase works): saved when a session ends, listed
      and searchable by meaning at `/history`, per signed-in account or per browser
- [x] **Pop out**: a floating always-on-top window with the latest turns and the answer to say
- [x] Browser tests: 29 Playwright scenarios against a fake AssemblyAI, LLM, web, and GitHub
- [ ] First run with real keys (the smoke test below checks each call)
- [ ] Deployment (see [Deploy](#deploy))

## Run locally

Requirements: Node.js 20.9+, Python 3.11+, [uv](https://docs.astral.sh/uv/), and Chrome or Edge
on a computer for tab audio (the microphone works in any modern browser).

### 1. Configure the API: `apps/api/.env`

Copy `apps/api/.env.example` to `apps/api/.env` and fill it in. Two keys are needed: one for
speech (AssemblyAI) and one for the LLM that translates and answers.

| Variable | Example | What it does |
| --- | --- | --- |
| `ASSEMBLYAI_API_KEY` | (required) | Your AssemblyAI key, for speech-to-text. Server-side only; the browser gets short-lived tokens. |
| `LLM_PROVIDER` | `groq` | Who translates, detects questions, and answers: `groq`, `openrouter`, `gemini`, `openai`, `custom` (any OpenAI-compatible API, with `LLM_BASE_URL`), or `assemblyai` (the LLM Gateway). |
| `LLM_API_KEY` | (required) | That provider's key. Not used for `assemblyai`, which uses `ASSEMBLYAI_API_KEY`. |
| `LLM_MODEL` | `openai/gpt-oss-120b` | Grounded answers. |
| `LLM_FAST_MODEL` | `openai/gpt-oss-20b` | Translation and question detection on every turn. Empty = `LLM_MODEL`. |
| `LLM_REASONING_EFFORT` | `low` | For reasoning models: faster replies, fewer tokens. Empty = provider default. |
| `CORS_ORIGINS` | `http://localhost:3000` | Web app origins allowed for HTTP and the WebSocket, comma-separated. `localhost` and `127.0.0.1` are different origins. |
| `EMBEDDING_PROVIDER` | `gemini` | Semantic search: `gemini`, `openai`, `custom`, or `none`. Empty follows `LLM_PROVIDER` when that is `gemini` or `openai`. |
| `EMBEDDING_API_KEY` | (Gemini key) | Free at aistudio.google.com. Needed with Groq or OpenRouter, which have no embeddings. |
| `DATABASE_URL` | (optional) | Postgres with pgvector for the meeting history (Supabase: the session pooler connection string). Empty = no history. |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | (optional) | Same values as the web's `NEXT_PUBLIC_SUPABASE_*`: signed-in users' history follows their account. |

Optional: `EMBEDDING_MODEL` (`gemini-embedding-001` / `text-embedding-3-small`),
`EMBEDDING_DIMENSIONS`, `EMBEDDING_BASE_URL` (for `custom`), `RETRIEVAL_MIN_SIMILARITY` (0.5),
`GITHUB_TOKEN` (private repos, and more than 60 GitHub downloads an hour), `MAX_IMPORT_BYTES`
(5 MB), `MAX_REPO_DOWNLOAD_BYTES` (30 MB), `STREAMING_TOKEN_TTL_SECONDS` (60),
`STREAMING_MAX_SESSION_SECONDS` (3600), `STREAMING_TOKENS_PER_SESSION` (30),
`LLM_TIMEOUT_SECONDS` (15), `MAX_UPLOAD_BYTES` (10 MB), `LLM_BASE_URL` (required for `custom`,
e.g. `http://localhost:11434/v1` for Ollama).

> **Free setup.** AssemblyAI's free credits cover speech-to-text (Universal-3.5 Pro Realtime
> included) but not the LLM Gateway, so on a free account point the LLM at a free tier.
> Each finished turn is one LLM request, plus one per answered question.
>
> | Provider | Free tier (Sept 2026) | Setup |
> | --- | --- | --- |
> | Groq (recommended) | About 30 requests/min and 1,000/day per model (8,000 tokens/min on gpt-oss-120b); no card | Key at console.groq.com; the `.env.example` defaults |
> | OpenRouter | 20 requests/min, 50/day across `:free` models (1,000/day after a one-time $10 credit purchase) | `LLM_PROVIDER=openrouter`, `LLM_MODEL=openrouter/free` (or a `:free` id from the smoke test), empty `LLM_FAST_MODEL` |
> | Gemini | Per model, e.g. about 15/min and 1,000/day on 2.5 Flash-Lite, 10/min and 250/day on 2.5 Flash | `LLM_PROVIDER=gemini`, `LLM_MODEL=gemini-2.5-flash`, `LLM_FAST_MODEL=gemini-2.5-flash-lite`, empty `LLM_REASONING_EFFORT` |
>
> With a paid AssemblyAI account, `LLM_PROVIDER=assemblyai` uses the LLM Gateway
> (`claude-sonnet-4-6` for answers, `claude-haiku-4-5` per turn; override with `LLM_MODEL`).
>
> The rest is free too: embeddings on Gemini's free tier (`EMBEDDING_PROVIDER=gemini` with a
> key from aistudio.google.com), and the history on Supabase's free Postgres, which includes
> pgvector.

### 2. Configure the web app: `apps/web/.env.local`

Copy `apps/web/.env.example` to `apps/web/.env.local`.

| Variable | Value | What it does |
| --- | --- | --- |
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000` | Runs the live pipeline against this API. Empty = scripted preview. Restart `npm run dev` after changing it. |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | (optional) | Sign-in; see [apps/web/README.md](apps/web/README.md#sign-in-optional). |

### 3. Start both

Terminal 1, the API (http://localhost:8000, interactive docs at `/docs`):

```bash
cd apps/api
uv sync
uv run uvicorn app.main:app --reload --port 8000
```

Terminal 2, the web app (http://localhost:3000):

```bash
cd apps/web
npm install
npm run dev
```

### 4. Check every external call once

```bash
cd apps/api
uv run python -m scripts.smoke_assemblyai                  # silence: proves the connection settings
uv run python -m scripts.smoke_assemblyai --wav question.wav # a 16 kHz mono WAV: real transcripts
```

It mints a streaming token, opens a short stream on each speech model (with keyterms on
Universal-3.5 Pro), lists the LLM provider's models (the current `:free` ones on OpenRouter),
and runs one turn analysis and one grounded answer with the configured models. Each failure
prints the provider's reason and a next step.
To make the WAV, record a question with any app and convert it:
`ffmpeg -i question.m4a -ar 16000 -ac 1 -sample_fmt s16 question.wav`.

### 5. Test in the browser

Open http://localhost:3000/session in Chrome or Edge.

1. The setup screen says **Connected to the Contexa API** and names the LLM provider and
   models (otherwise it says what's wrong).
2. **Load sample project docs** (or drop your own PDF, DOCX, Markdown, or TXT): each file turns
   *Ready* with its chunk count and the keyterms sent to AssemblyAI.
3. Pick **Microphone**, press **Start listening**, and ask: *"How does your app handle concurrent
   updates when two people edit the same note?"* Expect the transcript, the Indonesian
   translation, a *Question* badge, evidence from `notewave-architecture.md`, and a suggested
   answer plus a ready-to-say version. The answer's style menu redrafts it (say, *Concise*), and
   **Listen** reads the ready-to-say version aloud.
4. Pick **Browser tab**, play an English or Japanese video in another tab, and share that tab
   with **Share tab audio** on. Or pick **Audio file** and choose a recording (MP3, WAV, M4A,
   WebM, MP4): it plays aloud through the same pipeline and the session stops when it ends,
   which makes a demo you can repeat exactly.
5. Press **Stop session**: the summary shows turns, questions, and average answer time, and a
   recap follows (summary, key points, action items, open questions); **Export .md** downloads
   the transcript with the recap; **New session** keeps the documents.
6. **Paste a link** in the Context panel: a docs page, a PDF on the web, or a GitHub repository
   (`https://github.com/owner/repo`). It turns *Ready* with its source link, and answers cite it.
   With embeddings on, the setup notice ends with "semantic search on gemini-embedding-001" and
   the panel says documents are searched "by keyword and by meaning".
7. With `DATABASE_URL` set, the setup screen shows **Save to history** (on by default), and the
   ended session says **Saved to history · Open**. `/history` lists every saved session and
   searches them by meaning: a hit opens the session at that turn, with Export .md and Delete.
8. While live in Chrome or Edge, **Pop out** opens a small window that stays on top of your
   meeting with the latest turns, their translations, and the answer to say (Copy, Listen).

Failure handling worth trying: stop the API (red banner, clear upload and start errors, both
retryable once it's back), empty `ASSEMBLYAI_API_KEY` or `LLM_API_KEY` (warning banner; the
transcript still works without an LLM), block the microphone, or share a tab without audio. The
transcript keeps running when a translation or answer fails, and each failure has a Retry.

### Troubleshooting

| Symptom | Cause and fix |
| --- | --- |
| Translations and answers fail with HTTP 401/402/403 from the AssemblyAI LLM Gateway | The AssemblyAI account is on the free plan. Set `LLM_PROVIDER` to a free tier (Groq, OpenRouter, Gemini) or add a payment method. |
| Translations fail with HTTP 401/403 from Groq, OpenRouter, Gemini, or OpenAI | `LLM_API_KEY` is wrong or for another provider. |
| Some turns fail with HTTP 429 | A free-tier rate limit: requests or tokens per minute, or the daily cap. One retry is automatic; keep `LLM_REASONING_EFFORT=low`, use a smaller `LLM_FAST_MODEL`, or wait. |
| "The model used up its token budget" | A reasoning model spent its tokens thinking. Set `LLM_REASONING_EFFORT=low` or pick a non-reasoning model. |
| "Can't reach the Contexa API" | The API isn't running, `NEXT_PUBLIC_API_URL` points elsewhere, or `CORS_ORIGINS` doesn't list the page's origin. The page keeps retrying for two minutes, and **Open the preview** shows the scripted version meanwhile. |
| "Waking up the Contexa API…" | Free hosting put the API to sleep; the first request takes up to a minute and the page continues on its own. |
| "This browser can't play" a recording | Use MP3, WAV, M4A, or WebM; MP4/AAC needs Chrome or Edge rather than Chromium. |
| "AssemblyAI didn't start the stream" | The reason is shown; code 1006 usually means a bad key or no balance. Run the smoke test. |
| No audio from a shared tab | Share a tab (not a window) in Chrome or Edge with **Share tab audio** on. Firefox and Safari can't share tab audio: use the microphone. |
| A model id is rejected | The smoke test lists the provider's model ids; set `LLM_MODEL` / `LLM_FAST_MODEL` to one of them. OpenRouter's `:free` models change over time. |

### Checks

```bash
cd apps/api && uv run pytest && uv run ruff check . && uv run ruff format --check .
cd apps/web && npm run lint && npx tsc --noEmit && npm run build
```

The history tests need Postgres with pgvector; they create and drop a throwaway database:

```bash
docker run -d --name contexa-pg -e POSTGRES_HOST_AUTH_METHOD=trust -p 127.0.0.1:54329:5432 pgvector/pgvector:pg16
cd apps/api && CONTEXA_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:54329/postgres uv run pytest
```

The browser suite is described in [e2e/README.md](e2e/README.md).

## Deploy

See [docs/DEPLOY.md](docs/DEPLOY.md): the API on Render (Docker, one worker for the WebSocket
sessions), the web app on Vercel, and Supabase for sign-in and the history.

## Tech stack

| Layer | Choice |
| --- | --- |
| Frontend | Next.js 16, React 19, TypeScript, Tailwind CSS v4, Radix / shadcn/ui, Zustand |
| Backend | FastAPI, Pydantic v2, httpx, pypdf, python-docx |
| Speech | AssemblyAI Universal-3.5 Pro Realtime (`universal-3-5-pro`) with speaker labels and keyterms prompting; Whisper Streaming (`whisper-rt`) for Indonesian |
| Reasoning | Any OpenAI-compatible LLM (Groq, OpenRouter, Gemini, OpenAI) or the AssemblyAI LLM Gateway, with strict JSON-schema outputs and fallbacks: `LLM_FAST_MODEL` per turn, `LLM_MODEL` for answers |
| Retrieval | BM25 fused with embeddings (reciprocal rank fusion); `gemini-embedding-001` on Gemini's free tier by default |
| History | Postgres + pgvector (Supabase), asyncpg; semantic and full-text search over saved sessions |
| Auth | Supabase Auth via `@supabase/ssr`: Google OAuth and email/password, PKCE, cookie sessions |

## Documentation

- [Product requirements](docs/PRD.md)
- [AssemblyAI implementation and hackathon guide](docs/ASSEMBLYAI_IMPLEMENTATION_AND_HACKATHON_GUIDE.md)
- [Web app](apps/web/README.md) and [API](apps/api/README.md)
