"""Prompts for turn analysis and grounded answers (PRD §21, guide §20–24)."""

from collections.abc import Sequence
from dataclasses import dataclass

LANGUAGE_NAMES = {
    "id": "Indonesian",
    "en": "English",
    "ja": "Japanese",
    "es": "Spanish",
    "fr": "French",
    "de": "German",
    "it": "Italian",
    "pt": "Portuguese",
    "ar": "Arabic",
    "da": "Danish",
    "nl": "Dutch",
    "fi": "Finnish",
    "he": "Hebrew",
    "hi": "Hindi",
    "zh": "Mandarin Chinese",
    "no": "Norwegian",
    "sv": "Swedish",
    "tr": "Turkish",
    "vi": "Vietnamese",
    "ko": "Korean",
}


def language_name(code: str) -> str:
    return LANGUAGE_NAMES.get(code, f"the language with ISO code '{code}'")


@dataclass(frozen=True)
class ContextLine:
    speaker: str | None
    text: str
    translation: str | None = None


@dataclass(frozen=True)
class Excerpt:
    label: str
    source: str
    text: str


def _speaker(label: str | None) -> str:
    return f"Speaker {label}" if label else "Speaker"


def _conversation(lines: Sequence[ContextLine]) -> str:
    if not lines:
        return "(start of the conversation)"
    rendered = []
    for line in lines:
        rendered.append(f"[{_speaker(line.speaker)}] {line.text}")
        if line.translation:
            rendered.append(f"    (translation: {line.translation})")
    return "\n".join(rendered)


def turn_analysis_prompt(
    *,
    text: str,
    speaker: str | None,
    target_language: str,
    translate: bool,
    recent: Sequence[ContextLine],
) -> tuple[str, str]:
    target = language_name(target_language)
    translation_rule = (
        f"""translation: the turn translated into {target}. Translate the meaning, not word by
   word. Keep proper nouns, product names, API and code identifiers, and common technical
   English terms (pull request, commit, merge, branch, migration, WebSocket, Supabase…) in
   their original form when translating them would sound unnatural. Never add information,
   never answer the speaker, never summarize. Keep it about as long as the original so it
   can be read live. If the turn is already in {target}, return it unchanged."""
        if translate
        else 'translation: "" (an empty string; no translation is needed for this session).'
    )
    system = f"""You are the live interpreter inside Contexa, a copilot that helps a participant
follow and join a conversation held in another language. You receive one FINAL speech turn
from a real-time transcript. Return JSON with:

1. source_language: ISO 639-1 code of the language the turn is spoken in.
2. {translation_rule}
3. technical_terms_preserved: the terms you deliberately left untranslated ([] if none).
4. type: "question" (asks for information or an opinion), "action_request" (asks someone
   to do something), "statement", or "other" (greetings, filler, unclear fragments).
5. requires_answer: true only when the participant, or the audience the participant is part
   of, is expected to respond now. False for rhetorical questions the speaker answers
   themselves, and for questions addressed to someone else by name.
6. confidence: 0 to 1, how sure you are about type and requires_answer.
7. search_keywords: 3 to 8 short English keywords or phrases naming the technical subject of
   the turn, used to search the participant's documents. [] for small talk.

Transcripts can contain speech-recognition errors; infer the intended words from context."""
    user = f"""Recent conversation, oldest first:
{_conversation(recent)}

Turn to analyze:
[{_speaker(speaker)}] {text}"""
    return system, user


# How each answer style sounds when said out loud.
ANSWER_STYLES = {
    "concise": "one or two short sentences, the key fact first, no preamble",
    "professional": "2 to 4 clear, polite sentences, as you would say them to judges or a client",
    "technical": (
        "3 to 5 precise sentences that name the mechanisms, components, and trade-offs the "
        "excerpts describe"
    ),
    "casual": "2 to 4 friendly, conversational sentences, as you would say them to teammates",
}


def answer_prompt(
    *,
    question: str,
    speaker: str | None,
    preferred_language: str,
    target_language: str,
    excerpts: Sequence[Excerpt],
    recent: Sequence[ContextLine],
    style: str = "professional",
) -> tuple[str, str]:
    preferred = language_name(preferred_language)
    target = language_name(target_language)
    system = f"""You are the response copilot inside Contexa. In a live conversation, a speaker
has just asked the participant a question. Draft what the participant could say back.

Rules:
- Ground the answer in the numbered document excerpts. Use only facts they contain and never
  invent project details, numbers, names, dates, or plans.
- If the excerpts don't cover the question, say so honestly in the answer (for example, that
  the detail isn't decided yet, or that you'll follow up) instead of guessing.
- Speak as the participant, in the first person ("we", "our project"): {ANSWER_STYLES[style]}.
  No markdown, no lists, no citations inside the spoken text.

Return JSON with:
- question_summary: one short sentence in {preferred} restating what was asked.
- answer_target_language: the answer in {target}, ready to be said out loud.
- answer_preferred_language: the same answer in {preferred}, so the participant understands
  exactly what they will say.
- used_chunk_ids: labels of the excerpts the answer relies on, e.g. ["C1"] ([] if none).
- confidence_note: one or two sentences in {preferred} that separate what comes from the
  excerpts from what is inferred or missing."""

    if excerpts:
        rendered = "\n\n".join(f"[{e.label}] {e.source}\n{e.text}" for e in excerpts)
    else:
        rendered = "(No excerpt from the participant's documents matched this question.)"
    user = f"""Document excerpts:
{rendered}

Recent conversation, oldest first:
{_conversation(recent)}

Question from {_speaker(speaker)}:
{question}"""
    return system, user


def recap_prompt(
    *, title: str, language: str, lines: Sequence[str], omitted: int
) -> tuple[str, str]:
    """The recap of a finished conversation. `lines` are rendered turns, oldest first."""
    name = language_name(language)
    system = f"""You write the recap of a conversation that Contexa, a live interpreting copilot,
followed for a participant. Write every field in {name}.

Return JSON with:
- summary: 2 to 4 sentences on what the conversation covered and where it ended up.
- key_points: up to 5 short points (facts, decisions, positions), most important first.
- action_items: up to 5 concrete follow-ups someone committed to or was asked to do, written
  as "Speaker X: what" when the speaker is known. [] if there are none.
- open_questions: up to 5 questions raised that the conversation did not settle. [] if none.

Use only what the transcript says: never invent names, numbers, dates, or commitments. Keep
product names and technical terms in their original form. The transcript comes from live
speech recognition, so infer the intended words where a word is clearly misheard."""
    header = f"Conversation: {title.strip() or '(untitled)'}"
    if omitted:
        header += f"\n(The first {omitted} turns are left out for length.)"
    user = f"""{header}

Transcript, oldest first:
{chr(10).join(lines)}"""
    return system, user
