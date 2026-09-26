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
                              ├─ translate + classify   (LLM Gateway, fast model)
                              ├─ retrieve evidence      (BM25 over your documents)
                              └─ grounded answer        (LLM Gateway: your language + ready-to-say)
```

- Audio goes from the browser straight to AssemblyAI with a short-lived token from the API.
  The API key never reaches the browser.
- Your documents do double duty: their passages ground the answers, and their product names
  and technical terms go to AssemblyAI as keyterms, so the transcript spells them right.
  Adding or removing a document mid-session updates the stream without reconnecting.
- Partial transcripts only update the screen. Translation, question detection, and retrieval
  run on finished turns; the per-turn analysis uses a fast model, answers a stronger one.
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
│       │   ├── llm/            LLM Gateway client and prompts
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
- [ ] First run against AssemblyAI with a real API key (the smoke test below checks each call)
- [ ] Persistence and semantic retrieval (Supabase + pgvector)
- [ ] Deployment (Vercel for the web app, a WebSocket-capable host such as Render or Fly.io for the API)

## Run locally

Requirements: Node.js 20.9+, Python 3.11+, [uv](https://docs.astral.sh/uv/), and Chrome or Edge
on a computer for tab audio (the microphone works in any modern browser).

### 1. Configure the API: `apps/api/.env`

Copy `apps/api/.env.example` to `apps/api/.env` and fill it in.

| Variable | Default | What it does |
| --- | --- | --- |
| `ASSEMBLYAI_API_KEY` | (required) | Your AssemblyAI key. Server-side only; the browser gets short-lived tokens. |
| `ASSEMBLYAI_LLM_MODEL` | `claude-sonnet-4-6` | Grounded answers. |
| `ASSEMBLYAI_LLM_FAST_MODEL` | `claude-haiku-4-5` | Translation and question detection on every turn. Empty = use the main model. |
| `CORS_ORIGINS` | `http://localhost:3000` | Web app origins allowed for HTTP and the WebSocket, comma-separated. `localhost` and `127.0.0.1` are different origins. |

Optional tuning: `STREAMING_TOKEN_TTL_SECONDS` (60), `STREAMING_MAX_SESSION_SECONDS` (3600),
`STREAMING_TOKENS_PER_SESSION` (30), `LLM_TIMEOUT_SECONDS` (15), `MAX_UPLOAD_BYTES` (10 MB).

> **The LLM Gateway isn't part of AssemblyAI's free plan.** Free credits cover speech-to-text
> (Universal-3.5 Pro Realtime included), but translation, question detection, and answers call
> the LLM Gateway, which needs a payment method on the account. Without it, the transcript still
> works and every translation and answer shows the gateway's refusal.

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

### 4. Check every AssemblyAI call once

```bash
cd apps/api
uv run python -m scripts.smoke_assemblyai                  # silence: proves the connection settings
uv run python -m scripts.smoke_assemblyai --wav question.wav # a 16 kHz mono WAV: real transcripts
```

It mints a streaming token, opens a short stream on each speech model (with keyterms on
Universal-3.5 Pro), lists the LLM Gateway models, and runs one turn analysis and one grounded
answer with the configured models. Each failure prints AssemblyAI's reason and a next step.
To make the WAV, record a question with any app and convert it:
`ffmpeg -i question.m4a -ar 16000 -ac 1 -sample_fmt s16 question.wav`.

### 5. Test in the browser

Open http://localhost:3000/session in Chrome or Edge.

1. The setup screen says **Connected to the Contexa API** (otherwise it says what's wrong).
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
retryable once it's back), empty `ASSEMBLYAI_API_KEY` (warning banner), block the microphone,
or share a tab without audio. The transcript keeps running when a translation or answer fails,
and each failure has a Retry.

### Troubleshooting

| Symptom | Cause and fix |
| --- | --- |
| Translations and answers fail with HTTP 401/402/403 from the LLM Gateway | The account is on the free plan. Add a payment method in the AssemblyAI dashboard. |
| "Can't reach the Contexa API" | The API isn't running, `NEXT_PUBLIC_API_URL` points elsewhere, or `CORS_ORIGINS` doesn't list the page's origin. |
| "AssemblyAI didn't start the stream" | The reason is shown; code 1006 usually means a bad key or no balance. Run the smoke test. |
| No audio from a shared tab | Share a tab (not a window) in Chrome or Edge with **Share tab audio** on. Firefox and Safari can't share tab audio: use the microphone. |
| A model id is rejected | The smoke test lists the gateway's model ids; set `ASSEMBLYAI_LLM_MODEL` / `ASSEMBLYAI_LLM_FAST_MODEL` to one of them. |

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
| Reasoning | AssemblyAI LLM Gateway with strict JSON-schema outputs: `ASSEMBLYAI_LLM_FAST_MODEL` per turn, `ASSEMBLYAI_LLM_MODEL` for answers |
| Retrieval | BM25 over document chunks (pgvector planned) |
| Auth | Supabase Auth via `@supabase/ssr`: Google OAuth and email/password, PKCE, cookie sessions |

## Documentation

- [Product requirements](docs/PRD.md)
- [AssemblyAI implementation and hackathon guide](docs/ASSEMBLYAI_IMPLEMENTATION_AND_HACKATHON_GUIDE.md)
- [Web app](apps/web/README.md) and [API](apps/api/README.md)
