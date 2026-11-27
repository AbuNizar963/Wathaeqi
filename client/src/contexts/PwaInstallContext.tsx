import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

export type PwaInstallOutcome = "accepted" | "dismissed";

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{
    outcome: PwaInstallOutcome;
    platform: string;
  }>;
}

interface PwaInstallContextValue {
  canInstall: boolean;
  isInstalled: boolean;
  installApp: () => Promise<PwaInstallOutcome | null>;
}

type DeferredInstallPrompt = BeforeInstallPromptEvent | null;

const PwaInstallContext = createContext<PwaInstallContextValue | null>(null);

export async function requestPwaInstall(
  event: BeforeInstallPromptEvent
): Promise<PwaInstallOutcome> {
  await event.prompt();
  const choice = await event.userChoice;
  return choice.outcome;
}

export function PwaInstallProvider({ children }: { children: ReactNode }) {
  const [deferredPrompt, setDeferredPrompt] =
    useState<DeferredInstallPrompt>(null);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    const displayMode = window.matchMedia("(display-mode: standalone)");
    const syncInstalledState = () => {
      const legacyStandalone = Boolean(
        (navigator as Navigator & { standalone?: boolean }).standalone
      );
      setIsInstalled(displayMode.matches || legacyStandalone);
    };

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    syncInstalledState();
    displayMode.addEventListener("change", syncInstalledState);
    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      displayMode.removeEventListener("change", syncInstalledState);
      window.removeEventListener(
        "beforeinstallprompt",
        handleBeforeInstallPrompt
      );
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  const installApp = useCallback(async () => {
    const prompt = deferredPrompt;
    if (!prompt || isInstalled) return null;

    // A browser install prompt can only be used once.
    setDeferredPrompt(null);
    return requestPwaInstall(prompt);
  }, [deferredPrompt, isInstalled]);

  return (
    <PwaInstallContext.Provider
      value={{
        canInstall: Boolean(deferredPrompt) && !isInstalled,
        isInstalled,
        installApp,
      }}
    >
      {children}
    </PwaInstallContext.Provider>
  );
}

export function usePwaInstall() {
  const context = useContext(PwaInstallContext);
  if (!context) {
    throw new Error("usePwaInstall must be used within PwaInstallProvider");
  }
  return context;
}
