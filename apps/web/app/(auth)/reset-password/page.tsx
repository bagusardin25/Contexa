import type { Metadata } from "next";
import Link from "next/link";
import { LinkIcon } from "lucide-react";

import { AuthHeading, NotConfiguredNotice } from "@/components/auth/fields";
import { ResetPasswordCard } from "@/components/auth/reset-password-card";
import { Button } from "@/components/ui/button";
import { isAuthConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Choose a new password",
};

/** Reached from the recovery email via /auth/callback, which signs the person in first. */
export default async function ResetPasswordPage() {
  if (!isAuthConfigured) {
    return (
      <div className="space-y-6">
        <AuthHeading title="Choose a new password" />
        <NotConfiguredNotice />
      </div>
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="space-y-6">
        <span className="flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
          <LinkIcon className="size-5" aria-hidden />
        </span>
        <AuthHeading
          title="This reset link has expired"
          description="Reset links work once and only for a limited time. Request a new one and open it in this browser."
        />
        <Button asChild size="lg" className="h-11 w-full sm:h-10">
          <Link href="/forgot-password">Request a new link</Link>
        </Button>
      </div>
    );
  }

  return <ResetPasswordCard email={user.email ?? "your account"} />;
}
