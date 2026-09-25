# Contexa — Product Requirements Document (PRD)

> Working title: **Contexa**
>
> Hackathon: **AssemblyAI - Voice Agent Hackathon (lablab.ai)**
>
> Product category: **Real-time multilingual conversation copilot**
>
> Status: MVP specification
>
> Primary build objective: Create a deployed, demo-ready prototype that uses AssemblyAI meaningfully in the real-time voice pipeline.

---

## 1. Executive Summary

Contexa is a real-time multilingual conversation copilot for people who need to participate in webinars, technical training sessions, meetings, hackathon Q&A sessions, and cross-language discussions but are not fluent in the speaker's language.

The product listens to live speech, transcribes it with AssemblyAI, translates the conversation into the user's preferred language, identifies important questions, retrieves relevant context from user-provided documents, and generates a suggested answer in both:

1. the user's native/preferred language, and
2. the language required to answer the speaker.

The product is intentionally a **copilot**, not an autonomous impersonator. It helps the user understand and respond, while the user remains responsible for what is ultimately said.

---

## 2. Problem

A user may understand the technical topic being discussed but still struggle during international conversations because of language fluency, accent, speed, vocabulary, and the cognitive load of translating while thinking.

Typical situation:

- The user joins an English or Japanese webinar.
- The speaker talks continuously at normal speed.
- The user needs to understand the content in Indonesian.
- During Q&A, the speaker asks the user a technical question.
- The user may know the answer but cannot formulate it quickly in the speaker's language.
- The answer may depend on a project proposal, README, architecture document, research paper, or other files the user already has.
- Existing speech translation tools generally stop at "what was said" instead of helping with "what does this mean in my context?" and "what should I say next?"

This creates three distinct problems:

### 2.1 Comprehension Gap
The user cannot reliably follow real-time speech in a foreign language.

### 2.2 Context Gap
Generic translators do not know the user's project, documents, terminology, or current discussion context.

### 2.3 Response Gap
Even after understanding a question, the user may need additional time to formulate an accurate response and translate it into the other participant's language.

---

## 3. Proposed Solution

Contexa provides four layers of assistance:

### Layer A — Listen
Capture live audio from a browser tab, meeting, webinar, or microphone.

### Layer B — Understand
Use AssemblyAI Streaming Speech-to-Text to produce low-latency transcripts and speaker turns.

### Layer C — Interpret
Translate finalized speech into the user's preferred language and preserve technical terminology.

### Layer D — Assist
When a question or actionable prompt is detected:

1. retrieve relevant snippets from uploaded documents,
2. generate a grounded suggested answer,
3. show the answer in the user's preferred language,
4. produce a "ready-to-say" version in the target language.

---

## 4. Product Positioning

### One-line pitch

**Contexa helps you understand what people are saying, understand what they mean in your context, and know what to say next — across languages, in real time.**

### Stronger hackathon positioning

**A real-time multilingual AI conversation copilot powered by AssemblyAI that translates live discussions, understands user-provided context, and generates grounded responses for cross-language participation.**

### What Contexa is NOT

- Not a generic Google Translate clone.
- Not a simple speech-to-text UI.
- Not a chatbot wrapper.
- Not an autonomous meeting participant.
- Not an AI that secretly speaks on behalf of the user.
- Not a full replacement for Zoom/Meet.
- Not a full enterprise meeting recorder for the MVP.

---

## 5. Target Users

### Primary Persona

International students, junior developers, hackathon participants, and technical professionals who:

- understand the subject matter,
- frequently attend foreign-language webinars or meetings,
- have limited speaking/listening fluency,
- need to answer questions accurately and quickly,
- often have supporting documents available.

### Initial MVP User Segment

**Indonesian technical learners/developers attending English or Japanese sessions.**

This focus keeps the demo concrete and avoids positioning the product as "for everyone."

---

## 6. Core User Scenarios

### Scenario 1 — Webinar Translation

1. User opens Contexa.
2. User selects:
   - source: browser tab audio,
   - preferred reading language: Indonesian.
3. User shares a webinar/YouTube/meeting tab with audio.
4. Contexa displays:
   - original live transcript,
   - Indonesian translation.
5. Transcript is grouped into readable speaker turns or paragraphs.

### Scenario 2 — Context-Aware Q&A Assistance

1. Before the session, user uploads:
   - PDF,
   - DOCX,
   - Markdown,
   - TXT.
2. Documents are parsed, chunked, indexed, and attached to the active session.
3. During the session a speaker asks a question.
4. Contexa detects that the finalized turn is a question.
5. Relevant document chunks are retrieved.
6. The AI generates:
   - Indonesian explanation of the question,
   - Indonesian suggested answer,
   - ready-to-say answer in the speaker's language.

### Scenario 3 — Technical Terminology Preservation

The session is about software engineering.

The speaker says:

> "Should we squash the commits before merging the PR?"

The system must preserve terms such as:

- squash,
- commit,
- PR / Pull Request,
- merge,
- branch,
- migration,
- Supabase,
- WebSocket.

It should not translate technical words literally when doing so harms meaning.

---

## 7. MVP Scope

### P0 — Must Ship

#### Live Audio Capture
- Browser tab/system audio capture where browser capabilities permit.
- User explicitly grants permission.
- Clear session start/stop controls.

#### Real-Time AssemblyAI Transcription
- WebSocket streaming.
- Partial transcript display.
- Finalized-turn handling.
- End-of-turn awareness.

#### Live Translation
- Translate finalized turns into a selected display language.
- MVP primary display language: Indonesian.
- Target source languages for demo: English and Japanese.

#### Document Context
- Upload PDF.
- Upload DOCX.
- Upload Markdown.
- Upload TXT.
- Parse text.
- Chunk documents.
- Index chunks for retrieval.
- Attach documents to a specific conversation session.

#### Question Detection
- Classify finalized turns as:
  - normal statement,
  - question,
  - actionable request.
- Do not run expensive RAG generation for every partial transcript.

#### Context-Aware Answer Suggestion
When a question is detected:
- retrieve relevant chunks,
- generate a grounded answer,
- show relevant source snippets,
- generate a ready-to-say response.

#### Bilingual Output
At minimum:
- translated question in Indonesian,
- suggested answer in Indonesian,
- ready-to-say answer in the source/target language.

#### Session Transcript
Store:
- finalized source text,
- translation,
- speaker label if available,
- timestamp,
- detected language if available,
- question classification.

---

## 8. P1 / Stretch Features

Only implement after the P0 golden path works reliably.

- Streaming speaker diarization.
- Technical glossary/keyterms.
- Automatic session summary.
- Action item extraction.
- Ask-follow-up button.
- Manual "Generate Answer" button when automatic question detection fails.
- Microphone input as a second input source.
- Multiple response styles:
  - concise,
  - professional,
  - technical.
- Export transcript as Markdown.
- Meeting history.
- Authentication.
- Voice playback/TTS.
- Browser extension.
- Google Meet/Zoom integrations.
- URL ingestion.
- GitHub repository context.

---

## 9. Explicit Non-Goals for Hackathon MVP

Do NOT spend hackathon time on:

- native mobile apps,
- enterprise SSO,
- advanced billing,
- complex team permissions,
- automatic outbound voice,
- full calendar integration,
- custom model training,
- speech cloning,
- complex autonomous agents,
- supporting every language,
- building a Zoom/Meet clone,
- sophisticated analytics dashboards.

The MVP must optimize for a reliable demo path.

---

## 10. Golden Demo Path

This is the flow that must work end-to-end before optional features are added.

### Step 1
Open Contexa.

### Step 2
Upload a small project PDF/README containing technical context.

### Step 3
Select:
- source language/session: English or Japanese,
- preferred language: Indonesian.

### Step 4
Start a browser-tab audio session.

### Step 5
Speaker says a normal statement.

Expected:
- original transcript appears,
- Indonesian translation appears.

### Step 6
Speaker asks a technical question related to the uploaded document.

Expected:
- question is translated,
- system detects it as a question,
- relevant document context is retrieved,
- suggested Indonesian answer appears,
- ready-to-say English/Japanese answer appears.

### Step 7
Stop session.

Expected:
- transcript persists,
- session can show a short summary if time permits.

---

## 11. User Experience

### Main Screen Layout

```text
┌───────────────────────────────────────────────────────────────┐
│ Contexa                                  Session: LIVE   │
│ Source: English/Japanese     Read in: Indonesian              │
├───────────────────────────────────────────────────────────────┤
│ LIVE CONVERSATION                                             │
│                                                               │
│ Speaker A                                                     │
│ "How does your application handle concurrent updates?"       │
│                                                               │
│ 🇮🇩 Bagaimana aplikasi Anda menangani pembaruan bersamaan?    │
│                                                               │
├───────────────────────────────┬───────────────────────────────┤
│ CONTEXT                       │ AI RESPONSE COPILOT            │
│ architecture.pdf ✓            │ Suggested answer — ID          │
│ README.md ✓                   │ ...                            │
│                               │                                │
│ Retrieved evidence            │ Ready to say — EN/JP           │
│ 1. architecture.pdf p. 4      │ ...                            │
│ 2. README.md                  │                                │
├───────────────────────────────┴───────────────────────────────┤
│ [Stop Session] [Generate Answer] [Copy Ready-to-Say]          │
└───────────────────────────────────────────────────────────────┘
```

### UX Principles

- Live text must be readable at a glance.
- Partial transcripts may update rapidly but must not trigger expensive downstream processing.
- Final turns should visually stabilize.
- Translation should appear directly under the source turn.
- Suggested answers must clearly indicate that they are AI-generated.
- Retrieved evidence should be inspectable.
- User remains in control.

---

## 12. Functional Requirements

### FR-001 — Session Creation
The user can create a conversation session with:
- preferred display language,
- expected source language or automatic mode,
- optional target response language.

### FR-002 — Audio Source
The user can select supported browser audio capture and explicitly start streaming.

### FR-003 — Real-Time Transcript
The UI must display partial and final AssemblyAI transcript events.

### FR-004 — Final Turn Processing
Translation and question classification must primarily run on finalized turns (`end_of_turn = true`), not every partial.

### FR-005 — Translation
The system translates finalized turns to the selected display language.

### FR-006 — Document Upload
The user can upload PDF, DOCX, MD, and TXT files.

### FR-007 — Context Indexing
Uploaded content is parsed and segmented into searchable chunks.

### FR-008 — Retrieval
The application retrieves the most relevant context for a detected question.

### FR-009 — Suggested Answer
The application generates a grounded answer using:
- conversation question,
- recent conversation window,
- retrieved document context.

### FR-010 — Ready-to-Say Translation
The generated answer is rendered in the language required to respond to the speaker.

### FR-011 — Evidence
The generated answer must retain references to the document chunk(s) used where possible.

### FR-012 — Manual Fallback
User can manually request "Generate Answer" for the most recent turn.

### FR-013 — Stop/Terminate
Stopping a session must close the AssemblyAI streaming session cleanly.

---

## 13. AI Pipeline

```text
Browser Tab Audio
      │
      ▼
AssemblyAI Streaming STT
      │
      ├── partial Turn ──► UI only
      │
      └── final Turn
              │
              ▼
      Translation Layer
              │
              ├──► Indonesian translation
              │
              ▼
       Intent Classifier
              │
       statement / question
              │
          if question
              ▼
       Context Retrieval
              │
              ▼
        LLM Reasoning
              │
       ┌──────┴─────────┐
       ▼                ▼
Suggested answer    Ready-to-say
(user language)     speaker language
```

---

## 14. AssemblyAI Role

AssemblyAI is a core runtime dependency, not merely a development tool.

### Required Use

- Live speech ingestion.
- Streaming speech-to-text.
- Turn/finalization events.
- Optional streaming diarization.
- Multilingual speech recognition where supported.
- LLM Gateway for translation/classification/response generation where practical.

### Architecture Choice

**Use a custom voice pipeline (bring-your-own orchestration) rather than relying entirely on the managed Voice Agent API.**

Reason:
Contexa needs explicit control over:

- translation,
- question detection,
- document retrieval,
- answer generation,
- response language,
- UI state,
- evidence.

---

## 15. Model Routing

### English / Japanese / Supported Core Languages

Use AssemblyAI **Universal-3.5 Pro Realtime**.

Current documented streaming model:

```text
speech_model=universal-3-5-pro
```

Current WebSocket:

```text
wss://streaming.assemblyai.com/v3/ws
```

### Indonesian Input

Indonesian is outside the currently documented 18-language Universal-3.5 Pro Realtime set.

For Indonesian streaming input use:

```text
speech_model=whisper-rt
```

Whisper Streaming provides automatic language detection and broad 99+ language coverage.

### Important Design Rule

The transcription provider/model is selected by audio language requirements. Translation into Indonesian does **not** require Indonesian speech recognition when the speaker is speaking English/Japanese; it is a text translation step after transcription.

---

## 16. Recommended Tech Stack

### Frontend
- **Next.js 15+**
- TypeScript
- React
- Tailwind CSS
- shadcn/ui
- Web Audio API / MediaDevices API
- Browser `getDisplayMedia()` for tab/screen audio where supported
- WebSocket client

### Backend
- **FastAPI (Python)**
- Pydantic
- Async WebSocket/HTTP clients
- Background tasks only where necessary

Why Python backend:
- strong document parsing ecosystem,
- straightforward AI/RAG libraries,
- easier audio/ML experimentation,
- simple typed API contracts with Pydantic.

### Voice / Speech
- **AssemblyAI Streaming Speech-to-Text**
- Universal-3.5 Pro Realtime for supported core languages
- Whisper Streaming for Indonesian/long-tail languages
- Optional streaming speaker diarization

### Reasoning / Translation
Preferred:
- **AssemblyAI LLM Gateway**
- Model selected via environment variable, not hardcoded across the codebase.

Example configuration:

```env
ASSEMBLYAI_LLM_MODEL=claude-sonnet-4-6
```

The implementation should keep a provider adapter so a model can be swapped without changing product logic.

### Database
- **Supabase PostgreSQL**

### Retrieval
- PostgreSQL + pgvector for semantic retrieval.
- If embedding provider is not configured, provide a simple lexical fallback so the demo still works.

### File Parsing
- PDF: PyMuPDF / pypdf
- DOCX: python-docx
- Markdown/TXT: native text parsing

### Deployment
- Frontend: Vercel
- Backend: Render / Fly.io / another WebSocket-capable host
- Database: Supabase

Do not depend on Railway.

---

## 17. Proposed Repository Structure

```text
Contexa/
├── apps/
│   ├── web/
│   │   ├── app/
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── lib/
│   │   └── types/
│   │
│   └── api/
│       ├── app/
│       │   ├── api/
│       │   ├── assemblyai/
│       │   ├── conversation/
│       │   ├── documents/
│       │   ├── rag/
│       │   ├── llm/
│       │   └── models/
│       └── tests/
│
├── docs/
│   ├── PRD.md
│   └── ASSEMBLYAI_IMPLEMENTATION_AND_HACKATHON_GUIDE.md
│
├── .env.example
├── docker-compose.yml
└── README.md
```

---

## 18. Backend Modules

### `assemblyai/`
Responsibilities:
- open/close streaming connections,
- model routing,
- normalize AssemblyAI events,
- maintain session state,
- expose final turn events.

### `conversation/`
Responsibilities:
- recent conversation window,
- intent/question classification,
- translation orchestration,
- answer generation.

### `documents/`
Responsibilities:
- upload validation,
- parsing,
- metadata,
- chunk creation.

### `rag/`
Responsibilities:
- embeddings,
- indexing,
- retrieval,
- evidence packaging.

### `llm/`
Responsibilities:
- AssemblyAI LLM Gateway client,
- structured outputs,
- prompts,
- provider/model configuration.

---

## 19. Suggested Data Model

### `sessions`

```text
id
user_id nullable for hackathon
title
source_language_mode
preferred_language
response_language
created_at
ended_at
```

### `conversation_turns`

```text
id
session_id
turn_order
speaker_label
source_text
translated_text
detected_language
is_question
started_at
ended_at
created_at
```

### `documents`

```text
id
session_id
filename
mime_type
status
created_at
```

### `document_chunks`

```text
id
document_id
chunk_index
content
embedding nullable
metadata jsonb
```

### `answer_suggestions`

```text
id
session_id
turn_id
answer_preferred_language
answer_target_language
evidence jsonb
created_at
```

---

## 20. Structured AI Contracts

Avoid free-form parsing between backend components.

### Translation Result

```json
{
  "source_language": "ja",
  "target_language": "id",
  "translation": "...",
  "technical_terms_preserved": ["WebSocket", "Supabase"]
}
```

### Turn Classification

```json
{
  "type": "question",
  "requires_answer": true,
  "confidence": 0.94
}
```

### Suggested Answer

```json
{
  "question_summary": "...",
  "answer_preferred_language": "...",
  "answer_target_language": "...",
  "used_context": [
    {
      "document_id": "...",
      "chunk_id": "..."
    }
  ],
  "confidence_note": "..."
}
```

Use AssemblyAI LLM Gateway structured outputs where supported.

---

## 21. Prompting Rules

### Translation Prompt

Must:
- preserve technical proper nouns,
- preserve code/API identifiers,
- translate meaning rather than word-for-word when necessary,
- avoid adding new claims,
- remain concise enough for live reading.

### Question Classifier

Must:
- inspect only finalized turns,
- distinguish rhetorical questions from questions directed at the participant where possible,
- return structured JSON.

### Answer Generator

Must:
- prioritize uploaded context,
- clearly separate retrieved evidence from model inference,
- never fabricate a fact from missing documents,
- produce a short spoken answer by default,
- avoid overlong essay responses during a live Q&A.

---

## 22. Latency Budget

Target perceived behavior:

- transcript partials: immediate/streaming,
- finalized turn: sub-second to low seconds,
- translation: ideally < 2 seconds after final turn,
- question detection: ideally < 1 second,
- RAG + answer: ideally < 3–5 seconds.

Optimization rule:

**Do not run translation + RAG + answer generation on every partial token.**

---

## 23. Security and Privacy Requirements

- Never expose `ASSEMBLYAI_API_KEY` in the browser bundle.
- API keys live on the backend only.
- Prefer short-lived browser streaming tokens if connecting directly from browser to AssemblyAI.
- Validate uploaded file types and size.
- Sanitize filenames.
- Do not execute uploaded document content.
- Clearly indicate recording/transcription state.
- Require explicit user action before audio capture.
- Provide stop control.
- Close streaming sessions when inactive.
- Do not silently store audio unless explicitly required.
- Store transcript text only for MVP unless audio storage is essential.

---

## 24. Error Handling

The UI must handle:

- microphone/tab permission denied,
- no tab audio available,
- AssemblyAI WebSocket disconnected,
- unsupported language/model,
- empty transcript,
- failed document parsing,
- no relevant RAG context,
- LLM Gateway timeout,
- translation failure.

Fallback principle:

**The live transcript should continue working even if RAG or answer generation temporarily fails.**

---

## 25. Acceptance Criteria

### AC-01
A user can stream an English/Japanese audio source and see live transcription.

### AC-02
Finalized turns are translated to Indonesian.

### AC-03
A PDF/MD/DOCX/TXT document can be uploaded and indexed.

### AC-04
A relevant spoken question triggers retrieval.

### AC-05
The UI shows a suggested Indonesian answer grounded in the uploaded document.

### AC-06
The UI shows a ready-to-say answer in English/Japanese.

### AC-07
The AssemblyAI API key is not exposed in client code.

### AC-08
The deployed demo works through the golden path without manual backend intervention.

### AC-09
The project clearly demonstrates meaningful AssemblyAI usage.

---

## 26. Hackathon Demo Narrative

### Problem
"Many people understand the subject, but language prevents them from participating in international conversations."

### Demonstration
1. Upload a project document.
2. Start a foreign-language webinar/meeting audio.
3. Show live AssemblyAI transcript.
4. Show Indonesian translation.
5. Play a question.
6. Show automatic question detection.
7. Show retrieved document evidence.
8. Show suggested answer.
9. Show ready-to-say foreign-language response.

### Closing Message
"Translation tells you what was said. Contexa helps you participate."

---

## 27. Business Direction

Potential post-hackathon users:

- international students,
- remote engineering teams,
- global training providers,
- hackathon participants,
- technical sales teams,
- international customer success teams.

Possible business model:

- Free: limited live minutes/month.
- Pro: more minutes + document context + history.
- Team: shared terminology/context + centralized billing.
- API/SDK: conversation assistance components.

Do not build billing for the hackathon.

---

## 28. Competitive Differentiation

The MVP should emphasize:

1. **Live comprehension** rather than post-meeting summaries.
2. **User-provided knowledge context** rather than generic translation.
3. **Response assistance** rather than translation-only.
4. **Technical terminology preservation**.
5. **User-in-control copilot behavior**.
6. **Evidence-grounded suggestions**.

---

## 29. Success Metrics for MVP

Hackathon-focused:

- Golden demo path success rate.
- Time from final spoken question to suggested answer.
- Translation readability.
- Accuracy of question detection.
- Retrieval relevance.
- Clear visible use of AssemblyAI.

Product-oriented future metrics:

- transcription latency,
- translation latency,
- answer acceptance/copy rate,
- percentage of questions with useful retrieved evidence,
- session retention,
- user-reported comprehension improvement.

---

## 30. Build Priority

Implement in this order:

1. Audio capture.
2. AssemblyAI streaming connection.
3. Live partial/final transcript UI.
4. Final-turn translation.
5. File upload + parsing.
6. Retrieval.
7. Question detection.
8. Suggested response.
9. Ready-to-say translation.
10. Polish demo path.
11. Only then add diarization, summaries, auth, history, TTS, etc.

---

## 31. Authoritative Companion Document

All developers and coding agents must read:

`docs/ASSEMBLYAI_IMPLEMENTATION_AND_HACKATHON_GUIDE.md`

before modifying AssemblyAI integration or changing architecture.

If implementation code conflicts with that guide, fix the implementation or verify current official AssemblyAI documentation before changing the documented architecture.
