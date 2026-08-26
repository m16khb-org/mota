import { useEffect, useState } from "react";

export function useElapsedSeconds(updatedAt: string | null): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    setNow(Date.now());
    if (updatedAt === null) {
      return;
    }
    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 1_000);
    return () => window.clearInterval(timer);
  }, [updatedAt]);

  return updatedAt === null
    ? 0
    : Math.max(
        0,
        Math.floor((now - new Date(updatedAt).getTime()) / 1_000),
      );
}
