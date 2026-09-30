// Who may see the credentials index. Deliberately a short list of people, not a
// role: being an admin is not enough. The website keeps the same list in
// src/lib/portal/credentialKeepers.ts — change both together.

export const CREDENTIAL_KEEPERS = ["riley.stanley@anchorp.com", "calli@anchorp.com", "lauren.burrell@anchorp.com"];

export function isCredentialKeeper(email: string | null | undefined) {
  return CREDENTIAL_KEEPERS.includes(String(email || "").trim().toLowerCase());
}

// The index says where a secret lives; it must never hold one. Refuse anything
// that reads like a pasted password, key or recovery code.
const SECRET_HINT = /(pass(word|wd)?|pwd|secret|api[\s_-]?key|token|recovery code|pin)\s*[:=]/i;

export function looksLikeSecret(value: unknown) {
  return typeof value === "string" && SECRET_HINT.test(value);
}

export const ENTRY_FIELDS = [
  "name",
  "category",
  "login_url",
  "account",
  "used_for",
  "vault_item",
  "two_factor",
  "owner",
  "last_rotated",
  "notes",
] as const;

export type CredentialEntry = {
  id: string;
  name: string;
  category: string | null;
  login_url: string | null;
  account: string | null;
  used_for: string | null;
  vault_item: string | null;
  two_factor: string | null;
  owner: string | null;
  last_rotated: string | null;
  notes: string | null;
  updated_at: string;
  updated_by: string | null;
};

export type CredentialLogRow = {
  id: number;
  at: string;
  email: string | null;
  action: string;
  entry_name: string | null;
  source: string;
};

export type VaultSetting = { name: string; url: string };
