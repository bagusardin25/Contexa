# Contexa

Real-time multilingual conversation copilot, built for the AssemblyAI Voice Agent Hackathon (lablab.ai).

Contexa listens to a live webinar or meeting, transcribes it with AssemblyAI streaming
speech-to-text, and translates every finished turn into your language. When someone asks you a
question, it drafts a grounded answer from your own documents, ready to say in the speaker's
language.

> Translation tells you what was said. Contexa helps you participate.

## Repository

| Path | Contents |
| --- | --- |
| `apps/web` | Next.js 16 frontend: landing page and live session workspace |
| `apps/api` | FastAPI backend: AssemblyAI streaming tokens, translation, question detection, retrieval, grounded answers |
| `PRD.md` | Product requirements |
| `ASSEMBLYAI_IMPLEMENTATION_AND_HACKATHON_GUIDE.md` | Guardrails for the voice pipeline. Read before touching AssemblyAI code. |

## Status

- [x] UI: landing page, session setup, live transcript, response copilot, document context, error states. Runs on a clearly labelled scripted preview.
- [x] Backend: FastAPI, short-lived AssemblyAI streaming tokens, LLM Gateway translation, question detection, and grounded answers
- [x] Document parsing, chunking, and lexical (BM25) retrieval
- [ ] Web app wired to the backend: browser audio capture (tab or mic → PCM16 16 kHz) streaming to AssemblyAI, live transport, document uploads
- [ ] Persistence and semantic retrieval (Supabase + pgvector)
- [ ] Deployment (Vercel for the web app, a WebSocket-capable host for the API)

## Run locally

```bash
# API (http://localhost:8000, docs at /docs)
cd apps/api
cp .env.example .env    # add ASSEMBLYAI_API_KEY
uv sync
uv run uvicorn app.main:app --reload --port 8000

# Web app (http://localhost:3000)
cd apps/web
npm install
npm run dev
```

See [`apps/api/README.md`](apps/api/README.md) and [`apps/web/README.md`](apps/web/README.md) for details.
