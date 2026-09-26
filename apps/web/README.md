# Contexa web

Frontend for Contexa, the real-time multilingual conversation copilot.

Next.js 16 (App Router, Turbopack) · React 19 · TypeScript · Tailwind CSS v4 · shadcn/ui-style components on Radix · Zustand.

## Develop

```bash
npm install
cp .env.example .env.local   # NEXT_PUBLIC_API_URL for the live pipeline; Supabase keys for sign-in
npm run dev      # http://localhost:3000
npm run lint
npm run build
```

`NEXT_PUBLIC_API_URL` (e.g. `http://localhost:8000`) switches `/session` to the live pipeline
against the Contexa API; without it, `/session` runs the scripted preview. `NEXT_PUBLIC_*`
values are inlined when the app is built or the dev server starts, so restart after changing it.

Deploying to Vercel: set the project's root directory to `apps/web`.

## Routes

- `/`: landing page that explains the product in one screen
- `/session`: the live session workspace (setup → live transcript → response copilot → summary)
- `/login`, `/register`, `/forgot-password`, `/reset-password`: optional sign-in (see below)
- `/auth/callback`: where Google OAuth and auth email links land

## Sign-in (optional)

Supabase Auth handles Google and email/password sign-in. An account is optional: `/session`
works without one. Without Supabase keys the app still runs, the header hides "Sign in", and the
auth pages explain what to configure.

1. Create a Supabase project. Under **Project Settings → API Keys**, copy the project URL and the
   publishable key into `apps/web/.env.local` (start from `.env.example`).
2. **Authentication → URL Configuration**: set the Site URL to `http://localhost:3000` and add
   `http://localhost:3000/auth/callback` to the redirect URLs. Add your production URL later.
3. **Authentication → Providers → Google**: enable it with a Google Cloud OAuth client of type
   *Web application*. In Google Cloud, add `https://<project-ref>.supabase.co/auth/v1/callback`
   as an authorized redirect URI.
4. **Email**: new accounts confirm their email first (the Supabase default). The built-in mailer
   is heavily rate-limited, so set up custom SMTP before real use. Set the minimum password length
   to 8 to match the forms.
5. Restart `npm run dev`. `NEXT_PUBLIC_*` values are inlined at build time, so production needs a
   rebuild after changing them.

How it fits together:

- Server Actions in `app/(auth)/actions.ts` sign in, sign up, and send reset emails. Each one
  validates its input and checks configuration itself.
- `proxy.ts` refreshes the session only for `/login`, `/register`, and `/reset-password`, the pages
  that read it on the server. `/` and `/session` stay static; the header reads the session in the
  browser.
- `?next=` only accepts same-site paths (`lib/auth/redirect.ts`), and auth responses are sent
  with `Cache-Control: private, no-store`.
- Links in auth emails use PKCE, so they finish signing in only in the browser that asked for
  them. Opened on another device, the email still gets confirmed and the page asks the person to
  sign in there.

## Live pipeline

`createSessionServices()` (`lib/session/services.ts`) picks the live transport and uploader when
`NEXT_PUBLIC_API_URL` is set. Both share one backend session (`lib/api/session.ts`).

- `LiveTransport` (`lib/session/live-transport.ts`) captures a shared tab or the microphone,
  turns it into 50 ms frames of 16 kHz PCM16 in an AudioWorklet (`public/audio/pcm16-processor.js`),
  and streams them to AssemblyAI with a short-lived token from the API. Partial turns only update
  the screen; final turns go to the API over `WS /ws/sessions/{id}`, and the server's events
  (translation, classification, evidence, answer) feed the store.
- Turn ids include the connection segment (`s2-t0`), because AssemblyAI restarts `turn_order`
  after a reconnect. Dropped streams reconnect up to 3 times with fresh tokens. Stop, errors,
  and leaving the page send `Terminate`, so no billed stream stays open.
- Keyterms follow the documents: the stream URL carries them, and adding or removing a document
  mid-session sends an `UpdateConfiguration`.
- If the API restarts, the relay notices, a new backend session is created, documents are
  re-uploaded, and manual requests re-send their turn first.
- `LiveUploader` (`lib/documents/live-uploader.ts`) posts files with the browser's document id,
  reports upload progress, shows each document's keyterms, and supports Retry.
- The setup screen checks `/health` first: it names the LLM provider and models in use, and says
  when the API is unreachable, has no AssemblyAI key, or has no LLM configured (the transcript
  still works then). **Load sample project docs** uploads the real files in `public/samples/`.

## Preview mode

Without `NEXT_PUBLIC_API_URL`, `/session` runs on `PreviewTransport`
(`lib/session/preview-transport.ts`). It replays a scripted English or Japanese Q&A and emits
exactly the events the live pipeline emits, with realistic timing. The UI labels it with a
**Preview** badge, and the badge menu simulates failures: connection drop, translation failure,
answer failure, permission denied, and missing tab audio.

Load the sample documents to see grounded answers with evidence. Without documents, the copilot
returns a cautious answer instead of inventing facts.

## Structure

```text
app/                  routes: landing page, /session, (auth) pages, /auth/callback
proxy.ts              session refresh for the pages that read auth on the server
components/ui/        shadcn/ui-style primitives
components/session/   workspace: setup, conversation, copilot, context, control bar
components/landing/   landing page sections
components/auth/      sign-in forms, Google button, header account menu
lib/supabase/         Supabase clients (browser, server, proxy) and config
lib/auth/             validation, error messages, safe redirects
hooks/                small client hooks (clock, clipboard, auto-scroll, theme)
lib/session/          transports (live, preview), audio capture, Zustand store, Markdown export
lib/api/              Contexa API client and the shared backend session
lib/documents/        upload validation, live and preview uploaders, sample documents
lib/languages.ts      language catalogue and AssemblyAI model routing
public/audio/         AudioWorklet that produces AssemblyAI's 16 kHz PCM16 frames
public/samples/       sample project documents for live sessions
types/session.ts      domain types and the normalized SessionEvent union
```

The UI only consumes `SessionEvent`s from a `SessionTransport` (`lib/session/transport.ts`), so
the live and preview pipelines share every component. `ASSEMBLYAI_API_KEY` stays on the backend;
the browser only receives short-lived streaming tokens.
