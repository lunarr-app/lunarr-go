const DEFAULT_ABORT_MESSAGE = "Operation was cancelled.";

export async function withOperationTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
  onLateResolve?: (value: T) => Promise<void> | void,
  signal?: AbortSignal,
  abortMessage = DEFAULT_ABORT_MESSAGE,
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  let abortHandler: (() => void) | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      stopped = true;
      reject(new Error(`${label} timed out after ${timeoutMs}ms.`));
    }, timeoutMs);
  });
  const abortPromise = new Promise<never>((_, reject) => {
    if (!signal) return;
    abortHandler = () => {
      stopped = true;
      reject(new Error(abortMessage));
    };
    if (signal.aborted) {
      abortHandler();
      return;
    }
    signal.addEventListener("abort", abortHandler, { once: true });
  });
  promise
    .then((value) => {
      if (!stopped || !onLateResolve) return;
      void Promise.resolve(onLateResolve(value)).catch(() => undefined);
    })
    .catch(() => undefined);

  try {
    return await Promise.race([promise, timeoutPromise, abortPromise]);
  } finally {
    if (timeout) clearTimeout(timeout);
    if (signal && abortHandler) signal.removeEventListener("abort", abortHandler);
  }
}
