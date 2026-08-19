import { Download } from "lucide-react";
import { useEffect, useState } from "react";

interface InstallChoice {
  outcome: "accepted" | "dismissed";
  platform: string;
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<InstallChoice>;
}

declare global {
  interface Window {
    __installPrompt?: BeforeInstallPromptEvent;
  }
}

const isStandalone = () =>
  window.matchMedia?.("(display-mode: standalone)").matches === true ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

export function InstallPrompt() {
  const [installEvent, setInstallEvent] =
    useState<BeforeInstallPromptEvent | null>(
      () => window.__installPrompt ?? null,
    );
  const [installed, setInstalled] = useState(isStandalone);
  const [showGuidance, setShowGuidance] = useState(false);
  const isSamsungInternet = /SamsungBrowser/i.test(navigator.userAgent);

  useEffect(() => {
    const saveInstallEvent = (event: Event) => {
      event.preventDefault();
      const promptEvent = event as BeforeInstallPromptEvent;
      window.__installPrompt = promptEvent;
      setInstallEvent(promptEvent);
    };
    const markInstalled = () => {
      Reflect.deleteProperty(window, "__installPrompt");
      setInstalled(true);
    };

    window.addEventListener("beforeinstallprompt", saveInstallEvent);
    window.addEventListener("appinstalled", markInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", saveInstallEvent);
      window.removeEventListener("appinstalled", markInstalled);
    };
  }, []);

  if (installed || (!installEvent && !isSamsungInternet)) {
    return null;
  }

  const install = async () => {
    if (!installEvent) {
      setShowGuidance(true);
      return;
    }

    try {
      await installEvent.prompt();
      const choice = await installEvent.userChoice;
      if (choice.outcome === "accepted") {
        setInstalled(true);
      } else if (isSamsungInternet) {
        setShowGuidance(true);
      }
    } catch {
      setShowGuidance(true);
    } finally {
      Reflect.deleteProperty(window, "__installPrompt");
      setInstallEvent(null);
    }
  };

  return (
    <div className="install-prompt">
      <button className="install-button" type="button" onClick={install}>
        <Download aria-hidden="true" />
        앱 설치
      </button>
      {showGuidance ? (
        <p role="status">브라우저 메뉴에서 앱 화면에 설치를 선택해 주세요.</p>
      ) : null}
    </div>
  );
}
