/** Confirms that the app shell has an active Service Worker. */
export const isOfflineShellReady = async (timeoutMs = 8000): Promise<boolean> => {
  if (!("serviceWorker" in navigator)) return false;

  const isLocalDevelopment = import.meta.env.DEV
    && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");

  try {
    const existingRegistration = await navigator.serviceWorker.getRegistration();
    if (existingRegistration?.active) return true;
    if (isLocalDevelopment) return false;

    return await Promise.race([
      navigator.serviceWorker.ready.then((registration) => Boolean(registration.active)),
      new Promise<boolean>((resolve) => window.setTimeout(() => resolve(false), timeoutMs)),
    ]);
  } catch {
    return false;
  }
};
