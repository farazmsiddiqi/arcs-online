// A clock reading: "4:05", or "24:00:00" from an hour up. Negative time is
// overtime, shown with a leading "+".
export function duration(ms) {
  const n = Math.ceil(Math.abs(ms) / 1000),
    h = Math.floor(n / 3600),
    m = Math.floor((n % 3600) / 60),
    s = String(n % 60).padStart(2, "0");
  return `${ms < 0 ? "+" : ""}${h ? `${h}:${String(m).padStart(2, "0")}` : m}:${s}`;
}
