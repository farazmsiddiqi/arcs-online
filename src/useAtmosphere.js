import { useSyncExternalStore } from "react";
const event = "arcs-atmosphere-change";
export const readAtmosphere = () =>
  localStorage.getItem("arcs-atmosphere") !== "off";
export function writeAtmosphere(value) {
  localStorage.setItem("arcs-atmosphere", value ? "on" : "off");
  window.dispatchEvent(new Event(event));
}
function subscribe(notify) {
  window.addEventListener(event, notify);
  window.addEventListener("storage", notify);
  return () => {
    window.removeEventListener(event, notify);
    window.removeEventListener("storage", notify);
  };
}
export function useAtmosphere() {
  return useSyncExternalStore(subscribe, readAtmosphere, () => false);
}
