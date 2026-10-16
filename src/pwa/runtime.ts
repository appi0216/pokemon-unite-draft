import { useSyncExternalStore } from "react";

type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};
type PwaStatus = {
  online: boolean;
  offline: "preparing" | "ready" | "unavailable" | "unsupported";
  standalone: boolean;
  canInstall: boolean;
  installRequested: boolean;
  installed: boolean;
  updateReady: boolean;
};
const standalone = () =>
  window.matchMedia("(display-mode: standalone)").matches ||
  window.matchMedia("(display-mode: minimal-ui)").matches ||
  Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
let state: PwaStatus = {
  online: navigator.onLine,
  offline:
    "serviceWorker" in navigator && import.meta.env.PROD
      ? "preparing"
      : "unsupported",
  standalone: standalone(),
  canInstall: false,
  installRequested: false,
  installed: false,
  updateReady: false,
};
let prompt: InstallEvent | undefined;
let registration: ServiceWorkerRegistration | undefined;
let started = false;
let registering: Promise<void> | undefined;
let readinessTimeout: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();
function update(patch: Partial<PwaStatus>) {
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener());
}
export function usePwaStatus() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    () => state,
  );
}

function checkOffline() {
  (navigator.serviceWorker.controller || registration?.active)?.postMessage({
    type: "CHECK_OFFLINE",
  });
}
function limitPreparation() {
  clearTimeout(readinessTimeout);
  readinessTimeout = setTimeout(() => {
    if (state.offline === "preparing") update({ offline: "unavailable" });
  }, 45000);
}
async function register() {
  if (registering) return registering;
  registering = (async () => {
    limitPreparation();
    try {
      registration = await navigator.serviceWorker.register(
        `${import.meta.env.BASE_URL}sw.js`,
        {
          scope: import.meta.env.BASE_URL,
          updateViaCache: "none",
        },
      );
      update({ updateReady: Boolean(registration.waiting) });
      const watch = () => {
        const installing = registration?.installing;
        if (!installing) return;
        installing.addEventListener("statechange", () => {
          if (installing.state === "installed") {
            update({
              updateReady: Boolean(
                registration?.waiting && navigator.serviceWorker.controller,
              ),
            });
          } else if (installing.state === "activated") checkOffline();
          else if (installing.state === "redundant" && !registration?.active)
            update({ offline: "unavailable" });
        });
      };
      watch();
      registration.addEventListener("updatefound", watch);
      checkOffline();
    } catch {
      if (state.offline !== "ready") update({ offline: "unavailable" });
    } finally {
      registering = undefined;
    }
  })();
  return registering;
}
export async function retryOffline() {
  if (state.offline === "unsupported") return;
  update({ offline: "preparing" });
  await register();
  if (registration?.active)
    registration.active.postMessage({ type: "REPAIR_OFFLINE" });
  try {
    await registration?.update();
  } catch {
    if (state.offline !== "ready") update({ offline: "unavailable" });
  }
}
export async function installApp() {
  const event = prompt;
  if (!event) return;
  prompt = undefined;
  update({ canInstall: false });
  try {
    await event.prompt();
    const choice = await event.userChoice;
    update({ installRequested: choice.outcome === "accepted" });
  } catch {
    update({ installRequested: false });
  }
}
export function registerAppWorker() {
  if (started) return;
  started = true;
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    prompt = event as InstallEvent;
    update({ canInstall: true, installRequested: false });
  });
  window.addEventListener("appinstalled", () => {
    prompt = undefined;
    update({ canInstall: false, installRequested: false, installed: true });
  });
  window
    .matchMedia("(display-mode: standalone)")
    .addEventListener("change", () => update({ standalone: standalone() }));
  window.addEventListener("offline", () => update({ online: false }));
  window.addEventListener("online", () => {
    update({ online: true });
    if (state.offline === "unavailable") void retryOffline();
    else if (state.offline !== "unsupported") checkOffline();
  });
  if (state.offline === "unsupported") return;
  navigator.serviceWorker.addEventListener("message", (event) => {
    if (event.data?.type === "OFFLINE_READY") {
      clearTimeout(readinessTimeout);
      update({ offline: "ready" });
    }
    if (event.data?.type === "OFFLINE_UNAVAILABLE") {
      clearTimeout(readinessTimeout);
      update({ offline: "unavailable" });
    }
  });
  navigator.serviceWorker.addEventListener("controllerchange", checkOffline);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      checkOffline();
      void registration?.update().catch(() => {});
    }
  });
  if (document.readyState === "complete") void register();
  else
    window.addEventListener(
      "load",
      () => {
        void register();
      },
      { once: true },
    );
}
