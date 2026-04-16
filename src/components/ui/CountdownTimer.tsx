"use client";

import { useEffect, useState } from "react";

export function CountdownTimer({ targetTime }: { targetTime: Date }) {
  const [secondsLeft, setSecondsLeft] = useState(() =>
    Math.max(0, Math.round((targetTime.getTime() - Date.now()) / 1000)),
  );

  useEffect(() => {
    setSecondsLeft(
      Math.max(0, Math.round((targetTime.getTime() - Date.now()) / 1000)),
    );
    const id = setInterval(() => {
      const remaining = Math.max(
        0,
        Math.round((targetTime.getTime() - Date.now()) / 1000),
      );
      setSecondsLeft(remaining);
      if (remaining <= 0) clearInterval(id);
    }, 1000);
    return () => clearInterval(id);
  }, [targetTime]);

  return (
    <span className="text-xs text-muted-foreground tabular-nums">
      Next update in {secondsLeft}s
    </span>
  );
}
