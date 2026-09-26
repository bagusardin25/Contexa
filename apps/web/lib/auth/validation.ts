/** Field checks shared by the auth forms (instant feedback) and Server Actions (the real gate). */

export type AuthField = "name" | "email" | "password" | "confirm";
export type FieldErrors = Partial<Record<AuthField, string>>;

export const PASSWORD_MIN = 8;
/** Supabase hashes passwords with bcrypt, which ignores bytes past 72. */
export const PASSWORD_MAX = 72;
export const NAME_MAX = 80;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function emailError(email: string) {
  if (!email) return "Enter your email address.";
  if (email.length > 254 || !EMAIL.test(email)) return "Enter a valid email address, like name@example.com.";
  return undefined;
}

export function newPasswordError(password: string) {
  if (!password) return "Choose a password.";
  if (password.length < PASSWORD_MIN) return `Use at least ${PASSWORD_MIN} characters.`;
  if (password.length > PASSWORD_MAX) return `Use ${PASSWORD_MAX} characters or fewer.`;
  if (!password.trim()) return "A password can't be only spaces.";
  return undefined;
}

function collect(errors: FieldErrors): FieldErrors | null {
  const found = Object.fromEntries(Object.entries(errors).filter(([, message]) => message));
  return Object.keys(found).length ? found : null;
}

export function validateSignIn({ email, password }: { email: string; password: string }) {
  return collect({ email: emailError(email), password: password ? undefined : "Enter your password." });
}

export function validateSignUp({ name, email, password }: { name: string; email: string; password: string }) {
  return collect({
    name: !name ? "Enter your name." : name.length > NAME_MAX ? `Use ${NAME_MAX} characters or fewer.` : undefined,
    email: emailError(email),
    password: newPasswordError(password),
  });
}

export function validateEmailOnly({ email }: { email: string }) {
  return collect({ email: emailError(email) });
}

export function validateNewPassword({ password, confirm }: { password: string; confirm: string }) {
  return collect({
    password: newPasswordError(password),
    confirm: !confirm ? "Enter the password again." : confirm !== password ? "The passwords don't match." : undefined,
  });
}

/** Reads a text field from a submitted form. */
export function field(formData: FormData, name: string, { trim = true } = {}) {
  const value = formData.get(name);
  if (typeof value !== "string") return "";
  return trim ? value.trim() : value;
}
