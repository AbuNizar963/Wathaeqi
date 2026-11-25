export interface DocumentProgress {
  phase: "preparation" | "transfer" | "render" | "ready" | "print-dialog";
  message: string;
  percent?: number;
  /** Completed workflow milestone; never an elapsed-time estimate. */
  stagePercent?: number;
  loaded?: number;
  total?: number;
}

export interface DocumentOperationOptions {
  onProgress?: (progress: DocumentProgress) => void;
  signal?: AbortSignal;
}

export function measuredProgress(
  phase: "transfer" | "render",
  message: string,
  loaded: number,
  total?: number
): DocumentProgress {
  const known = Number.isFinite(total) && total! > 0;
  return {
    phase,
    message,
    loaded,
    ...(known
      ? {
          total,
          percent: Math.min(
            100,
            Math.max(0, Math.floor((loaded / total!) * 100))
          ),
        }
      : {}),
  };
}

export function throwIfAborted(signal?: AbortSignal): void {
  signal?.throwIfAborted();
}
