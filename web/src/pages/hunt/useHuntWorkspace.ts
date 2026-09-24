import { useEffect, useEffectEvent, useRef, useState } from "react";
import type { HuntState, SavedHunt } from "../../lib/hunt_types";
import {
  createHuntClient,
  EMPTY_HUNT,
  HUNT_REFRESH_MS,
  huntError,
} from "../../lib/hunt_workspace";

export function useHuntWorkspace(token: string | null, slug: string | null) {
  const [state, setState] = useState<HuntState>(EMPTY_HUNT);
  const [archives, setArchives] = useState<SavedHunt[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [online, setOnline] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const session = useRef(0);
  const mutating = useRef(false);
  const reading = useRef<AbortController | null>(null);
  const client = token ? createHuntClient(token, slug) : null;

  async function refresh() {
    if (!client || mutating.current || reading.current) return;
    const epoch = session.current;
    const controller = new AbortController();
    reading.current = controller;
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const next = await client.state(controller.signal);
      if (epoch !== session.current || controller.signal.aborted) return;
      setState((previous) =>
        JSON.stringify(previous) === JSON.stringify(next) ? previous : next,
      );
      setOnline(true);
      setSavedAt(new Date());
    } catch {
      if (epoch === session.current && !mutating.current) setOnline(false);
    } finally {
      clearTimeout(timeout);
      if (reading.current === controller) reading.current = null;
      if (epoch === session.current) setLoading(false);
    }
  }
  const tick = useEffectEvent(refresh);
  useEffect(() => {
    session.current++;
    mutating.current = false;
    setBusy(false);
    setState(EMPTY_HUNT);
    setArchives([]);
    setError(null);
    setOnline(false);
    setLoading(!!token);
    if (!token) return;
    void tick();
    const timer = setInterval(() => {
      if (!document.hidden) void tick();
    }, HUNT_REFRESH_MS);
    const onVisible = () => {
      if (!document.hidden) void tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onVisible);
    return () => {
      session.current++;
      reading.current?.abort();
      reading.current = null;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onVisible);
    };
  }, [token, slug]);

  async function loadArchives() {
    if (!client) return;
    const epoch = session.current;
    try {
      const items = await client.archives();
      if (epoch === session.current) setArchives(items);
    } catch (e) {
      if (epoch === session.current) setError(huntError(e));
    }
  }

  async function act(
    action: (api: NonNullable<typeof client>) => Promise<unknown>,
  ) {
    if (!client || mutating.current) return false;
    mutating.current = true;
    reading.current?.abort();
    reading.current = null;
    const epoch = session.current;
    setBusy(true);
    setError(null);
    let success = false;
    try {
      await action(client);
      success = true;
    } catch (e) {
      if (epoch === session.current) setError(huntError(e));
    } finally {
      if (epoch === session.current) {
        mutating.current = false;
        await refresh();
        setBusy(false);
      }
    }
    return success;
  }
  return {
    state,
    archives,
    loading,
    busy,
    error,
    online,
    savedAt,
    refresh,
    act,
    loadArchives,
  };
}
