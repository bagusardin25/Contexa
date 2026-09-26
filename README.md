# Contexa

Real-time multilingual conversation copilot, built for the AssemblyAI Voice Agent Hackathon (lablab.ai).

Contexa listens to a live webinar or meeting, transcribes it with AssemblyAI streaming
speech-to-text, and translates every finished turn into your language. When someone asks you a
question, it drafts a grounded answer from your own documents, ready to say in the speaker's
language.

> Translation tells you what was said. Contexa helps you participate.

## How it works

```text
Browser tab / mic ──PCM16 16 kHz──► AssemblyAI Streaming STT
        │                                   │
        │◄────── partial + final turns ─────┘
        │
        └── final turns ──► Contexa API (FastAPI)
                              ├─ translate + classify   (AssemblyAI LLM Gateway)
                              ├─ retrieve evidence      (your uploaded documents)
                              └─ grounded answer        (your language + ready-to-say)
```

- Audio goes from the browser straight to AssemblyAI with a short-lived token from the API.
  The API key never reaches the browser.
- Partial transcripts only update the screen. Translation, question detection, and retrieval
  run on finished turns.
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
│   │   │   ├── session/        transport contract, preview transport, Zustand store
│   │   │   ├── documents/      upload validation, uploader contract, sample docs
│   │   │   ├── supabase/       Supabase clients for browser, server, and proxy
│   │   │   └── auth/           form validation, error messages, safe redirects
│   │   ├── proxy.ts            refreshes the session for pages that read it on the server
│   │   └── types/              session types and the SessionEvent union
│   └── api/                    FastAPI backend
│       ├── app/
│       │   ├── api/            REST routes and the WebSocket
│       │   ├── assemblyai/     speech-model routing, streaming tokens
│       │   ├── conversation/   final-turn pipeline (analysis → retrieval → answer)
│       │   ├── documents/      upload validation, parsing, chunking
│       │   ├── rag/            tokenizer and BM25 index
│       │   ├── llm/            LLM Gateway client and prompts
│       │   ├── models/         Pydantic contracts (API, events, LLM outputs)
│       │   ├── store/          in-memory session store
│       │   ├── config.py       settings from environment variables
│       │   └── main.py         app factory
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
- [ ] Web app wired to the API. The UI still runs on a clearly labelled scripted preview;
      next up are tab/mic capture, the live transport, and uploads to the API.
- [ ] First end-to-end run against AssemblyAI with a real API key
- [ ] Persistence and semantic retrieval (Supabase + pgvector)
- [ ] Deployment (Vercel for the web app, a WebSocket-capable host such as Render or Fly.io for the API)

## Run locally

Requirements: Node.js 20.9+, Python 3.11+, and [uv](https://docs.astral.sh/uv/).

Terminal 1, the API (http://localhost:8000, interactive docs at `/docs`):

```bash
cd apps/api
cp .env.example .env    # then set ASSEMBLYAI_API_KEY
uv sync
uv run uvicorn app.main:app --reload --port 8000
```

Terminal 2, the web app (http://localhost:3000):

```bash
cd apps/web
npm install
cp .env.example .env.local    # optional: Supabase keys to enable sign-in
npm run dev
```

Sign-in is optional. To turn it on, follow the Supabase and Google setup in
[apps/web/README.md](apps/web/README.md#sign-in-optional).

Checks:

```bash
cd apps/api && uv run pytest && uv run ruff check .
cd apps/web && npm run lint && npm run build
```

## Tech stack

| Layer | Choice |
| --- | --- |
| Frontend | Next.js 16, React 19, TypeScript, Tailwind CSS v4, Radix / shadcn/ui, Zustand |
| Backend | FastAPI, Pydantic v2, httpx, pypdf, python-docx |
| Speech | AssemblyAI Universal-3.5 Pro Realtime (`universal-3-5-pro`), Whisper Streaming (`whisper-rt`) for Indonesian |
| Reasoning | AssemblyAI LLM Gateway with strict JSON-schema outputs; model set by `ASSEMBLYAI_LLM_MODEL` |
| Retrieval | BM25 over document chunks (pgvector planned) |
| Auth | Supabase Auth via `@supabase/ssr`: Google OAuth and email/password, PKCE, cookie sessions |

## Documentation

- [Product requirements](docs/PRD.md)
- [AssemblyAI implementation and hackathon guide](docs/ASSEMBLYAI_IMPLEMENTATION_AND_HACKATHON_GUIDE.md)
- [Web app](apps/web/README.md) and [API](apps/api/README.md)
