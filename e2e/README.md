# Browser E2E harness

Real Next.js + real FastAPI in Chromium, against `fake_assemblyai.py`: a fake AssemblyAI
(token + v3 streaming WebSocket, with turns driven by the audio actually received), a fake
OpenAI-compatible LLM and embeddings API, a web page to import, and GitHub's zipball download.
`suite.js` runs 29 Playwright scenarios. Generated files (logs, screenshots, test uploads) stay
out of git via `.gitignore`.

## Run

Needs Node 20+, uv, and Playwright (`npm i -g playwright && npx playwright install chromium`,
or any folder on `NODE_PATH`). Works in Linux and in Git Bash on Windows.

```bash
cd apps/web && rm -rf .next && NEXT_PUBLIC_API_URL=http://localhost:8000 npm run build
cd ../../e2e && ./servers.sh start fake && LLM_MODE=groq ./servers.sh start api && ./servers.sh start web
NODE_PATH=$(npm root -g) LLM_MODE=groq node suite.js              # every scenario
NODE_PATH=$(npm root -g) LLM_MODE=groq node suite.js "01 " "24 "  # a subset, by name prefix
```

Never rebuild `.next` while a suite runs: the web server serves from it.

`servers.sh start|stop fake|api|api-nokey|api-nollm|web` (ports 8100 / 8000 / 3000). The API
runs from `e2e/`, so a real `apps/api/.env` never reaches the fake stack. Variables, read by
both `servers.sh` and the suite:

| Variable | Effect |
| --- | --- |
| `LLM_MODE=assemblyai\|openrouter\|groq` | Which provider shape the API uses for the fake LLM (default `assemblyai`) |
| `EMBEDDINGS=on` | Semantic retrieval on the fake embeddings API |
| `IMPORTS=public` | Keep the private-address guard for link imports (default: allow 127.0.0.1) |
| `HISTORY=on` + `E2E_DATABASE_URL` | Meeting history in that Postgres (with pgvector) |

Scenario 27 (history) runs only when `E2E_DATABASE_URL` is set, e.g. with
`docker run -d --name contexa-pg -e POSTGRES_HOST_AUTH_METHOD=trust -p 127.0.0.1:54329:5432 pgvector/pgvector:pg16`
and `E2E_DATABASE_URL=postgresql://postgres@127.0.0.1:54329/postgres`.

Fake server controls: `/__control/reset`, `/__control/llm?mode=ok|fail|no_schema|rate_limit|reasoning_cut`,
`/__control/script?name=default|pricing|pricing_id`, `/__control/drop`, `/__control/reject?count=`,
`/__control/slow_token?seconds=`, `/__control/log`.

## Gotchas

- Next's route announcer is also `role="alert"`: filter alerts by text.
- Headless microphone prompts hang: grant the permission in the context, or stub
  `getUserMedia` to simulate a denial.
- The browser logs expected network failures (a deliberately failing recap, a lost session):
  filter those, not script errors.
- A scenario that stops a session should wait for its recap, or the recap's LLM call can land
  in the next scenario's log.
