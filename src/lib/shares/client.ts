import type { CreateSharePayload, PublicShareRecord } from "$lib/shares/types";

async function readJsonError(response: Response, fallback: string) {
  const body = await response.json().catch(() => null);
  throw new Error(body?.error ?? fallback);
}

export async function listSharesForMedia(mediaItemId: string) {
  const response = await fetch(`/api/shares?mediaItemId=${encodeURIComponent(mediaItemId)}`);
  if (!response.ok) {
    await readJsonError(response, "Could not load share links.");
  }
  const body = await response.json().catch(() => null);
  return (body?.shares ?? []) as PublicShareRecord[];
}

export async function createShare(payload: CreateSharePayload) {
  const response = await fetch("/api/shares", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    await readJsonError(response, "Could not create share link.");
  }
  const body = await response.json().catch(() => null);
  return (body?.share ?? null) as PublicShareRecord | null;
}

export async function revokeShare(shareId: string) {
  const response = await fetch(`/api/shares/${encodeURIComponent(shareId)}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    await readJsonError(response, "Could not revoke share link.");
  }
  const body = await response.json().catch(() => null);
  return (body?.share ?? undefined) as PublicShareRecord | undefined;
}

export function shareLinkUrl(share: Pick<PublicShareRecord, "sharePath">) {
  return new URL(share.sharePath, window.location.origin).toString();
}
