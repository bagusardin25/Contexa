# Contexa — AssemblyAI Implementation & Hackathon Guide

> Audience: human developers, Codex, Claude Code, Cursor, GitHub Copilot, and other coding agents.
>
> Purpose: prevent implementation drift, outdated AssemblyAI integrations, insecure API-key handling, and hackathon scope creep.
>
> This file is an engineering guardrail. **Read it before implementing or modifying the voice pipeline.**
>
> Last research refresh: 2026-09-25.

---

# 1. Non-Negotiable Product Intent

Contexa is a **real-time multilingual conversation copilot**.

The core experience is:

```text
live foreign-language speech
        ↓
AssemblyAI real-time transcription
        ↓
translation into user's preferred language
        ↓
question/action detection
        ↓
retrieve relevant uploaded context
        ↓
generate grounded suggested response
        ↓
render a ready-to-say answer in target language
```

Do not reduce the project to:

- a generic chatbot,
- a file Q&A app,
- a transcript viewer,
- a post-meeting summarizer,
- a basic translator.

The hackathon demonstration must clearly show **voice → AssemblyAI → useful downstream intelligence**.

---

# 2. Hackathon Facts

Event:
**AssemblyAI - Voice Agent Hackathon**

Organizer:
- lablab.ai
- AssemblyAI

Current official event page states:

- Online hackathon.
- Build window: **September 1–30, 2026**.
- Prize pool: **$10,000 total**:
  - $5,000 cash,
  - $5,000 AssemblyAI credits.
- **Every participant builds on AssemblyAI.**

Official event page:
https://lablab.ai/ai-hackathons/assemblyai-voice-agent-hackathon

Live dashboard:
https://lablab.ai/ai-hackathons/assemblyai-voice-agent-hackathon/live

---

# 3. Submission Requirements

lablab.ai's official guide states that a complete hackathon submission needs:

1. **A working prototype that others can use online.**
2. **A video presentation.**
3. **A pitch deck.**

Official guide:
https://lablab.ai/guide

Do not treat a local-only prototype as sufficient.

---

# 4. Judging Optimization

The event page currently emphasizes building on AssemblyAI but does not expose a separate numeric event-specific rubric in the public page text.

Use lablab.ai's official general judging guidance as the optimization target unless the event organizers publish a more specific rubric.

The general lablab guide identifies four judging dimensions:

1. **Presentation**
2. **Business Value**
3. **Application of Technology**
4. **Originality**

Reference:
https://lablab.ai/guide/how-to-win-an-ai-hackathon

## 4.1 Presentation

Agent implication:

- Build a demoable golden path.
- Optimize for clarity.
- The product should be understandable within the opening of the demo.
- Do not hide the AssemblyAI integration behind mock data.

## 4.2 Business Value

Agent implication:

Keep the target user concrete:

> people who understand the topic but struggle to participate in foreign-language live discussions.

Do not rewrite the product as a generic "AI for everyone."

## 4.3 Application of Technology

Agent implication:

AssemblyAI must perform meaningful runtime work.

Strong implementation signals:

- real AssemblyAI streaming connection,
- live audio,
- real transcript events,
- working deployed demo,
- actual RAG/translation flow,
- no fake transcript hardcoding,
- visible technical architecture.

## 4.4 Originality

The differentiator is NOT "speech translation."

The differentiator is:

> live translation + context-aware question understanding + grounded response assistance.

Keep these together in the core experience.

---

# 5. Architecture Decision

## Approved Architecture

Use **AssemblyAI Streaming STT + custom orchestration**.

```text
Browser Audio
    ↓
AssemblyAI Streaming STT
    ↓
Normalized Turn Events
    ↓
Translation
    ↓
Question Detection
    ↓
RAG / Context Retrieval
    ↓
LLM Reasoning
    ↓
Suggested Answer
```

This is a deliberate bring-your-own-orchestration architecture.

## Do Not Default To

The managed AssemblyAI Voice Agent API as a black box for the entire product.

Why:

Contexa needs explicit control over:

- the translated transcript,
- question classification,
- uploaded documents,
- retrieval,
- answer generation,
- evidence,
- output language,
- UI state.

The managed Voice Agent API may be used later for additional features, but it is not required for the MVP architecture.

---

# 6. AssemblyAI Is Runtime Infrastructure

Codex/Claude Code/Cursor/etc. are **development tools**.

AssemblyAI is **runtime product infrastructure**.

The application must make real AssemblyAI API calls when running.

Correct mental model:

```text
Codex / Claude Code
       ↓
writes application code
       ↓
Contexa
       ↓
calls AssemblyAI at runtime
```

Do not confuse the coding agent with the hackathon technology requirement.

---

# 7. AssemblyAI API Key

Use:

```env
ASSEMBLYAI_API_KEY=...
```

Never commit a real key.

Never expose the raw key in:

- client source,
- Next.js public environment variables,
- browser JavaScript,
- repository history,
- screenshots,
- demo video.

`.env.example` may contain placeholders only.

---

# 8. Streaming Endpoint

Current AssemblyAI streaming WebSocket endpoint:

```text
wss://streaming.assemblyai.com/v3/ws
```

For Universal-3.5 Pro Realtime:

```text
speech_model=universal-3-5-pro
```

Official references:

- https://www.assemblyai.com/docs/streaming/
- https://www.assemblyai.com/blog/real-time-transcription-code-switches-multilingual-speakers
- https://www.assemblyai.com/docs/streaming/migration-guides/gladia-to-aai-streaming

## Do Not Use

Old endpoints such as:

```text
/v2/realtime/ws
```

unless current official docs explicitly say otherwise.

---

# 9. Audio Format

Recommended streaming audio configuration:

- PCM16
- signed little-endian
- mono
- 16 kHz

Keep audio chunking small enough for realtime behavior.

Do not unnecessarily upsample audio.

---

# 10. Browser Authentication Pattern

Raw AssemblyAI keys must remain server-side.

If the browser connects directly to AssemblyAI streaming:

1. browser calls our backend,
2. backend uses `ASSEMBLYAI_API_KEY`,
3. backend mints a short-lived AssemblyAI streaming token,
4. browser uses the token for the WebSocket session.

Current token pattern documented by AssemblyAI:

```text
GET https://streaming.assemblyai.com/v3/token?expires_in_seconds=60
Authorization: <ASSEMBLYAI_API_KEY>
```

The coding agent should verify the exact current token API against official docs before shipping.

Alternative:
proxy the WebSocket through our backend.

For the hackathon, prefer the simpler reliable architecture while keeping the raw key private.

Official coding-agent reference:
https://www.assemblyai.com/docs/coding-agent-prompts

---

# 11. AssemblyAI Event Handling

Treat partial and finalized turns differently.

Typical Turn fields include concepts such as:

```json
{
  "type": "Turn",
  "transcript": "...",
  "end_of_turn": true
}
```

## Partial Turn

If:

```text
end_of_turn = false
```

Use for:
- live UI transcript,
- immediate visual feedback.

Do NOT:
- run RAG,
- generate full answers,
- repeatedly save expensive derived records.

## Final Turn

If:

```text
end_of_turn = true
```

Use for:
- persistence,
- translation,
- question detection,
- RAG,
- answer generation.

This rule is critical for latency and cost.

---

# 12. Model Routing Rules

## 12.1 Universal-3.5 Pro Realtime

Use for live audio in its supported core language set.

Current official AssemblyAI material documents native code-switching across 18 languages:

- English
- Spanish
- French
- German
- Italian
- Portuguese
- Arabic
- Danish
- Dutch
- Finnish
- Hebrew
- Hindi
- Japanese
- Mandarin/Chinese
- Norwegian
- Swedish
- Turkish
- Vietnamese

Model:

```text
universal-3-5-pro
```

Good demo choices:
- English
- Japanese

Official reference:
https://www.assemblyai.com/blog/real-time-transcription-code-switches-multilingual-speakers

---

# 13. Indonesian Language Rule

**Indonesian is not in the documented 18-language Universal-3.5 Pro Realtime set.**

Do not force Indonesian speech into the Pro model and assume quality.

If the user is speaking Indonesian and we need live Indonesian STT, use AssemblyAI:

```text
speech_model=whisper-rt
```

AssemblyAI Whisper Streaming supports 99+ languages and automatically detects the spoken language.

Do not pass a manual `language` parameter to `whisper-rt`; current AssemblyAI docs state that automatic language detection is built in.

Official reference:
https://www.assemblyai.com/docs/universal-streaming/multilingual-transcription

---

# 14. Important Translation Distinction

Do not confuse:

**speech-recognition language**
with
**display/translation language**.

Example:

Speaker talks in Japanese.

Correct pipeline:

```text
Japanese speech
      ↓
AssemblyAI Japanese STT
      ↓
Japanese transcript
      ↓
LLM text translation
      ↓
Indonesian text
```

This does NOT require Indonesian speech-to-text.

Only use `whisper-rt` for Indonesian when Indonesian itself is incoming spoken audio.

---

# 15. Speaker Diarization

AssemblyAI supports streaming diarization.

Enable using the documented streaming configuration:

```json
{
  "speaker_labels": true
}
```

Optional:

```json
{
  "max_speakers": 2
}
```

Current docs allow a speaker-count hint up to 10.

`Turn` events may include:

```json
{
  "speaker_label": "A"
}
```

Use diarization only if it improves the MVP.

Do not delay the core demo because speaker labels are imperfect.

Official reference:
https://www.assemblyai.com/docs/streaming/label-speakers-and-separate-channels

---

# 16. Context and Keyterms

For technical sessions, transcription accuracy can improve when the speech model receives useful context or domain terms.

Potential terms:

```text
AssemblyAI
WebSocket
Supabase
PostgreSQL
pgvector
Next.js
FastAPI
Pull Request
GitHub
migration
endpoint
```

If using supported contextual/keyterm features:
- derive them from uploaded project documents,
- keep the list focused,
- never send huge document content as a keyterm list.

---

# 17. AssemblyAI LLM Gateway

Preferred reasoning/translation integration for the hackathon:

```text
POST https://llm-gateway.assemblyai.com/v1/chat/completions
```

Auth:

```text
Authorization: <ASSEMBLYAI_API_KEY>
```

AssemblyAI LLM Gateway provides a unified interface for multiple model providers.

Current official docs show support for multiple model families including:
- Anthropic Claude,
- OpenAI GPT,
- Google Gemini,
- Qwen,
- Kimi,
- others.

Official references:

- https://www.assemblyai.com/docs/llm-gateway/chat-completions
- https://www.assemblyai.com/docs/lemur/summarize-audio/

## Why Use It Here

It increases the depth of AssemblyAI usage while preserving custom orchestration.

Use it for:
- translation,
- question classification,
- response generation,
- structured outputs.

---

# 18. LLM Model Configuration

Do not scatter model names across files.

Use one environment value:

```env
ASSEMBLYAI_LLM_MODEL=claude-sonnet-4-6
```

or another currently supported model.

All LLM Gateway calls must use a centralized client.

If a chosen model becomes unavailable, changing the environment configuration should be sufficient.

---

# 19. Structured Outputs

Prefer structured JSON contracts for machine-to-machine steps.

AssemblyAI LLM Gateway supports structured outputs on supported model families.

Use structured output for:

- turn classification,
- translation metadata,
- grounded answer payload.

Do not parse model prose with fragile regex if structured JSON is available.

Reference:
https://www.assemblyai.com/docs/llm-gateway/structured-outputs

---

# 20. Translation Pipeline

Translation should be performed on FINAL turns.

System behavior:

```text
AssemblyAI final transcript
        ↓
LLM Gateway
        ↓
translated text
```

Translation prompt rules:

- preserve factual meaning,
- preserve API names,
- preserve proper nouns,
- preserve source code identifiers,
- preserve common technical English terms if Indonesian translation would be awkward,
- do not answer the speaker during translation,
- do not summarize unless explicitly requested.

---

# 21. Question Detection

Question detection runs after final transcript stabilization.

Return a typed payload:

```json
{
  "type": "question",
  "requires_answer": true,
  "confidence": 0.95
}
```

Possible values:

```text
statement
question
action_request
other
```

The first MVP may use a lightweight LLM classifier.

Do not build an unnecessarily complex multi-agent classifier.

---

# 22. RAG Architecture

Uploaded files:

- `.pdf`
- `.docx`
- `.md`
- `.txt`

Pipeline:

```text
upload
  ↓
validate
  ↓
parse
  ↓
normalize
  ↓
chunk
  ↓
embed/index
  ↓
retrieve when question detected
```

RAG is our application layer, not AssemblyAI STT.

Recommended storage:
- Supabase PostgreSQL
- pgvector

Keep an interface allowing a lexical-search fallback.

---

# 23. Grounded Answer Rule

The response assistant must use:

1. current spoken question,
2. recent conversation turns,
3. retrieved user document context.

Never claim a document says something that cannot be found in retrieved context.

If evidence is insufficient, return a cautious answer.

Example:

```json
{
  "answer_preferred_language": "Dokumen yang diberikan belum menjelaskan detail tersebut...",
  "answer_target_language": "The provided documents do not specify that detail...",
  "used_context": []
}
```

---

# 24. Ready-to-Say Answer

Default behavior:

- concise,
- natural spoken language,
- no markdown,
- no citations inside the spoken response,
- approximately 2–5 sentences unless the user selects another mode.

The UI may separately display evidence.

---

# 25. System Audio Capture

For webinar/browser-tab demos, browser system/tab audio is more important than microphone input.

Use browser media APIs such as `getDisplayMedia()` where supported.

Concept:

```text
Browser tab with webinar
        ↓
user shares tab + audio
        ↓
MediaStream
        ↓
audio conversion/chunking
        ↓
AssemblyAI WebSocket
```

Browser behavior differs by browser and OS.

The UI must:
- instruct the user to share a tab with audio,
- handle `audio track missing`,
- avoid pretending capture succeeded when no audio track exists.

---

# 26. Microphone Input

Microphone input is optional for P0.

If implemented:

```text
getUserMedia({ audio: true })
```

Keep it separate from tab audio unless a deliberate mixing design is implemented.

Do not add complex two-channel mixing before the tab-audio golden path works.

---

# 27. Session Lifecycle

Each live session should have explicit states:

```text
idle
requesting_permission
connecting
listening
reconnecting
stopping
stopped
error
```

Do not represent disconnected state as "listening."

---

# 28. Terminate Streaming Sessions

AssemblyAI streaming billing is based on session duration.

Always close/terminate sessions when:

- user clicks Stop,
- page session ends where possible,
- unrecoverable error occurs,
- idle timeout is exceeded.

Whisper Streaming documentation explicitly warns that sessions are billed for how long the WebSocket remains open.

Reference:
https://www.assemblyai.com/docs/universal-streaming/multilingual-transcription

---

# 29. Error Isolation

The voice layer must remain usable if a downstream AI component fails.

Correct degradation:

```text
STT works
translation fails
→ show source transcript + retry translation
```

Incorrect behavior:

```text
RAG fails
→ tear down AssemblyAI WebSocket
```

Components should fail independently where possible.

---

# 30. Backend API Proposal

Example internal API surface:

```text
POST /api/sessions
POST /api/sessions/{id}/documents
POST /api/sessions/{id}/stream-token
POST /api/sessions/{id}/answer
GET  /api/sessions/{id}
GET  /api/sessions/{id}/turns
WS   /ws/sessions/{id}
```

Exact routes may change, but separation of concerns should remain.

---

# 31. Security Rules for Coding Agents

Never:

- print real API keys,
- include secrets in logs,
- return API keys to frontend,
- store unrestricted uploaded executable files,
- execute file content,
- trust client-provided MIME type alone,
- commit `.env`,
- put API key in `NEXT_PUBLIC_*`.

Prefer:

- backend secret storage,
- short-lived streaming tokens,
- file-size limits,
- allowlisted extensions,
- server-side MIME validation,
- scoped database access.

---

# 32. Coding-Agent Implementation Rules

Before changing voice integration:

1. Read this file.
2. Read the relevant current official AssemblyAI docs.
3. Confirm model name and endpoint have not changed.
4. Preserve the custom orchestration architecture unless explicitly instructed otherwise.
5. Write a small integration test or reproducible manual test.
6. Do not replace real AssemblyAI calls with mocks in the production/demo path.

---

# 33. Scope Control

If a coding agent proposes one of these before the golden path works, reject/defer it:

- authentication redesign,
- subscription billing,
- native app,
- browser extension,
- calendar integration,
- multi-agent framework,
- TTS voice cloning,
- automatic meeting joining bot,
- complicated workflow engine,
- custom ML training.

Prioritize:

```text
audio
→ AssemblyAI
→ transcript
→ translation
→ context
→ answer
```

---

# 34. Definition of Done — Voice Pipeline

The voice pipeline is done when:

- real browser audio reaches AssemblyAI,
- transcript partials render,
- final turns are distinguishable,
- session stop closes the connection,
- no raw key reaches the browser,
- source transcript survives downstream service failure.

---

# 35. Definition of Done — Intelligence Pipeline

The intelligence pipeline is done when:

- finalized turn is translated,
- question is detected,
- relevant document chunks are retrieved,
- a grounded suggested answer is generated,
- target-language ready-to-say text is rendered,
- evidence is visible separately.

---

# 36. Definition of Done — Hackathon Submission

Before submission:

- public/deployed prototype URL works,
- real AssemblyAI integration works in deployment,
- GitHub repository contains meaningful history,
- README explains architecture,
- video shows the product working,
- pitch deck exists,
- problem/target user is specific,
- demo shows meaningful AssemblyAI usage,
- no secrets are exposed,
- core interaction is understandable quickly.

---

# 37. Demo Quality Checklist

The demo should visibly prove:

- "This audio is live."
- "AssemblyAI is transcribing it."
- "The translation updates."
- "This is the uploaded context."
- "A question was detected."
- "These document chunks were retrieved."
- "This answer was generated from those chunks."
- "This is what the user can say back."

Avoid a demo where judges cannot tell whether outputs are prerecorded.

---

# 38. Hackathon-Focused Engineering Tradeoffs

Prefer:
- one reliable live pipeline,
- simple UI,
- explicit evidence,
- stable deployment,
- short latency,
- clear failure states.

Avoid:
- feature count,
- architecture complexity for its own sake,
- multiple unnecessary LLM calls,
- abstractions that slow development without improving demo reliability.

lablab.ai explicitly warns against over-engineering the AI layer and recommends getting the core loop working first.

Reference:
https://lablab.ai/guide/how-to-win-an-ai-hackathon

---

# 39. Differentiation Guardrail

If the product starts looking like:

```text
audio → transcript → translate
```

the coding/product agent must raise a warning.

The intended differentiating loop is:

```text
audio
→ transcript
→ translate
→ understand question
→ use private/user context
→ generate grounded response
→ translate response
```

---

# 40. Source Priority

When technical sources conflict, use this priority:

1. Current official AssemblyAI documentation.
2. Current official AssemblyAI release/blog posts.
3. Current lablab.ai event page.
4. Current lablab.ai official guide.
5. Existing repository implementation.
6. Third-party tutorials.

Do not blindly preserve outdated repository code over current official API documentation.

---

# 41. Verified Official References

## Hackathon

- Event:
  https://lablab.ai/ai-hackathons/assemblyai-voice-agent-hackathon

- Live dashboard:
  https://lablab.ai/ai-hackathons/assemblyai-voice-agent-hackathon/live

- lablab guide / submission requirements:
  https://lablab.ai/guide

- lablab judging/build guidance:
  https://lablab.ai/guide/how-to-win-an-ai-hackathon

## AssemblyAI Streaming

- Streaming documentation:
  https://www.assemblyai.com/docs/streaming/

- Universal-3.5 Pro Realtime / multilingual code-switching:
  https://www.assemblyai.com/blog/real-time-transcription-code-switches-multilingual-speakers

- Whisper Streaming:
  https://www.assemblyai.com/docs/universal-streaming/multilingual-transcription

- Streaming diarization:
  https://www.assemblyai.com/docs/streaming/label-speakers-and-separate-channels

- Coding agent integration reference:
  https://www.assemblyai.com/docs/coding-agent-prompts

## AssemblyAI LLM Gateway

- Chat completions:
  https://www.assemblyai.com/docs/llm-gateway/chat-completions

- Tool calling:
  https://www.assemblyai.com/docs/llm-gateway/tool-calling

- Structured outputs:
  https://www.assemblyai.com/docs/llm-gateway/structured-outputs

- LLM Gateway overview:
  https://www.assemblyai.com/docs/lemur/summarize-audio/

---

# 42. Final Instruction to Coding Agents

When uncertain, optimize for this sequence:

```text
1. Does the deployed live voice flow work?
2. Is AssemblyAI meaningfully used?
3. Can the user understand the foreign speaker?
4. Can the system retrieve relevant uploaded context?
5. Can it suggest a grounded response quickly?
6. Can a judge understand the value in one demo?
```

Do not optimize for maximum feature count.

**The product wins or loses on the quality of the real-time end-to-end loop.**
