import { useSyncExternalStore } from "react";
const key = "arcs-cinematics",
  event = "arcs-cinematics-change";
export function readCinematics() {
  try {
    return localStorage.getItem(key) !== "quick";
  } catch {
    return true;
  }
}
export function writeCinematics(value) {
  try {
    localStorage.setItem(key, value ? "epic" : "quick");
  } catch {}
  window.dispatchEvent(new Event(event));
}
function subscribe(fn) {
  window.addEventListener(event, fn);
  window.addEventListener("storage", fn);
  return () => {
    window.removeEventListener(event, fn);
    window.removeEventListener("storage", fn);
  };
}
export const useCinematics = () =>
  useSyncExternalStore(subscribe, readCinematics, () => false);
