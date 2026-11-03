/** English UI strings (owner decision: English only). One catalog, no inline copy. */
export const strings = {
  appName: "connect",
  home: {
    title: "Structured mentorship with confirmed outcomes",
    signUp: "Create an account",
    signIn: "Sign in",
  },
  signUp: {
    title: "Create your account",
    displayName: "Display name",
    email: "Email address",
    password: "Password (at least 12 characters)",
    dateOfBirth: "Date of birth",
    submit: "Create account",
    success: "Check your email for the verification link.",
    ageGateNote: "You must be 18 or older to use connect.",
    error: "Registration failed. Check the fields and try again.",
  },
  signIn: {
    title: "Sign in",
    email: "Email address",
    password: "Password",
    submit: "Sign in",
    success: "You are signed in.",
    error: "That email and password combination did not work.",
  },
  verify: {
    title: "Email verification",
    verified: "Your email address is verified. You can sign in now.",
    invalid: "That verification link is invalid or has expired.",
    error: "Verification could not be completed. Try again in a moment.",
  },
  reset: {
    title: "Choose a new password",
    password: "New password (at least 12 characters)",
    submit: "Set new password",
    success: "Your password has been changed. Sign in with the new password.",
    invalid: "That reset link is invalid or has expired.",
  },
  session: {
    signOutEverywhere: "Sign out of all sessions",
    signedOutEverywhere: "Every session has been signed out.",
  },
} as const;
