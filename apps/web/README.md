# Contexa web

Frontend for Contexa, the real-time multilingual conversation copilot.

Next.js 16 (App Router, Turbopack) · React 19 · TypeScript · Tailwind CSS v4 · shadcn/ui-style components on Radix · Zustand.

## Develop

```bash
npm install
cp .env.example .env.local   # optional: Supabase keys for sign-in
npm run dev      # http://localhost:3000
npm run lint
npm run build
```

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
app/                  routes: landing page, /session, (auth) pages, /auth/callback
proxy.ts              session refresh for the pages that read auth on the server
components/ui/        shadcn/ui-style primitives
components/session/   workspace: setup, conversation, copilot, context, control bar
components/landing/   landing page sections
components/auth/      sign-in forms, Google button, header account menu
lib/supabase/         Supabase clients (browser, server, proxy) and config
lib/auth/             validation, error messages, safe redirects
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
