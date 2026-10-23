"use client";
import { useCallback, useEffect, useState } from "react";
import { groupResponseSchema } from "@staysuite/validation";
import type { SavedGroup } from "@staysuite/types";
export async function groupRequest(method: string, body?: unknown) {
  const response = await fetch("/api/groups", {
    method,
    ...(body
      ? {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : {}),
    cache: "no-store",
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(result.error ?? "Your groups could not be loaded.");
  return groupResponseSchema.parse(result);
}
export function useGroups() {
  const [groups, setGroups] = useState<SavedGroup[]>([]);
  const [stats, setStats] = useState({ total: 0, reviewed: 0, needsReview: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const reload = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await groupRequest("GET");
      if (!data.groups || !data.stats)
        throw new Error("Saved group response was incomplete.");
      setGroups(data.groups);
      setStats(data.stats);
    } catch {
      setError(
        "Saved groups are unavailable. Retry, or ask your administrator to connect saved groups.",
      );
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void reload();
    const synced = () => { void reload(); };
    window.addEventListener("staysuite:groups-synced", synced);
    return () => window.removeEventListener("staysuite:groups-synced", synced);
  }, [reload]);
  return { groups, stats, loading, error, reload };
}
