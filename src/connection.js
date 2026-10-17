// Reads may be retried; writes are never replayed automatically. A lost write
// response can mean it was committed, so let the next snapshot reconcile it.
export async function requestJSON(
  path,
  { method = "GET", body, key, fetcher = fetch } = {},
) {
  let response;
  try {
    response = await fetcher(path, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(key ? { Authorization: `Bearer ${key}` } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw Object.assign(
      new Error(
        method === "GET"
          ? "Reconnecting to your table…"
          : "Connection interrupted. Your table will refresh automatically; check whether this went through before trying again.",
      ),
      { transient: true },
    );
  }
  const data = await response.json().catch(() => null);
  if (!response.ok || !data) {
    const transient =
      response.status >= 500 ||
      response.status === 408 ||
      (!data && response.ok);
    throw Object.assign(
      new Error(
        transient
          ? method === "GET"
            ? "Reconnecting to your table…"
            : "The server is reconnecting. Your table will refresh automatically; check before trying again."
          : (data?.error ?? `Request failed (${response.status}).`),
      ),
      { transient, status: response.status, data },
    );
  }
  return data;
}
export const reconnectDelay = (attempt, random = Math.random) =>
  Math.min(10000, 600 * 2 ** Math.min(attempt, 4)) * (0.8 + random() * 0.4);
export function subscribeRoom({
  credentials,
  onRoom,
  onConnected,
  onError,
  request = requestJSON,
  Socket = WebSocket,
  origin = location,
  events = window,
  schedule = setTimeout,
  cancel = clearTimeout,
}) {
  let active = true,
    ws,
    retry,
    poll,
    deadline,
    attempt = 0,
    sequence = 0,
    applied = 0,
    lastRevision = -1,
    terminal = false,
    refreshing = false;
  const accept = (data, order) => {
    if (!active || order < applied || (data.revision ?? 0) < lastRevision)
      return;
    applied = order;
    lastRevision = data.revision ?? 0;
    onRoom(data);
  };
  const refresh = async () => {
    if (!active || terminal || refreshing) return;
    refreshing = true;
    cancel(poll);
    const order = ++sequence;
    try {
      accept(
        await request(`/api/rooms/${credentials.id}`, { key: credentials.key }),
        order,
      );
    } catch (e) {
      if (active && !e.transient) {
        onError(e.message);
        if ([401, 403, 404].includes(e.status)) terminal = true;
      }
    } finally {
      refreshing = false;
      if (active && !terminal) poll = schedule(refresh, 15000);
    }
  };
  const connect = () => {
    if (!active || terminal) return;
    const socket = new Socket(
      `${origin.protocol === "https:" ? "wss" : "ws"}://${origin.host}/socket`,
    );
    ws = socket;
    deadline = schedule(() => socket.close(), 12000);
    socket.onopen = () => {
      if (active) socket.send(JSON.stringify(credentials));
    };
    socket.onmessage = (e) => {
      if (!active || ws !== socket) return;
      try {
        const data = JSON.parse(e.data);
        if (!data.id) return;
        cancel(deadline);
        attempt = 0;
        accept(data, ++sequence);
        onConnected(true);
      } catch {
        /* Ignore malformed frames; the polling read will reconcile. */
      }
    };
    socket.onclose = (event) => {
      if (!active || ws !== socket) return;
      cancel(deadline);
      onConnected(false);
      if (event.code === 1008) {
        terminal = true;
        onError(
          "This seat could not be authenticated. Reopen your saved seat link.",
        );
        return;
      }
      retry = schedule(connect, reconnectDelay(attempt++));
    };
    socket.onerror = () => socket.close();
  };
  const wake = () => {
    if (!active || terminal) return;
    if (!ws || ws.readyState === 3) {
      cancel(retry);
      connect();
    }
    cancel(poll);
    refresh();
  };
  onConnected(false);
  refresh();
  connect();
  events.addEventListener("online", wake);
  return () => {
    active = false;
    cancel(retry);
    cancel(poll);
    cancel(deadline);
    events.removeEventListener("online", wake);
    ws?.close();
  };
}
