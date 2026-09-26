import type { Metadata } from "next";

import { RegisterCard } from "@/components/auth/register-card";
import { firstParam, safeNext } from "@/lib/auth/redirect";
import { isAuthConfigured } from "@/lib/supabase/config";

export const metadata: Metadata = {
  title: "Create account",
};

export default async function RegisterPage({ searchParams }: PageProps<"/register">) {
  const params = await searchParams;
  return <RegisterCard next={safeNext(firstParam(params.next))} configured={isAuthConfigured} />;
}
