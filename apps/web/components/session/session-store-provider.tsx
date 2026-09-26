"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useStore } from "zustand";

import type { SessionMode } from "@/lib/session/mode";
import { createSessionServices } from "@/lib/session/services";
import {
  createSessionStore,
  type SessionStore,
  type SessionStoreApi,
} from "@/lib/session/store";
import type { SessionTransport } from "@/lib/session/transport";

interface SessionContextValue {
  store: SessionStoreApi;
  transportKind: SessionTransport["kind"];
}

const SessionContext = createContext<SessionContextValue | null>(null);

/** The mode is fixed for the provider's lifetime; key the provider by it to switch. */
export function SessionStoreProvider({ mode, children }: { mode: SessionMode; children: ReactNode }) {
  const [value] = useState<SessionContextValue>(() => {
    const { transport, uploader } = createSessionServices(mode);
    return {
      store: createSessionStore({ transport, uploader }),
      transportKind: transport.kind,
    };
  });

  useEffect(() => {
    // Streaming sessions are billed while open, so close them whenever the
    // workspace goes away (navigation, tab close, bfcache).
    const stop = () => void value.store.getState().stop();
    window.addEventListener("pagehide", stop);
    return () => {
      window.removeEventListener("pagehide", stop);
      stop();
    };
  }, [value]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

function useSessionContext() {
  const context = useContext(SessionContext);
  if (!context) throw new Error("Session hooks must be used inside <SessionStoreProvider>.");
  return context;
}

/** Subscribes to a slice of the session store. Keep selectors returning stable values. */
export function useSession<T>(selector: (state: SessionStore) => T): T {
  return useStore(useSessionContext().store, selector);
}

export function useSessionStoreApi() {
  return useSessionContext().store;
}

export function useIsPreview() {
  return useSessionContext().transportKind === "preview";
}
