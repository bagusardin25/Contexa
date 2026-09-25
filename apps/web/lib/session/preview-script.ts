import type { LanguageCode } from "@/lib/languages";
import type { TurnClassification } from "@/types/session";

/**
 * Scripted conversations for the UI preview. They replay the golden demo path
 * (statement → rhetorical question → grounded question → partially grounded
 * question) so every UI state can be reviewed before the backend exists.
 * None of this is used once the live transport is connected.
 */

export type Localized = Partial<Record<LanguageCode, string>>;

export interface ScriptedAnswer {
  evidence: { chunkId: string; score: number }[];
  questionSummary: Localized;
  answer: Localized;
  confidenceNote: string;
}

export interface ScriptedTurn {
  speaker: string;
  text: string;
  translation: Localized;
  terms: string[];
  classification: TurnClassification;
  answer?: ScriptedAnswer;
}

export interface PreviewScript {
  language: LanguageCode;
  turns: ScriptedTurn[];
}

const CONCURRENCY_ANSWER: Omit<ScriptedAnswer, "evidence"> = {
  questionSummary: {
    id: "Bagaimana aplikasi menangani dua orang yang mengedit catatan yang sama secara bersamaan?",
    en: "How does the app handle two people editing the same note at once?",
    ja: "二人が同じノートを同時に編集したとき、アプリはどう処理するか？",
  },
  answer: {
    id: "Kami memakai optimistic locking. Setiap catatan punya kolom version; saat menyimpan, klien mengirim versi terakhir yang dibacanya. Kalau versinya sudah berubah, update ditolak, lalu klien mengambil data terbaru dan menerapkan ulang editan pengguna. Perubahan kemudian disebarkan lewat Supabase Realtime, jadi kolaborator lain menerimanya dalam sekitar 150 ms.",
    en: "We use optimistic locking. Every note has a version column, and when a client saves, it sends the version it last read. If someone else changed the note in the meantime, the write is rejected, so the client fetches the latest state and re-applies the edit. Changes are then broadcast over Supabase Realtime, so collaborators see them in about 150 milliseconds.",
    ja: "楽観的ロックを使っています。各ノートには version カラムがあり、保存するときにクライアントは最後に読んだバージョンを送ります。その間に他の人が更新していた場合は書き込みが拒否されるので、クライアントは最新の状態を取得して編集を再適用します。変更は Supabase Realtime で配信されるため、他のメンバーには約150ミリ秒で反映されます。",
  },
  confidenceNote:
    "Grounded in architecture.pdf (p. 4) and README.md. The documents don't describe a UI for resolving conflicting edits, so the answer doesn't mention one.",
};

const PRICING_ANSWER: Omit<ScriptedAnswer, "evidence"> = {
  questionSummary: {
    id: "Apa rencana harga setelah pilot untuk mahasiswa selesai?",
    en: "What is the pricing plan after the student pilot?",
    ja: "学生向けパイロットの後の料金プランは？",
  },
  answer: {
    id: "Kami belum menetapkan harga. Kami akan menjalankan pilot bersama tiga kampus mitra pada Q4, lalu memutuskan harga dan paket tim berdasarkan hasilnya.",
    en: "We haven't set pricing yet. We're running a pilot with three partner campuses in Q4, and we'll decide on pricing and team plans based on what we learn there.",
    ja: "料金はまだ決めていません。第4四半期に3つの提携キャンパスでパイロットを実施し、その結果をもとに料金とチームプランを決める予定です。",
  },
  confidenceNote:
    "Partially grounded: README.md mentions the Q4 pilot and says pricing will be evaluated afterwards, but gives no prices. The answer avoids inventing numbers.",
};

export const ENGLISH_SCRIPT: PreviewScript = {
  language: "en",
  turns: [
    {
      speaker: "A",
      text: "Welcome back, everyone. Next up is a team building a realtime collaboration tool for students.",
      translation: {
        id: "Selamat datang kembali, semuanya. Berikutnya adalah tim yang membangun alat kolaborasi realtime untuk mahasiswa.",
      },
      terms: ["realtime"],
      classification: { type: "statement", requiresAnswer: false, confidence: 0.97 },
    },
    {
      speaker: "A",
      text: "So why does latency matter so much here? Because anything above a few hundred milliseconds feels broken.",
      translation: {
        id: "Jadi, kenapa latency begitu penting di sini? Karena apa pun di atas beberapa ratus milidetik akan terasa rusak.",
      },
      terms: ["latency"],
      classification: { type: "question", requiresAnswer: false, confidence: 0.91 },
    },
    {
      speaker: "B",
      text: "I read through your architecture document. How does your application handle concurrent updates when two people edit the same note?",
      translation: {
        id: "Saya sudah membaca dokumen arsitektur Anda. Bagaimana aplikasi Anda menangani concurrent updates ketika dua orang mengedit catatan yang sama?",
      },
      terms: ["concurrent updates"],
      classification: { type: "question", requiresAnswer: true, confidence: 0.96 },
      answer: {
        ...CONCURRENCY_ANSWER,
        evidence: [
          { chunkId: "arch-conflicts", score: 0.89 },
          { chunkId: "readme-sync", score: 0.81 },
        ],
      },
    },
    {
      speaker: "A",
      text: "Nice. That's the approach most teams end up with once they hit real traffic.",
      translation: {
        id: "Bagus. Itu pendekatan yang akhirnya dipakai kebanyakan tim begitu menghadapi traffic sungguhan.",
      },
      terms: ["traffic"],
      classification: { type: "statement", requiresAnswer: false, confidence: 0.95 },
    },
    {
      speaker: "B",
      text: "One more question. What's your plan for pricing after the student pilot?",
      translation: {
        id: "Satu pertanyaan lagi. Bagaimana rencana harga (pricing) Anda setelah pilot untuk mahasiswa?",
      },
      terms: ["pricing", "pilot"],
      classification: { type: "question", requiresAnswer: true, confidence: 0.94 },
      answer: {
        ...PRICING_ANSWER,
        evidence: [{ chunkId: "readme-roadmap", score: 0.66 }],
      },
    },
    {
      speaker: "A",
      text: "Great, thank you. Let's move on to the next team.",
      translation: { id: "Baik, terima kasih. Mari kita lanjut ke tim berikutnya." },
      terms: [],
      classification: { type: "statement", requiresAnswer: false, confidence: 0.98 },
    },
  ],
};

export const JAPANESE_SCRIPT: PreviewScript = {
  language: "ja",
  turns: [
    {
      speaker: "A",
      text: "皆さん、引き続きよろしくお願いします。次は、学生向けのリアルタイム共同編集ツールを開発しているチームです。",
      translation: {
        id: "Semuanya, mari kita lanjutkan. Berikutnya adalah tim yang mengembangkan alat kolaborasi realtime untuk mahasiswa.",
      },
      terms: ["realtime"],
      classification: { type: "statement", requiresAnswer: false, confidence: 0.97 },
    },
    {
      speaker: "A",
      text: "では、なぜここでレイテンシがそれほど重要なのでしょうか。数百ミリ秒を超えると、ユーザーは壊れていると感じるからです。",
      translation: {
        id: "Lalu, kenapa latency begitu penting di sini? Karena kalau lebih dari beberapa ratus milidetik, pengguna akan merasa aplikasinya rusak.",
      },
      terms: ["latency"],
      classification: { type: "question", requiresAnswer: false, confidence: 0.9 },
    },
    {
      speaker: "B",
      text: "アーキテクチャの資料を読みました。二人が同じノートを同時に編集した場合、アプリケーションは同時更新をどのように処理していますか？",
      translation: {
        id: "Saya sudah membaca dokumen arsitektur Anda. Kalau dua orang mengedit catatan yang sama secara bersamaan, bagaimana aplikasi Anda menangani concurrent update tersebut?",
      },
      terms: ["concurrent update"],
      classification: { type: "question", requiresAnswer: true, confidence: 0.96 },
      answer: {
        ...CONCURRENCY_ANSWER,
        evidence: [
          { chunkId: "arch-conflicts", score: 0.87 },
          { chunkId: "readme-sync", score: 0.79 },
        ],
      },
    },
    {
      speaker: "A",
      text: "いいですね。実際のトラフィックに直面すると、多くのチームが最終的にその方法にたどり着きます。",
      translation: {
        id: "Bagus. Begitu menghadapi traffic sungguhan, kebanyakan tim akhirnya memakai pendekatan itu.",
      },
      terms: ["traffic"],
      classification: { type: "statement", requiresAnswer: false, confidence: 0.95 },
    },
    {
      speaker: "B",
      text: "もう一つ質問です。学生向けのパイロットの後、料金についてはどう考えていますか？",
      translation: {
        id: "Satu pertanyaan lagi. Setelah pilot untuk mahasiswa, bagaimana rencana Anda soal harga (pricing)?",
      },
      terms: ["pilot", "pricing"],
      classification: { type: "question", requiresAnswer: true, confidence: 0.94 },
      answer: {
        ...PRICING_ANSWER,
        evidence: [{ chunkId: "readme-roadmap", score: 0.64 }],
      },
    },
    {
      speaker: "A",
      text: "ありがとうございました。では、次のチームに移りましょう。",
      translation: { id: "Terima kasih banyak. Baiklah, mari kita lanjut ke tim berikutnya." },
      terms: [],
      classification: { type: "statement", requiresAnswer: false, confidence: 0.98 },
    },
  ],
};

/** Cautious answer used when nothing relevant was retrieved (guide §23). */
export const NO_CONTEXT_ANSWER: Localized = {
  id: "Pertanyaan yang bagus. Saya tidak ingin menebak, jadi saya akan memeriksa detailnya dan menindaklanjutinya setelah sesi ini.",
  en: "That's a good question. I don't want to guess, so let me double-check the details and follow up right after this session.",
  ja: "良い質問ですね。推測でお答えしたくないので、詳細を確認して、このセッションの後にご連絡します。",
};

/** Short reply for manual requests on turns that aren't questions. */
export const ACKNOWLEDGEMENT_ANSWER: Localized = {
  id: "Terima kasih, masukan itu sangat membantu.",
  en: "Thank you, that's really helpful feedback.",
  ja: "ありがとうございます。とても参考になります。",
};
