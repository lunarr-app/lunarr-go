import { withTimeout } from "../storage/remote";

const DEFAULT_ABORT_MESSAGE = "Operation was cancelled.";

export async function withOperationTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
  onLateResolve?: (value: T) => Promise<void> | void,
  signal?: AbortSignal,
  abortMessage = DEFAULT_ABORT_MESSAGE,
): Promise<T> {
  return withTimeout(promise, timeoutMs, label, {
    onLateResolve: onLateResolve
      ? (value) => void Promise.resolve(onLateResolve(value)).catch(() => undefined)
      : undefined,
    signal,
    abortMessage,
  });
}
