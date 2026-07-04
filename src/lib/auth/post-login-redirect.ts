export const POST_LOGIN_REDIRECT_QUERY_PARAM = "redirectTo";

export function sanitizePostLoginRedirect(value: string | null | undefined): string | null {
  if (!value) return null;

  const trimmed = value.trim();
  if (!trimmed.startsWith("/")) return null;
  if (trimmed.startsWith("//")) return null;
  if (trimmed.includes("\\")) return null;
  if (trimmed.includes("://")) return null;
  if (trimmed === "/login" || trimmed.startsWith("/login?")) return null;

  return trimmed;
}

export function loginPathWithRedirect(returnPath: string): string {
  const safe = sanitizePostLoginRedirect(returnPath);
  if (!safe) return "/login";

  return `/login?${POST_LOGIN_REDIRECT_QUERY_PARAM}=${encodeURIComponent(safe)}`;
}
