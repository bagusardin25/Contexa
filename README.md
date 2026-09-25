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
| `apps/api` | FastAPI backend: AssemblyAI streaming, translation, retrieval (planned) |
| `PRD.md` | Product requirements |
| `ASSEMBLYAI_IMPLEMENTATION_AND_HACKATHON_GUIDE.md` | Guardrails for the voice pipeline. Read before touching AssemblyAI code. |

## Status

- [x] UI: landing page, session setup, live transcript, response copilot, document context, error states. Runs on a clearly labelled scripted preview.
- [ ] Backend: FastAPI, short-lived AssemblyAI streaming tokens, LLM Gateway translation, question detection, and answers
- [ ] Browser audio capture (tab or mic → PCM16 16 kHz) streaming to AssemblyAI
- [ ] Document parsing, chunking, and retrieval (Supabase + pgvector, lexical fallback)
- [ ] Deployment (Vercel for the web app, a WebSocket-capable host for the API)

## Run the web app

```bash
cd apps/web
npm install
npm run dev
```

Then open http://localhost:3000. See [`apps/web/README.md`](apps/web/README.md) for details.
