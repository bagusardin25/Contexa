import type { Metadata } from "next";
import { Suspense } from "react";

import { HistoryView } from "@/components/history/history-view";

export const metadata: Metadata = {
  title: "History",
};

// HistoryView reads ?id= and ?turn= with useSearchParams, so the static page renders it
// in the browser inside a Suspense boundary.
export default function HistoryPage() {
  return (
    <Suspense fallback={null}>
      <HistoryView />
    </Suspense>
  );
}
