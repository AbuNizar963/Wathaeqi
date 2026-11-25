import { useEffect, useRef, useState } from "react";
import type {
  DocumentOperationOptions,
  DocumentProgress,
} from "./documentProgress";

export function useDocumentProgress() {
  const [progress, setProgress] = useState<DocumentProgress | null>(null);
  const active = useRef<AbortController | null>(null);
  useEffect(() => () => active.current?.abort(), []);

  async function run<T>(
    operation: (options: DocumentOperationOptions) => Promise<T>
  ): Promise<T> {
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    setProgress({ phase: "preparation", message: "جارٍ تجهيز العملية…" });
    try {
      const result = await operation({
        signal: controller.signal,
        onProgress: next => {
          if (active.current === controller && !controller.signal.aborted)
            setProgress(next);
        },
      });
      controller.signal.throwIfAborted();
      return result;
    } finally {
      if (active.current === controller) {
        active.current = null;
        setProgress(null);
      }
    }
  }

  return { progress, run, cancel: () => active.current?.abort() };
}
