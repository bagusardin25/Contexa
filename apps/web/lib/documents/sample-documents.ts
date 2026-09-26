import type { ContextDocument, Evidence } from "@/types/session";

/**
 * Sample project context for the preview: "Notewave", a realtime notes app for
 * students. Mirrors the golden demo path (upload a small PDF + README first).
 */
export const SAMPLE_DOCUMENTS: ContextDocument[] = [
  {
    id: "sample-architecture",
    name: "architecture.pdf",
    kind: "pdf",
    sizeBytes: 1_240_000,
    status: "ready",
    progress: 100,
    chunkCount: 14,
    error: null,
    sample: true,
    keyterms: ["Notewave", "Supabase Realtime", "PostgreSQL", "WebSocket"],
  },
  {
    id: "sample-readme",
    name: "README.md",
    kind: "md",
    sizeBytes: 6_300,
    status: "ready",
    progress: 100,
    chunkCount: 6,
    error: null,
    sample: true,
    keyterms: ["Notewave", "Supabase", "Q4"],
  },
];

export const SAMPLE_CHUNKS: Record<string, Omit<Evidence, "score">> = {
  "arch-conflicts": {
    chunkId: "arch-conflicts",
    documentId: "sample-architecture",
    documentName: "architecture.pdf",
    location: "p. 4 · Conflict handling",
    snippet:
      "Each note row carries a version column. Writes use optimistic locking: the client sends the version it last read, and the update is rejected when the stored version has changed. The client then fetches the latest state and re-applies the pending edit.",
    highlights: ["optimistic locking", "version column"],
  },
  "readme-sync": {
    chunkId: "readme-sync",
    documentId: "sample-readme",
    documentName: "README.md",
    location: "Realtime sync",
    snippet:
      "Changes are broadcast through one Supabase Realtime channel per note, so collaborators receive updates in roughly 150 ms.",
    highlights: ["Supabase Realtime", "150 ms"],
  },
  "readme-roadmap": {
    chunkId: "readme-roadmap",
    documentId: "sample-readme",
    documentName: "README.md",
    location: "Roadmap",
    snippet:
      "Q4 2026: student pilot with three partner campuses. Pricing and team plans will be evaluated after the pilot.",
    highlights: ["pilot", "Pricing and team plans"],
  },
};
