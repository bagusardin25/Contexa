import type { FieldErrors } from "./validation";

/** What an auth Server Action hands back to its form. Passwords are never echoed. */
export interface AuthFormState {
  status: "idle" | "error" | "success";
  code?: string;
  message?: string;
  fieldErrors?: FieldErrors;
  values?: { name?: string; email?: string };
}

export const IDLE_STATE: AuthFormState = { status: "idle" };
