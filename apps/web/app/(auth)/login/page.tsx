import type { Metadata } from "next";

import { LoginCard } from "@/components/auth/login-card";
import { authErrorMessage } from "@/lib/auth/errors";
import { firstParam, safeNext } from "@/lib/auth/redirect";
import { isAuthConfigured } from "@/lib/supabase/config";

export const metadata: Metadata = {
  title: "Sign in",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const error = firstParam(params.error);

  return (
    <LoginCard
      next={safeNext(firstParam(params.next))}
      notice={error ? authErrorMessage(error) : undefined}
      configured={isAuthConfigured}
    />
  );
}
