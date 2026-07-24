"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  ArrowUp,
  BarChart3,
  Bell,
  Brain,
  CalendarDays,
  Check,
  ChevronRight,
  CloudOff,
  Lightbulb,
  LoaderCircle,
  Menu,
  MessageCircle,
  Mic,
  Moon,
  Pause,
  Plus,
  RefreshCw,
  RotateCcw,
  Send,
  Settings2,
  Sparkles,
  SunMedium,
  UserRound,
  X,
} from "lucide-react";
import { NotificationSettings } from "@/app/notification-settings";
import {
  chooseRecorderMimeType,
  getAudioFilename,
} from "@/lib/audio";

type Tab = "today" | "coach" | "insights" | "profile" | "evening";
type EntryKind = "note" | "coach" | "health" | "impact";

type JournalEntry = {
  id: string;
  clientId?: string;
  time: string;
  text: string;
  kind: EntryKind;
  syncState?: "local" | "pending" | "synced" | "failed";
};

type ChatMessage = {
  id: string;
  clientId?: string;
  role: "coach" | "user";
  text: string;
  time: string;
  syncState?: "pending" | "sent" | "failed";
};

type UserProfile = {
  displayName: string;
  initials: string;
  timezone: string;
  eveningCheckInTime: string;
  coachSettings: Record<string, unknown>;
};

type IntegrationStatus = {
  supabase: boolean;
  openai: boolean;
  authenticated: boolean;
  schemaReady: boolean;
  ready: boolean;
  issues: string[];
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
  { id: "insights", label: "Insights", icon: BarChart3 },
  { id: "profile", label: "Jij", icon: UserRound },
];

const LEGACY_DEMO_ENTRY_IDS = new Set(["1", "2", "3"]);
const LEGACY_DEMO_CHAT_IDS = new Set(["c1", "c2", "c3"]);

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
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [profile, setProfile] = useState<UserProfile>({
    displayName: "Northstar",
    initials: "NS",
    timezone: "Europe/Brussels",
    eveningCheckInTime: "21:00:00",
    coachSettings: {},
  });
  const [draft, setDraft] = useState("");
  const [chatDraft, setChatDraft] = useState("");
  const [coachResponding, setCoachResponding] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [listening, setListening] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [notificationSettingsOpen, setNotificationSettingsOpen] =
    useState(false);
  const [toast, setToast] = useState("");
  const [integrationStatus, setIntegrationStatus] =
    useState<IntegrationStatus>({
      supabase: false,
      openai: false,
      authenticated: false,
      schemaReady: false,
      ready: false,
      issues: [],
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
          setEntries(
            ((state.entries ?? []) as JournalEntry[])
              .filter((entry) => !LEGACY_DEMO_ENTRY_IDS.has(entry.id))
              .map((entry) => ({
                ...entry,
                clientId: entry.clientId ?? entry.id,
                syncState:
                  entry.kind === "coach"
                    ? "synced"
                    : (entry.syncState ?? "local"),
              })),
          );
          setChat(
            ((state.chat ?? []) as ChatMessage[]).filter(
              (message) => !LEGACY_DEMO_CHAT_IDS.has(message.id),
            ),
          );
        } catch {
          // Keep a clean local state when saved data is malformed.
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
              metadata?: Record<string, unknown>;
            }>;
          } | null,
        ) => {
          if (!result) return;
          const rawEntries = result.entries ?? [];
          const chatEntryIds = new Set(
            rawEntries
              .filter(
                (entry) =>
                  entry.kind !== "coach_message" &&
                  entry.metadata?.channel === "chat",
              )
              .map((entry) => entry.id),
          );
          const isChatEntry = (entry: (typeof rawEntries)[number]) =>
            entry.metadata?.channel === "chat" ||
            (entry.kind === "coach_message" &&
              typeof entry.metadata?.in_response_to === "string" &&
              chatEntryIds.has(entry.metadata.in_response_to));
          const formatTime = (occurredAt: string) =>
            new Intl.DateTimeFormat("nl-BE", {
              hour: "2-digit",
              minute: "2-digit",
            }).format(new Date(occurredAt));

          const cloudEntries: JournalEntry[] = rawEntries
            .filter((entry) => !isChatEntry(entry))
            .map((entry) => ({
              id: entry.id,
              time: formatTime(entry.occurred_at),
              text: entry.content,
              kind: entry.kind === "coach_message" ? "coach" : "note",
              syncState: "synced",
            }));
          const cloudChat: ChatMessage[] = rawEntries
            .filter(isChatEntry)
            .map((entry) => ({
              id: entry.id,
              clientId:
                typeof entry.metadata?.client_entry_id === "string"
                  ? entry.metadata.client_entry_id
                  : undefined,
              role: entry.kind === "coach_message" ? "coach" : "user",
              text: entry.content,
              time: formatTime(entry.occurred_at),
              syncState: "sent",
            }));

          setEntries((current) => {
            const cloudClientIds = new Set(
              rawEntries
                .map((entry) => {
                  const metadata = entry.metadata;
                  return typeof metadata?.client_entry_id === "string"
                    ? metadata.client_entry_id
                    : null;
                })
                .filter(Boolean),
            );
            const localOnly = current.filter(
              (entry) =>
                entry.kind !== "coach" &&
                entry.syncState !== "synced" &&
                !cloudClientIds.has(entry.clientId ?? entry.id),
            );
            return [...cloudEntries, ...localOnly];
          });
          setChat((current) => {
            const cloudClientIds = new Set(
              cloudChat.map((message) => message.clientId).filter(Boolean),
            );
            const unsynced = current.filter(
              (message) =>
                message.role === "user" &&
                message.syncState !== "sent" &&
                !cloudClientIds.has(message.clientId),
            );
            return [...cloudChat, ...unsynced];
          });
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
    if (!integrationStatus.authenticated) return;
    fetch("/api/profile")
      .then((response) => (response.ok ? response.json() : null))
      .then((nextProfile: UserProfile | null) => {
        if (nextProfile) setProfile(nextProfile);
      })
      .catch(() => {
        // The fallback identity keeps the shell usable if profile loading fails.
      });
  }, [integrationStatus.authenticated]);

  useEffect(() => {
    const viewport = window.visualViewport;
    let settledHeight = Math.max(
      window.innerHeight,
      viewport?.height ?? window.innerHeight,
    );

    const updateViewport = () => {
      const activeElement = document.activeElement;
      const textInputFocused =
        activeElement instanceof HTMLInputElement ||
        activeElement instanceof HTMLTextAreaElement ||
        activeElement instanceof HTMLSelectElement ||
        activeElement?.getAttribute("contenteditable") === "true";
      const visualHeight = viewport?.height ?? window.innerHeight;
      const visualTop = viewport?.offsetTop ?? 0;

      if (!textInputFocused) {
        settledHeight = Math.max(
          settledHeight,
          window.innerHeight,
          visualHeight + visualTop,
        );
      }

      const keyboardOpen =
        textInputFocused &&
        (settledHeight - visualHeight > 80 || visualTop > 0);

      document.documentElement.style.setProperty(
        "--app-viewport-height",
        `${keyboardOpen ? visualHeight : window.innerHeight}px`,
      );
      document.documentElement.style.setProperty(
        "--app-viewport-top",
        `${keyboardOpen ? visualTop : 0}px`,
      );
      document.documentElement.dataset.keyboard = keyboardOpen
        ? "open"
        : "closed";
    };

    updateViewport();
    viewport?.addEventListener("resize", updateViewport);
    viewport?.addEventListener("scroll", updateViewport);
    window.addEventListener("resize", updateViewport);
    document.addEventListener("focusin", updateViewport);
    document.addEventListener("focusout", updateViewport);

    return () => {
      viewport?.removeEventListener("resize", updateViewport);
      viewport?.removeEventListener("scroll", updateViewport);
      window.removeEventListener("resize", updateViewport);
      document.removeEventListener("focusin", updateViewport);
      document.removeEventListener("focusout", updateViewport);
      document.documentElement.style.removeProperty("--app-viewport-height");
      document.documentElement.style.removeProperty("--app-viewport-top");
      delete document.documentElement.dataset.keyboard;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(
      "northstar-state",
      JSON.stringify({ entries, chat }),
    );
  }, [entries, chat, hydrated]);

  useEffect(() => {
    if (composerOpen) textareaRef.current?.focus();
  }, [composerOpen]);

  useEffect(() => {
    if (!composerOpen && !menuOpen) return;

    const closeOverlay = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setComposerOpen(false);
      setMenuOpen(false);
    };

    window.addEventListener("keydown", closeOverlay);
    return () => window.removeEventListener("keydown", closeOverlay);
  }, [composerOpen, menuOpen]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedView = params.get("view");
    const frame = window.requestAnimationFrame(() => {
      if (requestedView === "today" || requestedView === "coach") {
        setTab(requestedView);
      } else if (requestedView === "evening") {
        setTab("evening");
      } else if (requestedView === "progress") {
        setTab("insights");
      } else if (requestedView === "memory") {
        setTab("profile");
      }
      if (params.get("compose") === "1") {
        setComposerOpen(true);
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const date = todayLabel();

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2400);
  }, []);

  async function requestCoach(
    message: string,
    channel: "journal" | "chat",
    clientEntryId: string,
  ) {
    if (!integrationStatus.ready) {
      showToast("Niet gesynchroniseerd — cloudsetup is nog onvolledig");
      return null;
    }

    const response = await fetch("/api/coach", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message,
        channel,
        occurredAt: new Date().toISOString(),
        clientEntryId,
      }),
    });

    if (!response.ok) {
      const failure = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      if (response.status === 401) {
        showToast("Log opnieuw in om cloudopslag te gebruiken");
      } else if (failure?.error === "DATABASE_SCHEMA_MISSING") {
        showToast("Database is nog niet geïnitialiseerd");
      } else {
        showToast("Niet gesynchroniseerd — probeer opnieuw");
      }
      return null;
    }

    return response.json() as Promise<{
      entry: { id: string; occurred_at: string };
      coach: { reply: string; intervention: string } | null;
      warning?: string;
    }>;
  }

  async function addEntry(event: FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    const clientId = crypto.randomUUID();
    setEntries((current) => [
      ...current,
      {
        id: clientId,
        clientId,
        time: nowTime(),
        text,
        kind: "note",
        syncState: integrationStatus.ready ? "pending" : "local",
      },
    ]);
    setDraft("");
    setComposerOpen(false);
    showToast(
      integrationStatus.ready
        ? "Entry wordt veilig verwerkt…"
        : "Alleen op dit toestel bewaard",
    );

    const result = await requestCoach(text, "journal", clientId);
    if (!result) {
      setEntries((current) =>
        current.map((entry) =>
          entry.clientId === clientId
            ? { ...entry, syncState: "failed" }
            : entry,
        ),
      );
      return;
    }

    setEntries((current) =>
      current.map((entry) =>
        entry.clientId === clientId
          ? { ...entry, id: result.entry.id, syncState: "synced" }
          : entry,
      ),
    );

    const coachReply = result.coach?.reply;
    if (coachReply) {
      setEntries((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          time: nowTime(),
          text: coachReply,
          kind: "coach",
        },
      ]);
      showToast("Entry en coachfeedback bewaard");
    } else if (result.warning) {
      showToast("Entry bewaard; coachfeedback volgt later");
    }
  }

  async function retryEntry(entry: JournalEntry) {
    const clientId = entry.clientId ?? entry.id;
    setEntries((current) =>
      current.map((item) =>
        item.id === entry.id ? { ...item, syncState: "pending" } : item,
      ),
    );

    const result = await requestCoach(entry.text, "journal", clientId);
    if (!result) {
      setEntries((current) =>
        current.map((item) =>
          item.id === entry.id ? { ...item, syncState: "failed" } : item,
        ),
      );
      return;
    }

    setEntries((current) =>
      current.map((item) =>
        item.id === entry.id
          ? { ...item, id: result.entry.id, syncState: "synced" }
          : item,
      ),
    );

    if (result.coach?.reply) {
      setEntries((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          time: nowTime(),
          text: result.coach!.reply,
          kind: "coach",
          syncState: "synced",
        },
      ]);
    }
    showToast(
      result.coach ? "Entry en coachfeedback gesynchroniseerd" : "Entry gesynchroniseerd",
    );
  }

  async function toggleVoice(target: "journal" | "chat" = "journal") {
    if (listening && mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      setListening(false);
      return;
    }

    if (!integrationStatus.ready) {
      setListening(true);
      window.setTimeout(() => {
        const demoText =
          "Ik heb net een uur gefocust gewerkt. De pricing staat goed, maar ik stel het versturen nog uit.";
        if (target === "chat") setChatDraft(demoText);
        else setDraft(demoText);
        setListening(false);
      }, 1800);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      const preferredMimeType = chooseRecorderMimeType((mimeType) =>
        MediaRecorder.isTypeSupported(mimeType),
      );
      const recorder = new MediaRecorder(
        stream,
        preferredMimeType ? { mimeType: preferredMimeType } : undefined,
      );
      mediaStreamRef.current = stream;
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.addEventListener("dataavailable", (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      });

      recorder.addEventListener("stop", async () => {
        setTranscribing(true);
        mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
        const mimeType =
          recorder.mimeType ||
          audioChunksRef.current.find((chunk) => chunk.type)?.type ||
          preferredMimeType;
        const audio = new Blob(audioChunksRef.current, {
          type: mimeType,
        });
        const filename = getAudioFilename(mimeType);
        if (!filename || audio.size < 256) {
          setTranscribing(false);
          showToast("Opname was te kort of leeg — probeer opnieuw");
          return;
        }
        const formData = new FormData();
        formData.append("audio", audio, filename);

        try {
          const response = await fetch("/api/transcribe", {
            method: "POST",
            body: formData,
          });
          if (!response.ok) {
            const failure = (await response.json().catch(() => null)) as {
              message?: string;
            } | null;
            throw new Error(
              failure?.message ?? "Transcriptie mislukt; probeer opnieuw",
            );
          }
          const result = (await response.json()) as { text: string };
          if (target === "chat") setChatDraft(result.text);
          else setDraft(result.text);
          showToast("Spraak omgezet naar tekst");
        } catch (error) {
          showToast(
            error instanceof Error
              ? error.message
              : "Transcriptie mislukt; probeer opnieuw",
          );
        } finally {
          setTranscribing(false);
        }
      });

      recorder.start(1000);
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
    if (!text || coachResponding) return;
    const time = nowTime();
    const clientId = crypto.randomUUID();
    setChat((current) => [
      ...current,
      {
        id: clientId,
        clientId,
        role: "user",
        text,
        time,
        syncState: "pending",
      },
    ]);
    setChatDraft("");
    setCoachResponding(true);

    try {
      const result = await requestCoach(text, "chat", clientId);
      if (!result) {
        setChat((current) =>
          current.map((message) =>
            message.clientId === clientId
              ? { ...message, syncState: "failed" }
              : message,
          ),
        );
        return;
      }

      setChat((current) =>
        current.map((message) =>
          message.clientId === clientId
            ? { ...message, id: result.entry.id, syncState: "sent" }
            : message,
        ),
      );
      if (result.coach?.reply) {
        setChat((current) => [
          ...current,
          {
            id: crypto.randomUUID(),
            role: "coach",
            time: nowTime(),
            text: result.coach!.reply,
            syncState: "sent",
          },
        ]);
      } else {
        showToast("Bericht bewaard; coachfeedback volgt later");
      }
    } catch {
      setChat((current) =>
        current.map((message) =>
          message.clientId === clientId
            ? { ...message, syncState: "failed" }
            : message,
        ),
      );
      showToast("Coach is tijdelijk niet bereikbaar");
    } finally {
      setCoachResponding(false);
    }
  }

  async function retryChat(message: ChatMessage) {
    if (coachResponding || message.role !== "user") return;
    const clientId = message.clientId ?? message.id;
    setChat((current) =>
      current.map((item) =>
        item.id === message.id ? { ...item, syncState: "pending" } : item,
      ),
    );
    setCoachResponding(true);
    try {
      const result = await requestCoach(message.text, "chat", clientId);
      if (!result) throw new Error("COACH_RETRY_FAILED");
      setChat((current) =>
        current.map((item) =>
          item.id === message.id
            ? { ...item, id: result.entry.id, clientId, syncState: "sent" }
            : item,
        ),
      );
      if (result.coach?.reply) {
        setChat((current) => [
          ...current,
          {
            id: crypto.randomUUID(),
            role: "coach",
            time: nowTime(),
            text: result.coach!.reply,
            syncState: "sent",
          },
        ]);
      }
    } catch {
      setChat((current) =>
        current.map((item) =>
          item.id === message.id ? { ...item, syncState: "failed" } : item,
        ),
      );
      showToast("Opnieuw versturen is niet gelukt");
    } finally {
      setCoachResponding(false);
    }
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
        <button
          className="rail-button settings"
          aria-label="Instellingen"
          onClick={() => setTab("profile")}
        >
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
            onClick={() => setTab("profile")}
          >
            {profile.initials}
          </button>
        </header>

        {hydrated && !integrationStatus.ready && (
          <div className="system-banner" role="status">
            <CloudOff size={17} aria-hidden="true" />
            <span>
              <strong>Alleen lokaal</strong>
              {integrationStatus.issues.includes("DATABASE_SCHEMA_MISSING")
                ? "Database-initialisatie ontbreekt."
                : "Cloud en coach zijn nog niet volledig beschikbaar."}
            </span>
          </div>
        )}

        <div className={`view-container view-${tab}`} key={tab}>
          {tab === "today" && (
            <TodayView
              date={date}
              entries={entries}
              coachReady={integrationStatus.ready}
              onCompose={() => setComposerOpen(true)}
              onCoach={() => setTab("coach")}
              onEvening={() => setTab("evening")}
              onRetry={(entry) => void retryEntry(entry)}
            />
          )}
          {tab === "coach" && (
            <CoachView
              messages={chat}
              active={integrationStatus.ready}
              responding={coachResponding}
              listening={listening}
              transcribing={transcribing}
              draft={chatDraft}
              setDraft={setChatDraft}
              onSubmit={sendChat}
              onVoice={() => void toggleVoice("chat")}
              onRetry={(message) => void retryChat(message)}
            />
          )}
          {tab === "evening" && (
            <EveningView
              onComplete={(review) => void completeReview(review)}
            />
          )}
          {tab === "insights" && <InsightsView entries={entries} />}
          {tab === "profile" && (
            <ProfileView
              profile={profile}
              onNotifications={() => setNotificationSettingsOpen(true)}
              onMemory={() =>
                showToast("Memory review komt in de volgende intelligence-release")
              }
            />
          )}
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
        <div
          className="menu-overlay"
          onMouseDown={() => setMenuOpen(false)}
          role="presentation"
        >
          <aside
            className="menu-panel"
            onMouseDown={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
          >
            <div className="menu-top">
              <div className="brand-lockup">
                <span className="brand-mark small">N</span>
                <span>northstar</span>
              </div>
              <button
                className="icon-button"
                onClick={() => setMenuOpen(false)}
                aria-label="Menu sluiten"
              >
                <X size={21} />
              </button>
            </div>
            <p className="menu-quote">
              “Streng op gedrag.
              <br />
              Zacht voor de mens.”
            </p>
            <div className="menu-status">
              <span>{profile.displayName}</span>
              <strong>
                <i /> {integrationStatus.ready ? "Actief" : "Actie nodig"}
              </strong>
            </div>
            <button
              className="menu-row"
              onClick={() => {
                setMenuOpen(false);
                setTab("profile");
              }}
            >
              <UserRound size={20} /> Profiel en instellingen
              <ChevronRight size={18} />
            </button>
            <button
              className="menu-row"
              onClick={() => {
                setMenuOpen(false);
                setNotificationSettingsOpen(true);
              }}
            >
              <Bell size={20} /> Notificaties & dagritme
              <ChevronRight size={18} />
            </button>
            <button
              className="menu-row"
              onClick={() => {
                setMenuOpen(false);
                setTab("insights");
              }}
            >
              <BarChart3 size={20} /> Insights
              <ChevronRight size={18} />
            </button>
          </aside>
        </div>
      )}

      <NotificationSettings
        open={notificationSettingsOpen}
        onClose={() => setNotificationSettingsOpen(false)}
        onToast={showToast}
      />

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
  coachReady,
  onCompose,
  onCoach,
  onEvening,
  onRetry,
}: {
  date: string;
  entries: JournalEntry[];
  coachReady: boolean;
  onCompose: () => void;
  onCoach: () => void;
  onEvening: () => void;
  onRetry: (entry: JournalEntry) => void;
}) {
  return (
    <div className="page today-page">
      <div className="date-row">
        <span>{date}</span>
        <span className="day-state">
          <i className={coachReady ? "" : "offline"} />{" "}
          {coachReady ? "Coach actief" : "Alleen lokaal"}
        </span>
      </div>

      <section className="welcome">
        <h1>Vandaag</h1>
        <p>
          Leg vast wat er gebeurt. Northstar verbindt je entries met je doelen
          en patronen.
        </p>
      </section>

      <div className="capture-actions">
        <button className="capture-primary" onClick={onCompose}>
          <Plus size={18} />
          Nieuwe entry
        </button>
        <button onClick={onCoach}>
          <MessageCircle size={18} />
          Praat met coach
        </button>
      </div>

      <section className="timeline">
        <div className="section-heading">
          <h2>Entries</h2>
          <span>{entries.length}</span>
        </div>
        {entries.length ? (
          <div className="timeline-list">
            {entries.map((entry, index) => (
              <article className={`timeline-entry ${entry.kind}`} key={entry.id}>
                <div className="timeline-time">{entry.time}</div>
                <div className="timeline-node">
                  <span />
                  {index < entries.length - 1 && <i />}
                </div>
                <div className="timeline-content">
                  <p>{entry.text}</p>
                  {entry.kind !== "coach" &&
                    entry.syncState &&
                    entry.syncState !== "synced" && (
                      <button
                        className="sync-action"
                        onClick={() => onRetry(entry)}
                        disabled={
                          entry.syncState === "pending" || !coachReady
                        }
                      >
                        {entry.syncState === "pending" ? (
                          <>
                            <RefreshCw size={12} />
                            Synchroniseren…
                          </>
                        ) : (
                          <>
                            <CloudOff size={12} />
                            {coachReady
                              ? "Synchroniseer opnieuw"
                              : "Alleen op dit toestel"}
                          </>
                        )}
                      </button>
                    )}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <p>Nog geen entries vandaag.</p>
            <span>Een korte, eerlijke notitie is genoeg om te beginnen.</span>
          </div>
        )}
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

    </div>
  );
}

function CoachView({
  messages,
  active,
  responding,
  listening,
  transcribing,
  draft,
  setDraft,
  onSubmit,
  onVoice,
  onRetry,
}: {
  messages: ChatMessage[];
  active: boolean;
  responding: boolean;
  listening: boolean;
  transcribing: boolean;
  draft: string;
  setDraft: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
  onVoice: () => void;
  onRetry: (message: ChatMessage) => void;
}) {
  const streamEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const prompts = [
    "Geef me een eerlijke reality check",
    "Wat is nu mijn hoogste-impactactie?",
    "Help me mijn gedachten structureren",
  ];

  useEffect(() => {
    streamEndRef.current?.scrollIntoView({ block: "end" });
  }, [messages, responding]);

  function selectPrompt(prompt: string) {
    setDraft(prompt);
    window.requestAnimationFrame(() => inputRef.current?.focus());
  }

  return (
    <div className="page coach-page">
      <div className="coach-header">
        <div className="coach-orb">
          <Sparkles size={17} />
        </div>
        <div>
          <h1>Northstar</h1>
          <span>{active ? "Klaar om mee te denken" : "Tijdelijk offline"}</span>
        </div>
      </div>

      <div className="chat-stream" aria-live="polite">
        {messages.length ? (
          messages.map((message) => (
            <div className={`message ${message.role}`} key={message.id}>
              {message.role === "coach" && (
                <div className="message-avatar">
                  <Sparkles size={13} />
                </div>
              )}
              <div>
                <p>{message.text}</p>
                <span className="message-meta">
                  {message.time}
                  {message.syncState === "pending" && (
                    <>
                      <LoaderCircle className="spin" size={11} /> Bezig…
                    </>
                  )}
                  {message.syncState === "failed" && (
                    <button type="button" onClick={() => onRetry(message)}>
                      <RotateCcw size={11} /> Opnieuw
                    </button>
                  )}
                </span>
              </div>
            </div>
          ))
        ) : (
          <div className="coach-empty">
            <h2>{active ? "Waar wil je scherpte op?" : "Coach niet actief"}</h2>
            <p>
              {active
                ? "Vraag om reflectie, een eerlijke reality check of een concrete volgende stap."
                : "Je berichten blijven op dit toestel tot de cloudsetup voltooid is."}
            </p>
            {active && (
              <div className="coach-prompts">
                {prompts.map((prompt) => (
                  <button
                    type="button"
                    key={prompt}
                    onClick={() => selectPrompt(prompt)}
                  >
                    <Lightbulb size={15} />
                    {prompt}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {responding && (
          <div className="message coach coach-typing">
            <div className="message-avatar">
              <Sparkles size={13} />
            </div>
            <div className="typing-dots" aria-label="Northstar denkt na">
              <i />
              <i />
              <i />
            </div>
          </div>
        )}
        <div ref={streamEndRef} />
      </div>

      <form className="chat-composer" onSubmit={onSubmit}>
        <button
          type="button"
          className={listening ? "chat-voice is-listening" : "chat-voice"}
          aria-label={listening ? "Opname stoppen" : "Inspreken"}
          onClick={onVoice}
          disabled={!active || transcribing || responding}
        >
          {listening ? <Pause size={19} /> : <Mic size={19} />}
        </button>
        <textarea
          ref={inputRef}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onInput={(event) => {
            event.currentTarget.style.height = "auto";
            event.currentTarget.style.height = `${Math.min(
              event.currentTarget.scrollHeight,
              112,
            )}px`;
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
          placeholder={
            transcribing ? "Spraak omzetten…" : "Vraag Northstar om scherpte…"
          }
          rows={1}
          disabled={!active}
        />
        <button
          type="submit"
          className="chat-send"
          aria-label="Verstuur"
          disabled={!active || !draft.trim() || responding}
        >
          {responding ? (
            <LoaderCircle className="spin" size={17} />
          ) : (
            <Send size={17} />
          )}
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

function InsightsView({ entries }: { entries: JournalEntry[] }) {
  const humanEntries = entries.filter((entry) => entry.kind !== "coach").length;
  const progress = Math.min(100, Math.round((humanEntries / 7) * 100));

  return (
    <div className="page insights-page">
      <div className="page-title">
        <span className="eyebrow">Leren uit je dagen</span>
        <h1>Insights</h1>
        <p>
          Northstar toont alleen patronen die door voldoende echte entries
          worden ondersteund.
        </p>
      </div>

      <section className="insight-readiness">
        <div>
          <span>Databasis</span>
          <strong>
            {humanEntries < 7
              ? `${humanEntries} van 7 entries`
              : "Eerste analyse beschikbaar"}
          </strong>
        </div>
        <div className="readiness-track" aria-label={`${progress}% opgebouwd`}>
          <i style={{ width: `${progress}%` }} />
        </div>
        <p>
          {humanEntries < 7
            ? "Blijf kort en eerlijk vastleggen. We wachten liever dan een patroon te verzinnen."
            : "De intelligence-release maakt hiervan een onderbouwd weekrapport."}
        </p>
      </section>

      <div className="insight-list">
        <div>
          <BarChart3 size={18} />
          <span>
            <strong>Weekrapport</strong>
            <small>Impact, health en terugkerend gedrag</small>
          </span>
          <span className="coming-label">Binnenkort</span>
        </div>
        <div>
          <CalendarDays size={18} />
          <span>
            <strong>Terugblik</strong>
            <small>Vergelijk vandaag met eerdere momenten</small>
          </span>
          <span className="coming-label">Binnenkort</span>
        </div>
      </div>
    </div>
  );
}

function ProfileView({
  profile,
  onNotifications,
  onMemory,
}: {
  profile: UserProfile;
  onNotifications: () => void;
  onMemory: () => void;
}) {
  return (
    <div className="page profile-page">
      <div className="profile-heading">
        <span className="profile-avatar">{profile.initials}</span>
        <div>
          <span className="eyebrow">Jouw Northstar</span>
          <h1>{profile.displayName}</h1>
          <p>{profile.timezone}</p>
        </div>
      </div>

      <section className="profile-section">
        <h2>Instellingen</h2>
        <div className="profile-list">
          <button onClick={onNotifications}>
            <Bell size={19} />
            <span>
              <strong>Notificaties & dagritme</strong>
              <small>
                Avondcheck-in om {profile.eveningCheckInTime.slice(0, 5)}
              </small>
            </span>
            <ChevronRight size={18} />
          </button>
          <button onClick={onMemory}>
            <Brain size={19} />
            <span>
              <strong>Wat Northstar weet</strong>
              <small>Controleer en corrigeer je persoonlijke context</small>
            </span>
            <ChevronRight size={18} />
          </button>
        </div>
      </section>

      <p className="privacy-note">
        Je journal, coachcontext en notificaties zijn per account gescheiden.
      </p>
    </div>
  );
}
