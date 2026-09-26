import type { SessionConfig } from "@/types/session";

import { ApiError, api, toApiConfig } from "./client";

type Listener = () => void;

/**
 * The backend session behind one workspace, shared by the live transport and the
 * live uploader. It's created on first use (usually the first document upload),
 * gets the final languages when streaming starts, and survives "New session"
 * through a server-side reset, so attached documents stay indexed.
 *
 * The API keeps sessions in memory: after a restart it no longer knows ours. Then a
 * new one is created and `onRecreated` listeners re-upload the documents.
 */
export class ApiSessionManager {
  private id: string | null = null;
  private creating: Promise<string> | null = null;
  private resetting: Promise<unknown> = Promise.resolve();
  private recreatedListeners = new Set<Listener>();
  private documentListeners = new Set<Listener>();

  get sessionId() {
    return this.id;
  }

  ensure(): Promise<string> {
    if (this.id) return Promise.resolve(this.id);
    this.creating ??= api
      .createSession()
      .then((created) => {
        this.id = created.id;
        return created.id;
      })
      .finally(() => {
        this.creating = null;
      });
    return this.creating;
  }

  /** Right before streaming: the session exists and has the languages the user picked. */
  async prepare(config: SessionConfig): Promise<string> {
    await this.resetting;
    const id = await this.ensure();
    try {
      await api.updateSession(id, toApiConfig(config));
      return id;
    } catch (error) {
      if (!(error instanceof ApiError && error.status === 404)) throw error;
      const fresh = await this.recreate(id);
      await api.updateSession(fresh, toApiConfig(config));
      return fresh;
    }
  }

  /** Replaces a session the server no longer knows. Concurrent callers share one. */
  async recreate(staleId: string): Promise<string> {
    if (this.id !== staleId) return this.ensure();
    this.id = null;
    const id = await this.ensure();
    for (const listener of this.recreatedListeners) listener();
    return id;
  }

  /** New conversation: turns are cleared on the server, documents stay. */
  reset() {
    const id = this.id;
    if (!id) return;
    this.resetting = api.resetSession(id).catch((error: unknown) => {
      // Gone already: the next call creates a fresh session and re-uploads documents.
      if (error instanceof ApiError && error.status === 404) return this.recreate(id);
    });
  }

  onRecreated(listener: Listener) {
    this.recreatedListeners.add(listener);
    return () => void this.recreatedListeners.delete(listener);
  }

  /** Documents were added or removed, so the session's keyterms may have changed. */
  onDocumentsChanged(listener: Listener) {
    this.documentListeners.add(listener);
    return () => void this.documentListeners.delete(listener);
  }

  notifyDocumentsChanged() {
    for (const listener of this.documentListeners) listener();
  }
}
