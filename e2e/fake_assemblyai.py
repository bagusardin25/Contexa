"""Fake AssemblyAI for local end-to-end tests: token, v3 streaming WS, LLM Gateway.

Turns are driven by the amount of audio received, so nothing happens unless the
client really streams PCM16 at 16 kHz.
"""

import asyncio
import json
import time
from urllib.parse import parse_qs

from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse

API_KEY = "fake-key"
TOKEN = "fake-token"
BYTES_PER_MS = 32  # 16 kHz * 2 bytes / 1000

app = FastAPI()
log: dict = {"connections": [], "messages": [], "llm": [], "drop_next": False,
             "llm_mode": "ok", "reject_next": 0}

SCRIPT = [
    # (speaker, text, start_ms, end_ms)
    ("A", "Welcome back, everyone. Next up is a team building a realtime notes app.", 300, 2300),
    ("B", "How does your application handle concurrent updates when two people edit the same note?", 3000, 5600),
]


def words_for(text: str, start: int, end: int, upto: int | None = None):
    parts = text.split()
    step = (end - start) / len(parts)
    words = []
    for index, part in enumerate(parts):
        w_start = int(start + index * step)
        if upto is not None and w_start > upto:
            break
        words.append({"start": w_start, "end": int(w_start + step * 0.9), "text": part,
                      "confidence": 0.98, "word_is_final": upto is None})
    return words


@app.get("/v3/token")
async def token(request: Request):
    if request.headers.get("authorization") != API_KEY:
        return JSONResponse({"error": "Unauthorized"}, status_code=401)
    await asyncio.sleep(log.get("token_delay", 0))
    expires = int(request.query_params.get("expires_in_seconds", "60"))
    return {"token": TOKEN, "expires_in_seconds": expires}


@app.websocket("/v3/ws")
async def stream(ws: WebSocket):
    query = {k: v[0] for k, v in parse_qs(ws.url.query).items()}
    record = {"query": query, "audio_bytes": 0, "updates": [], "closed_by": None}
    log["connections"].append(record)
    if query.get("token") != TOKEN:
        await ws.close(code=1008, reason="Unauthorized: invalid token")
        return
    await ws.accept()
    if log["reject_next"] > 0:
        log["reject_next"] -= 1
        record["closed_by"] = "server-reject"
        await ws.send_json({"error": "Invalid parameter: speech_model"})
        await ws.close(code=1008, reason="Invalid parameter: speech_model")
        return
    started = time.time()
    await ws.send_json({"type": "Begin", "id": f"fake-{len(log['connections'])}", "expires_at": int(started) + 3600})
    received_ms = 0
    emitted_partial: dict[int, int] = {}
    finalized: set[int] = set()
    try:
        while True:
            message = await ws.receive()
            if message["type"] == "websocket.disconnect":
                record["closed_by"] = "client"
                return
            if message.get("bytes") is not None:
                chunk = message["bytes"]
                record["audio_bytes"] += len(chunk)
                received_ms = record["audio_bytes"] // BYTES_PER_MS
                if log["drop_next"]:
                    log["drop_next"] = False
                    record["closed_by"] = "server-drop"
                    await ws.close(code=1011, reason="simulated drop")
                    return
                for order, (speaker, text, start, end) in enumerate(SCRIPT):
                    if order in finalized or received_ms < start:
                        continue
                    if received_ms < end:
                        # partial every ~300 ms of audio
                        bucket = (received_ms - start) // 300
                        if emitted_partial.get(order) != bucket:
                            emitted_partial[order] = bucket
                            words = words_for(text, start, end, upto=received_ms)
                            await ws.send_json({
                                "type": "Turn", "turn_order": order, "turn_is_formatted": False,
                                "end_of_turn": False, "transcript": " ".join(w["text"] for w in words).lower(),
                                "end_of_turn_confidence": 0.1, "words": words,
                                "speaker_label": speaker,
                            })
                    else:
                        finalized.add(order)
                        await ws.send_json({
                            "type": "Turn", "turn_order": order, "turn_is_formatted": True,
                            "end_of_turn": True, "transcript": text, "end_of_turn_confidence": 0.9,
                            "words": words_for(text, start, end), "speaker_label": speaker,
                            "language_code": "en", "language_confidence": 0.99,
                        })
            elif message.get("text") is not None:
                data = json.loads(message["text"])
                log["messages"].append(data)
                if data.get("type") == "Terminate":
                    await ws.send_json({"type": "Termination", "audio_duration_seconds": round(received_ms / 1000, 2),
                                        "session_duration_seconds": round(time.time() - started, 2)})
                    record["closed_by"] = "terminate"
                    await ws.close(code=1000)
                    return
                if data.get("type") == "UpdateConfiguration":
                    record["updates"].append(data)
    except WebSocketDisconnect:
        record["closed_by"] = record["closed_by"] or "client"


def authorized(request: Request) -> bool:
    return request.headers.get("authorization") in (API_KEY, f"Bearer {API_KEY}")


@app.get("/v1/models")
async def models(request: Request):
    if not authorized(request):
        return JSONResponse({"error": "Unauthorized"}, status_code=401)
    ids = ["claude-sonnet-4-6", "claude-haiku-4-5", "vendor/big:free", "vendor/small:free", "vendor/paid-model"]
    return {"data": [{"id": i} for i in ids]}


@app.post("/v1/chat/completions")
async def chat(request: Request):
    if not authorized(request):
        return JSONResponse({"error": {"message": "Unauthorized"}}, status_code=401)
    body = await request.json()
    kind = (body.get("response_format") or {}).get("type", "prompt")
    system = body["messages"][0]["content"]
    name = ("session_recap" if "open_questions" in system
            else "grounded_answer" if "question_summary" in system else "turn_analysis")
    budget = body.get("max_tokens", body.get("max_completion_tokens"))
    log["llm"].append({"model": body["model"], "name": name, "format": kind,
                       "temperature": body.get("temperature"), "provider": body.get("provider"),
                       "auth": request.headers.get("authorization", "")[:6],
                       "max_tokens": budget, "reasoning_effort": body.get("reasoning_effort"),
                       "reasoning": body.get("reasoning"),
                       "system": system if name == "grounded_answer" else None})
    if log["llm_mode"] == "reasoning_cut" and budget <= 1200:  # first attempts only
        # A reasoning model that spent the whole budget thinking.
        return {"choices": [{"message": {"role": "assistant", "content": None,
                                         "reasoning": "Let me think about the translation..."},
                             "finish_reason": "length"}]}
    if log["llm_mode"] == "no_schema" and kind in ("json_schema", "json_object"):
        return JSONResponse({"error": {"message": f"response_format {kind} is not supported for this model"}}, status_code=400)
    if log["llm_mode"] == "rate_limit":
        return JSONResponse({"error": {"message": "Rate limit exceeded: free-models-per-day. Add 10 credits to unlock 1000 free model requests per day"}},
                            status_code=429, headers={"retry-after": "0"})
    if log["llm_mode"] == "fail":
        return JSONResponse(
            {"error": {"message": "LLM Gateway is not available on the free plan. Add a payment method to upgrade."}},
            status_code=403,
        )
    user = body["messages"][1]["content"]
    turn_text = user.rsplit("\n", 1)[-1]
    if name == "session_recap":
        await asyncio.sleep(0.5)
        log["recap_user"] = user
        content = {
            "summary": "Tim membahas cara Notewave menangani pembaruan bersamaan pada catatan yang sama.",
            "key_points": ["Optimistic locking dengan kolom version"],
            "action_items": ["Speaker B: kirim dokumen arsitektur lengkap"],
            "open_questions": ["Bagaimana konflik ditampilkan ke pengguna?"],
        }
    elif name == "turn_analysis":
        await asyncio.sleep(0.3)
        question = "?" in turn_text
        content = {
            "source_language": "en",
            "translation": (
                "Bagaimana aplikasi Anda menangani concurrent updates ketika dua orang mengedit catatan yang sama?"
                if question else "Selamat datang kembali, semuanya. Berikutnya tim yang membangun aplikasi catatan realtime."
            ),
            "technical_terms_preserved": ["concurrent updates"] if question else ["realtime"],
            "type": "question" if question else "statement",
            "requires_answer": question,
            "confidence": 0.95 if question else 0.97,
            "search_keywords": ["concurrent updates", "optimistic locking", "version column"] if question else [],
        }
    else:
        await asyncio.sleep(0.6)
        cited = ["C1"] if "[C1]" in user else []
        content = {
            "question_summary": "Bagaimana aplikasi menangani pembaruan bersamaan?",
            "answer_preferred_language": "Kami memakai optimistic locking dengan kolom version.",
            "answer_target_language": "We use optimistic locking with a version column.",
            "used_chunk_ids": cited,
            "confidence_note": "Berdasarkan dokumen yang diunggah." if cited else "Tidak ada dokumen yang relevan.",
        }
    text = json.dumps(content)
    if kind == "prompt":  # chatty models wrap prompt-only JSON
        text = "Here is the JSON:\n```json\n" + text + "\n```"
    return {"choices": [{"message": {"role": "assistant", "content": text}}]}


@app.post("/__control/drop")
async def drop():
    log["drop_next"] = True
    return {"ok": True}


@app.post("/__control/llm")
async def llm_mode(mode: str = "ok"):
    log["llm_mode"] = mode
    return {"ok": True}


@app.post("/__control/reject")
async def reject(count: int = 1):
    log["reject_next"] = count
    return {"ok": True}


@app.post("/__control/slow_token")
async def slow_token(seconds: float = 0):
    log["token_delay"] = seconds
    return {"ok": True}


@app.post("/__control/reset")
async def reset_log():
    log.update({"connections": [], "messages": [], "llm": [], "drop_next": False,
                "llm_mode": "ok", "reject_next": 0, "token_delay": 0})
    return {"ok": True}


@app.get("/__control/log")
async def get_log():
    return log
