#!/usr/bin/env bash
# Start/stop the local test stack: fake AssemblyAI (8100), API (8000), web (3000).
# usage: [LLM_MODE=assemblyai|openrouter|groq] [EMBEDDINGS=on] [IMPORTS=public]
#        servers.sh start|stop fake|api|api-nokey|api-nollm|web
#   LLM_MODE picks who answers the API's LLM calls (both are the fake server):
#   assemblyai = AssemblyAI LLM Gateway shape (default); openrouter, groq = OpenAI-compatible.
set -u
SP="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SP/.." && pwd)"
action=$1; name=$2
case $name in
  fake) port=8100 ;; api|api-nokey|api-nollm) port=8000 ;; web) port=3000 ;;
esac

# Git Bash on Windows has no setsid, lsof, or pgrep: find listeners with netstat, kill with taskkill.
case "$(uname -s)" in MINGW*|MSYS*|CYGWIN*) windows=1 detach= ;; *) windows= detach=setsid ;; esac

port_pids() {
  if [ -n "$windows" ]; then
    netstat -ano | awk -v port=":$port" '$1 == "TCP" && $4 == "LISTENING" && substr($2, length($2) - length(port) + 1) == port { print $5 }' | sort -u
  elif [ "$name" = web ]; then
    # lsof doesn't list Node's listening socket here; match the process titles instead.
    { pgrep -f '^next-server'; pgrep -f '^npm run start'; } 2>/dev/null | sort -u
  else
    lsof -t -iTCP:"$port" -sTCP:LISTEN 2>/dev/null | sort -u
  fi
}

kill_pid() {
  if [ -n "$windows" ]; then
    taskkill //PID "$1" //T //F > /dev/null 2>&1
  else
    kill "-$2" "$1" 2>/dev/null
  fi
}

stop() {
  for pid in $(port_pids); do kill_pid "$pid" TERM; done
  for _ in $(seq 1 30); do
    [ -z "$(port_pids)" ] && return 0
    sleep 0.3
  done
  for pid in $(port_pids); do kill_pid "$pid" KILL; done
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
    ASSEMBLYAI_LLM_BASE_URL=http://127.0.0.1:8100 CORS_ORIGINS=http://localhost:3000
    GITHUB_API_BASE_URL=http://127.0.0.1:8100/github)
  local openrouter=(LLM_PROVIDER=openrouter LLM_BASE_URL=http://127.0.0.1:8100/v1
    LLM_MODEL=vendor/big:free LLM_FAST_MODEL=vendor/small:free)
  case "${LLM_MODE:-assemblyai}" in
    openrouter) env+=("${openrouter[@]}" LLM_API_KEY=fake-key LLM_REASONING_EFFORT=low) ;;
    groq) env+=(LLM_PROVIDER=groq LLM_BASE_URL=http://127.0.0.1:8100/v1 LLM_API_KEY=fake-key
      LLM_MODEL=openai/gpt-oss-120b LLM_FAST_MODEL=openai/gpt-oss-20b LLM_REASONING_EFFORT=low) ;;
    *) env+=(LLM_PROVIDER=assemblyai) ;;
  esac
  # EMBEDDINGS=on: semantic retrieval on the fake embeddings API (off by default: BM25 only).
  if [ "${EMBEDDINGS:-off}" = on ]; then
    env+=(EMBEDDING_PROVIDER=custom EMBEDDING_BASE_URL=http://127.0.0.1:8100/v1 EMBEDDING_API_KEY=fake-key
      EMBEDDING_MODEL=fake-embed)
  else
    env+=(EMBEDDING_PROVIDER=none)
  fi
  # The fake web page lives on 127.0.0.1; IMPORTS=public keeps the production guard on.
  [ "${IMPORTS:-local}" = public ] || env+=(IMPORT_ALLOW_PRIVATE_HOSTS=true)
  # Run from e2e/, so a developer's apps/api/.env (real keys) never reaches the fake stack.
  local api=(uv run --project "$ROOT/apps/api" uvicorn --app-dir "$ROOT/apps/api" app.main:app --port 8000
    --timeout-graceful-shutdown 1)
  case $name in
    fake)
      (cd "$SP" && $detach uv run --project "$ROOT/apps/api" uvicorn fake_assemblyai:app --port 8100 --log-level warning > "$SP/fake.log" 2>&1 &) ;;
    api)
      (cd "$SP" && env "${env[@]}" ASSEMBLYAI_API_KEY=fake-key $detach "${api[@]}" > "$SP/api.log" 2>&1 &) ;;
    api-nokey)
      (cd "$SP" && env "${env[@]}" ASSEMBLYAI_API_KEY= $detach "${api[@]}" > "$SP/api.log" 2>&1 &) ;;
    api-nollm)  # speech configured, OpenRouter chosen but LLM_API_KEY left empty
      (cd "$SP" && env "${env[@]}" "${openrouter[@]}" LLM_API_KEY= ASSEMBLYAI_API_KEY=fake-key $detach "${api[@]}" > "$SP/api.log" 2>&1 &) ;;
    web)
      (cd "$ROOT/apps/web" && NEXT_PUBLIC_API_URL=http://localhost:8000 $detach npm run start -- -p 3000 > "$SP/web.log" 2>&1 &) ;;
  esac
  wait_ready
}

"$action"
