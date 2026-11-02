"use client";
import { nativeEngineRequest } from "@staysuite/ui";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  COMPOSE_ENGINE_CHANNEL,
  composeEngineOpenSchema,
  composeEngineStatusSchema,
  type ComposeEngineOpen,
  type ComposeEngineStatus,
} from "@staysuite/validation";
function engineRequest(
  operation: "status" | "open",
  input?: ComposeEngineOpen,
): Promise<unknown> {
  const native = nativeEngineRequest(operation, input);
  if (native) return native;
  const request_id = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    const finish = () => {
      clearTimeout(timeout);
      window.removeEventListener("message", listener);
    };
    const listener = (event: MessageEvent<unknown>) => {
      if (event.source !== window || event.origin !== location.origin) return;
      const data = event.data;
      if (
        operation === "status" &&
        data &&
        typeof data === "object" &&
        "channel" in data &&
        data.channel === COMPOSE_ENGINE_CHANNEL &&
        "direction" in data &&
        data.direction === "ready"
      ) {
        window.postMessage(
          {
            channel: COMPOSE_ENGINE_CHANNEL,
            direction: "request",
            request_id,
            operation,
          },
          location.origin,
        );
        return;
      }
      if (
        !data ||
        typeof data !== "object" ||
        !("channel" in data) ||
        data.channel !== COMPOSE_ENGINE_CHANNEL ||
        !("direction" in data) ||
        data.direction !== "response" ||
        !("request_id" in data) ||
        data.request_id !== request_id ||
        !("result" in data)
      )
        return;
      finish();
      const result = data.result;
      if (
        !result ||
        typeof result !== "object" ||
        !("ok" in result) ||
        result.ok !== true
      ) {
        reject(
          new Error(
            result &&
            typeof result === "object" &&
            "error" in result &&
            typeof result.error === "string"
              ? result.error
              : "The posting engine could not accept this request.",
          ),
        );
        return;
      }
      resolve(result);
    };
    const timeout = setTimeout(
      () => {
        finish();
        reject(
          new Error(
            operation === "status"
              ? "Connect StaySuite and Facebook in extension 0.5.4+, then check this tab again."
              : "The posting-engine response was not confirmed. Check the engine and saved post before retrying.",
          ),
        );
      },
      operation === "status" ? 15000 : 45000,
    );
    window.addEventListener("message", listener);
    window.postMessage(
      {
        channel: COMPOSE_ENGINE_CHANNEL,
        direction: "request",
        request_id,
        operation,
        ...(input ? { input } : {}),
      },
      location.origin,
    );
  });
}
export function useComposeEngine(viewer: string) {
  const [status, setStatus] = useState<ComposeEngineStatus | null>(null),
    [error, setError] = useState(""),
    [checking, setChecking] = useState(false);
  const generation = useRef(0),
    checkingRef = useRef(false);
  const refresh = useCallback(async () => {
    if (!viewer || checkingRef.current) return null;
    const token = generation.current;
    checkingRef.current = true;
    setChecking(true);
    setError("");
    try {
      const raw = await engineRequest("status");
      const parsed = composeEngineStatusSchema.parse(
        raw && typeof raw === "object" && "status" in raw ? raw.status : null,
      );
      if (parsed.viewer_id !== viewer)
        throw new Error(
          "Your StaySuite account changed. Reconnect the extension.",
        );
      if (token !== generation.current) return null;
      setStatus(parsed);
      return parsed;
    } catch (error) {
      if (token === generation.current) {
        setStatus(null);
        setError(
          error instanceof Error
            ? error.message
            : "The engine is disconnected.",
        );
      }
      return null;
    } finally {
      if (token === generation.current) {
        checkingRef.current = false;
        setChecking(false);
      }
    }
  }, [viewer]);
  useEffect(() => {
    generation.current++;
    setStatus(null);
    setError("");
    checkingRef.current = false;
    setChecking(false);
    if (!viewer) return;
    void refresh();
    const focus = () => void refresh();
    const ready = (event: MessageEvent<unknown>) => {
      if (event.origin !== location.origin || event.source !== window) return;
      const data = event.data;
      if (
        data &&
        typeof data === "object" &&
        "channel" in data &&
        data.channel === COMPOSE_ENGINE_CHANNEL &&
        "direction" in data &&
        data.direction === "ready"
      )
        void refresh();
    };
    window.addEventListener("focus", focus);
    window.addEventListener("message", ready);
    return () => {
      generation.current++;
      window.removeEventListener("focus", focus);
      window.removeEventListener("message", ready);
    };
  }, [viewer, refresh]);
  const open = useCallback(
    async (input: ComposeEngineOpen) => {
      if (input.viewer_id !== viewer)
        throw new Error("Your account changed. Reconnect the posting engine.");
      const parsed = composeEngineOpenSchema.parse(input);
      const raw = await engineRequest("open", parsed);
      if (
        !raw ||
        typeof raw !== "object" ||
        !("request_id" in raw) ||
        raw.request_id !== parsed.request_id
      )
        throw new Error(
          "The posting-engine launch was not confirmed. Check the engine before retrying.",
        );
    },
    [viewer],
  );
  return {
    status: status?.viewer_id === viewer ? status : null,
    error,
    checking,
    refresh,
    open,
  };
}
