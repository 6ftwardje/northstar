"use client";

import { FormEvent, useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CircleAlert,
  KeyRound,
  Mail,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { publicFeatureStatus } from "@/lib/config";

type AuthMode = "code" | "password";
type AuthStep = "credentials" | "code";
type AuthStatus = "idle" | "loading" | "success" | "error";

const RESEND_SECONDS = 60;

function getSafeNextPath() {
  const requestedPath = new URLSearchParams(window.location.search).get("next");

  if (
    requestedPath &&
    requestedPath.startsWith("/") &&
    !requestedPath.startsWith("//")
  ) {
    return requestedPath;
  }

  return "/";
}

function getFriendlyAuthError(message: string) {
  const normalized = message.toLowerCase();

  if (normalized.includes("rate") || normalized.includes("too many")) {
    return "Er waren te veel pogingen. Wacht even en probeer opnieuw.";
  }

  if (
    normalized.includes("expired") ||
    normalized.includes("invalid") ||
    normalized.includes("token")
  ) {
    return "Deze code is ongeldig of verlopen. Vraag een nieuwe code aan.";
  }

  if (
    normalized.includes("credentials") ||
    normalized.includes("password") ||
    normalized.includes("user")
  ) {
    return "De inloggegevens kloppen niet. Controleer ze en probeer opnieuw.";
  }

  return "Inloggen lukte niet. Controleer je gegevens en probeer opnieuw.";
}

export default function LoginPage() {
  const [mode, setMode] = useState<AuthMode>("code");
  const [step, setStep] = useState<AuthStep>("credentials");
  const [status, setStatus] = useState<AuthStatus>("idle");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [resendIn, setResendIn] = useState(0);

  const configured = publicFeatureStatus.supabase;
  const isBusy = status === "loading" || status === "success";

  useEffect(() => {
    if (resendIn <= 0) {
      return;
    }

    const timer = window.setInterval(() => {
      setResendIn((current) => Math.max(0, current - 1));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [resendIn]);

  function resetFeedback() {
    setStatus("idle");
    setError("");
  }

  function selectMode(nextMode: AuthMode) {
    setMode(nextMode);
    setStep("credentials");
    setCode("");
    setPassword("");
    resetFeedback();
  }

  async function requestCode(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();

    if (!configured || isBusy) {
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail) {
      setStatus("error");
      setError("Vul eerst je e-mailadres in.");
      return;
    }

    setStatus("loading");
    setError("");

    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithOtp({
      email: normalizedEmail,
      options: {
        shouldCreateUser: false,
      },
    });

    if (authError) {
      setStatus("error");
      setError(getFriendlyAuthError(authError.message));
      return;
    }

    setEmail(normalizedEmail);
    setCode("");
    setStep("code");
    setStatus("idle");
    setResendIn(RESEND_SECONDS);
  }

  async function verifyCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!configured || isBusy) {
      return;
    }

    const normalizedCode = code.replace(/\D/g, "");

    if (normalizedCode.length !== 6) {
      setStatus("error");
      setError("Vul de volledige code van zes cijfers in.");
      return;
    }

    setStatus("loading");
    setError("");

    const supabase = createClient();
    const { error: authError } = await supabase.auth.verifyOtp({
      email,
      token: normalizedCode,
      type: "email",
    });

    if (authError) {
      setStatus("error");
      setError(getFriendlyAuthError(authError.message));
      return;
    }

    setStatus("success");
    window.setTimeout(() => {
      window.location.replace(getSafeNextPath());
    }, 250);
  }

  async function signInWithPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!configured || isBusy) {
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail || !password) {
      setStatus("error");
      setError("Vul je e-mailadres en wachtwoord in.");
      return;
    }

    setStatus("loading");
    setError("");

    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    });

    if (authError) {
      setStatus("error");
      setError(getFriendlyAuthError(authError.message));
      return;
    }

    setStatus("success");
    window.setTimeout(() => {
      window.location.replace(getSafeNextPath());
    }, 250);
  }

  return (
    <main className="login-page">
      <section className="login-panel">
        <div className="brand-lockup">
          <span className="brand-mark small">N</span>
          <span>northstar</span>
        </div>

        <div className="login-copy">
          <span className="login-eyebrow">
            <ShieldCheck size={15} aria-hidden="true" />
            Privé op dit toestel
          </span>
          <h1>
            Welkom
            <br />
            <em>terug.</em>
          </h1>
          <p>
            Log rechtstreeks in deze app in. Je hoeft geen link in een andere
            browser te openen.
          </p>
        </div>

        {!configured ? (
          <div className="setup-required">
            <CircleAlert size={22} aria-hidden="true" />
            <div>
              <strong>Supabase moet nog gekoppeld worden</strong>
              <p>
                Vul eerst de drie Supabase-waarden in <code>.env.local</code>{" "}
                in en herstart de ontwikkelserver.
              </p>
            </div>
          </div>
        ) : (
          <div className="auth-shell">
            <div id="old-link" className="legacy-link-notice" role="status">
              <CircleAlert size={18} aria-hidden="true" />
              <span>
                Deze link werd in een andere browser geopend. Vraag hieronder
                een e-mailcode aan en voer die in Northstar zelf in.
              </span>
            </div>

            {step === "credentials" ? (
              <>
                <div
                  className="auth-method-switch"
                  role="tablist"
                  aria-label="Kies je inlogmethode"
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={mode === "code"}
                    className={mode === "code" ? "is-active" : ""}
                    onClick={() => selectMode("code")}
                  >
                    <Mail size={16} aria-hidden="true" />
                    E-mailcode
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={mode === "password"}
                    className={mode === "password" ? "is-active" : ""}
                    onClick={() => selectMode("password")}
                  >
                    <KeyRound size={16} aria-hidden="true" />
                    Wachtwoord
                  </button>
                </div>

                <form
                  className="login-form"
                  onSubmit={
                    mode === "code" ? requestCode : signInWithPassword
                  }
                >
                  <label htmlFor="email">E-mailadres</label>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    value={email}
                    onChange={(event) => {
                      setEmail(event.target.value);
                      resetFeedback();
                    }}
                    placeholder="jij@voorbeeld.be"
                    required
                  />

                  {mode === "password" ? (
                    <>
                      <label htmlFor="password">Wachtwoord</label>
                      <input
                        id="password"
                        name="password"
                        type="password"
                        autoComplete="current-password"
                        value={password}
                        onChange={(event) => {
                          setPassword(event.target.value);
                          resetFeedback();
                        }}
                        placeholder="Je wachtwoord"
                        required
                      />
                    </>
                  ) : (
                    <p className="auth-method-note">
                      We sturen een code van zes cijfers. Kopieer die vanuit je
                      inbox en keer terug naar Northstar.
                    </p>
                  )}

                  {error ? (
                    <div className="auth-message is-error" role="alert">
                      <CircleAlert size={18} aria-hidden="true" />
                      <span>{error}</span>
                    </div>
                  ) : null}

                  <button
                    className="login-primary-button"
                    type="submit"
                    disabled={isBusy}
                  >
                    {status === "loading" ? (
                      "Even controleren…"
                    ) : status === "success" ? (
                      <>
                        <Check size={18} aria-hidden="true" />
                        Ingelogd
                      </>
                    ) : (
                      <>
                        {mode === "code" ? "Stuur inlogcode" : "Log veilig in"}
                        <ArrowRight size={18} aria-hidden="true" />
                      </>
                    )}
                  </button>
                </form>
              </>
            ) : (
              <div className="code-step">
                <button
                  type="button"
                  className="login-back-button"
                  onClick={() => {
                    setStep("credentials");
                    setCode("");
                    resetFeedback();
                  }}
                >
                  <ArrowLeft size={16} aria-hidden="true" />
                  Ander e-mailadres
                </button>

                <div className="code-step-heading">
                  <span className="code-step-icon">
                    <Mail size={19} aria-hidden="true" />
                  </span>
                  <div>
                    <h2>Controleer je inbox</h2>
                    <p>
                      Voer de code in die we naar <strong>{email}</strong>{" "}
                      stuurden.
                    </p>
                  </div>
                </div>

                <form className="login-form" onSubmit={verifyCode}>
                  <label htmlFor="otp">Zescijferige code</label>
                  <input
                    id="otp"
                    name="otp"
                    className="otp-input"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]*"
                    maxLength={6}
                    value={code}
                    onChange={(event) => {
                      setCode(
                        event.target.value.replace(/\D/g, "").slice(0, 6),
                      );
                      resetFeedback();
                    }}
                    placeholder="000000"
                    autoFocus
                    required
                  />

                  {error ? (
                    <div className="auth-message is-error" role="alert">
                      <CircleAlert size={18} aria-hidden="true" />
                      <span>{error}</span>
                    </div>
                  ) : null}

                  <button
                    className="login-primary-button"
                    type="submit"
                    disabled={isBusy || code.length !== 6}
                  >
                    {status === "loading" ? (
                      "Code controleren…"
                    ) : status === "success" ? (
                      <>
                        <Check size={18} aria-hidden="true" />
                        Ingelogd
                      </>
                    ) : (
                      <>
                        Log in op dit toestel
                        <ArrowRight size={18} aria-hidden="true" />
                      </>
                    )}
                  </button>
                </form>

                <div className="resend-row" aria-live="polite">
                  <span>Geen code ontvangen?</span>
                  <button
                    type="button"
                    disabled={resendIn > 0 || isBusy}
                    onClick={() => void requestCode()}
                  >
                    {resendIn > 0
                      ? `Opnieuw sturen over ${resendIn}s`
                      : "Stuur opnieuw"}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="login-trust">
          <Sparkles size={15} aria-hidden="true" />
          <span>
            Je sessie wordt beveiligd bewaard in deze Northstar-installatie.
          </span>
        </div>
      </section>
      <aside className="login-atmosphere" aria-hidden="true">
        <blockquote>
          “Streng op gedrag.
          <br />
          Zacht voor de mens.”
        </blockquote>
        <p>Je persoonlijke life guide, iedere dag beter geïnformeerd.</p>
      </aside>
    </main>
  );
}
