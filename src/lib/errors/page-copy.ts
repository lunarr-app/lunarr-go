export function getErrorTitle(status: number) {
  if (status === 404) return "Page not found";
  if (status === 401) return "Sign in required";
  if (status === 403) return "Access denied";
  if (status >= 500) return "Server error";
  return "Something went wrong";
}

export function getErrorMessage(status: number, errorMessage?: string | null) {
  const detail = errorMessage?.trim();
  if (status === 404) return detail || "That page does not exist or may have moved.";
  if (status === 401) return detail || "Sign in to continue.";
  if (status === 403) return detail || "Your account does not have access to this page.";
  if (status >= 500) return "Lunarr could not finish loading this page.";
  return detail || "The page could not be loaded.";
}

export function shouldShowRetry(status: number) {
  return status !== 404;
}
