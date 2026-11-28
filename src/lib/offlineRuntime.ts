const waitForServiceWorkerController = (timeoutMs: number): Promise<boolean> => {
  if (!("serviceWorker" in navigator)) return Promise.resolve(false);
  if (navigator.serviceWorker.controller) return Promise.resolve(true);

  return new Promise((resolve) => {
    let settled = false;
    const finish = (ready: boolean) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      navigator.serviceWorker.removeEventListener("controllerchange", handleControllerChange);
      resolve(ready);
    };
    const handleControllerChange = () => {
      if (navigator.serviceWorker.controller) finish(true);
    };
    const timeout = window.setTimeout(() => finish(false), timeoutMs);

    navigator.serviceWorker.addEventListener("controllerchange", handleControllerChange);
    // Close the race where the controller changes between the initial check and listener registration.
    handleControllerChange();
  });
};

/**
 * Confirms that this page is actually controlled by the active Service Worker.
 * An activated registration alone is insufficient: without a controller, a
 * reload while offline is handled by the browser rather than the app shell.
 */
export const isOfflineShellReady = async (timeoutMs = 10000): Promise<boolean> => {
  if (!( "serviceWorker" in navigator)) return false;

  const isLocalDevelopment = import.meta.env.DEV
    && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");
  if (isLocalDevelopment) return false;

  try {
    if (navigator.serviceWorker.controller) return true;

    await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<null>((resolve) => window.setTimeout(() => resolve(null), timeoutMs)),
    ]);

    if (navigator.serviceWorker.controller) return true;
    return await waitForServiceWorkerController(timeoutMs);
  } catch {
    return false;
  }
};
