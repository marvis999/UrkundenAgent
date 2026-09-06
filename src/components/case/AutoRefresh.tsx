"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

interface AutoRefreshProps {
  /** Milliseconds between refreshes. */
  everyMs?: number;
}

const DEFAULT_INTERVAL = 2000;

/**
 * Re-fetches the server-rendered page while a run is in flight.
 *
 * The progress strip counts pages the run has written to the database, so the page only
 * has to ask again. `router.refresh()` re-renders the route on the server and keeps the
 * scroll position and any open field, which a reload would lose. Mounted only during the
 * analysis phase, so a case at rest makes no requests.
 */
export function AutoRefresh({ everyMs = DEFAULT_INTERVAL }: AutoRefreshProps) {
  const router = useRouter();

  useEffect(() => {
    const timer = setInterval(() => router.refresh(), everyMs);
    return () => clearInterval(timer);
  }, [router, everyMs]);

  return null;
}
