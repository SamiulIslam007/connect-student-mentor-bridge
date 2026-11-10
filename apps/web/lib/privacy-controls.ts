/**
 * The browser half of account deletion: the confirmation is the account email,
 * typed again. The API refuses the same mismatch (D-86), so this only saves a
 * round trip and states the rule where the user can see it.
 */
export function deletionConfirmed(storedEmail: string, typedEmail: string): boolean {
  return typedEmail.trim().toLowerCase() === storedEmail.trim().toLowerCase();
}
