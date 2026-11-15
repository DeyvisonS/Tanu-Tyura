import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

// O Service Worker é registrado somente na versão de produção.
// Ele mantém a estrutura da aplicação disponível quando não há conexão.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, {
      scope: import.meta.env.BASE_URL,
    }).catch((error: unknown) => {
      console.warn('Não foi possível registrar o Service Worker do Tanu-Tyura.', error)
    })
  })
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
