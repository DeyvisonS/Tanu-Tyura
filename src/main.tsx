import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

const isLocalDevelopment = import.meta.env.DEV
  && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")

if ("serviceWorker" in navigator && !isLocalDevelopment) {
  window.addEventListener("load", () => {
    const registerServiceWorker = async () => {
      try {
        await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, {
          scope: import.meta.env.BASE_URL,
        })
        const registration = await navigator.serviceWorker.ready
        const publicAssetHosts = new Set(["fonts.googleapis.com", "fonts.gstatic.com"])
        const resourceUrls = performance.getEntriesByType("resource")
          .map((entry) => entry.name)
          .filter((url) => {
            const resourceUrl = new URL(url, window.location.href)
            return resourceUrl.origin === window.location.origin || publicAssetHosts.has(resourceUrl.hostname)
          })

        registration.active?.postMessage({
          type: "CACHE_APP_RESOURCES",
          urls: [new URL(import.meta.env.BASE_URL, window.location.origin).toString(), ...resourceUrls],
        })
        console.info("[Tanu-Tyura] Service Worker ativo", {
          scope: registration.scope,
          recursosIdentificados: resourceUrls.length + 1,
        })
      } catch (error) {
        console.error("[Tanu-Tyura] Falha ao registrar o Service Worker", error)
      }
    }

    registerServiceWorker()
  });
}
