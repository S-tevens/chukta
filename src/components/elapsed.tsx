"use client";

import { useEffect, useState } from "react";

/** Ticking mm:ss since `since`, for calls in progress. */
export function Elapsed({ since }: { since: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const s = Math.max(0, Math.floor((now - new Date(since).getTime()) / 1000));
  return <span className="num">{`${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`}</span>;
}
