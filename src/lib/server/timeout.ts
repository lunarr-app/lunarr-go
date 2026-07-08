export type WithTimeoutOptions<T> = {
  /** Invoked when the timeout fires, before the rejection propagates. Use to abort the underlying operation. */
  onTimeout?: () => void;
  /** Invoked if the wrapped promise resolves after the timeout/abort won the race. Rejections are swallowed. */
  onLateResolve?: (value: T) => Promise<void> | void;
  /** Invoked if the wrapped promise rejects after the timeout/abort won the race. */
  onLateReject?: (error: unknown) => void;
  /** Optional abort signal; aborting it rejects early with `abortMessage`. */
  signal?: AbortSignal;
  abortMessage?: string;
};

export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
  options?: WithTimeoutOptions<T>,
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  let abortHandler: (() => void) | undefined;
  const signal = options?.signal;
  const abortMessage = options?.abortMessage ?? `${label} was aborted.`;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      stopped = true;
      options?.onTimeout?.();
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
      if (stopped && options?.onLateResolve) {
        void Promise.resolve(options.onLateResolve(value)).catch(() => undefined);
      }
    })
    .catch((error) => {
      if (stopped) options?.onLateReject?.(error);
    });

  try {
    return await Promise.race([promise, timeoutPromise, abortPromise]);
  } finally {
    if (timeout) clearTimeout(timeout);
    if (signal && abortHandler) signal.removeEventListener("abort", abortHandler);
  }
}
