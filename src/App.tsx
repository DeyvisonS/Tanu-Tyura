import { useState, useEffect, useRef, useCallback } from "react";
import type { AuthError, Session } from "@supabase/supabase-js";
import { supabase } from "./lib/supabase";
import { correctStoredAttempt } from "./lib/activitySync";
import { inspectOfflineContent, preloadOfflineContent } from "./lib/contentPreload";
import {
  cacheActivities,
  cacheModules,
  cacheQuestions,
  cacheWords,
  countPendingAttempts,
  getCachedActivities,
  getCachedModules,
  getCachedQuestions,
  getCachedWords,
  getPendingAttempts,
  keepAttemptPending,
  markAttemptSynced,
  savePendingAttempt,
} from "./lib/offline";
import type { OfflineAttempt } from "./lib/offline";

// ─── Types ────────────────────────────────────────────────────────────────────

type Screen =
  | "login"
  | "register"
  | "home"
  | "dictionary"
  | "modules"
  | "module-content"
  | "activities"
  | "question"
  | "result";

type Level = "Fácil" | "Médio" | "Avançado";
type AnswerOption = "A" | "B" | "C" | "D";

type LearningActivity = {
  id: number;
  titulo: string;
  descricao: string;
  nivel: "facil" | "medio" | "avancado";
};

type ActivityQuestion = {
  id: number;
  atividade_id: number;
  enunciado: string;
  alternativas: Record<AnswerOption, string>;
  ordem: number;
};

type ActivityAnswer = {
  questao_id: number;
  resposta: AnswerOption;
};

type SupabaseErrorDetails = {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
};

type AuthActionResult = {
  error?: string;
  confirmationRequired?: boolean;
};

type LearningModule = {
  id: number;
  nome: string;
  descricao: string;
  ordem: number;
};

type LearningWord = {
  id: number;
  modulo_id: number;
  termo_kambeba: string;
  traducao_portugues: string;
  audio_url: string | null;
};

type DictionaryWord = Pick<LearningWord, "id" | "termo_kambeba" | "traducao_portugues">;

const getValidAudioUrl = (value: string | null) => {
  if (!value?.trim()) return null;

  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
};

const getAuthErrorMessage = (error: AuthError | Error) => {
  const code = "code" in error ? error.code : "";
  const message = error.message.toLowerCase();

  if (code === "invalid_credentials" || message.includes("invalid login credentials")) {
    return "E-mail ou senha incorretos.";
  }
  if (code === "email_not_confirmed" || message.includes("email not confirmed")) {
    return "Confirme seu e-mail antes de entrar. Verifique sua caixa de entrada.";
  }
  if (code === "user_already_exists" || message.includes("already registered")) {
    return "Já existe uma conta associada a este e-mail.";
  }
  if (code === "weak_password" || message.includes("password")) {
    return "A senha não atende aos requisitos de segurança.";
  }
  if (code === "over_email_send_rate_limit" || message.includes("rate limit")) {
    return "Muitas tentativas foram realizadas. Aguarde alguns minutos e tente novamente.";
  }
  if (message.includes("fetch") || message.includes("network")) {
    return "Não foi possível conectar ao serviço de autenticação. Verifique sua conexão e tente novamente.";
  }

  return "Não foi possível concluir a autenticação. Tente novamente.";
};

const logSupabaseError = (context: string, error: SupabaseErrorDetails) => {
  console.error(`[Tanu-Tyura] ${context}`, {
    code: error.code ?? null,
    message: error.message ?? null,
    details: error.details ?? null,
    hint: error.hint ?? null,
  });
};

const getActivityCorrectionErrorMessage = (error: SupabaseErrorDetails) => {
  const message = error.message?.toLocaleLowerCase("pt-BR") ?? "";
  const isNetworkFailure = !navigator.onLine
    || message.includes("failed to fetch")
    || message.includes("network")
    || message.includes("load failed");

  if (isNetworkFailure) {
    return "Sem conexão com a internet. Reconecte-se para finalizar a atividade.";
  }

  const code = error.code ?? "";

  if (code === "42501" || code === "PGRST301" || message.includes("permission denied") || message.includes("jwt")) {
    return "Sua sessão não tem autorização para corrigir esta atividade. Entre novamente e tente de novo.";
  }
  if (code === "PGRST202" || message.includes("schema cache") || message.includes("could not find the function")) {
    return "O serviço de correção não está disponível com o contrato esperado. A atividade não foi registrada.";
  }
  if (
    code === "22P02"
    || code === "22023"
    || code === "PGRST102"
    || message.includes("json")
    || message.includes("recordset")
  ) {
    return "O servidor rejeitou o formato das respostas enviadas. A atividade não foi registrada.";
  }
  if (code === "23503" || message.includes("foreign key")) {
    return "Os dados desta atividade estão inconsistentes no servidor. A atividade não foi registrada.";
  }

  return `A correção falhou no servidor${code ? ` (código ${code})` : ""}. Tente novamente.`;
};

// ─── Icons (inline SVG) ───────────────────────────────────────────────────────

const IconHome = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" />
  </svg>
);
const IconBook = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
  </svg>
);
const IconSearch = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
  </svg>
);
const IconActivity = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
  </svg>
);
const IconLogout = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
  </svg>
);
const IconChevronRight = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m9 18 6-6-6-6" />
  </svg>
);
const IconChevronLeft = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m15 18-6-6 6-6" />
  </svg>
);
const IconVolume = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
  </svg>
);
const IconTrophy = () => (
  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" /><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
    <path d="M4 22h16" /><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
    <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
    <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
  </svg>
);
const IconCheck = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);
const IconX = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);
const IconWifi = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12.55a11 11 0 0 1 14.08 0" /><path d="M1.42 9a16 16 0 0 1 21.16 0" /><path d="M8.53 16.11a6 6 0 0 1 6.95 0" /><line x1="12" y1="20" x2="12.01" y2="20" />
  </svg>
);
const IconWifiOff = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="1" y1="1" x2="23" y2="23" /><path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" /><path d="M5 12.55a11 11 0 0 1 5.17-2.39" />
    <path d="M10.71 5.05A16 16 0 0 1 22.56 9" /><path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" /><path d="M8.53 16.11a6 6 0 0 1 6.95 0" /><line x1="12" y1="20" x2="12.01" y2="20" />
  </svg>
);
const IconMenu = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <line x1="4" y1="7" x2="20" y2="7" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="17" x2="20" y2="17" />
  </svg>
);
const IconClose = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <line x1="6" y1="6" x2="18" y2="18" /><line x1="18" y1="6" x2="6" y2="18" />
  </svg>
);
const ModuleIcon = ({ order }: { order: number }) => {
  if (order === 2) {
    return <span className="text-base font-bold" aria-hidden="true">123</span>;
  }
  if (order === 1) {
    return (
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
        <path d="M8 11a4 4 0 1 0-4-4 4 4 0 0 0 4 4Z" /><path d="M2 20a6 6 0 0 1 12 0" /><path d="M17 5v6m-3-3h6" />
      </svg>
    );
  }
  if (order === 4) {
    return (
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
        <circle cx="9" cy="8" r="3" /><circle cx="17" cy="9" r="2" /><path d="M3 20a6 6 0 0 1 12 0M14 14a5 5 0 0 1 7 4.5" />
      </svg>
    );
  }
  if (order === 5) {
    return (
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
        <circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M19 5l-1.5 1.5m-11 11L5 19" />
      </svg>
    );
  }
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" /><circle cx="8" cy="9" r="1" /><circle cx="15" cy="8" r="1" /><circle cx="16" cy="14" r="1" /><path d="M12 21a3 3 0 0 1 0-6h1" />
    </svg>
  );
};

// ─── Logo ─────────────────────────────────────────────────────────────────────

const Logo = ({ size = "md" }: { size?: "sm" | "md" | "lg" }) => {
  const sizes = { sm: 28, md: 36, lg: 52 };
  const s = sizes[size];
  return (
    <svg width={s} height={s} viewBox="0 0 52 52" fill="none" aria-hidden="true">
      <ellipse cx="26" cy="32" rx="14" ry="18" fill="#A64D25" opacity="0.15" />
      <path d="M26 6 C18 14 12 22 14 32 C16 42 26 46 26 46 C26 46 36 42 38 32 C40 22 34 14 26 6Z" fill="#6B4423" />
      <path d="M26 10 C20 17 16 24 18 33 C20 40 26 44 26 44 C26 44 26 28 26 10Z" fill="#A64D25" />
      <path d="M26 10 C32 17 36 24 34 33 C32 40 26 44 26 44 C26 44 26 28 26 10Z" fill="#8B6F47" opacity="0.6" />
      <path d="M20 22 C22 20 24 22 26 20 C28 22 30 20 32 22" stroke="#F5E6D3" strokeWidth="1.2" strokeLinecap="round" fill="none" opacity="0.5" />
    </svg>
  );
};

// ─── Layout Components ────────────────────────────────────────────────────────

const Sidebar = ({
  active,
  isOnline,
  pendingCount,
  onNavigate,
  onLogout,
  onClose,
}: {
  active: Screen;
  isOnline: boolean;
  pendingCount: number;
  onNavigate: (s: Screen) => void;
  onLogout: () => void;
  onClose: () => void;
}) => {
  const navItems = [
    { screen: "home" as Screen, label: "Início", icon: <IconHome /> },
    { screen: "modules" as Screen, label: "Módulos", icon: <IconBook /> },
    { screen: "dictionary" as Screen, label: "Dicionário", icon: <IconSearch /> },
    { screen: "activities" as Screen, label: "Atividades", icon: <IconActivity /> },
  ];

  return (
    <aside
      id="app-sidebar"
      style={{ backgroundColor: "#6B4423" }}
      className="flex h-full w-full flex-col"
      aria-label="Navegação principal"
    >
      {/* Brand */}
      <div className="flex items-center justify-between gap-3 border-b px-5 py-5" style={{ borderColor: "rgba(255,255,255,0.1)" }}>
        <div className="flex items-center gap-3">
          <Logo size="sm" />
          <div>
            <span className="block text-white font-bold text-lg leading-tight" style={{ fontFamily: "Lora, serif" }}>
              Tanu-Tyura
            </span>
            <span className="block text-xs" style={{ color: "#F5E6D3" }}>Aprenda. Ouça. Preserve.</span>
          </div>
        </div>
        <button type="button" onClick={onClose} className="rounded-lg text-white lg:hidden" aria-label="Fechar menu">
          <IconClose />
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-5 space-y-1" aria-label="Menu">
        {navItems.map((item) => {
          const isActive = active === item.screen || (active === "module-content" && item.screen === "modules");
          return (
            <button
              key={item.screen}
              onClick={() => onNavigate(item.screen)}
              aria-current={isActive ? "page" : undefined}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all duration-150 text-left"
              style={{
                color: "#F5E6D3",
                backgroundColor: isActive ? "rgba(166,77,37,0.6)" : "transparent",
              }}
              onMouseEnter={(e) => { if (!isActive) (e.currentTarget as HTMLElement).style.backgroundColor = "rgba(255,255,255,0.07)"; }}
              onMouseLeave={(e) => { if (!isActive) (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"; }}
            >
              {item.icon}
              {item.label}
            </button>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-4 pb-5 space-y-3">
        {/* Online status */}
        <div
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs"
          style={{ backgroundColor: "rgba(0,0,0,0.2)", color: isOnline ? "#86efac" : "#fca5a5" }}
          aria-live="polite"
          aria-label={isOnline ? "Status: online" : "Status: offline"}
        >
          {isOnline ? <IconWifi /> : <IconWifiOff />}
          <span>{isOnline ? "Online" : "Offline"}</span>
        </div>
        {pendingCount > 0 && (
          <div
            className="rounded-lg px-3 py-2 text-xs"
            style={{ backgroundColor: "rgba(245,230,211,0.12)", color: "#F5E6D3" }}
            aria-live="polite"
          >
            {pendingCount} {pendingCount === 1 ? "tentativa pendente" : "tentativas pendentes"}
          </div>
        )}

        <button
          onClick={onLogout}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm transition-all duration-150"
          style={{ color: "#F5E6D3" }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "rgba(255,255,255,0.07)"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"; }}
        >
          <IconLogout />
          Sair
        </button>
      </div>
    </aside>
  );
};

const AppLayout = ({
  children,
  activeScreen,
  onNavigate,
  onLogout,
  isOnline,
  pendingCount,
  isSyncing,
  onSync,
  offlinePreparation,
  notice,
  onDismissNotice,
  error,
}: {
  children: React.ReactNode;
  activeScreen: Screen;
  onNavigate: (s: Screen) => void;
  onLogout: () => void;
  isOnline: boolean;
  pendingCount: number;
  isSyncing: boolean;
  onSync: () => void;
  offlinePreparation: {
    state: "idle" | "preparing" | "ready" | "error" | "local-ready" | "local-incomplete";
    message: string;
  };
  notice?: string;
  onDismissNotice: () => void;
  error?: string;
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const toastIdRef = useRef(0);
  const [successQueue, setSuccessQueue] = useState<Array<{ id: number; message: string }>>([]);

  const closeMenu = () => {
    setMenuOpen(false);
    menuButtonRef.current?.focus();
  };

  const navigate = (screen: Screen) => {
    setMenuOpen(false);
    onNavigate(screen);
  };

  useEffect(() => {
    mainRef.current?.focus();
  }, [activeScreen]);

  const enqueueSuccess = useCallback((message: string) => {
    setSuccessQueue((currentQueue) => {
      if (currentQueue.some((notification) => notification.message === message)) {
        return currentQueue;
      }
      return [...currentQueue, { id: ++toastIdRef.current, message }];
    });
  }, []);

  const dismissCurrentSuccess = useCallback(() => {
    setSuccessQueue((currentQueue) => currentQueue.slice(1));
  }, []);

  useEffect(() => {
    if (!notice) return;
    enqueueSuccess(notice);
    onDismissNotice();
  }, [enqueueSuccess, notice, onDismissNotice]);

  useEffect(() => {
    if (offlinePreparation.state === "ready") {
      enqueueSuccess(offlinePreparation.message);
    }
  }, [enqueueSuccess, offlinePreparation.message, offlinePreparation.state]);

  const currentSuccess = successQueue[0];

  useEffect(() => {
    if (!currentSuccess) return;
    const timer = window.setTimeout(dismissCurrentSuccess, 3000);
    return () => window.clearTimeout(timer);
  }, [currentSuccess, dismissCurrentSuccess]);

  useEffect(() => {
    if (!menuOpen) return;
    const drawer = drawerRef.current;
    drawer?.querySelector<HTMLElement>("button")?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeMenu();
      if (event.key !== "Tab" || !drawer) return;
      const focusable = Array.from(drawer.querySelectorAll<HTMLElement>("button:not([disabled])"));
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [menuOpen]);

  return (
    <div className="min-h-screen lg:flex" style={{ backgroundColor: "#F5E6D3" }}>
      <a href="#main-content" className="skip-link">Pular para o conteúdo principal</a>
      <header className="sticky top-0 z-30 flex min-h-16 items-center justify-between border-b px-4 lg:hidden" style={{ backgroundColor: "#6B4423", borderColor: "#8B6F47" }}>
        <div className="flex items-center gap-2">
          <Logo size="sm" />
          <span className="font-display text-lg font-bold text-white">Tanu-Tyura</span>
        </div>
        <button
          ref={menuButtonRef}
          type="button"
          onClick={() => setMenuOpen(true)}
          className="rounded-lg text-white"
          aria-label="Abrir menu principal"
          aria-expanded={menuOpen}
          aria-controls="app-sidebar"
        >
          <IconMenu />
        </button>
      </header>

      {menuOpen && (
        <button type="button" className="fixed inset-0 z-40 h-full w-full bg-black/50 lg:hidden" onClick={closeMenu} aria-label="Fechar menu" tabIndex={-1} />
      )}

      <div
        ref={drawerRef}
        className={`fixed inset-y-0 left-0 z-50 w-64 transform transition-transform duration-200 lg:sticky lg:top-0 lg:block lg:h-screen lg:translate-x-0 ${
          menuOpen ? "visible translate-x-0" : "invisible -translate-x-full lg:visible"
        }`}
      >
        <Sidebar
          active={activeScreen}
          isOnline={isOnline}
          pendingCount={pendingCount}
          onNavigate={navigate}
          onLogout={onLogout}
          onClose={closeMenu}
        />
      </div>

      <main id="main-content" ref={mainRef} className="min-w-0 flex-1 overflow-y-auto" tabIndex={-1}>
        {currentSuccess && (
          <div
            key={currentSuccess.id}
            role="status"
            aria-live="polite"
            className="mx-4 mt-4 flex min-h-10 items-center rounded-2xl border px-4 py-2 text-sm sm:mx-8"
            style={{ backgroundColor: "#dcfce7", color: "#166534", borderColor: "#86efac" }}
          >
            <p className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap font-medium">
              {currentSuccess.message}
            </p>
          </div>
        )}
        {(offlinePreparation.state === "preparing"
          || offlinePreparation.state === "error"
          || offlinePreparation.state === "local-incomplete") && (
          <div
            role={offlinePreparation.state === "error" || offlinePreparation.state === "local-incomplete" ? "alert" : "status"}
            className="mx-auto mt-4 max-w-4xl px-4"
            aria-live="polite"
          >
            <div
              className="rounded-xl p-3 text-sm"
              style={{
                backgroundColor: offlinePreparation.state === "preparing"
                  ? "#eff6ff"
                  : offlinePreparation.state === "error" || offlinePreparation.state === "local-incomplete"
                    ? "#fff7ed"
                    : "#ecfdf5",
                color: offlinePreparation.state === "preparing"
                  ? "#1e40af"
                  : offlinePreparation.state === "error" || offlinePreparation.state === "local-incomplete"
                    ? "#9a3412"
                    : "#166534",
                border: `1px solid ${
                  offlinePreparation.state === "preparing"
                    ? "#93c5fd"
                    : offlinePreparation.state === "error" || offlinePreparation.state === "local-incomplete"
                      ? "#fdba74"
                      : "#86efac"
                }`,
              }}
            >
              {offlinePreparation.message}
            </div>
          </div>
        )}
        {!isOnline && (
          <div role="status" className="mx-auto mt-4 max-w-4xl px-4">
            <div className="rounded-xl p-3 text-sm" style={{ backgroundColor: "#fff7ed", color: "#9a3412", border: "1px solid #fdba74" }}>
              Você está offline. Atividades já carregadas continuam disponíveis e as tentativas serão sincronizadas quando a conexão retornar.
            </div>
          </div>
        )}
        {pendingCount > 0 && (
          <div role="status" className="mx-auto mt-4 max-w-4xl px-4">
            <div className="flex flex-col items-start justify-between gap-3 rounded-xl p-3 text-sm sm:flex-row sm:items-center" style={{ backgroundColor: "#fefce8", color: "#854d0e", border: "1px solid #fde047" }}>
              <span>
                {pendingCount} {pendingCount === 1 ? "tentativa aguarda" : "tentativas aguardam"} sincronização.
              </span>
              {isOnline && (
                <button
                  type="button"
                  onClick={onSync}
                  disabled={isSyncing}
                  className="rounded-lg px-4 py-2 text-xs font-semibold text-white"
                  style={{ backgroundColor: isSyncing ? "#8B6F47" : "#A64D25" }}
                >
                  {isSyncing ? "Sincronizando…" : "Sincronizar agora"}
                </button>
              )}
            </div>
          </div>
        )}
        {error && (
          <div role="alert" className="mx-auto mt-4 max-w-4xl px-4">
            <div className="rounded-xl p-3 text-sm" style={{ backgroundColor: "#fef2f2", color: "#991b1b", border: "1px solid #fecaca" }}>
              {error}
            </div>
          </div>
        )}
        {children}
      </main>
    </div>
  );
};

// ─── Screen: Login ────────────────────────────────────────────────────────────

const LoginScreen = ({
  onLogin,
  onGoRegister,
  notice,
}: {
  onLogin: (email: string, password: string) => Promise<AuthActionResult>;
  onGoRegister: () => void;
  notice?: string;
}) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<{ email?: string; password?: string; general?: string }>({});
  const [loading, setLoading] = useState(false);

  const validate = () => {
    const e: typeof errors = {};
    if (!email.trim()) e.email = "O e-mail é obrigatório.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) e.email = "Informe um e-mail válido.";
    if (!password) e.password = "A senha é obrigatória.";
    else if (password.length < 6) e.password = "A senha deve ter ao menos 6 caracteres.";
    return e;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) {
      setErrors(errs);
      requestAnimationFrame(() => document.querySelector<HTMLElement>("[aria-invalid='true']")?.focus());
      return;
    }
    setErrors({});
    setLoading(true);
    const result = await onLogin(email.trim(), password);
    if (result.error) setErrors({ general: result.error });
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex" style={{ backgroundColor: "#6B4423" }}>
      {/* Left panel */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-between p-12" style={{ backgroundColor: "#5A3820" }}>
        <div className="flex items-center gap-4">
          <Logo size="lg" />
          <div>
            <div className="text-white text-3xl font-bold" style={{ fontFamily: "Lora, serif" }}>Tanu-Tyura</div>
            <p style={{ color: "#D4A574" }} className="text-sm">Aprenda. Ouça. Preserve.</p>
          </div>
        </div>
        <div>
          <blockquote className="text-xl font-medium leading-relaxed mb-4" style={{ color: "#F5E6D3", fontFamily: "Lora, serif" }}>
            "A língua Kambeba vive em nós."
          </blockquote>
          <p className="text-sm" style={{ color: "#D4A574" }}>
            Uma plataforma dedicada ao ensino e preservação da língua Kambeba (Omágua),
            patrimônio imaterial da Amazônia.
          </p>
        </div>
        <p className="text-xs" style={{ color: "#6B4423" }}>
          Funciona offline após o primeiro acesso.
        </p>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex items-center justify-center p-4 sm:p-8">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="flex items-center gap-3 mb-8 lg:hidden">
            <Logo size="md" />
            <div>
              <span className="text-white text-xl font-bold" style={{ fontFamily: "Lora, serif" }}>Tanu-Tyura</span>
              <p className="text-xs" style={{ color: "#D4A574" }}>Aprenda. Ouça. Preserve.</p>
            </div>
          </div>

          <div className="rounded-2xl p-5 sm:p-8" style={{ backgroundColor: "#F5E6D3" }}>
            <h1 className="text-2xl font-bold mb-1" style={{ fontFamily: "Lora, serif", color: "#6B4423" }}>Bem-vindo(a)</h1>
            <p className="text-sm mb-6" style={{ color: "#6B4423" }}>Entre para continuar aprendendo Kambeba</p>

            {notice && (
              <div role="status" className="mb-4 p-3 rounded-lg text-sm" style={{ backgroundColor: "#dcfce7", color: "#166534", border: "1px solid #86efac" }}>
                {notice}
              </div>
            )}

            {errors.general && (
              <div role="alert" className="mb-4 p-3 rounded-lg text-sm" style={{ backgroundColor: "#fef2f2", color: "#991b1b", border: "1px solid #fecaca" }}>
                {errors.general}
              </div>
            )}

            <form onSubmit={handleSubmit} noValidate>
              <div className="mb-4">
                <label htmlFor="email" className="block text-sm font-medium mb-1" style={{ color: "#6B4423" }}>
                  E-mail
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  aria-invalid={!!errors.email}
                  aria-describedby={errors.email ? "email-error" : undefined}
                  placeholder="seu@email.com"
                  className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-all"
                  style={{
                    border: errors.email ? "2px solid #dc2626" : "1.5px solid #D4A574",
                    backgroundColor: "white",
                    color: "#3D2B1A",
                  }}
                  onFocus={(e) => { if (!errors.email) e.target.style.border = "2px solid #A64D25"; }}
                  onBlur={(e) => { if (!errors.email) e.target.style.border = "1.5px solid #D4A574"; }}
                />
                {errors.email && <p id="email-error" role="alert" className="mt-1 text-xs" style={{ color: "#dc2626" }}>{errors.email}</p>}
              </div>

              <div className="mb-6">
                <label htmlFor="password" className="block text-sm font-medium mb-1" style={{ color: "#6B4423" }}>
                  Senha
                </label>
                <input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  aria-invalid={!!errors.password}
                  aria-describedby={errors.password ? "password-error" : undefined}
                  placeholder="••••••••"
                  className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-all"
                  style={{
                    border: errors.password ? "2px solid #dc2626" : "1.5px solid #D4A574",
                    backgroundColor: "white",
                    color: "#3D2B1A",
                  }}
                  onFocus={(e) => { if (!errors.password) e.target.style.border = "2px solid #A64D25"; }}
                  onBlur={(e) => { if (!errors.password) e.target.style.border = "1.5px solid #D4A574"; }}
                />
                {errors.password && <p id="password-error" role="alert" className="mt-1 text-xs" style={{ color: "#dc2626" }}>{errors.password}</p>}
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 rounded-xl font-semibold text-sm text-white transition-all duration-200"
                style={{ backgroundColor: loading ? "#c47040" : "#A64D25" }}
                aria-busy={loading}
              >
                {loading ? "Entrando…" : "Entrar"}
              </button>
            </form>

            <div className="mt-5 text-center">
              <button
                onClick={onGoRegister}
                className="text-sm font-medium transition-colors underline underline-offset-2"
                style={{ color: "#A64D25" }}
              >
                Criar uma conta
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── Screen: Register ─────────────────────────────────────────────────────────

const RegisterScreen = ({
  onRegister,
  onGoLogin,
}: {
  onRegister: (name: string, email: string, password: string) => Promise<AuthActionResult>;
  onGoLogin: (notice?: string) => void;
}) => {
  const [form, setForm] = useState({ name: "", email: "", password: "", confirm: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState("");

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = "O nome é obrigatório.";
    if (!form.email.trim()) e.email = "O e-mail é obrigatório.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = "Informe um e-mail válido.";
    if (!form.password) e.password = "A senha é obrigatória.";
    else if (form.password.length < 6) e.password = "A senha deve ter ao menos 6 caracteres.";
    if (!form.confirm) e.confirm = "Confirme a senha.";
    else if (form.confirm !== form.password) e.confirm = "As senhas não coincidem.";
    return e;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) {
      setErrors(errs);
      requestAnimationFrame(() => document.querySelector<HTMLElement>("[aria-invalid='true']")?.focus());
      return;
    }
    setErrors({});
    setSuccess("");
    setLoading(true);
    const result = await onRegister(form.name.trim(), form.email.trim(), form.password);
    setLoading(false);
    if (result.error) {
      setErrors({ general: result.error });
      return;
    }
    if (result.confirmationRequired) {
      setSuccess("Cadastro realizado. Enviamos um link de confirmação para seu e-mail. Confirme a conta antes de entrar.");
    }
  };

  const field = (id: string, label: string, type = "text", placeholder = "") => (
    <div className="mb-4">
      <label htmlFor={id} className="block text-sm font-medium mb-1" style={{ color: "#6B4423" }}>{label}</label>
      <input
        id={id}
        type={type}
        autoComplete={id === "name" ? "name" : id === "email" ? "email" : id === "password" ? "new-password" : "new-password"}
        value={(form as Record<string, string>)[id]}
        onChange={set(id)}
        placeholder={placeholder}
        aria-invalid={!!errors[id]}
        aria-describedby={errors[id] ? `${id}-error` : undefined}
        className="w-full px-4 py-3 rounded-xl text-sm outline-none"
        style={{ border: errors[id] ? "2px solid #dc2626" : "1.5px solid #D4A574", backgroundColor: "white", color: "#3D2B1A" }}
        onFocus={(e) => { if (!errors[id]) e.target.style.border = "2px solid #A64D25"; }}
        onBlur={(e) => { if (!errors[id]) e.target.style.border = "1.5px solid #D4A574"; }}
      />
      {errors[id] && <p id={`${id}-error`} role="alert" className="mt-1 text-xs" style={{ color: "#dc2626" }}>{errors[id]}</p>}
    </div>
  );

  return (
    <div className="min-h-screen flex items-center justify-center p-4 sm:p-6" style={{ backgroundColor: "#6B4423" }}>
      <div className="w-full max-w-md">
        <div className="flex items-center gap-3 mb-6">
          <Logo size="md" />
          <div>
            <span className="text-white text-xl font-bold" style={{ fontFamily: "Lora, serif" }}>Tanu-Tyura</span>
            <p className="text-xs" style={{ color: "#D4A574" }}>Aprenda. Ouça. Preserve.</p>
          </div>
        </div>

        <div className="rounded-2xl p-5 sm:p-8" style={{ backgroundColor: "#F5E6D3" }}>
          <h1 className="text-2xl font-bold mb-1" style={{ fontFamily: "Lora, serif", color: "#6B4423" }}>Criar conta</h1>
          <p className="text-sm mb-6" style={{ color: "#6B4423" }}>Junte-se à nossa comunidade de aprendizagem</p>

          {success && (
            <div role="status" className="mb-4 p-3 rounded-lg text-sm" style={{ backgroundColor: "#dcfce7", color: "#166534", border: "1px solid #86efac" }}>
              {success}
            </div>
          )}

          {errors.general && (
            <div role="alert" className="mb-4 p-3 rounded-lg text-sm" style={{ backgroundColor: "#fef2f2", color: "#991b1b", border: "1px solid #fecaca" }}>
              {errors.general}
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate>
            {field("name", "Nome completo", "text", "Seu nome")}
            {field("email", "E-mail", "email", "seu@email.com")}
            {field("password", "Senha", "password", "••••••••")}
            {field("confirm", "Confirmar senha", "password", "••••••••")}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl font-semibold text-sm text-white transition-all mt-2"
              style={{ backgroundColor: loading ? "#c47040" : "#A64D25" }}
            >
              {loading ? "Criando conta…" : "Criar conta"}
            </button>
          </form>

          <div className="mt-5 text-center">
            <button
              onClick={() => onGoLogin(success ? "E-mail confirmado? Entre com sua conta para continuar." : undefined)}
              className="text-sm font-medium underline underline-offset-2"
              style={{ color: "#A64D25" }}
            >
              Já tenho uma conta
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── Screen: Home ─────────────────────────────────────────────────────────────

const HomeScreen = ({ onNavigate }: { onNavigate: (s: Screen) => void }) => {
  const cards = [
    { screen: "modules" as Screen, title: "Módulos", subtitle: "Estude por categorias", icon: <IconBook />, color: "#6B4423" },
    { screen: "dictionary" as Screen, title: "Dicionário", subtitle: "Pesquise palavras", icon: <IconSearch />, color: "#A64D25" },
    { screen: "activities" as Screen, title: "Atividades", subtitle: "Pratique e teste seus conhecimentos", icon: <IconActivity />, color: "#4A6741" },
  ];

  return (
    <div className="page-container max-w-4xl">
      {/* Greeting */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-1" style={{ fontFamily: "Lora, serif", color: "#6B4423" }}>
          Ñuká!
        </h1>
        <p className="text-base" style={{ color: "#6B4423" }}>
          Vamos continuar aprendendo Kambeba hoje?
        </p>
      </div>

      {/* Quick access cards */}
      <section aria-labelledby="acesso-rapido" className="mb-8">
        <h2 id="acesso-rapido" className="text-xs font-semibold uppercase tracking-wider mb-4" style={{ color: "#6B4423" }}>
          Acesso rápido
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {cards.map((card) => (
            <button
              key={card.screen}
              onClick={() => onNavigate(card.screen)}
              className="flex items-start gap-4 p-5 rounded-2xl text-left transition-all duration-200 group"
              style={{ backgroundColor: "#E8D5C4", border: "1.5px solid #D4A574" }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.transform = "translateY(-2px)"; (e.currentTarget as HTMLElement).style.boxShadow = "0 6px 20px rgba(107,68,35,0.15)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.transform = "none"; (e.currentTarget as HTMLElement).style.boxShadow = "none"; }}
            >
              <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 text-white" style={{ backgroundColor: card.color }}>
                {card.icon}
              </div>
              <div>
                <div className="font-bold text-base" style={{ color: "#6B4423", fontFamily: "Lora, serif" }}>{card.title}</div>
                <div className="text-xs mt-0.5" style={{ color: "#6B4423" }}>{card.subtitle}</div>
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* Dictionary invitation */}
      <section aria-labelledby="explore-dicionario" className="mb-8">
        <h2 id="explore-dicionario" className="text-xs font-semibold uppercase tracking-wider mb-4" style={{ color: "#6B4423" }}>
          Explore o dicionário
        </h2>
        <div
          className="flex flex-col items-start gap-5 rounded-2xl p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6"
          style={{ backgroundColor: "#E8D5C4", border: "1.5px solid #D4A574" }}
        >
          <div>
            <p className="text-xl font-bold mb-1" style={{ fontFamily: "Lora, serif", color: "#6B4423" }}>
              Consulte palavras em Kambeba
            </p>
            <p className="text-sm" style={{ color: "#6B4423" }}>Pesquise termos e traduções cadastrados na plataforma.</p>
          </div>
          <button
            onClick={() => onNavigate("dictionary")}
            className="w-full rounded-xl px-4 py-2 text-sm font-medium transition-all sm:w-auto"
            style={{ backgroundColor: "#A64D25", color: "white" }}
            aria-label="Ver mais no dicionário"
          >
            Ver mais →
          </button>
        </div>
      </section>

      {/* Progress */}
      <section aria-labelledby="seu-progresso">
        <h2 id="seu-progresso" className="text-xs font-semibold uppercase tracking-wider mb-4" style={{ color: "#6B4423" }}>
          Seu progresso
        </h2>
        <div className="rounded-2xl p-6" style={{ backgroundColor: "#E8D5C4", border: "1.5px solid #D4A574" }}>
          <div className="flex justify-between text-sm mb-2">
            <span style={{ color: "#6B4423" }}>Módulos concluídos</span>
            <span className="font-semibold" style={{ color: "#A64D25" }}>2 de 4</span>
          </div>
          <div className="h-3 rounded-full overflow-hidden" style={{ backgroundColor: "#D4A574" }} role="progressbar" aria-label="Módulos concluídos" aria-valuemin={0} aria-valuemax={4} aria-valuenow={2}>
            <div className="h-full rounded-full" style={{ width: "50%", backgroundColor: "#A64D25" }} />
          </div>
          <p className="text-xs mt-2" style={{ color: "#6B4423" }}>Continue assim! Cada palavra aprendida é um passo na preservação da língua.</p>
        </div>
      </section>
    </div>
  );
};

// ─── Screen: Dictionary ───────────────────────────────────────────────────────

const DictionaryScreen = () => {
  const [query, setQuery] = useState("");
  const [words, setWords] = useState<DictionaryWord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [requestKey, setRequestKey] = useState(0);

  useEffect(() => {
    let active = true;

    const loadWords = async () => {
      setIsLoading(true);
      setError("");

      try {
        if (navigator.onLine) {
          const { data, error: queryError } = await supabase
            .from("palavras")
            .select("id, modulo_id, termo_kambeba, traducao_portugues, audio_url")
            .eq("ativo", true)
            .order("termo_kambeba", { ascending: true })
            .order("id", { ascending: true });

          if (!queryError) {
            await cacheWords(data ?? []);
            if (active) setWords(data ?? []);
            return;
          }
          logSupabaseError("Falha ao atualizar dicionário; usando cache local", queryError);
        }

        const cachedWords = (await getCachedWords()).sort((first, second) =>
          first.termo_kambeba.localeCompare(second.termo_kambeba, "pt-BR")
          || first.id - second.id
        );
        if (!active) return;
        setWords(cachedWords);
        if (cachedWords.length === 0) {
          setError("O dicionário ainda não foi carregado neste dispositivo. Conecte-se para preparar o acesso offline.");
        }
      } catch (loadError) {
        if (!active) return;
        setWords([]);
        console.error("[Tanu-Tyura] Falha ao carregar dicionário online ou offline", loadError);
        setError(
          navigator.onLine
            ? "Não foi possível carregar o dicionário do servidor nem do armazenamento local."
            : "O dicionário ainda não está disponível offline neste dispositivo.",
        );
      } finally {
        if (active) setIsLoading(false);
      }
    };

    loadWords();
    return () => {
      active = false;
    };
  }, [requestKey]);

  const normalizedQuery = query.trim().toLocaleLowerCase("pt-BR");
  const filtered = words.filter((word) =>
    !normalizedQuery
    || word.termo_kambeba.toLocaleLowerCase("pt-BR").startsWith(normalizedQuery)
    || word.traducao_portugues.toLocaleLowerCase("pt-BR").startsWith(normalizedQuery)
  );

  return (
    <div className="page-container max-w-3xl">
      <h1 className="text-3xl font-bold mb-1" style={{ fontFamily: "Lora, serif", color: "#6B4423" }}>Dicionário</h1>
      <p className="text-sm mb-6" style={{ color: "#6B4423" }}>Kambeba → Português</p>

      {/* Search */}
      <div className="relative mb-4">
        <label htmlFor="dict-search" className="sr-only">Pesquisar no dicionário</label>
        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none" style={{ color: "#6B4423" }}>
          <IconSearch />
        </div>
        <input
          id="dict-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Digite uma palavra em Kambeba ou português…"
          className="w-full pl-11 pr-4 py-3 rounded-xl text-sm outline-none"
          style={{ border: "1.5px solid #D4A574", backgroundColor: "white", color: "#3D2B1A" }}
          onFocus={(e) => { e.target.style.border = "2px solid #A64D25"; }}
          onBlur={(e) => { e.target.style.border = "1.5px solid #D4A574"; }}
          aria-controls="dict-results"
        />
      </div>

      {isLoading && (
        <div role="status" aria-live="polite" className="py-12 text-center" style={{ color: "#6B4423" }}>
          <p className="font-medium">Carregando dicionário…</p>
        </div>
      )}

      {!isLoading && error && (
        <div role="alert" className="rounded-2xl p-6 text-center" style={{ backgroundColor: "#E8D5C4", border: "1.5px solid #D4A574", color: "#6B4423" }}>
          <p className="font-semibold">Não foi possível exibir o dicionário</p>
          <p className="mt-2 text-sm">{error}</p>
          <button
            type="button"
            onClick={() => setRequestKey((key) => key + 1)}
            className="mt-5 rounded-xl px-5 py-2.5 text-sm font-semibold text-white"
            style={{ backgroundColor: "#A64D25" }}
          >
            Tentar novamente
          </button>
        </div>
      )}

      {/* Results */}
      {!isLoading && !error && (
      <div id="dict-results" role="list" aria-label="Resultados do dicionário" aria-live="polite">
        {filtered.length === 0 ? (
          <div className="text-center py-16" style={{ color: "#6B4423" }}>
            <div className="mb-3 flex justify-center" aria-hidden="true"><IconSearch /></div>
            <p className="font-medium">{words.length === 0 ? "Nenhuma palavra disponível" : "Nenhuma palavra encontrada"}</p>
            <p className="text-sm mt-1">
              {words.length === 0 ? "Ainda não há palavras ativas no dicionário." : "Tente pesquisar outro termo em Kambeba ou português."}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((word) => (
              <div
                key={word.id}
                role="listitem"
                className="rounded-xl p-4 transition-all"
                style={{ backgroundColor: "#E8D5C4", border: "1.5px solid #D4A574" }}
              >
                <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-2">
                  <span className="break-words font-bold text-base" style={{ fontFamily: "Lora, serif", color: "#6B4423" }}>
                    {word.termo_kambeba}
                  </span>
                  <span className="hidden text-sm sm:inline" style={{ color: "#D4A574" }} aria-hidden="true">→</span>
                  <span className="break-words text-sm" style={{ color: "#3D2B1A" }}>
                    {word.traducao_portugues}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      )}

      {!isLoading && !error && (
        <p className="text-xs text-center mt-6" style={{ color: "#6B4423" }}>
          {filtered.length} {filtered.length === 1 ? "palavra encontrada" : "palavras encontradas"}
        </p>
      )}
    </div>
  );
};

// ─── Screen: Modules ──────────────────────────────────────────────────────────

const moduleColors = ["#4A6741", "#6B4423", "#A64D25", "#8B6F47", "#6B4423"];

const ModulesScreen = ({ onSelectModule }: { onSelectModule: (module: LearningModule) => void }) => {
  const [modules, setModules] = useState<LearningModule[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [requestKey, setRequestKey] = useState(0);

  useEffect(() => {
    let active = true;

    const loadModules = async () => {
      setIsLoading(true);
      setError("");

      try {
        if (navigator.onLine) {
          const { data, error: queryError } = await supabase
            .from("modulos")
            .select("id, nome, descricao, ordem")
            .eq("ativo", true)
            .order("ordem", { ascending: true });

          if (!queryError) {
            await cacheModules(data ?? []);
            if (active) setModules(data ?? []);
            return;
          }
          logSupabaseError("Falha ao atualizar módulos; usando cache local", queryError);
        }

        const cachedModules = await getCachedModules();
        if (!active) return;
        setModules(cachedModules);
        if (cachedModules.length === 0) {
          setError("Os módulos ainda não foram carregados neste dispositivo. Conecte-se para preparar o acesso offline.");
        }
      } catch (loadError) {
        if (!active) return;
        setModules([]);
        console.error("[Tanu-Tyura] Falha ao carregar módulos online ou offline", loadError);
        setError(
          navigator.onLine
            ? "Não foi possível carregar os módulos do servidor nem do armazenamento local."
            : "Os módulos ainda não estão disponíveis offline neste dispositivo.",
        );
      } finally {
        if (active) setIsLoading(false);
      }
    };

    loadModules();
    return () => {
      active = false;
    };
  }, [requestKey]);

  return (
    <div className="page-container max-w-4xl">
      <h1 className="text-3xl font-bold mb-1" style={{ fontFamily: "Lora, serif", color: "#6B4423" }}>Módulos de Estudo</h1>
      <p className="text-sm mb-8" style={{ color: "#6B4423" }}>Escolha uma categoria para começar a aprender</p>

      {isLoading && (
        <div role="status" aria-live="polite">
          <p className="mb-4 text-sm font-medium" style={{ color: "#6B4423" }}>Carregando módulos…</p>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2" aria-hidden="true">
            {Array.from({ length: 5 }).map((_, index) => (
              <div
                key={index}
                className="h-40 animate-pulse rounded-2xl"
                style={{ backgroundColor: "#E8D5C4", border: "1.5px solid #D4A574" }}
              />
            ))}
          </div>
        </div>
      )}

      {!isLoading && error && (
        <div role="alert" className="rounded-2xl p-6 text-center" style={{ backgroundColor: "#E8D5C4", border: "1.5px solid #D4A574", color: "#6B4423" }}>
          <p className="font-semibold">Não foi possível exibir os módulos</p>
          <p className="mt-2 text-sm">{error}</p>
          <button
            type="button"
            onClick={() => setRequestKey((key) => key + 1)}
            className="mt-5 rounded-xl px-5 py-2.5 text-sm font-semibold text-white"
            style={{ backgroundColor: "#A64D25" }}
          >
            Tentar novamente
          </button>
        </div>
      )}

      {!isLoading && !error && modules.length === 0 && (
        <div role="status" className="rounded-2xl p-8 text-center" style={{ backgroundColor: "#E8D5C4", border: "1.5px solid #D4A574", color: "#6B4423" }}>
          <p className="font-semibold">Nenhum módulo disponível</p>
          <p className="mt-2 text-sm">Ainda não há módulos de aprendizagem ativos.</p>
        </div>
      )}

      {!isLoading && !error && modules.length > 0 && (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          {modules.map((module, index) => (
            <button
              type="button"
              key={module.id}
              onClick={() => onSelectModule(module)}
              className="group flex items-start gap-5 rounded-2xl p-6 text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg"
              style={{ backgroundColor: "#E8D5C4", border: "1.5px solid #D4A574" }}
            >
              <div
                className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl text-2xl text-white"
                style={{ backgroundColor: moduleColors[index % moduleColors.length], opacity: 0.9 }}
                aria-hidden="true"
              >
                <ModuleIcon order={module.ordem} />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="mb-1 break-words text-lg font-bold" style={{ fontFamily: "Lora, serif", color: "#6B4423" }}>{module.nome}</h2>
                <p className="mb-3 text-sm" style={{ color: "#6B4423" }}>{module.descricao}</p>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium" style={{ color: "#6B4423" }}>Acessar módulo</span>
                  <span style={{ color: "#6B4423" }}><IconChevronRight /></span>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

// ─── Screen: Module Content ───────────────────────────────────────────────────

const ModuleContentScreen = ({
  module,
  onBack,
}: {
  module: LearningModule;
  onBack: () => void;
}) => {
  const [words, setWords] = useState<LearningWord[]>([]);
  const [index, setIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [requestKey, setRequestKey] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioError, setAudioError] = useState("");
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    let active = true;

    const loadWords = async () => {
      setIsLoading(true);
      setError("");
      setIndex(0);

      try {
        if (navigator.onLine) {
          const { data, error: queryError } = await supabase
            .from("palavras")
            .select("id, modulo_id, termo_kambeba, traducao_portugues, audio_url")
            .eq("modulo_id", module.id)
            .eq("ativo", true)
            .order("id", { ascending: true });

          if (!queryError) {
            await cacheWords(data ?? []);
            if (active) setWords(data ?? []);
            return;
          }
          logSupabaseError(`Falha ao atualizar palavras do módulo ${module.id}; usando cache local`, queryError);
        }

        const cachedWords = await getCachedWords(module.id);
        if (!active) return;
        setWords(cachedWords);
        if (cachedWords.length === 0) {
          setError("O conteúdo deste módulo ainda não foi carregado neste dispositivo.");
        }
      } catch (loadError) {
        if (!active) return;
        setWords([]);
        console.error("[Tanu-Tyura] Falha ao carregar conteúdo do módulo online ou offline", loadError);
        setError(
          navigator.onLine
            ? "Não foi possível carregar este módulo do servidor nem do armazenamento local."
            : "O conteúdo deste módulo ainda não está disponível offline neste dispositivo.",
        );
      } finally {
        if (active) setIsLoading(false);
      }
    };

    loadWords();
    return () => {
      active = false;
    };
  }, [module.id, requestKey]);

  useEffect(() => {
    audioRef.current?.pause();
    audioRef.current = null;
    setIsPlaying(false);
    setAudioError("");
  }, [index, module.id]);

  useEffect(() => () => {
    audioRef.current?.pause();
  }, []);

  const word = words[index];
  const audioUrl = word ? getValidAudioUrl(word.audio_url) : null;

  const handleAudio = async () => {
    if (!audioUrl) return;

    audioRef.current?.pause();
    const audio = new Audio(audioUrl);
    audioRef.current = audio;
    setAudioError("");
    setIsPlaying(true);

    audio.addEventListener("ended", () => setIsPlaying(false), { once: true });
    audio.addEventListener("error", () => {
      setIsPlaying(false);
      setAudioError("Não foi possível reproduzir o áudio.");
    }, { once: true });

    try {
      await audio.play();
    } catch {
      setIsPlaying(false);
      setAudioError("Não foi possível reproduzir o áudio.");
    }
  };

  return (
    <div className="page-container max-w-2xl">
      <div className="mb-6 flex min-w-0 items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="flex flex-shrink-0 items-center gap-2 text-sm font-medium transition-colors"
          style={{ color: "#6B4423" }}
          aria-label="Voltar aos módulos"
        >
          <IconChevronLeft />
          Módulos
        </button>
        <span style={{ color: "#D4A574" }}>/</span>
        <h1 className="min-w-0 break-words text-sm font-semibold" style={{ color: "#6B4423" }}>{module.nome}</h1>
      </div>

      {isLoading && (
        <div role="status" aria-live="polite" className="rounded-2xl p-10 text-center" style={{ backgroundColor: "#E8D5C4", border: "1.5px solid #D4A574", color: "#6B4423" }}>
          <p className="font-medium">Carregando palavras…</p>
        </div>
      )}

      {!isLoading && error && (
        <div role="alert" className="rounded-2xl p-6 text-center" style={{ backgroundColor: "#E8D5C4", border: "1.5px solid #D4A574", color: "#6B4423" }}>
          <p className="font-semibold">Não foi possível exibir este módulo</p>
          <p className="mt-2 text-sm">{error}</p>
          <button
            type="button"
            onClick={() => setRequestKey((key) => key + 1)}
            className="mt-5 rounded-xl px-5 py-2.5 text-sm font-semibold text-white"
            style={{ backgroundColor: "#A64D25" }}
          >
            Tentar novamente
          </button>
        </div>
      )}

      {!isLoading && !error && words.length === 0 && (
        <div role="status" className="rounded-2xl p-8 text-center" style={{ backgroundColor: "#E8D5C4", border: "1.5px solid #D4A574", color: "#6B4423" }}>
          <p className="font-semibold">Nenhuma palavra disponível</p>
          <p className="mt-2 text-sm">Ainda não há palavras ativas cadastradas neste módulo.</p>
        </div>
      )}

      {!isLoading && !error && word && (
        <>
          <div className="mb-6">
            <div className="mb-2 flex justify-between text-xs" style={{ color: "#6B4423" }}>
              <span>Progresso</span>
              <span>{index + 1} de {words.length}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full" style={{ backgroundColor: "#D4A574" }} role="progressbar" aria-label={`Progresso no módulo ${module.nome}`} aria-valuemin={1} aria-valuemax={words.length} aria-valuenow={index + 1}>
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${((index + 1) / words.length) * 100}%`, backgroundColor: moduleColors[(module.ordem - 1) % moduleColors.length] }}
              />
            </div>
          </div>

          <div
            className="mb-6 rounded-2xl p-6 text-center sm:p-10"
            style={{ backgroundColor: "#E8D5C4", border: "1.5px solid #D4A574" }}
            aria-live="polite"
            aria-atomic="true"
          >
            <p className="mb-4 text-xs font-semibold uppercase tracking-wider" style={{ color: "#6B4423" }}>Palavra em Kambeba</p>
            <p className="mb-4 break-words text-4xl font-bold sm:text-5xl" style={{ fontFamily: "Lora, serif", color: "#6B4423" }}>{word.termo_kambeba}</p>
            <p className="break-words text-lg" style={{ color: "#A64D25", fontWeight: 500 }}>{word.traducao_portugues}</p>

            {audioUrl && navigator.onLine && (
              <button
                type="button"
                onClick={handleAudio}
                disabled={isPlaying}
                className="mt-6 inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-medium text-white transition-all"
                style={{ backgroundColor: isPlaying ? "#4A6741" : "#A64D25" }}
                aria-label={isPlaying ? "Reproduzindo áudio" : `Ouvir pronúncia de ${word.termo_kambeba}`}
              >
                <IconVolume />
                {isPlaying ? "Reproduzindo…" : "Ouvir pronúncia"}
              </button>
            )}
            {audioUrl && !navigator.onLine && (
              <p className="mt-5 text-xs" style={{ color: "#6B4423" }}>
                O áudio estará disponível quando a conexão retornar.
              </p>
            )}
            {audioError && <p role="alert" className="mt-3 text-xs" style={{ color: "#6B4423" }}>{audioError}</p>}
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setIndex((current) => Math.max(0, current - 1))}
              disabled={index === 0}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl py-3 text-sm font-medium transition-all"
              style={{ backgroundColor: index === 0 ? "#E8D5C4" : "#D4A574", color: index === 0 ? "#A89070" : "#6B4423", border: "1.5px solid #D4A574", cursor: index === 0 ? "not-allowed" : "pointer" }}
            >
              <IconChevronLeft /> Anterior
            </button>
            <button
              type="button"
              onClick={() => setIndex((current) => Math.min(words.length - 1, current + 1))}
              disabled={index === words.length - 1}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl py-3 text-sm font-medium text-white transition-all"
              style={{ backgroundColor: index === words.length - 1 ? "#c47040" : "#A64D25", cursor: index === words.length - 1 ? "not-allowed" : "pointer" }}
            >
              Próxima <IconChevronRight />
            </button>
          </div>

          <div className="mt-8">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider" style={{ color: "#6B4423" }}>Todas as palavras</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {words.map((item, itemIndex) => (
                <button
                  type="button"
                  key={item.id}
                  onClick={() => setIndex(itemIndex)}
                  className="flex min-w-0 items-center justify-between gap-3 rounded-xl p-3 text-left text-sm transition-all"
                  style={{ backgroundColor: itemIndex === index ? "#A64D25" : "#E8D5C4", color: itemIndex === index ? "white" : "#6B4423", border: "1.5px solid", borderColor: itemIndex === index ? "#A64D25" : "#D4A574" }}
                  aria-current={itemIndex === index ? "true" : undefined}
                >
                  <span className="min-w-0 break-words font-medium" style={{ fontFamily: "Lora, serif" }}>{item.termo_kambeba}</span>
                  <span className="min-w-0 break-words text-right text-sm opacity-80">{item.traducao_portugues}</span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

// ─── Screen: Activities ───────────────────────────────────────────────────────

const levelDetails: Record<LearningActivity["nivel"], { label: Level; color: string; bg: string }> = {
  facil: { label: "Fácil", color: "#4A6741", bg: "#eaf3e8" },
  medio: { label: "Médio", color: "#A64D25", bg: "#fdf0e8" },
  avancado: { label: "Avançado", color: "#6B4423", bg: "#f2ebe3" },
};

const ActivitiesScreen = ({ onSelectActivity }: { onSelectActivity: (activity: LearningActivity) => void }) => {
  const [activities, setActivities] = useState<LearningActivity[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [preparationMessage, setPreparationMessage] = useState("");
  const [preparationFailed, setPreparationFailed] = useState(false);
  const [requestKey, setRequestKey] = useState(0);

  useEffect(() => {
    let active = true;

    const loadActivities = async () => {
      setIsLoading(true);
      setError("");
      setPreparationMessage("");
      setPreparationFailed(false);

      try {
        if (navigator.onLine) {
          const { data, error: queryError } = await supabase
            .from("atividades")
            .select("id, titulo, descricao, nivel")
            .eq("ativo", true)
            .order("id", { ascending: true });

          if (!queryError) {
            const validActivities = (data ?? []).filter(
              (activity): activity is LearningActivity => activity.nivel in levelDetails,
            );
            await cacheActivities(validActivities);

            const activityIds = validActivities.map((activity) => activity.id);
            const { data: questionData, error: questionError } = await supabase
              .from("questoes")
              .select("id, atividade_id, enunciado, alternativas, ordem")
              .in("atividade_id", activityIds)
              .eq("ativo", true)
              .order("atividade_id", { ascending: true })
              .order("ordem", { ascending: true });

            if (questionError) {
              logSupabaseError("Falha ao preparar todas as questões para uso offline", questionError);
              if (active) {
                setPreparationFailed(true);
                setPreparationMessage("As atividades estão disponíveis online, mas não foi possível atualizar agora o conteúdo offline.");
              }
            } else {
              const loadedQuestions = (questionData ?? []) as ActivityQuestion[];
              const hasCompleteQuestionSet = validActivities.length === 3
                && loadedQuestions.length === 15
                && validActivities.every((activity) =>
                  loadedQuestions.filter((question) => question.atividade_id === activity.id).length === 5
                )
                && loadedQuestions.every((question) =>
                  ["A", "B", "C", "D"].every((key) =>
                    typeof question.alternativas?.[key as keyof ActivityQuestion["alternativas"]] === "string"
                  )
                );

              if (hasCompleteQuestionSet) {
                await cacheQuestions(loadedQuestions);
                if (active) setPreparationMessage("As três atividades estão preparadas para uso offline.");
              } else {
                console.error("[Tanu-Tyura] Conjunto de questões incompleto; cache anterior preservado", {
                  atividades: validActivities.length,
                  questoes: loadedQuestions.length,
                  porAtividade: validActivities.map((activity) => ({
                    atividade_id: activity.id,
                    quantidade: loadedQuestions.filter((question) => question.atividade_id === activity.id).length,
                  })),
                });
                if (active) {
                  setPreparationFailed(true);
                  setPreparationMessage("Os dados recebidos estão incompletos. O conteúdo offline anterior foi preservado.");
                }
              }
            }

            if (active) setActivities(validActivities);
            return;
          }
          logSupabaseError("Falha ao atualizar atividades; usando cache local", queryError);
        }

        const cachedActivities = await getCachedActivities();
        if (!active) return;
        setActivities(cachedActivities);
        if (cachedActivities.length === 0) {
          setError("Nenhuma atividade foi carregada anteriormente neste dispositivo. Conecte-se para preparar o acesso offline.");
        } else {
          const cachedQuestionSets = await Promise.all(
            cachedActivities.map((activity) => getCachedQuestions(activity.id)),
          );
          if (!active) return;
          const allActivitiesAvailable = cachedActivities.length === 3
            && cachedQuestionSets.every((questions) => questions.length === 5);
          setPreparationFailed(!allActivitiesAvailable);
          setPreparationMessage(
            allActivitiesAvailable
              ? "As três atividades estão disponíveis offline."
              : "Algumas atividades ainda não possuem questões armazenadas neste dispositivo.",
          );
        }
      } catch (loadError) {
        if (!active) return;
        setActivities([]);
        console.error("[Tanu-Tyura] Falha ao carregar atividades online ou offline", loadError);
        setError(
          navigator.onLine
            ? "Não foi possível carregar as atividades do servidor nem do armazenamento local."
            : "As atividades ainda não estão disponíveis offline neste dispositivo.",
        );
      } finally {
        if (active) setIsLoading(false);
      }
    };

    loadActivities();
    return () => {
      active = false;
    };
  }, [requestKey]);

  return (
    <div className="page-container max-w-2xl">
      <h1 className="text-3xl font-bold mb-1" style={{ fontFamily: "Lora, serif", color: "#6B4423" }}>Atividades</h1>
      <p className="text-sm mb-8" style={{ color: "#6B4423" }}>Escolha seu nível e comece a praticar</p>

      {!isLoading && preparationMessage && (
        <div
          role={preparationFailed ? "alert" : "status"}
          className="mb-5 rounded-xl p-3 text-sm"
          style={{
            backgroundColor: preparationFailed ? "#fff7ed" : "#ecfdf5",
            border: `1px solid ${preparationFailed ? "#fdba74" : "#86efac"}`,
            color: preparationFailed ? "#9a3412" : "#166534",
          }}
        >
          {preparationMessage}
        </div>
      )}

      {isLoading && (
        <div role="status" className="rounded-2xl p-6 text-center text-sm" style={{ backgroundColor: "#E8D5C4", color: "#6B4423", border: "1.5px solid #D4A574" }}>
          Carregando atividades…
        </div>
      )}

      {!isLoading && error && (
        <div role="alert" className="rounded-2xl p-6 text-center" style={{ backgroundColor: "#fef2f2", color: "#991b1b", border: "1px solid #fecaca" }}>
          <p className="mb-4 text-sm">{error}</p>
          <button type="button" onClick={() => setRequestKey((key) => key + 1)} className="rounded-xl px-5 py-2.5 text-sm font-semibold text-white" style={{ backgroundColor: "#A64D25" }}>
            Tentar novamente
          </button>
        </div>
      )}

      {!isLoading && !error && activities.length === 0 && (
        <div role="status" className="rounded-2xl p-6 text-center text-sm" style={{ backgroundColor: "#E8D5C4", color: "#6B4423", border: "1.5px solid #D4A574" }}>
          Nenhuma atividade está disponível no momento.
        </div>
      )}

      {!isLoading && !error && activities.length > 0 && <div className="space-y-4">
        {activities.map((activity) => {
          const { label, color, bg } = levelDetails[activity.nivel];
          return (
          <button
            key={activity.id}
            onClick={() => onSelectActivity(activity)}
            className="w-full flex items-center justify-between p-6 rounded-2xl text-left transition-all duration-200"
            style={{ backgroundColor: bg, border: `2px solid ${color}22` }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.transform = "translateX(4px)"; (e.currentTarget as HTMLElement).style.borderColor = color; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.transform = "none"; (e.currentTarget as HTMLElement).style.borderColor = `${color}22`; }}
          >
            <div>
              <p className="font-bold text-lg mb-1" style={{ fontFamily: "Lora, serif", color }}>
                {activity.titulo}
              </p>
              <p className="text-sm" style={{ color: "#6B4423" }}>{activity.descricao}</p>
              <p className="text-xs mt-1" style={{ color }}>
                Nível {label.toLocaleLowerCase("pt-BR")} · 5 questões
              </p>
            </div>
            <div style={{ color }}>
              <IconChevronRight />
            </div>
          </button>
          );
        })}
      </div>}
    </div>
  );
};

// ─── Screen: Question ─────────────────────────────────────────────────────────

const QuestionScreen = ({
  activity,
  userId,
  onFinish,
  onQueued,
  onPendingChange,
  onBack,
}: {
  activity: LearningActivity;
  userId: string;
  onFinish: (correct: number, total: number) => void;
  onQueued: () => void;
  onPendingChange: () => void;
  onBack: () => void;
}) => {
  const [questions, setQuestions] = useState<ActivityQuestion[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [requestKey, setRequestKey] = useState(0);
  const [qIndex, setQIndex] = useState(0);
  const [selected, setSelected] = useState<AnswerOption | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [answers, setAnswers] = useState<Record<number, AnswerOption>>({});
  const [attemptId] = useState(() => crypto.randomUUID());
  const level = levelDetails[activity.nivel].label;

  useEffect(() => {
    let active = true;

    const loadQuestions = async () => {
      setIsLoading(true);
      setLoadError("");

      try {
        let loadedQuestions: ActivityQuestion[] = [];

        if (navigator.onLine) {
          const { data, error } = await supabase
            .from("questoes")
            .select("id, atividade_id, enunciado, alternativas, ordem")
            .eq("atividade_id", activity.id)
            .eq("ativo", true)
            .order("ordem", { ascending: true })
            .limit(5);

          if (!error) {
            loadedQuestions = (data ?? []) as ActivityQuestion[];
            await cacheQuestions(loadedQuestions);
          } else {
            logSupabaseError("Falha ao atualizar questões; usando cache local", error);
          }
        }

        if (loadedQuestions.length === 0) {
          loadedQuestions = await getCachedQuestions(activity.id);
        }
        if (!active) return;

        const hasInvalidOptions = loadedQuestions.some(
          (question) => !["A", "B", "C", "D"].every((key) => typeof question.alternativas?.[key as keyof ActivityQuestion["alternativas"]] === "string"),
        );
        if (loadedQuestions.length !== 5 || hasInvalidOptions) {
          setLoadError(
            navigator.onLine
              ? "Esta atividade não possui cinco questões válidas disponíveis."
              : "Esta atividade ainda não foi preparada para uso offline. Abra-a uma vez enquanto estiver conectado.",
          );
          return;
        }
        setQuestions(loadedQuestions);
      } catch (loadError) {
        if (!active) return;
        console.error("[Tanu-Tyura] Falha ao carregar questões online ou offline", loadError);
        setLoadError(
          navigator.onLine
            ? "Não foi possível carregar as questões do servidor nem do armazenamento local."
            : "Esta atividade ainda não está disponível offline neste dispositivo.",
        );
      } finally {
        if (active) setIsLoading(false);
      }
    };

    loadQuestions();
    return () => {
      active = false;
    };
  }, [activity.id, requestKey]);

  const current = questions[qIndex];

  const handleConfirm = () => {
    if (selected === null || !current) return;
    setAnswers((currentAnswers) => ({ ...currentAnswers, [current.id]: selected }));
    setConfirmed(true);
  };

  const submitAnswers = async () => {
    setIsSubmitting(true);
    setSubmitError("");

    const completedAnswersByQuestion = {
      ...answers,
      ...(current && selected ? { [current.id]: selected } : {}),
    };
    const completedAnswers: ActivityAnswer[] = questions.flatMap((question) => {
      const answer = completedAnswersByQuestion[question.id];
      return answer ? [{ questao_id: Number(question.id), resposta: answer }] : [];
    });

    if (completedAnswers.length !== questions.length) {
      setSubmitError("Confirme uma resposta para cada questão antes de finalizar.");
      setIsSubmitting(false);
      return;
    }

    const attempt: OfflineAttempt = {
      tentativa_uuid: attemptId,
      usuario_id: userId,
      atividade_id: activity.id,
      atividade_titulo: activity.titulo,
      nivel: activity.nivel,
      respostas: completedAnswers,
      status: "pending",
      criado_em: new Date().toISOString(),
    };

    try {
      await savePendingAttempt(attempt);
      onPendingChange();

      if (!navigator.onLine) {
        onQueued();
        return;
      }

      console.info("[Tanu-Tyura] Enviando atividade para correção", attempt);
      const { result, error } = await correctStoredAttempt(attempt);
      if (error) {
        logSupabaseError("Falha na RPC corrigir_atividade", error);
        await keepAttemptPending(attempt, error.message);
        onPendingChange();
        setSubmitError(getActivityCorrectionErrorMessage(error));
        return;
      }

      await markAttemptSynced(attempt, result);
      onPendingChange();
      onFinish(result.acertos, result.total_questoes);
    } catch (error) {
      const unexpectedError = error instanceof Error
        ? { message: error.message }
        : { message: String(error) };
      logSupabaseError("Erro inesperado ao chamar corrigir_atividade", unexpectedError);
      await keepAttemptPending(attempt, unexpectedError.message).catch((storageError) => {
        console.error("[Tanu-Tyura] Não foi possível preservar a tentativa pendente", storageError);
      });
      onPendingChange();
      setSubmitError(getActivityCorrectionErrorMessage(unexpectedError));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleNext = () => {
    if (qIndex + 1 >= questions.length) {
      submitAnswers();
    } else {
      setQIndex((i) => i + 1);
      setSelected(null);
      setConfirmed(false);
      setSubmitError("");
    }
  };

  if (isLoading) {
    return (
      <div className="page-container max-w-2xl">
        <div role="status" className="rounded-2xl p-8 text-center text-sm" style={{ backgroundColor: "#E8D5C4", color: "#6B4423", border: "1.5px solid #D4A574" }}>
          Carregando questões…
        </div>
      </div>
    );
  }

  if (loadError || !current) {
    return (
      <div className="page-container max-w-2xl">
        <div role="alert" className="rounded-2xl p-6 text-center" style={{ backgroundColor: "#fef2f2", color: "#991b1b", border: "1px solid #fecaca" }}>
          <p className="mb-4 text-sm">{loadError || "Não foi possível abrir esta atividade."}</p>
          <div className="flex flex-col justify-center gap-3 sm:flex-row">
            <button type="button" onClick={() => setRequestKey((key) => key + 1)} className="rounded-xl px-5 py-2.5 text-sm font-semibold text-white" style={{ backgroundColor: "#A64D25" }}>
              Tentar novamente
            </button>
            <button type="button" onClick={onBack} className="rounded-xl px-5 py-2.5 text-sm font-semibold" style={{ border: "1.5px solid #D4A574", color: "#6B4423" }}>
              Voltar às atividades
            </button>
          </div>
        </div>
      </div>
    );
  }

  const optionEntries = (["A", "B", "C", "D"] as const).map((key) => [key, current.alternativas[key]] as const);

  return (
    <div className="page-container max-w-2xl">
      {/* Header */}
      <div className="grid grid-cols-[1fr_auto] items-center gap-3 mb-6 sm:grid-cols-[1fr_auto_1fr]">
        <button onClick={onBack} className="flex items-center gap-2 text-sm font-medium" style={{ color: "#6B4423" }}>
          <IconChevronLeft /> Atividades
        </button>
        <h1 className="text-sm font-medium" style={{ color: "#6B4423" }}>
          Trilha {level}
        </h1>
        <span className="col-span-2 text-right text-sm sm:col-span-1" style={{ color: "#6B4423" }}>
          {qIndex + 1} / {questions.length}
        </span>
      </div>

      {/* Progress */}
      <div className="h-2 rounded-full mb-8 overflow-hidden" style={{ backgroundColor: "#D4A574" }} role="progressbar" aria-label="Progresso da atividade" aria-valuemin={1} aria-valuemax={questions.length} aria-valuenow={qIndex + 1}>
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${((qIndex + 1) / questions.length) * 100}%`, backgroundColor: "#A64D25" }}
        />
      </div>

      {/* Question */}
      <div
        className="rounded-2xl p-5 sm:p-8 mb-6"
        style={{ backgroundColor: "#E8D5C4", border: "1.5px solid #D4A574" }}
        aria-live="polite"
      >
        <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: "#6B4423" }}>Questão</p>
        <h2 className="text-xl font-bold" style={{ fontFamily: "Lora, serif", color: "#6B4423" }}>
          {current.enunciado}
        </h2>
      </div>

      {/* Options */}
      <fieldset className="space-y-3 mb-6">
        <legend className="sr-only">Escolha uma alternativa</legend>
        {optionEntries.map(([key, option]) => {
          let bg = "#E8D5C4";
          let border = "#D4A574";
          let color = "#3D2B1A";
          if (confirmed && key === selected) { bg = "#eaf3e8"; border = "#4A6741"; color = "#365032"; }
          else if (!confirmed && key === selected) { border = "#A64D25"; bg = "#F5E6D3"; }

          return (
            <label
              key={key}
              className="answer-option flex cursor-pointer items-center gap-4 rounded-xl p-4 transition-all"
              style={{ backgroundColor: bg, border: `2px solid ${border}`, color }}
            >
              <input
                type="radio"
                name="answer"
                value={key}
                checked={selected === key}
                onChange={() => { if (!confirmed) setSelected(key); }}
                disabled={confirmed}
                className="sr-only"
              />
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 transition-all"
                style={{
                  backgroundColor: !confirmed && key === selected ? "#A64D25" : confirmed && key === selected ? "#4A6741" : "#D4A574",
                  color: key === selected ? "white" : "#6B4423",
                }}
              >
                {confirmed && key === selected ? <IconCheck /> : key}
              </div>
              <span className="font-medium">{option}</span>
            </label>
          );
        })}
      </fieldset>

      {/* Feedback */}
      {confirmed && (
        <div
          className="p-3 rounded-xl text-sm font-medium mb-4"
          style={{ backgroundColor: "#eaf3e8", color: "#365032" }}
          role="status"
          aria-live="polite"
        >
          Resposta confirmada.
        </div>
      )}

      {submitError && (
        <div role="alert" className="mb-4 rounded-xl p-3 text-sm" style={{ backgroundColor: "#fef2f2", color: "#991b1b", border: "1px solid #fecaca" }}>
          {submitError}
        </div>
      )}

      <div className="flex gap-3">
        {!confirmed ? (
          <button
            onClick={handleConfirm}
            disabled={selected === null}
            className="w-full py-3 rounded-xl font-semibold text-sm text-white transition-all"
            style={{ backgroundColor: selected === null ? "#c47040" : "#A64D25", cursor: selected === null ? "not-allowed" : "pointer" }}
          >
            Confirmar
          </button>
        ) : (
          <button
            onClick={handleNext}
            disabled={isSubmitting}
            className="w-full py-3 rounded-xl font-semibold text-sm text-white transition-all"
            style={{ backgroundColor: isSubmitting ? "#c47040" : "#A64D25" }}
            aria-busy={isSubmitting}
          >
            {isSubmitting ? "Corrigindo…" : qIndex + 1 >= questions.length ? submitError ? "Tentar corrigir novamente" : "Finalizar atividade" : "Próxima questão →"}
          </button>
        )}
      </div>
    </div>
  );
};

// ─── Screen: Result ───────────────────────────────────────────────────────────

const ResultScreen = ({
  correct,
  total,
  level,
  onRetry,
  onBack,
}: {
  correct: number;
  total: number;
  level: Level;
  onRetry: () => void;
  onBack: () => void;
}) => {
  const pct = Math.round((correct / total) * 100);
  const msg = pct >= 80 ? "Excelente! Parabéns pelo desempenho!" : pct >= 60 ? "Bom trabalho! Continue praticando." : "Continue tentando, você está evoluindo!";
  const msgColor = pct >= 80 ? "#15803d" : pct >= 60 ? "#A64D25" : "#6B4423";

  return (
    <div className="page-container max-w-lg text-center">
      <div className="rounded-2xl p-6 sm:p-10" style={{ backgroundColor: "#E8D5C4", border: "1.5px solid #D4A574" }}>
        <div className="flex justify-center mb-5" style={{ color: "#A64D25" }} aria-hidden="true">
          <IconTrophy />
        </div>

        <h1 className="text-3xl font-bold mb-1" style={{ fontFamily: "Lora, serif", color: "#6B4423" }}>
          Resultado
        </h1>
        <p className="text-sm mb-8" style={{ color: "#6B4423" }}>Trilha {level}</p>

        <div
          className="text-6xl font-bold mb-2"
          style={{ fontFamily: "Lora, serif", color: "#6B4423" }}
          aria-label={`${correct} de ${total} acertos`}
        >
          {correct}<span className="text-3xl" style={{ color: "#6B4423" }}> / {total}</span>
        </div>
        <p className="text-lg font-semibold mb-6" style={{ color: "#A64D25" }}>{pct}% de acertos</p>

        {/* Progress bar */}
        <div className="h-3 rounded-full overflow-hidden mb-2" style={{ backgroundColor: "#D4A574" }} role="progressbar" aria-label="Percentual de acertos" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
          <div className="h-full rounded-full transition-all duration-1000" style={{ width: `${pct}%`, backgroundColor: pct >= 80 ? "#4A6741" : pct >= 60 ? "#A64D25" : "#8B6F47" }} />
        </div>

        <div className="flex flex-col justify-center gap-3 mb-6 text-sm sm:flex-row sm:gap-6">
          <div className="flex items-center gap-2" style={{ color: "#15803d" }}>
            <div className="w-5 h-5 rounded-full bg-green-100 flex items-center justify-center"><IconCheck /></div>
            {correct} acertos
          </div>
          <div className="flex items-center gap-2" style={{ color: "#dc2626" }}>
            <div className="w-5 h-5 rounded-full bg-red-100 flex items-center justify-center"><IconX /></div>
            {total - correct} erros
          </div>
        </div>

        <p className="text-sm font-medium mb-8" style={{ color: msgColor }}>{msg}</p>

        <div className="space-y-3">
          <button
            onClick={onRetry}
            className="w-full py-3 rounded-xl font-semibold text-sm text-white transition-all"
            style={{ backgroundColor: "#A64D25" }}
          >
            Refazer atividade
          </button>
          <button
            onClick={onBack}
            className="w-full py-3 rounded-xl font-semibold text-sm transition-all"
            style={{ backgroundColor: "transparent", border: "1.5px solid #D4A574", color: "#6B4423" }}
          >
            Voltar às atividades
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── App (Router) ─────────────────────────────────────────────────────────────

const AuthLoadingScreen = () => (
  <div className="min-h-screen flex items-center justify-center p-6" style={{ backgroundColor: "#6B4423" }}>
    <div role="status" aria-live="polite" className="rounded-2xl p-8 text-center" style={{ backgroundColor: "#F5E6D3", color: "#6B4423" }}>
      <Logo size="md" />
      <p className="mt-3 text-sm font-medium">Verificando sua sessão…</p>
    </div>
  </div>
);

export default function App() {
  const [screen, setScreen] = useState<Screen>("login");
  const [selectedModule, setSelectedModule] = useState<LearningModule | null>(null);
  const [selectedActivity, setSelectedActivity] = useState<LearningActivity | null>(null);
  const [activityKey, setActivityKey] = useState(0);
  const [result, setResult] = useState({ correct: 0, total: 0 });
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [loginNotice, setLoginNotice] = useState("");
  const [appNotice, setAppNotice] = useState("");
  const [appError, setAppError] = useState("");
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingCount, setPendingCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncRequest, setSyncRequest] = useState(0);
  const [offlinePreparation, setOfflinePreparation] = useState<{
    state: "idle" | "preparing" | "ready" | "error" | "local-ready" | "local-incomplete";
    message: string;
  }>({ state: "idle", message: "" });
  const synchronizationRef = useRef(false);
  const preloadRef = useRef(false);

  const isAuthScreen = (value: Screen) => value === "login" || value === "register";

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (error) setLoginNotice("Não foi possível restaurar sua sessão. Entre novamente.");
      setSession(data.session);
      setScreen((current) => data.session && isAuthScreen(current) ? "home" : !data.session && !isAuthScreen(current) ? "login" : current);
      setAuthReady(true);
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return;
      setSession(nextSession);
      setScreen((current) => nextSession && isAuthScreen(current) ? "home" : !nextSession && !isAuthScreen(current) ? "login" : current);
      setAuthReady(true);
    });

    return () => {
      active = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const prepareOfflineContent = async () => {
      if (preloadRef.current) return;
      preloadRef.current = true;

      try {
        if (isOnline) {
          setOfflinePreparation({
            state: "preparing",
            message: "Preparando conteúdos para uso offline…",
          });
          await preloadOfflineContent();
          setOfflinePreparation({
            state: "ready",
            message: "Conteúdos armazenados com sucesso.",
          });
        } else {
          const summary = await inspectOfflineContent();
          setOfflinePreparation(
            summary.complete
              ? {
                  state: "local-ready",
                  message: "Tanu-Tyura pronto para uso offline com os conteúdos armazenados neste dispositivo.",
                }
              : {
                  state: "local-incomplete",
                  message: "Alguns conteúdos ainda não estão disponíveis offline neste dispositivo.",
                },
          );
        }
      } catch (error) {
        console.error("[Tanu-Tyura] Falha no pré-carregamento automático", error);
        setOfflinePreparation({
          state: "error",
          message: "Não foi possível atualizar todos os conteúdos; os dados locais anteriores foram preservados.",
        });
      } finally {
        preloadRef.current = false;
      }
    };

    prepareOfflineContent();
  }, [isOnline]);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const refreshPendingCount = useCallback(async () => {
    if (!session?.user.id) {
      setPendingCount(0);
      return;
    }

    try {
      setPendingCount(await countPendingAttempts(session.user.id));
    } catch (error) {
      console.error("[Tanu-Tyura] Falha ao contar tentativas pendentes", error);
    }
  }, [session?.user.id]);

  const synchronizePendingAttempts = useCallback(async () => {
    if (!isOnline || !session?.user.id || synchronizationRef.current) return;

    synchronizationRef.current = true;
    setIsSyncing(true);

    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !sessionData.session || sessionData.session.user.id !== session.user.id) {
        if (sessionError) logSupabaseError("Sessão inválida durante sincronização", sessionError);
        setAppError("As tentativas continuam salvas. Entre novamente para sincronizá-las.");
        return;
      }

      const pendingAttempts = await getPendingAttempts(session.user.id);
      if (pendingAttempts.length === 0) return;

      const synchronizedResults: Array<{ title: string; correct: number; total: number }> = [];
      for (const attempt of pendingAttempts) {
        const { result: synchronizedResult, error } = await correctStoredAttempt(attempt);

        if (error) {
          logSupabaseError(`Falha ao sincronizar tentativa ${attempt.tentativa_uuid}`, error);
          await keepAttemptPending(attempt, error.message);
          if (error.code === "42501" || error.code === "PGRST301") break;
          continue;
        }

        await markAttemptSynced(attempt, synchronizedResult);
        synchronizedResults.push({
          title: attempt.atividade_titulo,
          correct: synchronizedResult.acertos,
          total: synchronizedResult.total_questoes,
        });
      }

      await refreshPendingCount();
      if (synchronizedResults.length === 1) {
        const synchronizedResult = synchronizedResults[0];
        setAppError("");
        setAppNotice(`Sincronização concluída: ${synchronizedResult.correct} de ${synchronizedResult.total} acertos.`);
      } else if (synchronizedResults.length > 1) {
        setAppError("");
        setAppNotice(`${synchronizedResults.length} tentativas sincronizadas com sucesso.`);
      }
    } catch (error) {
      console.error("[Tanu-Tyura] Falha inesperada durante sincronização", error);
      setAppError(
        navigator.onLine
          ? "Não foi possível sincronizar agora. As tentativas continuam salvas para uma nova tentativa."
          : "",
      );
    } finally {
      synchronizationRef.current = false;
      setIsSyncing(false);
      await refreshPendingCount();
    }
  }, [isOnline, refreshPendingCount, session?.user.id]);

  useEffect(() => {
    refreshPendingCount();
    if (isOnline) synchronizePendingAttempts();
  }, [isOnline, refreshPendingCount, session?.user.id, syncRequest, synchronizePendingAttempts]);

  const navigateTo = (s: Screen) => {
    setAppError("");
    setAppNotice("");
    setScreen(s);
  };

  const handleLogin = async (email: string, password: string): Promise<AuthActionResult> => {
    if (!navigator.onLine) {
      return { error: "O login requer conexão com a internet. Reconecte-se e tente novamente." };
    }

    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) return { error: getAuthErrorMessage(error) };
      if (!data.session) return { error: "Não foi possível iniciar a sessão. Tente novamente." };

      setSession(data.session);
      setLoginNotice("");
      setAppError("");
      setAppNotice("Login realizado com sucesso.");
      setScreen("home");
      return {};
    } catch (error) {
      return { error: getAuthErrorMessage(error as Error) };
    }
  };

  const handleRegister = async (name: string, email: string, password: string): Promise<AuthActionResult> => {
    if (!navigator.onLine) {
      return { error: "O cadastro requer conexão com a internet. Reconecte-se e tente novamente." };
    }

    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            nome: name,
          },
        },
      });
      if (error) return { error: getAuthErrorMessage(error) };
      if (data.user?.identities?.length === 0) {
        return { error: "Já existe uma conta associada a este e-mail." };
      }
      if (!data.session) return { confirmationRequired: true };

      setSession(data.session);
      setAppError("");
      setAppNotice("Conta criada e login realizado.");
      setScreen("home");
      return {};
    } catch (error) {
      return { error: getAuthErrorMessage(error as Error) };
    }
  };

  const handleLogout = async () => {
    setAppError("");
    const { error } = await supabase.auth.signOut();
    if (error) {
      setAppError("Não foi possível encerrar a sessão. Tente novamente.");
      return;
    }
    setSession(null);
    setPendingCount(0);
    setAppNotice("");
    setLoginNotice("Sessão encerrada com sucesso.");
    setScreen("login");
  };

  const handleGoRegister = () => {
    setLoginNotice("");
    setScreen("register");
  };
  const handleGoLogin = (notice?: string) => {
    setLoginNotice(notice ?? "");
    setScreen("login");
  };

  const handleSelectModule = (module: LearningModule) => {
    setSelectedModule(module);
    setScreen("module-content");
  };

  const handleSelectActivity = (activity: LearningActivity) => {
    setSelectedActivity(activity);
    setActivityKey((k) => k + 1);
    setScreen("question");
  };

  const handleFinish = (correct: number, total: number) => {
    setResult({ correct, total });
    setScreen("result");
  };

  const handleRetry = () => {
    setActivityKey((k) => k + 1);
    setScreen("question");
  };

  const handleOfflineQueued = () => {
    setAppError("");
    setAppNotice("Tentativa salva. Aguardando sincronização.");
    setScreen("activities");
  };

  const clearAppNotice = useCallback(() => setAppNotice(""), []);

  if (!authReady) {
    return <AuthLoadingScreen />;
  }

  if (!session) {
    return screen === "register" ? (
      <RegisterScreen onRegister={handleRegister} onGoLogin={handleGoLogin} />
    ) : (
      <LoginScreen onLogin={handleLogin} onGoRegister={handleGoRegister} notice={loginNotice} />
    );
  }

  return (
    <AppLayout
      activeScreen={screen}
      onNavigate={navigateTo}
      onLogout={handleLogout}
      isOnline={isOnline}
      pendingCount={pendingCount}
      isSyncing={isSyncing}
      onSync={() => setSyncRequest((request) => request + 1)}
      offlinePreparation={offlinePreparation}
      notice={appNotice}
      onDismissNotice={clearAppNotice}
      error={appError}
    >
      {screen === "home" && <HomeScreen onNavigate={navigateTo} />}
      {screen === "dictionary" && <DictionaryScreen />}
      {screen === "modules" && <ModulesScreen onSelectModule={handleSelectModule} />}
      {screen === "module-content" && selectedModule && (
        <ModuleContentScreen module={selectedModule} onBack={() => setScreen("modules")} />
      )}
      {screen === "activities" && <ActivitiesScreen onSelectActivity={handleSelectActivity} />}
      {screen === "question" && selectedActivity && (
        <QuestionScreen
          key={activityKey}
          activity={selectedActivity}
          userId={session.user.id}
          onFinish={handleFinish}
          onQueued={handleOfflineQueued}
          onPendingChange={refreshPendingCount}
          onBack={() => setScreen("activities")}
        />
      )}
      {screen === "result" && (
        <ResultScreen
          correct={result.correct}
          total={result.total}
          level={selectedActivity ? levelDetails[selectedActivity.nivel].label : "Fácil"}
          onRetry={handleRetry}
          onBack={() => setScreen("activities")}
        />
      )}
    </AppLayout>
  );
}
