"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  BarChart3,
  Brain,
  BriefcaseBusiness,
  CalendarDays,
  Check,
  ChevronRight,
  Circle,
  Dumbbell,
  Flame,
  Leaf,
  Menu,
  MessageCircle,
  Mic,
  Moon,
  MoreHorizontal,
  Pause,
  Plus,
  Send,
  Settings2,
  Sparkles,
  SunMedium,
  Target,
  X,
} from "lucide-react";

type Tab = "today" | "coach" | "evening" | "progress" | "memory";
type EntryKind = "note" | "coach" | "health" | "impact";

type JournalEntry = {
  id: string;
  time: string;
  text: string;
  kind: EntryKind;
};

type ChatMessage = {
  id: string;
  role: "coach" | "user";
  text: string;
  time: string;
};

type IntegrationStatus = {
  supabase: boolean;
  openai: boolean;
  authenticated: boolean;
  ready: boolean;
  model: string | null;
};

type EveningReviewPayload = {
  reviewDate: string;
  impactSummary: string;
  movement: boolean | null;
  cannabisUsed: boolean | null;
  energy: number;
};

const NAV_ITEMS: Array<{
  id: Tab;
  label: string;
  icon: typeof SunMedium;
}> = [
  { id: "today", label: "Vandaag", icon: SunMedium },
  { id: "coach", label: "Coach", icon: MessageCircle },
  { id: "evening", label: "Avond", icon: Moon },
  { id: "progress", label: "Progress", icon: BarChart3 },
  { id: "memory", label: "Memory", icon: Brain },
];

const INITIAL_ENTRIES: JournalEntry[] = [
  {
    id: "1",
    time: "08:42",
    kind: "impact",
    text: "Mijn impact move voor vandaag: het voorstel voor de nieuwe klant afronden en versturen.",
  },
  {
    id: "2",
    time: "11:16",
    kind: "note",
    text: "Goede call gehad. Ik merk wel dat ik weer in kleine operationele taken verdwijn.",
  },
  {
    id: "3",
    time: "11:17",
    kind: "coach",
    text: "Je herkent de afleiding op tijd. Rond nu eerst de kern van het voorstel af. Administratie kan na 15:00.",
  },
];

const INITIAL_CHAT: ChatMessage[] = [
  {
    id: "c1",
    role: "coach",
    time: "11:17",
    text: "Je zit dicht bij het belangrijkste werk, maar verschuift naar taken die makkelijker voelen. Open het voorstel en werk alleen de pricing en next step af. Stuur me een update wanneer het verstuurd is.",
  },
  {
    id: "c2",
    role: "user",
    time: "11:21",
    text: "Deal. Ik zet Slack een uur uit.",
  },
  {
    id: "c3",
    role: "coach",
    time: "11:21",
    text: "Goed. Geen nieuw systeem bouwen, geen research. Eén uur, één voorstel.",
  },
];

const MEMORY_ITEMS = [
  {
    category: "Business",
    title: "Impact boven activiteit",
    detail:
      "Ward wil sturen op omzet, klanten, product en strategische bottlenecks — niet op taken die alleen productief voelen.",
    confidence: "Door jou bevestigd",
    icon: BriefcaseBusiness,
  },
  {
    category: "Coaching",
    title: "Directe feedback werkt",
    detail:
      "De coach mag excuses en inconsistenties duidelijk benoemen, zolang de toon opbouwend en correct blijft.",
    confidence: "Door jou bevestigd",
    icon: Target,
  },
  {
    category: "Health",
    title: "Cannabis bewust verminderen",
    detail:
      "Het doel is minder gebruiken door triggers te herkennen en werkbare alternatieven te testen, niet door alles te verbieden.",
    confidence: "Door jou bevestigd",
    icon: Leaf,
  },
  {
    category: "Movement",
    title: "Gym is beschikbaar",
    detail:
      "Ward heeft een gymabonnement en sportkleding. De voornaamste bottleneck is uitvoering, niet toegang.",
    confidence: "Hoge zekerheid",
    icon: Dumbbell,
  },
];

function nowTime() {
  return new Intl.DateTimeFormat("nl-BE", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());
}

function todayLabel() {
  const raw = new Intl.DateTimeFormat("nl-BE", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

export default function Home() {
  const [tab, setTab] = useState<Tab>("today");
  const [entries, setEntries] = useState<JournalEntry[]>(INITIAL_ENTRIES);
  const [chat, setChat] = useState<ChatMessage[]>(INITIAL_CHAT);
  const [draft, setDraft] = useState("");
  const [chatDraft, setChatDraft] = useState("");
  const [composerOpen, setComposerOpen] = useState(false);
  const [listening, setListening] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [impactDone, setImpactDone] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [integrationStatus, setIntegrationStatus] =
    useState<IntegrationStatus>({
      supabase: false,
      openai: false,
      authenticated: false,
      ready: false,
      model: null,
    });
  const [hydrated, setHydrated] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const stored = localStorage.getItem("northstar-state");
      if (stored) {
        try {
          const state = JSON.parse(stored);
          setEntries(state.entries ?? INITIAL_ENTRIES);
          setChat(state.chat ?? INITIAL_CHAT);
          setImpactDone(Boolean(state.impactDone));
        } catch {
          // Keep demo defaults when local data is malformed.
        }
      }
      setHydrated(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!integrationStatus.ready) return;

    fetch("/api/timeline")
      .then((response) => (response.ok ? response.json() : null))
      .then(
        (
          result: {
            entries?: Array<{
              id: string;
              kind: string;
              content: string;
              occurred_at: string;
            }>;
          } | null,
        ) => {
          if (!result?.entries?.length) return;
          setEntries(
            result.entries.map((entry) => ({
              id: entry.id,
              time: new Intl.DateTimeFormat("nl-BE", {
                hour: "2-digit",
                minute: "2-digit",
              }).format(new Date(entry.occurred_at)),
              text: entry.content,
              kind: entry.kind === "coach_message" ? "coach" : "note",
            })),
          );
        },
      )
      .catch(() => {
        // Keep local entries if cloud hydration fails.
      });
  }, [integrationStatus.ready]);

  useEffect(() => {
    fetch("/api/status")
      .then((response) => response.json())
      .then((status: IntegrationStatus) => setIntegrationStatus(status))
      .catch(() => {
        // Demo mode remains available when the status endpoint is unreachable.
      });
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(
      "northstar-state",
      JSON.stringify({ entries, chat, impactDone }),
    );
  }, [entries, chat, impactDone, hydrated]);

  useEffect(() => {
    if (composerOpen) textareaRef.current?.focus();
  }, [composerOpen]);

  const date = todayLabel();

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 2400);
  }

  async function requestCoach(message: string, channel: "journal" | "chat") {
    if (!integrationStatus.ready) return null;

    const response = await fetch("/api/coach", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message,
        channel,
        occurredAt: new Date().toISOString(),
      }),
    });

    if (!response.ok) {
      if (response.status === 401) {
        showToast("Log opnieuw in om cloudopslag te gebruiken");
      } else {
        showToast("Entry lokaal bewaard; coach tijdelijk niet bereikbaar");
      }
      return null;
    }

    return response.json() as Promise<{
      coach: { reply: string; intervention: string };
    }>;
  }

  async function addEntry(event: FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setEntries((current) => [
      ...current,
      { id: crypto.randomUUID(), time: nowTime(), text, kind: "note" },
    ]);
    setDraft("");
    setComposerOpen(false);
    showToast(
      integrationStatus.ready ? "Entry wordt veilig verwerkt…" : "Entry lokaal bewaard",
    );

    const result = await requestCoach(text, "journal");
    if (result?.coach.reply) {
      setEntries((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          time: nowTime(),
          text: result.coach.reply,
          kind: "coach",
        },
      ]);
      showToast("Entry en coachfeedback bewaard");
    }
  }

  async function toggleVoice() {
    if (listening && mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      setListening(false);
      return;
    }

    if (!integrationStatus.ready) {
      setListening(true);
      window.setTimeout(() => {
        setDraft(
          "Ik heb net een uur gefocust gewerkt. De pricing staat goed, maar ik stel het versturen nog uit.",
        );
        setListening(false);
      }, 1800);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      mediaStreamRef.current = stream;
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.addEventListener("dataavailable", (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      });

      recorder.addEventListener("stop", async () => {
        setTranscribing(true);
        mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
        const audio = new Blob(audioChunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });
        const formData = new FormData();
        formData.append("audio", audio, "northstar-entry.webm");

        try {
          const response = await fetch("/api/transcribe", {
            method: "POST",
            body: formData,
          });
          if (!response.ok) throw new Error("TRANSCRIPTION_FAILED");
          const result = (await response.json()) as { text: string };
          setDraft(result.text);
          showToast("Spraak omgezet naar tekst");
        } catch {
          showToast("Transcriptie mislukt; probeer opnieuw");
        } finally {
          setTranscribing(false);
        }
      });

      recorder.start();
      setListening(true);
    } catch {
      showToast("Geef microfoontoegang om in te spreken");
    }
  }

  async function completeReview(review: EveningReviewPayload) {
    if (integrationStatus.ready) {
      const response = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(review),
      });
      showToast(
        response.ok
          ? "Dag veilig afgesloten"
          : "Review lokaal afgerond; cloudopslag mislukte",
      );
    } else {
      showToast("Dag lokaal afgesloten");
    }
    setTab("today");
  }

  async function sendChat(event: FormEvent) {
    event.preventDefault();
    const text = chatDraft.trim();
    if (!text) return;
    const time = nowTime();
    setChat((current) => [
      ...current,
      { id: crypto.randomUUID(), role: "user", text, time },
    ]);
    setChatDraft("");

    const result = await requestCoach(text, "chat");
    if (result?.coach.reply) {
      setChat((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "coach",
          time: nowTime(),
          text: result.coach.reply,
        },
      ]);
      return;
    }

    window.setTimeout(() => {
      setChat((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "coach",
          time: nowTime(),
          text: "Ik hoor je. Wat is nu de eerlijkste volgende actie die binnen twintig minuten echte vooruitgang oplevert?",
        },
      ]);
    }, 450);
  }

  return (
    <main className="app-shell">
      <aside className="desktop-rail">
        <div className="brand-mark">N</div>
        <nav aria-label="Hoofdnavigatie">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              className={tab === item.id ? "rail-button active" : "rail-button"}
              onClick={() => setTab(item.id)}
              aria-label={item.label}
            >
              <item.icon size={21} strokeWidth={1.8} />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
        <button className="rail-button settings" aria-label="Instellingen">
          <Settings2 size={21} strokeWidth={1.8} />
          <span>Instellingen</span>
        </button>
      </aside>

      <section className="phone-stage">
        <header className="topbar">
          <button
            className="icon-button"
            onClick={() => setMenuOpen(true)}
            aria-label="Menu openen"
          >
            <Menu size={22} />
          </button>
          <div className="wordmark">northstar</div>
          <button
            className="avatar"
            aria-label="Profiel"
            onClick={() => setMenuOpen(true)}
          >
            WJ
          </button>
        </header>

        <div className="view-container" key={tab}>
          {tab === "today" && (
            <TodayView
              date={date}
              entries={entries}
              impactDone={impactDone}
              onImpact={() => {
                setImpactDone((current) => !current);
                showToast(impactDone ? "Impact move heropend" : "Sterk. Afgerond.");
              }}
              onCompose={() => setComposerOpen(true)}
              onCoach={() => setTab("coach")}
              onEvening={() => setTab("evening")}
            />
          )}
          {tab === "coach" && (
            <CoachView
              messages={chat}
              draft={chatDraft}
              setDraft={setChatDraft}
              onSubmit={sendChat}
            />
          )}
          {tab === "evening" && (
            <EveningView
              onComplete={(review) => void completeReview(review)}
            />
          )}
          {tab === "progress" && <ProgressView />}
          {tab === "memory" && <MemoryView onToast={showToast} />}
        </div>

        <nav className="bottom-nav" aria-label="Mobiele navigatie">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              className={tab === item.id ? "nav-button active" : "nav-button"}
              onClick={() => setTab(item.id)}
            >
              <item.icon size={20} strokeWidth={tab === item.id ? 2.3 : 1.7} />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
      </section>

      {composerOpen && (
        <div className="modal-backdrop" onMouseDown={() => setComposerOpen(false)}>
          <form
            className="composer-sheet"
            onSubmit={addEntry}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="sheet-handle" />
            <div className="composer-heading">
              <div>
                <span className="eyebrow">Nieuwe entry</span>
                <h2>Wat speelt er?</h2>
              </div>
              <button
                type="button"
                className="icon-button"
                onClick={() => setComposerOpen(false)}
                aria-label="Sluiten"
              >
                <X size={21} />
              </button>
            </div>
            <textarea
              ref={textareaRef}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Schrijf vrijuit. Werk, health, gedachten…"
              rows={6}
            />
            {(listening || transcribing) && (
              <div className="listening-state">
                <span className="sound-wave">
                  <i />
                  <i />
                  <i />
                  <i />
                </span>
                {transcribing ? "Transcriberen…" : "Luisteren…"}
              </div>
            )}
            <div className="composer-actions">
              <button
                type="button"
                className={listening ? "voice-button active" : "voice-button"}
                onClick={() => void toggleVoice()}
                disabled={transcribing}
              >
                {listening ? <Pause size={18} /> : <Mic size={18} />}
                {transcribing
                  ? "Even geduld"
                  : listening
                    ? "Stop"
                    : "Inspreken"}
              </button>
              <button className="send-button" type="submit" disabled={!draft.trim()}>
                Bewaar entry
                <ArrowUp size={18} />
              </button>
            </div>
          </form>
        </div>
      )}

      {menuOpen && (
        <div className="menu-overlay">
          <div className="menu-panel">
            <div className="menu-top">
              <div className="brand-lockup">
                <span className="brand-mark small">N</span>
                <span>northstar</span>
              </div>
              <button className="icon-button" onClick={() => setMenuOpen(false)}>
                <X size={21} />
              </button>
            </div>
            <p className="menu-quote">
              “Streng op gedrag.
              <br />
              Zacht voor de mens.”
            </p>
            <div className="menu-status">
              <span>Coachstatus</span>
              <strong>
                <i /> {integrationStatus.ready ? "Live" : "Demo"}
              </strong>
            </div>
            <div
              className={
                integrationStatus.supabase
                  ? "integration-row ready"
                  : "integration-row"
              }
            >
              <span>Supabase</span>
              <span>
                <i /> {integrationStatus.supabase ? "Gekoppeld" : "Setup nodig"}
              </span>
            </div>
            <div
              className={
                integrationStatus.openai
                  ? "integration-row ready"
                  : "integration-row"
              }
            >
              <span>OpenAI</span>
              <span>
                <i /> {integrationStatus.openai ? "Gekoppeld" : "Setup nodig"}
              </span>
            </div>
            <a className="menu-row" href="/login">
              <CalendarDays size={20} />{" "}
              {integrationStatus.authenticated ? "Account actief" : "Login & setup"}
              <ChevronRight size={18} />
            </a>
            <button className="menu-row">
              <Settings2 size={20} /> Coachinstellingen
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      )}

      {toast && (
        <div className="toast">
          <Check size={16} />
          {toast}
        </div>
      )}
    </main>
  );
}

function TodayView({
  date,
  entries,
  impactDone,
  onImpact,
  onCompose,
  onCoach,
  onEvening,
}: {
  date: string;
  entries: JournalEntry[];
  impactDone: boolean;
  onImpact: () => void;
  onCompose: () => void;
  onCoach: () => void;
  onEvening: () => void;
}) {
  return (
    <div className="page today-page">
      <div className="date-row">
        <span>{date}</span>
        <span className="day-state">
          <i /> Dag actief
        </span>
      </div>

      <section className="welcome">
        <p>Goedemiddag, Ward.</p>
        <h1>
          Wat verdient vandaag
          <br />
          je <em>volle aandacht?</em>
        </h1>
      </section>

      <section className={impactDone ? "impact-block done" : "impact-block"}>
        <div className="impact-topline">
          <span>
            <Target size={15} /> Impact move
          </span>
          <button aria-label="Meer opties">
            <MoreHorizontal size={20} />
          </button>
        </div>
        <button className="impact-action" onClick={onImpact}>
          <span className="impact-check">
            {impactDone ? <Check size={17} /> : <Circle size={17} />}
          </span>
          <span>
            Voorstel voor de nieuwe klant afronden en versturen
            <small>Omzet · Vandaag voor 16:00</small>
          </span>
        </button>
      </section>

      <section className="signals">
        <div>
          <span className="signal-icon sleep">
            <Moon size={18} />
          </span>
          <p>
            Slaap <strong>6u 42</strong>
          </p>
          <small>Onder je doel</small>
        </div>
        <div>
          <span className="signal-icon movement">
            <Dumbbell size={18} />
          </span>
          <p>
            Beweging <strong>—</strong>
          </p>
          <small>Gym om 18:30</small>
        </div>
        <div>
          <span className="signal-icon balance">
            <Leaf size={18} />
          </span>
          <p>
            Balans <strong>3d</strong>
          </p>
          <small>Op koers</small>
        </div>
      </section>

      <section className="coach-nudge">
        <div className="coach-orb">
          <Sparkles size={18} />
        </div>
        <div>
          <span>Northstar ziet iets</span>
          <p>
            Je verschuift naar kleine taken terwijl het voorstel nog openstaat.
            Dat is geen planning, dat is uitstel.
          </p>
          <button onClick={onCoach}>
            Bespreek dit <ChevronRight size={16} />
          </button>
        </div>
      </section>

      <section className="timeline">
        <div className="section-heading">
          <h2>Vandaag</h2>
          <button onClick={onCompose}>
            <Plus size={17} /> Entry
          </button>
        </div>
        <div className="timeline-list">
          {entries.map((entry, index) => (
            <article className={`timeline-entry ${entry.kind}`} key={entry.id}>
              <div className="timeline-time">{entry.time}</div>
              <div className="timeline-node">
                <span />
                {index < entries.length - 1 && <i />}
              </div>
              <p>{entry.text}</p>
            </article>
          ))}
        </div>
      </section>

      <button className="evening-banner" onClick={onEvening}>
        <span className="moon-disc">
          <Moon size={21} />
        </span>
        <span>
          <small>Om 21:00</small>
          Avondcheck-in
        </span>
        <ChevronRight size={19} />
      </button>

      <button className="floating-compose" onClick={onCompose}>
        <Plus size={22} />
        Nieuwe entry
      </button>
    </div>
  );
}

function CoachView({
  messages,
  draft,
  setDraft,
  onSubmit,
}: {
  messages: ChatMessage[];
  draft: string;
  setDraft: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
}) {
  return (
    <div className="page coach-page">
      <div className="coach-header">
        <div className="coach-orb large">
          <Sparkles size={21} />
        </div>
        <div>
          <span className="eyebrow">Personal life guide</span>
          <h1>Northstar</h1>
        </div>
        <span className="online-dot">actief</span>
      </div>

      <div className="coach-focus">
        <span>Huidige focus</span>
        <strong>Voorstel versturen vóór 16:00</strong>
      </div>

      <div className="chat-stream">
        <div className="chat-date">Vandaag</div>
        {messages.map((message) => (
          <div className={`message ${message.role}`} key={message.id}>
            {message.role === "coach" && (
              <div className="message-avatar">
                <Sparkles size={13} />
              </div>
            )}
            <div>
              <p>{message.text}</p>
              <span>{message.time}</span>
            </div>
          </div>
        ))}
      </div>

      <form className="chat-composer" onSubmit={onSubmit}>
        <button type="button" aria-label="Inspreken">
          <Mic size={19} />
        </button>
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Praat met je coach…"
        />
        <button type="submit" className="chat-send" aria-label="Verstuur">
          <Send size={17} />
        </button>
      </form>
    </div>
  );
}

function EveningView({
  onComplete,
}: {
  onComplete: (review: EveningReviewPayload) => void;
}) {
  const [step, setStep] = useState(0);
  const [impact, setImpact] = useState("");
  const [movement, setMovement] = useState<"yes" | "no" | null>(null);
  const [cannabis, setCannabis] = useState<"yes" | "no" | null>(null);
  const [energy, setEnergy] = useState(7);
  const questions = [
    {
      kicker: "01 · Impact",
      title: "Wat heeft vandaag écht verschil gemaakt?",
      body: (
        <textarea
          value={impact}
          onChange={(event) => setImpact(event.target.value)}
          placeholder="Geen activiteitenlijst. Wat creëerde werkelijk vooruitgang?"
          rows={5}
        />
      ),
    },
    {
      kicker: "02 · Health",
      title: "Hoe heb je voor je lichaam gezorgd?",
      body: (
        <div className="choice-stack">
          <p>Heb je vandaag gesport of bewust bewogen?</p>
          <div className="choice-row">
            <button
              className={movement === "yes" ? "selected" : ""}
              onClick={() => setMovement("yes")}
            >
              Ja
            </button>
            <button
              className={movement === "no" ? "selected" : ""}
              onClick={() => setMovement("no")}
            >
              Nee
            </button>
          </div>
          <p>Heb je vandaag cannabis gebruikt?</p>
          <div className="choice-row">
            <button
              className={cannabis === "no" ? "selected" : ""}
              onClick={() => setCannabis("no")}
            >
              Nee
            </button>
            <button
              className={cannabis === "yes" ? "selected" : ""}
              onClick={() => setCannabis("yes")}
            >
              Ja
            </button>
          </div>
        </div>
      ),
    },
    {
      kicker: "03 · Energie",
      title: "Hoe voel je je nu?",
      body: (
        <div className="range-block">
          <div className="range-value">{energy}</div>
          <input
            type="range"
            min="1"
            max="10"
            value={energy}
            onChange={(event) => setEnergy(Number(event.target.value))}
          />
          <div className="range-labels">
            <span>Leeg</span>
            <span>Scherp</span>
          </div>
        </div>
      ),
    },
  ];

  return (
    <div className="page evening-page">
      <div className="evening-intro">
        <span className="eyebrow">21:00 · Dagafsluiting</span>
        <h1>
          Eerlijk kijken.
          <br />
          <em>Rustig afsluiten.</em>
        </h1>
        <p>Vijf minuten. Geen oordeel, wel duidelijkheid.</p>
      </div>

      <div className="step-progress">
        {questions.map((_, index) => (
          <span key={index} className={index <= step ? "active" : ""} />
        ))}
      </div>

      <section className="review-question" key={step}>
        <span className="eyebrow">{questions[step].kicker}</span>
        <h2>{questions[step].title}</h2>
        {questions[step].body}
      </section>

      <div className="review-actions">
        <button
          className="text-button"
          onClick={() => setStep((current) => Math.max(0, current - 1))}
          disabled={step === 0}
        >
          Terug
        </button>
        <button
          className="primary-button"
          onClick={() =>
            step === questions.length - 1
              ? onComplete({
                  reviewDate: new Intl.DateTimeFormat("en-CA", {
                    year: "numeric",
                    month: "2-digit",
                    day: "2-digit",
                  }).format(new Date()),
                  impactSummary: impact,
                  movement:
                    movement === null ? null : movement === "yes",
                  cannabisUsed:
                    cannabis === null ? null : cannabis === "yes",
                  energy,
                })
              : setStep((current) => current + 1)
          }
        >
          {step === questions.length - 1 ? "Sluit mijn dag af" : "Volgende"}
          <ChevronRight size={18} />
        </button>
      </div>
    </div>
  );
}

function ProgressView() {
  const bars = [54, 66, 42, 78, 72, 86, 64];
  return (
    <div className="page progress-page">
      <div className="page-title">
        <span className="eyebrow">Laatste 7 dagen</span>
        <h1>Progress</h1>
        <p>Niet perfect. Wel steeds duidelijker.</p>
      </div>

      <section className="impact-score">
        <div>
          <span>Impactscore</span>
          <strong>72</strong>
          <small>
            <ArrowUp size={14} /> 8 punten
          </small>
        </div>
        <div className="bar-chart" aria-label="Impactscore per dag">
          {bars.map((height, index) => (
            <span key={index}>
              <i style={{ height: `${height}%` }} />
              <small>{"MDWDDVZ"[index]}</small>
            </span>
          ))}
        </div>
      </section>

      <section className="metric-list">
        <MetricRow
          icon={BriefcaseBusiness}
          label="Impact moves"
          value="4 / 5"
          detail="Eén dag verloren aan busywork"
          progress={80}
        />
        <MetricRow
          icon={Moon}
          label="Gemiddelde slaap"
          value="6u 51"
          detail="Doel: 7u 30"
          progress={73}
        />
        <MetricRow
          icon={Leaf}
          label="Cannabisvrije dagen"
          value="3 dagen"
          detail="Langste reeks deze maand"
          progress={60}
        />
        <MetricRow
          icon={Dumbbell}
          label="Trainingen"
          value="2 / 3"
          detail="Nog één sessie gepland"
          progress={66}
        />
      </section>

      <section className="pattern-note">
        <Flame size={18} />
        <div>
          <span>Voorlopig patroon</span>
          <p>
            Op dagen met beweging rapporteer je gemiddeld <strong>1,4 punt</strong>{" "}
            meer energie.
          </p>
        </div>
      </section>
    </div>
  );
}

function MetricRow({
  icon: Icon,
  label,
  value,
  detail,
  progress,
}: {
  icon: typeof Moon;
  label: string;
  value: string;
  detail: string;
  progress: number;
}) {
  return (
    <article className="metric-row">
      <div className="metric-icon">
        <Icon size={19} />
      </div>
      <div className="metric-copy">
        <div>
          <span>{label}</span>
          <strong>{value}</strong>
        </div>
        <p>{detail}</p>
        <i>
          <b style={{ width: `${progress}%` }} />
        </i>
      </div>
    </article>
  );
}

function MemoryView({ onToast }: { onToast: (message: string) => void }) {
  return (
    <div className="page memory-page">
      <div className="page-title">
        <span className="eyebrow">Jouw context</span>
        <h1>Memory</h1>
        <p>Wat Northstar over jou weet en gebruikt.</p>
      </div>

      <div className="memory-summary">
        <div>
          <strong>24</strong>
          <span>herinneringen</span>
        </div>
        <div>
          <strong>6</strong>
          <span>actieve doelen</span>
        </div>
        <div>
          <strong>3</strong>
          <span>patronen</span>
        </div>
      </div>

      <section className="memory-list">
        <div className="section-heading">
          <h2>Belangrijkste context</h2>
          <button>
            Alles <ChevronRight size={16} />
          </button>
        </div>
        {MEMORY_ITEMS.map((item) => (
          <article className="memory-item" key={item.title}>
            <div className="memory-icon">
              <item.icon size={18} />
            </div>
            <div>
              <span>{item.category}</span>
              <h3>{item.title}</h3>
              <p>{item.detail}</p>
              <small>
                <Check size={12} /> {item.confidence}
              </small>
            </div>
            <button
              aria-label={`${item.title} aanpassen`}
              onClick={() => onToast("Bewerken komt in de volgende iteratie")}
            >
              <MoreHorizontal size={19} />
            </button>
          </article>
        ))}
      </section>

      <button
        className="outline-button"
        onClick={() => onToast("Memory review gepland")}
      >
        <Brain size={18} />
        Review wat Northstar weet
      </button>
      <p className="privacy-note">
        Jij houdt controle. Iedere herinnering blijft herleidbaar, corrigeerbaar
        en verwijderbaar.
      </p>
    </div>
  );
}
