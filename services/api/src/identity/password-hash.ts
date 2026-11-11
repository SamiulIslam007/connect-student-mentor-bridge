import { hashPassword } from "better-auth/crypto";

/**
 * The library's own password hash, exposed so a seeded credential is stored in
 * exactly the format every registered account uses. The library import stays in
 * `src/identity` (a boundary test enforces that).
 */
export async function hashAccountPassword(password: string): Promise<string> {
  return await hashPassword(password);
}
