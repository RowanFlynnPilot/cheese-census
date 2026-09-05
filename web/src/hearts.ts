import { useCallback, useEffect, useState } from "react";

// Hearts are personal state and live in the reader's browser, keyed on the
// stable cheese ids that Supabase aggregation will also key on when engagement
// counts go live. Nothing leaves the device; static JSON stays engagement-free.
const KEY = "cheese-census.hearts.v1";

function read(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/** Saved cheese ids, in the order they were saved, synced across open tabs. */
export function useHearts(): {
  hearts: string[];
  toggleHeart: (id: string) => void;
  pruneHearts: (keep: (id: string) => boolean) => void;
} {
  const [hearts, setHearts] = useState<string[]>(read);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY) setHearts(read());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const toggleHeart = useCallback((id: string) => {
    setHearts((current) => {
      const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        // Storage unavailable (private mode, quota) — hearts last for the session.
      }
      return next;
    });
  }, []);

  // A saved id the catalog no longer carries would inflate the "n saved" count
  // while its card never renders; drop it once the dataset can say so.
  const pruneHearts = useCallback((keep: (id: string) => boolean) => {
    setHearts((current) => {
      const next = current.filter(keep);
      if (next.length === current.length) return current;
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        // Storage unavailable — the pruned list still lasts the session.
      }
      return next;
    });
  }, []);

  return { hearts, toggleHeart, pruneHearts };
}
