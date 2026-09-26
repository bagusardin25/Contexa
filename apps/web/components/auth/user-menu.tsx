"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { AppWindowIcon, ChevronDownIcon, LogInIcon, LogOutIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DEFAULT_NEXT } from "@/lib/auth/redirect";
import { createClient } from "@/lib/supabase/client";
import { isAuthConfigured } from "@/lib/supabase/config";
import { cn } from "@/lib/utils";

function displayName(user: User) {
  const meta = user.user_metadata as { full_name?: string; name?: string };
  return meta.full_name || meta.name || user.email || "Your account";
}

function initials(name: string) {
  const parts = name.replace(/@.*/, "").split(/[\s._-]+/).filter(Boolean);
  return (parts.length > 1 ? parts[0][0] + parts[1][0] : name.slice(0, 2)).toUpperCase();
}

/**
 * Account control for the site and session headers. Reads the session in the
 * browser so pages that use it can stay statically rendered. Renders nothing
 * when Supabase isn't configured, so there is never a sign-in button that can't work.
 */
export function UserMenu() {
  if (!isAuthConfigured) return null;
  return <ConfiguredUserMenu />;
}

function ConfiguredUserMenu() {
  const router = useRouter();
  const pathname = usePathname();
  // undefined while the session is being read; null when signed out.
  const [user, setUser] = useState<User | null | undefined>(undefined);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data }) => setUser(data.session?.user ?? null));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setUser(session?.user ?? null));
    return () => data.subscription.unsubscribe();
  }, []);

  if (!user) {
    // While loading, the sign-in buttons hold their space invisibly so nothing shifts.
    const hidden = user === undefined ? "invisible" : undefined;
    return (
      <>
        <Button asChild variant="ghost" size="icon-sm" className={cn("sm:hidden", hidden)}>
          <Link href="/login" aria-label="Sign in">
            <LogInIcon />
          </Link>
        </Button>
        <Button asChild variant="ghost" size="sm" className={cn("hidden sm:inline-flex", hidden)}>
          <Link href="/login">Sign in</Link>
        </Button>
      </>
    );
  }

  const name = displayName(user);

  async function signOut() {
    const { error } = await createClient().auth.signOut({ scope: "local" });
    if (error) {
      toast.error("Couldn't sign out. Check your connection and try again.");
      return;
    }
    toast.success("Signed out.");
    router.refresh();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-8 gap-1 rounded-full px-0.5 sm:pr-2" aria-label={`Account: ${name}`}>
          <span
            aria-hidden
            className="flex size-7 items-center justify-center rounded-full bg-primary/15 text-[11px] font-semibold text-primary"
          >
            {initials(name)}
          </span>
          <ChevronDownIcon className="hidden size-3.5 opacity-60 sm:block" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="font-normal">
          <span className="block truncate text-sm font-medium text-foreground">{name}</span>
          {user.email && user.email !== name ? (
            <span className="block truncate text-xs text-muted-foreground">{user.email}</span>
          ) : null}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {pathname === DEFAULT_NEXT ? null : (
          <DropdownMenuItem asChild>
            <Link href={DEFAULT_NEXT}>
              <AppWindowIcon />
              Open workspace
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onSelect={() => void signOut()}>
          <LogOutIcon />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
