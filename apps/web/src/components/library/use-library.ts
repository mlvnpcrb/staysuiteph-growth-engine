"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  librarySnapshotSchema,
  libraryReplySchema,
  libraryCommandSchema,
  type LibrarySnapshot,
} from "@staysuite/validation";
import type { LibraryCommand } from "@staysuite/validation";
export function useLibrary(viewer: string) {
  const [snapshot, setSnapshot] = useState<LibrarySnapshot | null>(null),
    [error, setError] = useState("");
  const generation = useRef(0),
    current = useRef(viewer);
  current.current = viewer;
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const token = ++generation.current;
    setSnapshot(null);
    setError("");
    if (!viewer) return;
    const controller = new AbortController();
    void fetch("/api/library", {
      cache: "no-store",
      signal: controller.signal,
      headers: { "x-staysuite-viewer": viewer },
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Library could not be loaded.");
        const data = librarySnapshotSchema.parse(await response.json());
        if (data.viewer_id !== viewer)
          throw new Error("Your account changed. Reload your library.");
        if (token === generation.current && !controller.signal.aborted)
          setSnapshot(data);
      })
      .catch((e) => {
        if (!controller.signal.aborted)
          setError(e instanceof Error ? e.message : "Library unavailable.");
      });
    return () => controller.abort();
  }, [viewer, version]);
  const command = useCallback(
    async (input: LibraryCommand) => {
      const owner = viewer,
        token = generation.current;
      if (!owner || current.current !== owner)
        throw new Error("Reload your account before saving.");
      const response = await fetch("/api/library", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-staysuite-viewer": owner,
        },
        body: JSON.stringify(libraryCommandSchema.parse(input)),
      });
      const body: unknown = await response.json();
      if (!response.ok)
        throw new Error(
          typeof body === "object" && body && "error" in body
            ? String(body.error)
            : "Library operation failed.",
        );
      const data = libraryReplySchema.parse(body);
      if (
        data.snapshot.viewer_id !== owner ||
        current.current !== owner ||
        generation.current !== token
      )
        throw new Error("Your account changed. Reload before continuing.");
      setSnapshot(data.snapshot);
      setError("");
      return data;
    },
    [viewer],
  );
  return {
    snapshot,
    error,
    command,
    reload: () => setVersion((value) => value + 1),
  };
}
