import { symmetricEncrypt } from "better-auth/crypto";

/**
 * The two-factor plugin stores a TOTP secret encrypted with `BETTER_AUTH_SECRET`
 * and decrypts it on verify (better-auth's `decryptTOTPSecret`). A seed that
 * writes the plaintext can never verify, so it stores the ciphertext instead.
 * The library import stays here: only `src/identity/**` may import it.
 */
export async function encryptTotpSecret(plaintext: string, key: string): Promise<string> {
  if (key.length === 0) {
    throw new Error("BETTER_AUTH_SECRET is required to write a seeded TOTP secret");
  }
  return symmetricEncrypt({ key, data: plaintext });
}
