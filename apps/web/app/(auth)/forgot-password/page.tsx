import type { Metadata } from "next";

import { ForgotPasswordCard } from "@/components/auth/forgot-password-card";
import { isAuthConfigured } from "@/lib/supabase/config";

export const metadata: Metadata = {
  title: "Reset password",
};

export default function ForgotPasswordPage() {
  return <ForgotPasswordCard configured={isAuthConfigured} />;
}
