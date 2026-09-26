# Deploying Contexa (free tiers)

Three pieces, all on free plans:

| Piece | Host | Why |
| --- | --- | --- |
| API (`apps/api`) | Render web service (Docker) | WebSockets, one long-running worker |
| Web app (`apps/web`) | Vercel | Next.js, zero config |
| Sign-in + meeting history | Supabase | Auth, and Postgres with pgvector |

Keys you need: AssemblyAI (speech, free credits), Groq (LLM, free), Gemini (embeddings, free at
aistudio.google.com). Supabase is optional: without it there is no sign-in and no history, and
everything else works.

## 1. Supabase (optional: sign-in and history)

1. Create a project at supabase.com (free). Pick a region near the API (US West for Render's
   Oregon).
2. **Project Settings → API Keys**: copy the project URL and the publishable key. They go to
   Vercel (`NEXT_PUBLIC_SUPABASE_*`) and to the API (`SUPABASE_URL`, `SUPABASE_ANON_KEY`).
3. **Connect** (top bar) → **Session pooler** → copy the connection string and put your database
   password in it. That is the API's `DATABASE_URL`. Use the pooler, not the direct connection:
   the direct host is IPv6-only and Render can't reach it. URL-encode special characters in the
   password (`@` → `%40`, `#` → `%23`).
4. Nothing to create by hand: on first connect the API enables `vector` and creates its own
   `contexa` schema (row level security on, so the public REST API can't read it).
5. Sign-in settings (Google, email) are in [apps/web/README.md](../apps/web/README.md#sign-in-optional).

## 2. API on Render

**Blueprint (recommended).** Render → **New → Blueprint** → pick this repository and the branch
to deploy. Render reads [`render.yaml`](../render.yaml) and asks for the secrets:

| Variable | Value |
| --- | --- |
| `ASSEMBLYAI_API_KEY` | AssemblyAI key |
| `LLM_API_KEY` | Groq key (`LLM_PROVIDER=groq` and the models are preset) |
| `EMBEDDING_API_KEY` | Gemini key (`EMBEDDING_PROVIDER=gemini` is preset) |
| `CORS_ORIGINS` | The Vercel URL, e.g. `https://contexa.vercel.app`. Put a placeholder first and fix it after step 3. |
| `DATABASE_URL` | Supabase session pooler string, or empty for no history |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | From Supabase, or empty |

Optional: `GITHUB_TOKEN` (a fine-grained token with no permissions) lifts GitHub's limit of 60
repository imports an hour.

**By hand**, if you prefer: New → Web Service → this repository → Language **Docker**, Root
Directory `apps/api`, Instance type **Free**, Health Check Path `/health`, and the variables
above plus `LLM_PROVIDER=groq`, `LLM_MODEL=openai/gpt-oss-120b`,
`LLM_FAST_MODEL=openai/gpt-oss-20b`, `LLM_REASONING_EFFORT=low`, `EMBEDDING_PROVIDER=gemini`.

Check it: `https://<service>.onrender.com/health` should show `"assemblyaiConfigured": true`,
`"llmConfigured": true`, `"embeddingModel": "gemini-embedding-001"`, and, with a database,
`"historyEnabled": true`. If history stays false, the Render log says why.

The container runs one uvicorn worker on purpose: live sessions live in memory. The free plan
sleeps after 15 minutes without traffic and wakes in under a minute; the web app says
"Waking up the Contexa API…" meanwhile and offers the scripted preview.

## 3. Web app on Vercel

Vercel → **Add New → Project** → import this repository → **Root Directory** `apps/web`
(framework: Next.js, detected). Environment variables:

| Variable | Value |
| --- | --- |
| `NEXT_PUBLIC_API_URL` | `https://<service>.onrender.com` (no trailing slash) |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL (optional) |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase publishable key (optional) |
| `NEXT_PUBLIC_SITE_URL` | The Vercel URL, e.g. `https://contexa.vercel.app` |

`NEXT_PUBLIC_*` values are built into the app: after changing one, **Redeploy**.

## 4. Connect the pieces

1. Render: set `CORS_ORIGINS` to the Vercel production URL (exactly, with `https://`, no trailing
   slash). The WebSocket checks the same list.
2. Supabase → **Authentication → URL Configuration**: Site URL = the Vercel URL; add
   `https://<vercel-url>/auth/callback` to the redirect URLs.

## 5. Check the deployment

1. Open `https://<vercel-url>/session`: "Connected to the Contexa API · speech on AssemblyAI ·
   translations on openai/gpt-oss-20b, answers on openai/gpt-oss-120b via Groq · semantic search
   on gemini-embedding-001". With a database, the setup shows **Save to history**.
2. Load the sample docs, pick **Microphone**, start, and ask the sample question (README, step 5).
3. Stop: the recap appears, then "Saved to history · Open".
4. Paste a link (e.g. a GitHub repository) and ask about it.
5. `/history`: the session is listed; search it in Indonesian.

Before recording or presenting, open `/session` a minute early so the API is awake.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| "Can't reach the Contexa API" but `/health` works in a tab | `CORS_ORIGINS` doesn't match the page's origin exactly |
| The session starts, then turns never get translations | The WebSocket was refused: same `CORS_ORIGINS` check |
| `historyEnabled: false` | `DATABASE_URL` empty, the direct (IPv6) host instead of the session pooler, or a password with unencoded special characters |
| "Couldn't check your sign-in with Supabase" when saving | `SUPABASE_URL` or `SUPABASE_ANON_KEY` on the API is wrong |
| Signed-in users see an empty history after signing in | Expected: sessions saved while signed out belong to that browser, not the account |
| Answers or translations fail with HTTP 429 | Groq's free per-minute limit; wait a minute. The smoke test shows the limits. |

## Fly.io instead of Render

`fly launch --no-deploy` in `apps/api` (it finds the Dockerfile), set the same variables with
`fly secrets set`, keep one machine (`fly scale count 1`), and `fly deploy`. The app listens on
`$PORT`, 8000 by default.
