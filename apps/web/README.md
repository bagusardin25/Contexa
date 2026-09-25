# Contexa web

Frontend for Contexa, the real-time multilingual conversation copilot.

Next.js 16 (App Router, Turbopack) · React 19 · TypeScript · Tailwind CSS v4 · shadcn/ui-style components on Radix · Zustand.

## Develop

```bash
npm install
npm run dev      # http://localhost:3000
npm run lint
npm run build
```

Deploying to Vercel: set the project's root directory to `apps/web`.

## Routes

- `/`: landing page that explains the product in one screen
- `/session`: the live session workspace (setup → live transcript → response copilot → summary)

## Preview mode

The backend isn't connected yet, so `/session` runs on `PreviewTransport`
(`lib/session/preview-transport.ts`). It replays a scripted English or Japanese Q&A and emits
exactly the events the live pipeline will emit, with realistic timing. The UI labels it with a
**Preview** badge, and the badge menu simulates failures: connection drop, translation failure,
answer failure, permission denied, and missing tab audio.

Load the sample documents to see grounded answers with evidence. Without documents, the copilot
returns a cautious answer instead of inventing facts.

## Structure

```text
app/                  routes: landing page and /session
components/ui/        shadcn/ui-style primitives
components/session/   workspace: setup, conversation, copilot, context, control bar
components/landing/   landing page sections
hooks/                small client hooks (clock, clipboard, auto-scroll, theme)
lib/session/          transport contract, preview transport, Zustand store, Markdown export
lib/documents/        upload validation, uploader contract, sample documents
lib/languages.ts      language catalogue and AssemblyAI model routing
types/session.ts      domain types and the normalized SessionEvent union
```

## Connecting the live pipeline

Implement `SessionTransport` (`lib/session/transport.ts`) and `DocumentUploader`
(`lib/documents/uploader.ts`) against the FastAPI backend, then return them from
`createTransport()` and `createUploader()`. The UI only consumes `SessionEvent`s, so no component
needs to change.

`ASSEMBLYAI_API_KEY` stays on the backend. The browser only receives short-lived streaming tokens.
