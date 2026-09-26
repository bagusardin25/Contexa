/**
 * Plain-language messages for Supabase Auth error codes (auth-js ErrorCode),
 * OAuth callback errors, and a few codes of our own.
 */
const MESSAGES: Record<string, string> = {
  invalid_credentials: "That email and password don't match. Check them and try again.",
  email_not_confirmed: "Confirm your email first. We sent you a link when you signed up.",
  user_already_exists: "An account with this email already exists. Sign in instead.",
  email_exists: "An account with this email already exists. Sign in instead.",
  weak_password: "Choose a stronger password with a mix of letters, numbers, and symbols.",
  same_password: "Choose a password you haven't used for this account before.",
  email_address_invalid: "Enter a valid email address.",
  email_address_not_authorized: "This email address can't be used to sign up.",
  signup_disabled: "New sign-ups are turned off right now.",
  email_provider_disabled: "Email sign-in is turned off for this project.",
  provider_disabled: "Google sign-in isn't enabled for this project yet.",
  over_email_send_rate_limit: "We've sent several emails to this address. Wait a minute, then try again.",
  over_request_rate_limit: "Too many attempts. Wait a minute, then try again.",
  otp_expired: "That link has expired. Request a new one.",
  flow_state_expired: "Sign-in took too long to finish. Try again.",
  flow_state_not_found:
    "We couldn't finish signing in on this browser. If you opened the link on another device, sign in here instead.",
  bad_code_verifier:
    "We couldn't finish signing in on this browser. If you opened the link on another device, sign in here instead.",
  // The link was opened in a browser that didn't start the flow (e.g. email read on a phone).
  pkce_code_verifier_not_found:
    "We couldn't finish signing in on this browser. If you opened the link on another device, sign in here instead.",
  bad_oauth_state: "Google sign-in didn't complete. Try again.",
  bad_oauth_callback: "Google sign-in didn't complete. Try again.",
  access_denied: "Google sign-in was cancelled.",
  session_not_found: "Your session has ended. Sign in again.",
  session_expired: "Your session has ended. Sign in again.",
  captcha_failed: "Verification failed. Try again.",
  request_timeout: "The request timed out. Check your connection and try again.",
  // Our own codes.
  link_invalid: "That link is invalid or has already been used. Request a new one.",
  oauth_failed: "Couldn't start Google sign-in. Try again.",
  network: "Couldn't reach the sign-in service. Check your connection and try again.",
  not_configured: "Sign-in isn't set up for this app yet.",
};

const FALLBACK = "Something went wrong. Try again.";

export function authErrorMessage(code: string | null | undefined) {
  return (code && MESSAGES[code]) || FALLBACK;
}

/** Normalizes an auth-js error into one of the codes above. */
export function authErrorCode(error: { code?: string; name?: string; status?: number }) {
  if (error.code) return error.code;
  if (error.name === "AuthRetryableFetchError" || error.status === 0) return "network";
  return "unknown";
}
