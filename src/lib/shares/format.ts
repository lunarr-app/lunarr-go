import { formatDateTime } from "$lib/media/format";
import { MAX_SHARE_EXPIRY_SECONDS } from "$lib/shares/constants";
import type { PublicShareRecord } from "$lib/shares/types";

export function formatShareExpiryDescription(expiresAt: string) {
  return `Expires ${formatDateTime(expiresAt)}`;
}

export function shareStatusLabel(share: Pick<PublicShareRecord, "active" | "revokedAt">) {
  if (share.active) return "Active";
  if (share.revokedAt) return "Revoked";
  return "Expired";
}

export function shareStatusDetail(share: Pick<PublicShareRecord, "active" | "revokedAt" | "expiresAt">) {
  if (share.revokedAt) return `Revoked ${formatDateTime(share.revokedAt)}`;
  if (!share.active) return `Expired ${formatDateTime(share.expiresAt)}`;
  return formatShareExpiryDescription(share.expiresAt);
}

const maxCustomDays = MAX_SHARE_EXPIRY_SECONDS / (24 * 60 * 60);
const maxCustomHours = MAX_SHARE_EXPIRY_SECONDS / (60 * 60);

export function validateCustomShareExpiry(amount: number, unit: "hours" | "days") {
  if (!Number.isFinite(amount) || amount <= 0 || !Number.isInteger(amount)) {
    return "Enter a whole number greater than zero.";
  }
  const seconds = unit === "hours" ? amount * 60 * 60 : amount * 24 * 60 * 60;
  if (seconds > MAX_SHARE_EXPIRY_SECONDS) {
    return `Custom expiry cannot be more than ${maxCustomDays} days.`;
  }
  return null;
}

export function customShareExpirySeconds(amount: number, unit: "hours" | "days") {
  return unit === "hours" ? amount * 60 * 60 : amount * 24 * 60 * 60;
}

export function maxCustomShareExpiryAmount(unit: "hours" | "days") {
  return unit === "hours" ? maxCustomHours : maxCustomDays;
}
