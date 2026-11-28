import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

const isLocalDevelopment = import.meta.env.DEV
  && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")

const withTimeout = <T,>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> =>
  Promise.race([
    promise,
    new Promise<T>((resolve) => window.setTimeout(() => resolve(fallback), timeoutMs)),
  ])

const prepareServiceWorker = async (): Promise<ServiceWorkerRegistration | null> => {
  if (!("serviceWorker" in navigator) || isLocalDevelopment) return null

  try {
    await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, {
      scope: import.meta.env.BASE_URL,
      updateViaCache: "none",
    })

    const registration = await withTimeout(
      navigator.serviceWorker.ready,
      12000,
      null as unknown as ServiceWorkerRegistration,
    )
    if (!registration?.active) return null

    // A first visit can be claimed by the worker after activation. Wait briefly
    // for that control before announcing offline readiness to the application.
    await withTimeout(
      new Promise<void>((resolve) => {
        if (navigator.serviceWorker.controller) return resolve()
        const handleControllerChange = () => {
          navigator.serviceWorker.removeEventListener("controllerchange", handleControllerChange)
          resolve()
        }
        navigator.serviceWorker.addEventListener("controllerchange", handleControllerChange, { once: true })
      }),
      12000,
      undefined,
    )

    const publicAssetHosts = new Set(["fonts.googleapis.com", "fonts.gstatic.com"])
    const resourceUrls = performance.getEntriesByType("resource")
      .map((entry) => entry.name)
      .filter((url) => {
        const resourceUrl = new URL(url, window.location.href)
        return resourceUrl.origin === window.location.origin || publicAssetHosts.has(resourceUrl.hostname)
      })

    const worker = navigator.serviceWorker.controller ?? registration.active
    worker?.postMessage({
      type: "CACHE_APP_RESOURCES",
      urls: [new URL(import.meta.env.BASE_URL, window.location.origin).toString(), ...resourceUrls],
    })

    return registration
  } catch (error) {
    console.error("[Tanu-Tyura] Falha ao preparar o Service Worker", error)
    return null
  }
}

const startApplication = async () => {
  await prepareServiceWorker()

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  )
}

void startApplication()
