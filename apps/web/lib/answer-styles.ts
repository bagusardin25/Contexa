import type { AnswerStyle } from "@/types/session";

/** How suggested answers sound; the API turns the style into the answer prompt. */
export const ANSWER_STYLES: Record<AnswerStyle, { label: string; description: string }> = {
  concise: { label: "Concise", description: "One or two sentences, the key fact first." },
  professional: { label: "Professional", description: "Clear and polite, for judges or clients." },
  technical: { label: "Technical", description: "Names the mechanisms and trade-offs." },
  casual: { label: "Casual", description: "Friendly, the way you'd talk to teammates." },
};

export const ANSWER_STYLE_ORDER: AnswerStyle[] = ["concise", "professional", "technical", "casual"];
