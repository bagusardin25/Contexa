#!/usr/bin/env bash
# Start/stop the local test stack: fake AssemblyAI (8100), API (8000), web (3000).
# usage: [LLM_MODE=assemblyai|openrouter|groq] servers.sh start|stop fake|api|api-nokey|api-nollm|web
#   LLM_MODE picks who answers the API's LLM calls (both are the fake server):
#   assemblyai = AssemblyAI LLM Gateway shape (default); openrouter, groq = OpenAI-compatible.
set -u
SP="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SP/.." && pwd)"
action=$1; name=$2
case $name in
  fake) port=8100 ;; api|api-nokey|api-nollm) port=8000 ;; web) port=3000 ;;
esac

port_pids() {
  if [ "$name" = web ]; then
    # lsof doesn't list Node's listening socket here; match the process titles instead.
    { pgrep -f '^next-server'; pgrep -f '^npm run start'; } 2>/dev/null | sort -u
  else
    lsof -t -iTCP:"$port" -sTCP:LISTEN 2>/dev/null | sort -u
  fi
}

stop() {
  for pid in $(port_pids); do kill -TERM "$pid" 2>/dev/null; done
  for _ in $(seq 1 30); do
    [ -z "$(port_pids)" ] && return 0
    sleep 0.3
  done
  for pid in $(port_pids); do kill -KILL "$pid" 2>/dev/null; done
  sleep 0.5
}

wait_ready() {
  for _ in $(seq 1 60); do
    case $name in
      fake) curl -sf -m 1 http://127.0.0.1:8100/__control/log > /dev/null && return 0 ;;
      api|api-nokey|api-nollm) curl -sf -m 1 http://127.0.0.1:8000/health > /dev/null && return 0 ;;
      web) curl -sf -m 2 -o /dev/null http://127.0.0.1:3000/session && return 0 ;;
    esac
    sleep 0.25
  done
  echo "$name did not become ready" >&2
  return 1
}

start() {
  stop
  local env=(ASSEMBLYAI_STREAMING_BASE_URL=http://127.0.0.1:8100 ASSEMBLYAI_STREAMING_WS_URL=ws://127.0.0.1:8100/v3/ws
    ASSEMBLYAI_LLM_BASE_URL=http://127.0.0.1:8100 CORS_ORIGINS=http://localhost:3000)
  local openrouter=(LLM_PROVIDER=openrouter LLM_BASE_URL=http://127.0.0.1:8100/v1
    LLM_MODEL=vendor/big:free LLM_FAST_MODEL=vendor/small:free)
  case "${LLM_MODE:-assemblyai}" in
    openrouter) env+=("${openrouter[@]}" LLM_API_KEY=fake-key LLM_REASONING_EFFORT=low) ;;
    groq) env+=(LLM_PROVIDER=groq LLM_BASE_URL=http://127.0.0.1:8100/v1 LLM_API_KEY=fake-key
      LLM_MODEL=openai/gpt-oss-120b LLM_FAST_MODEL=openai/gpt-oss-20b LLM_REASONING_EFFORT=low) ;;
    *) env+=(LLM_PROVIDER=assemblyai) ;;
  esac
  case $name in
    fake)
      (cd "$ROOT/apps/api" && setsid uv run uvicorn --app-dir "$SP" fake_assemblyai:app --port 8100 --log-level warning > "$SP/fake.log" 2>&1 &) ;;
    api)
      (cd "$ROOT/apps/api" && env "${env[@]}" ASSEMBLYAI_API_KEY=fake-key setsid uv run uvicorn app.main:app --port 8000 --timeout-graceful-shutdown 1 > "$SP/api.log" 2>&1 &) ;;
    api-nokey)
      (cd "$ROOT/apps/api" && env "${env[@]}" ASSEMBLYAI_API_KEY= setsid uv run uvicorn app.main:app --port 8000 --timeout-graceful-shutdown 1 > "$SP/api.log" 2>&1 &) ;;
    api-nollm)  # speech configured, OpenRouter chosen but LLM_API_KEY left empty
      (cd "$ROOT/apps/api" && env "${env[@]}" "${openrouter[@]}" LLM_API_KEY= ASSEMBLYAI_API_KEY=fake-key setsid uv run uvicorn app.main:app --port 8000 --timeout-graceful-shutdown 1 > "$SP/api.log" 2>&1 &) ;;
    web)
      (cd "$ROOT/apps/web" && NEXT_PUBLIC_API_URL=http://localhost:8000 setsid npm run start -- -p 3000 > "$SP/web.log" 2>&1 &) ;;
  esac
  wait_ready
}

"$action"
