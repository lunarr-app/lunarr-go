const USER_CODE_ALPHABET = "BCDFGHJKLMNPQRSTVWXYZ23456789";

export function normalizeUserCode(value: string) {
  return value.replace(/[\s-]/g, "").toUpperCase();
}

export function formatUserCode(value: string) {
  const normalized = normalizeUserCode(value);
  if (normalized.length <= 4) return normalized;
  return `${normalized.slice(0, 4)}-${normalized.slice(4)}`;
}

export function generateUserCode(length: number) {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let code = "";
  for (let index = 0; index < length; index += 1) {
    code += USER_CODE_ALPHABET[bytes[index]! % USER_CODE_ALPHABET.length]!;
  }
  return code;
}
