/**
 * Language catalogue and AssemblyAI model routing.
 *
 * Routing follows ASSEMBLYAI_IMPLEMENTATION_AND_HACKATHON_GUIDE.md §12–14:
 * the speech model is chosen by the language being *spoken*. Translating into
 * Indonesian is a text step after transcription and never needs Indonesian STT.
 */

export const LANGUAGES = {
  id: { name: "Indonesian", nativeName: "Bahasa Indonesia", short: "ID" },
  en: { name: "English", nativeName: "English", short: "EN" },
  ja: { name: "Japanese", nativeName: "日本語", short: "JA" },
} as const;

/** Languages Contexa can display translations and answers in. */
export type LanguageCode = keyof typeof LANGUAGES;

export const DISPLAY_LANGUAGES: LanguageCode[] = ["id", "en", "ja"];

export type SpeechModel = "universal-3-5-pro" | "whisper-rt";

export const SPEECH_MODELS: Record<
  SpeechModel,
  { name: string; shortName: string; description: string }
> = {
  "universal-3-5-pro": {
    name: "Universal-3.5 Pro Realtime",
    shortName: "Universal-3.5 Pro RT",
    description:
      "Low-latency streaming speech-to-text with native code-switching across 18 languages, including English and Japanese.",
  },
  "whisper-rt": {
    name: "Whisper Streaming",
    shortName: "Whisper RT",
    description:
      "Streaming speech-to-text for 99+ languages with built-in language detection. Used for Indonesian and long-tail languages.",
  },
};

/** What the people in the session are expected to speak. */
export type SpeakerLanguage = "en" | "ja" | "multi" | "id" | "auto";

export const SPEAKER_LANGUAGES: {
  value: SpeakerLanguage;
  label: string;
  model: SpeechModel;
  /** Language we expect to detect, when there is a single one. */
  expected: LanguageCode | null;
}[] = [
  { value: "en", label: "English", model: "universal-3-5-pro", expected: "en" },
  { value: "ja", label: "Japanese · 日本語", model: "universal-3-5-pro", expected: "ja" },
  { value: "multi", label: "Mixed · 18 core languages", model: "universal-3-5-pro", expected: null },
  { value: "id", label: "Indonesian · Bahasa Indonesia", model: "whisper-rt", expected: "id" },
  { value: "auto", label: "Other · auto-detect (99+)", model: "whisper-rt", expected: null },
];

export function speakerLanguageOption(value: SpeakerLanguage) {
  return (
    SPEAKER_LANGUAGES.find((option) => option.value === value) ??
    SPEAKER_LANGUAGES[0]
  );
}

export function speechModelFor(value: SpeakerLanguage): SpeechModel {
  return speakerLanguageOption(value).model;
}

export function isLanguageCode(code: string | null | undefined): code is LanguageCode {
  return code != null && code in LANGUAGES;
}

/** Short tag for any ISO language code, e.g. "en" → "EN". */
export function languageShort(code: string | null | undefined) {
  if (!code) return "—";
  return isLanguageCode(code) ? LANGUAGES[code].short : code.toUpperCase();
}

export function languageName(code: string | null | undefined) {
  if (!code) return "Unknown";
  return isLanguageCode(code) ? LANGUAGES[code].name : code.toUpperCase();
}

/** Answers default to the speaker's language so the user can reply directly. */
export function resolveResponseLanguage(
  responseLanguage: LanguageCode | "auto",
  detectedLanguage: string | null,
): LanguageCode {
  if (responseLanguage !== "auto") return responseLanguage;
  return isLanguageCode(detectedLanguage) ? detectedLanguage : "en";
}
