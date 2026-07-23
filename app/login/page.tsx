"use client";

import { FormEvent, useState } from "react";
import { ArrowRight, Check, CircleAlert, Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { publicFeatureStatus } from "@/lib/config";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<
    "idle" | "loading" | "sent" | "error"
  >("idle");
  const [message, setMessage] = useState("");

  async function signIn(event: FormEvent) {
    event.preventDefault();
    if (!publicFeatureStatus.supabase) return;
    setState("loading");

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      setMessage(error.message);
      setState("error");
      return;
    }

    setState("sent");
  }

  return (
    <main className="login-page">
      <section className="login-panel">
        <div className="brand-lockup">
          <span className="brand-mark small">N</span>
          <span>northstar</span>
        </div>

        <div className="login-copy">
          <span className="eyebrow">Private access</span>
          <h1>
            Jouw leven.
            <br />
            <em>Jouw context.</em>
          </h1>
          <p>Log veilig in met een magic link. Geen wachtwoord nodig.</p>
        </div>

        {!publicFeatureStatus.supabase ? (
          <div className="setup-required">
            <CircleAlert size={22} />
            <div>
              <strong>Supabase moet nog gekoppeld worden</strong>
              <p>
                Vul eerst de drie Supabase-waarden in <code>.env.local</code>{" "}
                in en herstart de ontwikkelserver.
              </p>
            </div>
          </div>
        ) : state === "sent" ? (
          <div className="magic-sent">
            <Check size={22} />
            <div>
              <strong>Controleer je inbox</strong>
              <p>We stuurden een beveiligde loginlink naar {email}.</p>
            </div>
          </div>
        ) : (
          <form className="login-form" onSubmit={signIn}>
            <label htmlFor="email">E-mailadres</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="ward@voorbeeld.be"
              required
            />
            <button type="submit" disabled={state === "loading"}>
              {state === "loading" ? "Link versturen…" : "Stuur magic link"}
              <ArrowRight size={18} />
            </button>
            {state === "error" && <p className="form-error">{message}</p>}
          </form>
        )}

        <div className="login-trust">
          <Sparkles size={15} />
          <span>Entries zijn alleen zichtbaar voor jouw account.</span>
        </div>
      </section>
      <aside className="login-atmosphere">
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
