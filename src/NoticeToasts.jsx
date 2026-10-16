import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { MAX_TOASTS, freshNotices, newestNotice } from "./notices.js";

const SHOW_MS = 9000;
const seenKey = (id) => `arcs-notices-seen-${id}`;
const readSeen = (id) => {
  try {
    const stored = localStorage.getItem(seenKey(id)),
      v = Number(stored);
    return stored !== null && Number.isFinite(v) ? v : null;
  } catch {
    return null;
  }
};
const writeSeen = (id, at) => {
  try {
    localStorage.setItem(seenKey(id), String(at));
  } catch {}
};

// Pop up each timer notice that is new to this browser. The newest-seen `at`
// is kept per table in localStorage, so after a reconnect or a reload the
// player is shown what they missed, and only that. `onFresh(notices)` also
// receives them, for the title flash.
export function useNoticeToasts(room, onFresh) {
  const [toasts, setToasts] = useState([]),
    seen = useRef({ id: null, at: null }),
    latest = useRef(onFresh);
  latest.current = onFresh;
  useEffect(() => {
    if (!room?.id || !Array.isArray(room.notices)) return;
    if (seen.current.id !== room.id)
      seen.current = { id: room.id, at: readSeen(room.id) };
    const fresh = freshNotices(room.notices, seen.current.at);
    // First visit: remember where the history ends and show none of it.
    if (seen.current.at === null) {
      seen.current.at = newestNotice(room.notices);
      writeSeen(room.id, seen.current.at);
    }
    if (!fresh.length) return;
    seen.current.at = fresh.at(-1).at;
    writeSeen(room.id, seen.current.at);
    setToasts((all) =>
      [
        ...all,
        ...fresh.map((n) => ({ key: `${n.at}-${n.text}`, text: n.text })),
      ].slice(-MAX_TOASTS),
    );
    latest.current?.(fresh);
  }, [room?.id, room?.notices]);
  return {
    toasts,
    dismiss: (key) => setToasts((all) => all.filter((t) => t.key !== key)),
  };
}

function Toast({ toast, onDismiss }) {
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(toast.key), SHOW_MS);
    return () => clearTimeout(timer);
  }, [toast.key]);
  return (
    <div className="notice-toast">
      <span className="eyebrow">TIMER</span>
      <p>{toast.text}</p>
      <button aria-label="Dismiss" onClick={() => onDismiss(toast.key)}>
        <X size={14} />
      </button>
    </div>
  );
}

export default function NoticeToasts({ toasts, onDismiss }) {
  return (
    <div className="notice-toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <Toast key={t.key} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  );
}
