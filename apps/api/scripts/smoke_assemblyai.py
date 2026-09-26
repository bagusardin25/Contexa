"""First live run against AssemblyAI: every call Contexa makes, checked one by one.

Run it from apps/api after setting ASSEMBLYAI_API_KEY in .env:

    uv run python -m scripts.smoke_assemblyai
    uv run python -m scripts.smoke_assemblyai --wav question.wav   # also transcribe a file
    uv run python -m scripts.smoke_assemblyai --skip-llm           # speech checks only

The WAV file must be 16 kHz, mono, 16-bit PCM. Convert anything else with:

    ffmpeg -i input.m4a -ar 16000 -ac 1 -sample_fmt s16 question.wav

It uses the server's own settings, prompts, schemas, and streaming URLs, spends a few
cents at most (a few seconds of streaming per model and two short LLM calls), and never
prints the API key.
"""

import argparse
import asyncio
import json
import sys
import time
import wave
from pathlib import Path
from typing import Any

import httpx
from pydantic import ValidationError
from websockets.asyncio.client import ClientConnection, connect
from websockets.exceptions import ConnectionClosed, InvalidStatus

from app.assemblyai.routing import SAMPLE_RATE, speech_model_for, websocket_url
from app.assemblyai.tokens import StreamingTokenClient, StreamingTokenError
from app.config import Settings
from app.conversation.pipeline import ANALYSIS_MAX_TOKENS, ANSWER_MAX_TOKENS
from app.llm.gateway import LLMError, LLMGateway
from app.llm.prompts import Excerpt, answer_prompt, turn_analysis_prompt
from app.models.ai import ANSWER_SCHEMA, TURN_ANALYSIS_SCHEMA, AnswerDraft, TurnAnalysis
from app.models.session import SessionConfig, SpeakerLanguage

FRAME_MS = 50
FRAME_BYTES = SAMPLE_RATE * 2 * FRAME_MS // 1000  # PCM16 mono
QUESTION = "I read your architecture document. How does your app handle concurrent updates?"
EXCERPT = Excerpt(
    label="C1",
    source="README.md · Conflict handling",
    text=(
        "Each note row carries a version column. Writes use optimistic locking: the client "
        "sends the version it last read, and the update is rejected when the stored version "
        "has changed."
    ),
)
SAMPLE_KEYTERMS = ["Contexa", "AssemblyAI", "Supabase"]
FREE_PLAN_HINT = (
    "If the streaming checks passed with this key, the key is fine: the LLM Gateway isn't "
    "part of AssemblyAI's free plan (free credits cover speech only). Add a payment method "
    "and a small balance in the AssemblyAI dashboard, then rerun."
)

failures: list[str] = []


def report(status: str, name: str, detail: str, hint: str = "") -> bool:
    print(f"[{status}] {name}: {detail}")
    if hint and status == "FAIL":
        print(f"       -> {hint}")
    if status == "FAIL":
        failures.append(name)
    return status != "FAIL"


def redact(text: str, settings: Settings) -> str:
    return text.replace(settings.api_key, "[redacted]") if settings.api_key else text


def llm_hint(message: str) -> str:
    lowered = message.lower()
    if any(code in message for code in ("HTTP 401", "HTTP 402", "HTTP 403")) or any(
        word in lowered for word in ("free", "credit", "balance", "payment", "billing", "upgrade")
    ):
        return FREE_PLAN_HINT
    if "model" in lowered:
        return "Check the model ids against the models list above and update apps/api/.env."
    if "timed out" in lowered:
        return "Rerun; if it keeps timing out, raise LLM_TIMEOUT_SECONDS."
    return ""


async def mint_token(settings: Settings, max_session_seconds: int) -> str | None:
    client = StreamingTokenClient(
        api_key=settings.api_key, base_url=settings.assemblyai_streaming_base_url
    )
    try:
        token = await client.create(expires_in_seconds=60, max_session_seconds=max_session_seconds)
    except StreamingTokenError as exc:
        report("FAIL", "Streaming token", exc.message, "Check ASSEMBLYAI_API_KEY in apps/api/.env.")
        return None
    finally:
        await client.aclose()
    return token.token


async def collect_turns(ws: ClientConnection, finals: list[str]) -> dict[str, Any]:
    seen_fields = False
    async for raw in ws:
        if isinstance(raw, bytes):
            continue
        message = json.loads(raw)
        kind = message.get("type")
        if kind == "Turn":
            if not seen_fields:
                print(f"       Turn fields: {', '.join(sorted(message))}")
                seen_fields = True
            if message.get("end_of_turn"):
                finals.append(message.get("transcript", ""))
                print(
                    f"       final turn {message.get('turn_order')}: "
                    f"{message.get('transcript')!r} speaker={message.get('speaker_label')} "
                    f"language={message.get('language_code')} "
                    f"formatted={message.get('turn_is_formatted')}"
                )
        elif kind == "Termination":
            return message
        else:
            print(f"       message: {str(message)[:200]}")
    return {}


async def check_stream(settings: Settings, language: SpeakerLanguage, audio: bytes) -> None:
    model = speech_model_for(language)
    name = f"Streaming {model} ({language})"
    token = await mint_token(settings, max_session_seconds=120)
    if token is None:
        return
    keyterms = SAMPLE_KEYTERMS if model == "universal-3-5-pro" else []
    config = SessionConfig(speaker_language=language, speaker_labels=True)
    url = websocket_url(settings.assemblyai_streaming_ws_url, config, token, keyterms)
    finals: list[str] = []
    try:
        async with connect(url, open_timeout=10, max_size=None) as ws:
            begin = json.loads(await asyncio.wait_for(ws.recv(), 10))
            if begin.get("type") != "Begin":
                report("FAIL", name, f"expected Begin, got {str(begin)[:200]}")
                return
            receiver = asyncio.create_task(collect_turns(ws, finals))
            for offset in range(0, len(audio), FRAME_BYTES):
                await ws.send(audio[offset : offset + FRAME_BYTES])
                await asyncio.sleep(FRAME_MS / 1000)
            await asyncio.sleep(2)  # let the last turn end
            await ws.send(json.dumps({"type": "Terminate"}))
            termination = await asyncio.wait_for(receiver, 10)
    except InvalidStatus as exc:
        body = redact(exc.response.body.decode(errors="replace")[:200], settings)
        report("FAIL", name, f"handshake rejected: HTTP {exc.response.status_code} {body}")
        return
    except ConnectionClosed as exc:
        closed = exc.rcvd
        reason = f"{closed.code} {closed.reason}" if closed else "no close frame"
        report(
            "FAIL",
            name,
            f"AssemblyAI closed the connection: {reason}",
            "If the reason names a parameter, this model doesn't accept it; the URL is built "
            "in app/assemblyai/routing.py.",
        )
        return
    except (TimeoutError, OSError) as exc:
        report("FAIL", name, f"{type(exc).__name__}: {exc}")
        return

    detail = f"session began ({begin.get('id', '?')})"
    if keyterms:
        detail += f", keyterms_prompt with {len(keyterms)} terms accepted"
    if termination:
        detail += f", terminated after {termination.get('audio_duration_seconds', '?')} s audio"
    detail += f", {len(finals)} final turn(s)"
    report("OK", name, detail)


async def check_models(settings: Settings) -> None:
    wanted = {settings.analysis_model, settings.assemblyai_llm_model}
    async with httpx.AsyncClient(base_url=settings.assemblyai_llm_base_url, timeout=15) as client:
        try:
            response = await client.get("/v1/models", headers={"Authorization": settings.api_key})
        except httpx.HTTPError as exc:
            report("FAIL", "LLM Gateway models", f"couldn't reach it ({type(exc).__name__})")
            return
    if response.status_code == 404:
        report("SKIP", "LLM Gateway models", "no models endpoint; the calls below decide")
        return
    if response.status_code >= 400:
        detail = redact(" ".join(response.text.split())[:200], settings)
        report(
            "FAIL",
            "LLM Gateway models",
            f"HTTP {response.status_code}: {detail}",
            llm_hint(f"HTTP {response.status_code} {detail}"),
        )
        return
    try:
        body = response.json()
        items = body.get("data", []) if isinstance(body, dict) else body
        ids = sorted({str(item["id"] if isinstance(item, dict) else item) for item in items})
    except (ValueError, KeyError, TypeError):
        report("SKIP", "LLM Gateway models", "unexpected response shape; the calls below decide")
        return
    claude = ", ".join(model for model in ids if "claude" in model) or "none"
    missing = sorted(wanted - set(ids))
    if missing:
        report(
            "FAIL",
            "LLM Gateway models",
            f"{len(ids)} models; Claude ids: {claude}",
            f"Not in the list: {', '.join(missing)}. Pick ids from the list for "
            "ASSEMBLYAI_LLM_MODEL / ASSEMBLYAI_LLM_FAST_MODEL.",
        )
    else:
        report("OK", "LLM Gateway models", f"{', '.join(sorted(wanted))} available")


async def check_llm(settings: Settings) -> None:
    llm = LLMGateway(
        api_key=settings.api_key,
        model=settings.assemblyai_llm_model,
        base_url=settings.assemblyai_llm_base_url,
        timeout=settings.llm_timeout_seconds,
        temperature=settings.llm_temperature,
    )
    try:
        name = f"Turn analysis ({settings.analysis_model})"
        system, user = turn_analysis_prompt(
            text=QUESTION, speaker="B", target_language="id", translate=True, recent=[]
        )
        started = time.perf_counter()
        try:
            analysis = TurnAnalysis.model_validate(
                await llm.complete_json(
                    system=system,
                    user=user,
                    schema_name="turn_analysis",
                    schema=TURN_ANALYSIS_SCHEMA,
                    max_tokens=ANALYSIS_MAX_TOKENS,
                    model=settings.analysis_model,
                )
            )
        except (LLMError, ValidationError) as exc:
            report("FAIL", name, str(exc), llm_hint(str(exc)))
        else:
            elapsed = round((time.perf_counter() - started) * 1000)
            report(
                "OK",
                name,
                f"{elapsed} ms · {analysis.type}, requires_answer={analysis.requires_answer}, "
                f"id: {analysis.translation!r}",
            )

        name = f"Grounded answer ({settings.assemblyai_llm_model})"
        system, user = answer_prompt(
            question=QUESTION,
            speaker="B",
            preferred_language="id",
            target_language="en",
            excerpts=[EXCERPT],
            recent=[],
        )
        started = time.perf_counter()
        try:
            draft = AnswerDraft.model_validate(
                await llm.complete_json(
                    system=system,
                    user=user,
                    schema_name="grounded_answer",
                    schema=ANSWER_SCHEMA,
                    max_tokens=ANSWER_MAX_TOKENS,
                    model=settings.assemblyai_llm_model,
                )
            )
        except (LLMError, ValidationError) as exc:
            report("FAIL", name, str(exc), llm_hint(str(exc)))
        else:
            elapsed = round((time.perf_counter() - started) * 1000)
            report(
                "OK",
                name,
                f"{elapsed} ms · cites {draft.used_chunk_ids} · {draft.answer_target_language!r}",
            )
    finally:
        await llm.aclose()


def load_wav(path: Path) -> bytes:
    with wave.open(str(path), "rb") as wav:
        if (wav.getframerate(), wav.getnchannels(), wav.getsampwidth()) != (SAMPLE_RATE, 1, 2):
            raise SystemExit(
                f"{path} must be 16 kHz mono 16-bit PCM. Convert it with:\n"
                f"  ffmpeg -i {path} -ar 16000 -ac 1 -sample_fmt s16 converted.wav"
            )
        return wav.readframes(wav.getnframes())


async def main(args: argparse.Namespace) -> int:
    settings = Settings()
    if not settings.api_key:
        print("ASSEMBLYAI_API_KEY is empty. Copy .env.example to .env in apps/api and set it.")
        return 1
    print(f"Streaming: {settings.assemblyai_streaming_ws_url}")
    print(f"LLM: analysis={settings.analysis_model} answers={settings.assemblyai_llm_model}\n")

    # Two seconds of silence proves the connection parameters; a WAV also proves transcripts.
    audio = load_wav(args.wav) if args.wav else bytes(FRAME_BYTES * 40)
    if await mint_token(settings, max_session_seconds=60):
        report("OK", "Streaming token", "minted")
        for language in args.languages:
            await check_stream(settings, language, audio)
    if not args.skip_llm:
        await check_models(settings)
        await check_llm(settings)

    print()
    print("All checks passed." if not failures else f"Failed: {', '.join(failures)}")
    return 1 if failures else 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Check Contexa's AssemblyAI calls live.")
    parser.add_argument("--wav", type=Path, help="16 kHz mono PCM16 WAV to stream")
    parser.add_argument("--skip-llm", action="store_true", help="only check speech-to-text")
    parser.add_argument(
        "--languages",
        nargs="+",
        default=["en", "id"],
        choices=["en", "ja", "multi", "id", "auto"],
        help="speaker languages to stream (en → universal-3-5-pro, id → whisper-rt)",
    )
    sys.exit(asyncio.run(main(parser.parse_args())))
