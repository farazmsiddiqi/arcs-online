// C-5: which timer notices has this browser not shown yet?
//
// `room.notices` holds the newest 20, oldest first, each `{ text, at, p? }`.
// The list is capped, so its length stops growing once full and cannot tell
// new from old. Every notice carries the server time it was written (`at`),
// so "new" means `at` is later than the newest one already shown.

export const MAX_TOASTS = 3;

// Newest `at` in the list; the baseline for a browser that has never seen
// this table, so opening it does not replay history as toasts.
export const newestNotice = (notices) =>
  (notices ?? []).reduce((latest, n) => Math.max(latest, n.at), 0);

// Notices after `seen`, oldest first. `seen` is null for a first visit, which
// treats the whole list as already shown.
export function freshNotices(notices, seen) {
  const since = seen ?? newestNotice(notices);
  return (notices ?? [])
    .filter((n) => Number.isFinite(n.at) && n.at > since)
    .sort((a, b) => a.at - b.at);
}

// Which of those should flash this seat's tab title: the ones about its clock.
export const affectsSeat = (fresh, seat) => fresh.filter((n) => n.p === seat);
