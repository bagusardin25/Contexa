import type { LanguageCode } from "@/lib/languages";

/**
 * The landing page's example turn: the concurrency question from the preview
 * script (lib/session/preview-script.ts) and its sample sources
 * (lib/documents/sample-documents.ts), condensed to fit the hero.
 */

export type DemoLanguage = Extract<LanguageCode, "en" | "ja">;

export interface DemoTurn {
  language: DemoLanguage;
  /** The turn as streaming partials would deliver it. */
  chunks: string[];
  /** How chunks join back into the final text. */
  joiner: string;
  /** Seconds between chunks in the hero timeline. */
  chunkGap: number;
  /** Indonesian translation of the final turn. */
  translation: string;
  preservedTerm: string;
  confidence: string;
  readyToSay: string;
}

export const DEMO_TURNS: Record<DemoLanguage, DemoTurn> = {
  en: {
    language: "en",
    chunks:
      "How does your application handle concurrent updates when two people edit the same note?".split(
        " ",
      ),
    joiner: " ",
    chunkGap: 0.11,
    translation:
      "Bagaimana aplikasi Anda menangani concurrent updates ketika dua orang mengedit catatan yang sama?",
    preservedTerm: "concurrent updates",
    confidence: "96%",
    readyToSay:
      "We use optimistic locking. Every note has a version column, so if someone else saved first, the write is rejected and the client re-applies the edit on the latest state.",
  },
  ja: {
    language: "ja",
    chunks: [
      "二人が",
      "同じノートを",
      "同時に",
      "編集した場合、",
      "アプリケーションは",
      "同時更新を",
      "どのように",
      "処理していますか？",
    ],
    joiner: "",
    chunkGap: 0.19,
    translation:
      "Kalau dua orang mengedit catatan yang sama secara bersamaan, bagaimana aplikasi Anda menangani concurrent update tersebut?",
    preservedTerm: "concurrent update",
    confidence: "96%",
    readyToSay:
      "楽観的ロックを使っています。各ノートには version カラムがあり、他の人が先に保存していた場合は書き込みが拒否され、クライアントが最新の状態を取得して編集を再適用します。",
  },
};

export const DEMO_SOURCES = [
  { name: "architecture.pdf", location: "p. 4" },
  { name: "README.md", location: "Realtime sync" },
];

/** What a partial transcript of the English turn looks like mid-sentence. */
export const DEMO_PARTIAL = DEMO_TURNS.en.chunks.slice(0, 6).join(" ");

/** The bilingual answer, shortened for the "How it works" walkthrough. */
export const DEMO_ANSWER = {
  id: "Kami memakai optimistic locking. Setiap catatan punya kolom version, jadi kalau versinya sudah berubah, update ditolak dan klien menerapkan ulang editan pada data terbaru.",
  en: "We use optimistic locking. Every note has a version column, so a conflicting write is rejected and the client re-applies the edit on the latest state.",
};
