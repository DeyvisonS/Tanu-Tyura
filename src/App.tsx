import { useState, useEffect, useRef } from "react";
import type { AuthError, Session } from "@supabase/supabase-js";
import { supabase } from "./lib/supabase";
import {
  cacheActivities,
  cacheQuestionsForActivity,
  getCachedActivities,
  getCachedQuestions,
  getPendingAttempts,
  removePendingAttempt,
  savePendingAttempt,
} from "./lib/activityStorage";
import type {
  ActivityLevelCode,
  ActivityQuestion,
  AnswerChoice,
  LearningActivity,
  PendingAttempt,
} from "./lib/activityStorage";

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

// ─── Activity helpers ──────────────────────────────────────────────────────────

const LEVEL_LABELS: Record<ActivityLevelCode, Level> = {
  facil: "Fácil",
  medio: "Médio",
  avancado: "Avançado",
};

const LEVEL_STYLES: Record<ActivityLevelCode, { color: string; bg: string; fallbackDescription: string }> = {
  facil: {
    color: "#4A6741",
    bg: "#eaf3e8",
    fallbackDescription: "Reconhecimento de palavras e significados.",
  },
  medio: {
    color: "#A64D25",
    bg: "#fdf0e8",
    fallbackDescription: "Associação e compreensão do vocabulário.",
  },
  avancado: {
    color: "#6B4423",
    bg: "#f2ebe3",
    fallbackDescription: "Aplicação dos conhecimentos adquiridos.",
  },
};

const ANSWER_CHOICES: AnswerChoice[] = ["A", "B", "C", "D"];

type CorrectionResult = {
  resultado_id: number;
  tentativa_uuid: string;
  acertos: number;
  total_questoes: number;
  data_realizacao: string;
  ja_processada: boolean;
};

const isActivityLevelCode = (value: unknown): value is ActivityLevelCode =>
  value === "facil" || value === "medio" || value === "avancado";

const isAnswerChoice = (value: unknown): value is AnswerChoice =>
  value === "A" || value === "B" || value === "C" || value === "D";

const isValidAlternatives = (value: unknown): value is Record<AnswerChoice, string> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const alternatives = value as Record<string, unknown>;
  return ANSWER_CHOICES.every((choice) => typeof alternatives[choice] === "string");
};

async function synchronizePendingAttempts(userId: string): Promise<void> {
  if (!navigator.onLine) return;

  let attempts: PendingAttempt[];
  try {
    attempts = await getPendingAttempts(userId);
  } catch {
    return;
  }

  for (const attempt of attempts) {
    try {
      const { data, error } = await supabase.rpc("corrigir_atividade", {
        p_tentativa_uuid: attempt.tentativa_uuid,
        p_atividade_id: attempt.atividade_id,
        p_respostas: attempt.respostas,
      });

      if (error || !data || typeof data.acertos !== "number" || typeof data.total_questoes !== "number") {
        continue;
      }

      await removePendingAttempt(attempt.tentativa_uuid);
      window.dispatchEvent(
        new CustomEvent<CorrectionResult>("tanu-tyura-attempt-synced", { detail: data as CorrectionResult }),
      );
    } catch {
      // A tentativa permanece no IndexedDB para uma nova sincronização.
    }
  }
}

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
  onNavigate,
  onLogout,
  onClose,
}: {
  active: Screen;
  onNavigate: (s: Screen) => void;
  onLogout: () => void;
  onClose: () => void;
}) => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => { window.removeEventListener("online", handleOnline); window.removeEventListener("offline", handleOffline); };
  }, []);

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
  notice,
  error,
}: {
  children: React.ReactNode;
  activeScreen: Screen;
  onNavigate: (s: Screen) => void;
  onLogout: () => void;
  notice?: string;
  error?: string;
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLElement>(null);

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
        <Sidebar active={activeScreen} onNavigate={navigate} onLogout={onLogout} onClose={closeMenu} />
      </div>

      <main id="main-content" ref={mainRef} className="min-w-0 flex-1 overflow-y-auto" tabIndex={-1}>
        {notice && (
          <div role="status" className="mx-auto mt-4 max-w-4xl px-4">
            <div className="rounded-xl p-3 text-sm" style={{ backgroundColor: "#dcfce7", color: "#166534", border: "1px solid #86efac" }}>
              {notice}
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
        const { data, error: queryError } = await supabase
          .from("palavras")
          .select("id, termo_kambeba, traducao_portugues")
          .eq("ativo", true)
          .order("termo_kambeba", { ascending: true })
          .order("id", { ascending: true });

        if (!active) return;

        if (queryError) {
          setWords([]);
          setError("Não foi possível carregar o dicionário. Verifique sua conexão e tente novamente.");
        } else {
          setWords(data ?? []);
        }
      } catch {
        if (!active) return;
        setWords([]);
        setError("Não foi possível carregar o dicionário. Verifique sua conexão e tente novamente.");
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

      const { data, error: queryError } = await supabase
        .from("modulos")
        .select("id, nome, descricao, ordem")
        .eq("ativo", true)
        .order("ordem", { ascending: true });

      if (!active) return;

      if (queryError) {
        setModules([]);
        setError("Não foi possível carregar os módulos. Verifique sua conexão e tente novamente.");
      } else {
        setModules(data ?? []);
      }
      setIsLoading(false);
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
        const { data, error: queryError } = await supabase
          .from("palavras")
          .select("id, modulo_id, termo_kambeba, traducao_portugues, audio_url")
          .eq("modulo_id", module.id)
          .eq("ativo", true)
          .order("id", { ascending: true });

        if (!active) return;

        if (queryError) {
          setWords([]);
          setError("Não foi possível carregar as palavras deste módulo. Verifique sua conexão e tente novamente.");
        } else {
          setWords(data ?? []);
        }
      } catch {
        if (!active) return;
        setWords([]);
        setError("Não foi possível carregar as palavras deste módulo. Verifique sua conexão e tente novamente.");
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

            {audioUrl && (
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

const ActivitiesScreen = ({
  onSelectActivity,
}: {
  onSelectActivity: (activity: LearningActivity) => void;
}) => {
  const [activities, setActivities] = useState<LearningActivity[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUsingCache, setIsUsingCache] = useState(false);
  const [error, setError] = useState("");
  const [requestKey, setRequestKey] = useState(0);

  useEffect(() => {
    let active = true;

    const loadActivities = async () => {
      setIsLoading(true);
      setError("");
      setIsUsingCache(false);

      if (navigator.onLine) {
        try {
          const { data, error: queryError } = await supabase
            .from("atividades")
            .select("id, titulo, descricao, nivel")
            .eq("ativo", true)
            .order("id", { ascending: true });

          if (queryError) throw queryError;

          const validActivities = (data ?? []).filter(
            (activity): activity is LearningActivity => isActivityLevelCode(activity.nivel),
          );

          if (!active) return;
          setActivities(validActivities);
          try {
            await cacheActivities(validActivities);
          } catch {
            // A consulta online continua disponível mesmo se o navegador bloquear o cache.
          }
          setIsLoading(false);
          return;
        } catch {
          // Tenta utilizar a última cópia local disponível.
        }
      }

      try {
        const cachedActivities = await getCachedActivities();
        if (!active) return;
        setActivities(cachedActivities);
        setIsUsingCache(cachedActivities.length > 0);
        if (cachedActivities.length === 0) {
          setError("As atividades ainda não foram armazenadas neste dispositivo. Conecte-se à internet para carregá-las.");
        }
      } catch {
        if (!active) return;
        setActivities([]);
        setError("Não foi possível carregar as atividades. Verifique sua conexão e tente novamente.");
      } finally {
        if (active) setIsLoading(false);
      }
    };

    void loadActivities();
    return () => {
      active = false;
    };
  }, [requestKey]);

  return (
    <div className="page-container max-w-2xl">
      <h1 className="text-3xl font-bold mb-1" style={{ fontFamily: "Lora, serif", color: "#6B4423" }}>Atividades</h1>
      <p className="text-sm mb-8" style={{ color: "#6B4423" }}>Escolha seu nível e comece a praticar</p>

      {isUsingCache && (
        <p className="mb-4 rounded-xl p-3 text-sm" style={{ backgroundColor: "#fdf0e8", color: "#6B4423" }} role="status">
          Você está sem conexão. Exibindo atividades armazenadas neste dispositivo.
        </p>
      )}

      {isLoading && <p role="status" className="text-sm mb-4" style={{ color: "#6B4423" }}>Carregando atividades…</p>}

      {error && (
        <div className="rounded-xl p-4 mb-4" style={{ backgroundColor: "#fee2e2", color: "#991b1b" }} role="alert">
          <p className="text-sm">{error}</p>
          <button type="button" onClick={() => setRequestKey((key) => key + 1)} className="mt-3 text-sm font-semibold underline">
            Tentar novamente
          </button>
        </div>
      )}

      <div className="space-y-4">
        {activities.map((activity) => {
          const style = LEVEL_STYLES[activity.nivel];
          return (
            <button
              key={activity.id}
              type="button"
              onClick={() => onSelectActivity(activity)}
              className="w-full flex items-center justify-between p-6 rounded-2xl text-left transition-all duration-200"
              style={{ backgroundColor: style.bg, border: `2px solid ${style.color}22` }}
              onMouseEnter={(event) => {
                (event.currentTarget as HTMLElement).style.transform = "translateX(4px)";
                (event.currentTarget as HTMLElement).style.borderColor = style.color;
              }}
              onMouseLeave={(event) => {
                (event.currentTarget as HTMLElement).style.transform = "none";
                (event.currentTarget as HTMLElement).style.borderColor = `${style.color}22`;
              }}
            >
              <div>
                <p className="font-bold text-lg mb-1" style={{ fontFamily: "Lora, serif", color: style.color }}>
                  {LEVEL_LABELS[activity.nivel]} — {activity.titulo}
                </p>
                <p className="text-sm" style={{ color: "#6B4423" }}>
                  {activity.descricao || style.fallbackDescription}
                </p>
                <p className="text-xs mt-1" style={{ color: style.color }}>5 questões</p>
              </div>
              <div style={{ color: style.color }}>
                <IconChevronRight />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

const QuestionScreen = ({
  activity,
  userId,
  onFinish,
  onBack,
}: {
  activity: LearningActivity;
  userId: string;
  onFinish: (attemptId: string) => void;
  onBack: () => void;
}) => {
  const [questions, setQuestions] = useState<ActivityQuestion[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUsingCache, setIsUsingCache] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [qIndex, setQIndex] = useState(0);
  const [selected, setSelected] = useState<AnswerChoice | null>(null);
  const [answers, setAnswers] = useState<Record<number, AnswerChoice>>({});
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let active = true;

    const loadQuestions = async () => {
      setIsLoading(true);
      setLoadError("");
      setIsUsingCache(false);

      if (navigator.onLine) {
        try {
          const { data, error: queryError } = await supabase
            .from("questoes")
            .select("id, atividade_id, enunciado, alternativas, ordem")
            .eq("atividade_id", activity.id)
            .eq("ativo", true)
            .order("ordem", { ascending: true });

          if (queryError) throw queryError;

          const validQuestions: ActivityQuestion[] = (data ?? [])
            .filter((question) => isValidAlternatives(question.alternativas))
            .map((question) => ({
              id: question.id,
              atividade_id: question.atividade_id,
              enunciado: question.enunciado,
              alternativas: question.alternativas,
              ordem: question.ordem,
            }));

          if (validQuestions.length !== 5) {
            throw new Error("A atividade não possui exatamente cinco questões válidas.");
          }

          if (!active) return;
          setQuestions(validQuestions);
          try {
            await cacheQuestionsForActivity(activity.id, validQuestions);
          } catch {
            // Mantém as questões em memória se o navegador não permitir o cache local.
          }
          setIsLoading(false);
          return;
        } catch {
          // Tenta a cópia local caso a consulta online falhe.
        }
      }

      try {
        const cachedQuestions = await getCachedQuestions(activity.id);
        if (!active) return;
        if (cachedQuestions.length !== 5) {
          setQuestions([]);
          setLoadError("As questões desta atividade ainda não foram armazenadas neste dispositivo. Conecte-se à internet para carregá-las primeiro.");
        } else {
          setQuestions(cachedQuestions);
          setIsUsingCache(true);
        }
      } catch {
        if (!active) return;
        setQuestions([]);
        setLoadError("Não foi possível carregar as questões. Verifique sua conexão e tente novamente.");
      } finally {
        if (active) setIsLoading(false);
      }
    };

    void loadQuestions();
    return () => {
      active = false;
    };
  }, [activity.id]);

  const current = questions[qIndex];

  const handleNext = async () => {
    if (!current || selected === null || isSaving) return;

    const updatedAnswers = { ...answers, [current.id]: selected };
    setAnswers(updatedAnswers);

    if (qIndex + 1 < questions.length) {
      setQIndex((index) => index + 1);
      setSelected(null);
      return;
    }

    const attemptId = crypto.randomUUID();
    const attempt: PendingAttempt = {
      tentativa_uuid: attemptId,
      usuario_id: userId,
      atividade_id: activity.id,
      respostas: questions.map((question) => ({
        questao_id: question.id,
        resposta: updatedAnswers[question.id],
      })),
      criada_em: new Date().toISOString(),
    };

    if (attempt.respostas.some((answer) => !answer.resposta)) {
      setLoadError("Não foi possível registrar todas as respostas. Revise a atividade e tente novamente.");
      return;
    }

    setIsSaving(true);
    setLoadError("");
    try {
      await savePendingAttempt(attempt);
      onFinish(attemptId);
    } catch {
      setLoadError("Não foi possível salvar sua tentativa neste dispositivo. Verifique o espaço disponível no navegador e tente novamente.");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="page-container max-w-2xl">
        <p role="status" className="text-sm" style={{ color: "#6B4423" }}>Carregando questões…</p>
      </div>
    );
  }

  if (loadError && questions.length === 0) {
    return (
      <div className="page-container max-w-2xl">
        <button type="button" onClick={onBack} className="flex items-center gap-2 text-sm font-medium mb-6" style={{ color: "#6B4423" }}>
          <IconChevronLeft /> Atividades
        </button>
        <div className="rounded-xl p-4" style={{ backgroundColor: "#fee2e2", color: "#991b1b" }} role="alert">
          {loadError}
        </div>
      </div>
    );
  }

  if (!current) return null;

  const levelLabel = LEVEL_LABELS[activity.nivel];

  return (
    <div className="page-container max-w-2xl">
      <div className="grid grid-cols-[1fr_auto] items-center gap-3 mb-6 sm:grid-cols-[1fr_auto_1fr]">
        <button type="button" onClick={onBack} className="flex items-center gap-2 text-sm font-medium" style={{ color: "#6B4423" }}>
          <IconChevronLeft /> Atividades
        </button>
        <h1 className="text-sm font-medium" style={{ color: "#6B4423" }}>
          Trilha {levelLabel}
        </h1>
        <span className="col-span-2 text-right text-sm sm:col-span-1" style={{ color: "#6B4423" }}>
          {qIndex + 1} / {questions.length}
        </span>
      </div>

      {isUsingCache && (
        <p className="rounded-xl p-3 mb-5 text-sm" style={{ backgroundColor: "#fdf0e8", color: "#6B4423" }} role="status">
          Modo offline: as questões foram carregadas do armazenamento deste dispositivo. A correção será realizada quando a conexão retornar.
        </p>
      )}

      <div className="h-2 rounded-full mb-8 overflow-hidden" style={{ backgroundColor: "#D4A574" }} role="progressbar" aria-label="Questões respondidas" aria-valuemin={0} aria-valuemax={questions.length} aria-valuenow={qIndex}>
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${(qIndex / questions.length) * 100}%`, backgroundColor: "#A64D25" }} />
      </div>

      <div className="rounded-2xl p-5 sm:p-8 mb-6" style={{ backgroundColor: "#E8D5C4", border: "1.5px solid #D4A574" }} aria-live="polite">
        <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: "#6B4423" }}>Questão {qIndex + 1}</p>
        <h2 className="text-xl font-bold" style={{ fontFamily: "Lora, serif", color: "#6B4423" }}>
          {current.enunciado}
        </h2>
      </div>

      <fieldset className="space-y-3 mb-6">
        <legend className="sr-only">Escolha uma alternativa</legend>
        {ANSWER_CHOICES.map((choice) => {
          const isSelected = selected === choice;
          return (
            <label
              key={choice}
              className="answer-option flex cursor-pointer items-center gap-4 rounded-xl p-4 transition-all"
              style={{
                backgroundColor: isSelected ? "#F5E6D3" : "#E8D5C4",
                border: `2px solid ${isSelected ? "#A64D25" : "#D4A574"}`,
                color: "#3D2B1A",
              }}
            >
              <input
                type="radio"
                name={`answer-${current.id}`}
                value={choice}
                checked={isSelected}
                onChange={() => setSelected(choice)}
                disabled={isSaving}
                className="sr-only"
              />
              <span
                className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
                style={{ backgroundColor: isSelected ? "#A64D25" : "#D4A574", color: isSelected ? "white" : "#6B4423" }}
              >
                {choice}
              </span>
              <span className="font-medium">{current.alternativas[choice]}</span>
            </label>
          );
        })}
      </fieldset>

      {loadError && (
        <p className="rounded-xl p-3 mb-4 text-sm" style={{ backgroundColor: "#fee2e2", color: "#991b1b" }} role="alert">
          {loadError}
        </p>
      )}

      <button
        type="button"
        onClick={() => void handleNext()}
        disabled={selected === null || isSaving}
        className="w-full py-3 rounded-xl font-semibold text-sm text-white transition-all"
        style={{ backgroundColor: selected === null || isSaving ? "#c47040" : "#A64D25", cursor: selected === null || isSaving ? "not-allowed" : "pointer" }}
      >
        {isSaving ? "Salvando tentativa…" : qIndex + 1 === questions.length ? "Finalizar atividade" : "Próxima questão →"}
      </button>
    </div>
  );
};

// ─── Screen: Result ───────────────────────────────────────────────────────────

const ResultScreen = ({
  correct,
  total,
  level,
  pending,
  onRetry,
  onBack,
  onSyncNow,
}: {
  correct: number;
  total: number;
  level: Level;
  pending: boolean;
  onRetry: () => void;
  onBack: () => void;
  onSyncNow: () => void;
}) => {
  const pct = pending ? null : Math.round((correct / total) * 100);
  const msg = pending
    ? "Sua tentativa foi salva neste dispositivo. A correção e a pontuação estarão disponíveis quando a conexão retornar."
    : pct !== null && pct >= 80
      ? "Excelente! Parabéns pelo desempenho!"
      : pct !== null && pct >= 60
        ? "Bom trabalho! Continue praticando."
        : "Continue tentando, você está evoluindo!";
  const msgColor = pending ? "#6B4423" : pct !== null && pct >= 80 ? "#15803d" : pct !== null && pct >= 60 ? "#A64D25" : "#6B4423";

  return (
    <div className="page-container max-w-lg text-center">
      <div className="rounded-2xl p-6 sm:p-10" style={{ backgroundColor: "#E8D5C4", border: "1.5px solid #D4A574" }}>
        <div className="flex justify-center mb-5" style={{ color: "#A64D25" }} aria-hidden="true">
          <IconTrophy />
        </div>

        <h1 className="text-3xl font-bold mb-1" style={{ fontFamily: "Lora, serif", color: "#6B4423" }}>
          {pending ? "Atividade enviada para correção" : "Resultado"}
        </h1>
        <p className="text-sm mb-8" style={{ color: "#6B4423" }}>Trilha {level}</p>

        {pending ? (
          <div className="rounded-xl p-4 mb-6 text-sm" style={{ backgroundColor: "#fdf0e8", color: "#6B4423" }} role="status" aria-live="polite">
            {msg}
            {navigator.onLine && (
              <button type="button" onClick={onSyncNow} className="block w-full mt-4 font-semibold underline">
                Tentar sincronizar agora
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="text-6xl font-bold mb-2" style={{ fontFamily: "Lora, serif", color: "#6B4423" }} aria-label={`${correct} de ${total} acertos`}>
              {correct}<span className="text-3xl" style={{ color: "#6B4423" }}> / {total}</span>
            </div>
            <p className="text-lg font-semibold mb-6" style={{ color: "#A64D25" }}>{pct}% de acertos</p>

            <div className="h-3 rounded-full overflow-hidden mb-2" style={{ backgroundColor: "#D4A574" }} role="progressbar" aria-label="Percentual de acertos" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct ?? 0}>
              <div className="h-full rounded-full transition-all duration-1000" style={{ width: `${pct}%`, backgroundColor: pct !== null && pct >= 80 ? "#4A6741" : pct !== null && pct >= 60 ? "#A64D25" : "#8B6F47" }} />
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
          </>
        )}

        {!pending && <p className="text-sm font-medium mb-8" style={{ color: msgColor }}>{msg}</p>}

        <div className="space-y-3">
          <button
            type="button"
            onClick={onRetry}
            className="w-full py-3 rounded-xl font-semibold text-sm text-white transition-all"
            style={{ backgroundColor: "#A64D25" }}
          >
            Refazer atividade
          </button>
          <button
            type="button"
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
  const [resultPending, setResultPending] = useState(false);
  const currentAttemptUuid = useRef<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [loginNotice, setLoginNotice] = useState("");
  const [appNotice, setAppNotice] = useState("");
  const [appError, setAppError] = useState("");

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
    if (!session?.user.id) return;

    const syncWhenOnline = () => {
      void synchronizePendingAttempts(session.user.id);
    };

    void synchronizePendingAttempts(session.user.id);
    window.addEventListener("online", syncWhenOnline);
    return () => window.removeEventListener("online", syncWhenOnline);
  }, [session?.user.id]);

  useEffect(() => {
    const handleAttemptSynced = (event: Event) => {
      const detail = (event as CustomEvent<CorrectionResult>).detail;
      if (!detail || detail.tentativa_uuid !== currentAttemptUuid.current) return;

      setResult({ correct: detail.acertos, total: detail.total_questoes });
      setResultPending(false);
      setAppNotice("Atividade corrigida e resultado sincronizado com sucesso.");
    };

    window.addEventListener("tanu-tyura-attempt-synced", handleAttemptSynced);
    return () => window.removeEventListener("tanu-tyura-attempt-synced", handleAttemptSynced);
  }, []);

  const navigateTo = (s: Screen) => {
    setAppError("");
    setAppNotice("");
    setScreen(s);
  };

  const handleLogin = async (email: string, password: string): Promise<AuthActionResult> => {
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
      setAppNotice("Conta criada e login realizado com sucesso.");
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
    setActivityKey((key) => key + 1);
    setResultPending(false);
    currentAttemptUuid.current = null;
    setScreen("question");
  };

  const handleFinish = (attemptId: string) => {
    currentAttemptUuid.current = attemptId;
    setResult({ correct: 0, total: 0 });
    setResultPending(true);
    setScreen("result");

    if (session?.user.id && navigator.onLine) {
      void synchronizePendingAttempts(session.user.id);
    }
  };

  const handleRetry = () => {
    setActivityKey((key) => key + 1);
    setResultPending(false);
    currentAttemptUuid.current = null;
    setScreen("question");
  };

  const handleSyncNow = () => {
    if (session?.user.id) void synchronizePendingAttempts(session.user.id);
  };

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
    <AppLayout activeScreen={screen} onNavigate={navigateTo} onLogout={handleLogout} notice={appNotice} error={appError}>
      {screen === "home" && <HomeScreen onNavigate={navigateTo} />}
      {screen === "dictionary" && <DictionaryScreen />}
      {screen === "modules" && <ModulesScreen onSelectModule={handleSelectModule} />}
      {screen === "module-content" && selectedModule && (
        <ModuleContentScreen module={selectedModule} onBack={() => setScreen("modules")} />
      )}
      {screen === "activities" && <ActivitiesScreen onSelectActivity={handleSelectActivity} />}
      {screen === "question" && selectedActivity && session && (
        <QuestionScreen
          key={activityKey}
          activity={selectedActivity}
          userId={session.user.id}
          onFinish={handleFinish}
          onBack={() => setScreen("activities")}
        />
      )}
      {screen === "result" && selectedActivity && (
        <ResultScreen
          correct={result.correct}
          total={result.total}
          level={LEVEL_LABELS[selectedActivity.nivel]}
          pending={resultPending}
          onRetry={handleRetry}
          onBack={() => setScreen("activities")}
          onSyncNow={handleSyncNow}
        />
      )}
    </AppLayout>
  );
}
