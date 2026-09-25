import type { Metadata } from "next";

import { SessionWorkspace } from "@/components/session/session-workspace";

export const metadata: Metadata = {
  title: "Live session",
};

export default function SessionPage() {
  return <SessionWorkspace />;
}
