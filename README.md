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
                              ├─ retrieve evidence      (BM25 over your documents)
                              └─ grounded answer        (LLM: your language + ready-to-say)
```

- Audio goes from the browser straight to AssemblyAI with a short-lived token from the API.
  The API key never reaches the browser.
- Your documents do double duty: their passages ground the answers, and their product names
  and technical terms go to AssemblyAI as keyterms, so the transcript spells them right.
  Adding or removing a document mid-session updates the stream without reconnecting.
- Partial transcripts only update the screen. Translation, question detection, and retrieval
  run on finished turns; the per-turn analysis uses a fast model, answers a stronger one.
- Speech always runs on AssemblyAI. The LLM is your choice: the AssemblyAI LLM Gateway, or any
  OpenAI-compatible API (Groq, OpenRouter, Gemini, OpenAI, a local server), so the whole app
  runs on free tiers.
- Each step fails on its own, so the live transcript keeps working if an answer fails.

## Repository structure

```text
Contexa/
├── apps/
│   ├── web/                    Next.js 16 frontend
│   │   ├── app/                routes: / (landing page), /session (live workspace),
│   │   │                       /login, /register, password reset, /auth/callback
│   │   ├── components/
│   │   │   ├── ui/             shadcn/ui-style primitives
│   │   │   ├── landing/        landing page sections
│   │   │   ├── auth/           sign-in forms, Google button, header account menu
│   │   │   └── session/        workspace: setup, transcript, copilot, context, controls
│   │   ├── hooks/              small client hooks
│   │   ├── lib/
│   │   │   ├── session/        live transport (capture → AssemblyAI → API), preview
│   │   │   │                   transport, audio capture, Zustand store
│   │   │   ├── api/            API client and the shared backend session
│   │   │   ├── documents/      upload validation, live and preview uploaders, samples
│   │   │   ├── supabase/       Supabase clients for browser, server, and proxy
│   │   │   └── auth/           form validation, error messages, safe redirects
│   │   ├── public/
│   │   │   ├── audio/          AudioWorklet: 16 kHz PCM16 frames for AssemblyAI
│   │   │   └── samples/        sample project documents (Notewave)
│   │   ├── proxy.ts            refreshes the session for pages that read it on the server
│   │   └── types/              session types and the SessionEvent union
│   └── api/                    FastAPI backend
│       ├── app/
│       │   ├── api/            REST routes and the WebSocket
│       │   ├── assemblyai/     speech-model routing, streaming tokens
│       │   ├── conversation/   final-turn pipeline (analysis → retrieval → answer)
│       │   ├── documents/      upload validation, parsing, chunking, keyterms
│       │   ├── rag/            tokenizer and BM25 index
│       │   ├── llm/            LLM client (LLM Gateway or OpenAI-compatible) and prompts
│       │   ├── models/         Pydantic contracts (API, events, LLM outputs)
│       │   ├── store/          in-memory session store
│       │   ├── config.py       settings from environment variables
│       │   └── main.py         app factory
│       ├── scripts/            smoke test for the first live run against AssemblyAI
│       ├── tests/              pytest suite (AssemblyAI mocked)
│       └── .env.example
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
- [ ] First run with real keys (the smoke test below checks each call)
- [ ] Persistence and semantic retrieval (Supabase + pgvector)
- [ ] Deployment (Vercel for the web app, a WebSocket-capable host such as Render or Fly.io for the API)

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

Optional tuning: `STREAMING_TOKEN_TTL_SECONDS` (60), `STREAMING_MAX_SESSION_SECONDS` (3600),
`STREAMING_TOKENS_PER_SESSION` (30), `LLM_TIMEOUT_SECONDS` (15), `MAX_UPLOAD_BYTES` (10 MB),
`LLM_BASE_URL` (required for `custom`, e.g. `http://localhost:11434/v1` for Ollama).

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
   answer plus a ready-to-say version.
4. Pick **Browser tab**, play an English or Japanese video in another tab, and share that tab
   with **Share tab audio** on.
5. Press **Stop session**: the summary shows turns, questions, and average answer time;
   **Export .md** downloads the transcript; **New session** keeps the documents.

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
| "Can't reach the Contexa API" | The API isn't running, `NEXT_PUBLIC_API_URL` points elsewhere, or `CORS_ORIGINS` doesn't list the page's origin. |
| "AssemblyAI didn't start the stream" | The reason is shown; code 1006 usually means a bad key or no balance. Run the smoke test. |
| No audio from a shared tab | Share a tab (not a window) in Chrome or Edge with **Share tab audio** on. Firefox and Safari can't share tab audio: use the microphone. |
| A model id is rejected | The smoke test lists the provider's model ids; set `LLM_MODEL` / `LLM_FAST_MODEL` to one of them. OpenRouter's `:free` models change over time. |

### Checks

```bash
cd apps/api && uv run pytest && uv run ruff check . && uv run ruff format --check .
cd apps/web && npm run lint && npm run build
```

## Tech stack

| Layer | Choice |
| --- | --- |
| Frontend | Next.js 16, React 19, TypeScript, Tailwind CSS v4, Radix / shadcn/ui, Zustand |
| Backend | FastAPI, Pydantic v2, httpx, pypdf, python-docx |
| Speech | AssemblyAI Universal-3.5 Pro Realtime (`universal-3-5-pro`) with speaker labels and keyterms prompting; Whisper Streaming (`whisper-rt`) for Indonesian |
| Reasoning | Any OpenAI-compatible LLM (Groq, OpenRouter, Gemini, OpenAI) or the AssemblyAI LLM Gateway, with strict JSON-schema outputs and fallbacks: `LLM_FAST_MODEL` per turn, `LLM_MODEL` for answers |
| Retrieval | BM25 over document chunks (pgvector planned) |
| Auth | Supabase Auth via `@supabase/ssr`: Google OAuth and email/password, PKCE, cookie sessions |

## Documentation

- [Product requirements](docs/PRD.md)
- [AssemblyAI implementation and hackathon guide](docs/ASSEMBLYAI_IMPLEMENTATION_AND_HACKATHON_GUIDE.md)
- [Web app](apps/web/README.md) and [API](apps/api/README.md)
