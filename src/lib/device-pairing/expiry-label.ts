export function formatDevicePairingApiKeyExpiryLabel(days: number): string {
  if (days >= 365 && days % 365 === 0) {
    const years = days / 365;
    return years === 1 ? "1 year" : `${years} years`;
  }

  return days === 1 ? "1 day" : `${days} days`;
}
