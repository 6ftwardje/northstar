"use client";

import { useEffect, useState } from "react";
import {
  Bell,
  BellOff,
  CalendarDays,
  Check,
  ChevronRight,
  Lock,
  Moon,
  Send,
  SunMedium,
  X,
} from "lucide-react";
import {
  getCurrentPushSubscription,
  getPushCapability,
  subscribeToPush,
  unsubscribeFromPush,
  type PushCapability,
} from "@/lib/notifications/client";

type Preferences = {
  timezone: string;
  pushEnabled: boolean;
  morningEnabled: boolean;
  morningTime: string;
  eveningEnabled: boolean;
  eveningTime: string;
  eveningFollowupEnabled: boolean;
  eveningFollowupMinutes: number;
  weeklyEnabled: boolean;
  weeklyDay: number;
  weeklyTime: string;
  privateLockScreen: boolean;
};

type SettingsResponse = {
  configured: boolean;
  subscriptionCount: number;
  preferences: Preferences;
  vapidPublicKey: string | null;
};

const FALLBACK_CAPABILITY: PushCapability = {
  supported: false,
  standalone: false,
  permission: "unsupported",
};

function displayTime(value: string) {
  return value.slice(0, 5);
}

function Toggle({
  checked,
  disabled,
  label,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      className={checked ? "ios-switch is-on" : "ios-switch"}
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onChange}
    >
      <span />
    </button>
  );
}

export function NotificationSettings({
  open,
  onClose,
  onToast,
}: {
  open: boolean;
  onClose: () => void;
  onToast: (message: string) => void;
}) {
  const [settings, setSettings] = useState<SettingsResponse | null>(null);
  const [capability, setCapability] =
    useState<PushCapability>(FALLBACK_CAPABILITY);
  const [subscribedHere, setSubscribedHere] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    let active = true;

    async function load() {
      setCapability(getPushCapability());
      try {
        const [response, subscription] = await Promise.all([
          fetch("/api/notifications/preferences"),
          getCurrentPushSubscription(),
        ]);
        if (!response.ok) throw new Error("SETTINGS_LOAD_FAILED");
        const next = (await response.json()) as SettingsResponse;
        if (!active) return;
        setSettings(next);
        setSubscribedHere(Boolean(subscription));
        setCapability(getPushCapability());
      } catch {
        if (active) {
          onToast("Notificatie-instellingen konden niet laden");
        }
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, [open, onToast]);

  async function updatePreference(
    key:
      | "morningEnabled"
      | "eveningEnabled"
      | "eveningFollowupEnabled"
      | "weeklyEnabled"
      | "privateLockScreen",
  ) {
    if (!settings || busy) return;
    const nextValue = !settings.preferences[key];
    const previous = settings;
    setSettings({
      ...settings,
      preferences: { ...settings.preferences, [key]: nextValue },
    });
    setBusy(true);
    try {
      const response = await fetch("/api/notifications/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: nextValue }),
      });
      if (!response.ok) throw new Error("UPDATE_FAILED");
      setSettings((await response.json()) as SettingsResponse);
    } catch {
      setSettings(previous);
      onToast("Wijziging niet bewaard");
    } finally {
      setBusy(false);
    }
  }

  async function toggleSubscription() {
    if (!settings || busy) return;
    setBusy(true);
    try {
      if (subscribedHere) {
        await unsubscribeFromPush();
        setSubscribedHere(false);
        setSettings({
          ...settings,
          subscriptionCount: Math.max(0, settings.subscriptionCount - 1),
          preferences: {
            ...settings.preferences,
            pushEnabled: settings.subscriptionCount > 1,
          },
        });
        onToast("Push op dit toestel uitgeschakeld");
      } else {
        if (!settings.vapidPublicKey) throw new Error("PUSH_NOT_CONFIGURED");
        await subscribeToPush(settings.vapidPublicKey);
        setSubscribedHere(true);
        setCapability(getPushCapability());
        setSettings({
          ...settings,
          subscriptionCount: settings.subscriptionCount + 1,
          preferences: { ...settings.preferences, pushEnabled: true },
        });
        onToast("Northstar mag je nu bijsturen");
      }
    } catch (error) {
      const code = error instanceof Error ? error.message : "";
      onToast(
        code === "NOTIFICATION_PERMISSION_DENIED"
          ? "Notificaties zijn geweigerd in je iPhone-instellingen"
          : "Push activeren is niet gelukt",
      );
    } finally {
      setBusy(false);
    }
  }

  async function sendTest() {
    if (!subscribedHere || busy) return;
    setBusy(true);
    try {
      const response = await fetch("/api/notifications/test", {
        method: "POST",
      });
      const result = (await response.json().catch(() => null)) as {
        sent?: number;
      } | null;
      if (!response.ok || !result?.sent) throw new Error("TEST_FAILED");
      onToast("Testmelding verstuurd");
    } catch {
      onToast("Testmelding kon niet worden verstuurd");
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  const needsHomeScreen =
    capability.supported &&
    /iPhone|iPad|iPod/.test(navigator.userAgent) &&
    !capability.standalone;

  return (
    <div className="settings-overlay" onMouseDown={onClose}>
      <section
        className="notification-panel"
        aria-modal="true"
        aria-labelledby="notification-title"
        role="dialog"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="notification-header">
          <div>
            <span className="eyebrow">Dagritme</span>
            <h2 id="notification-title">Notificaties</h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Sluiten">
            <X size={21} />
          </button>
        </header>

        {!settings ? (
          <div className="settings-loading">Instellingen laden…</div>
        ) : (
          <>
            <div
              className={
                subscribedHere
                  ? "push-status is-active"
                  : "push-status"
              }
            >
              <span className="push-status-icon">
                {subscribedHere ? <Bell size={21} /> : <BellOff size={21} />}
              </span>
              <div>
                <strong>
                  {subscribedHere ? "Actief op deze iPhone" : "Nog niet actief"}
                </strong>
                <p>
                  {subscribedHere
                    ? "Northstar kan je op de juiste momenten bereiken."
                    : "Activeer één keer. Je houdt zelf controle over elk ritme."}
                </p>
              </div>
              {subscribedHere && <Check size={18} />}
            </div>

            {needsHomeScreen && (
              <div className="settings-notice">
                Voeg Northstar eerst via Safari toe aan je beginscherm. Open
                daarna deze geïnstalleerde app opnieuw.
              </div>
            )}
            {!capability.supported && (
              <div className="settings-notice">
                Push wordt op dit toestel of in deze browser niet ondersteund.
              </div>
            )}
            {!settings.configured && (
              <div className="settings-notice">
                De beveiligde pushsleutels moeten nog op productie worden gezet.
              </div>
            )}

            <button
              className={
                subscribedHere
                  ? "notification-primary is-secondary"
                  : "notification-primary"
              }
              onClick={() => void toggleSubscription()}
              disabled={
                busy ||
                !settings.configured ||
                !capability.supported ||
                needsHomeScreen
              }
            >
              {subscribedHere ? <BellOff size={18} /> : <Bell size={18} />}
              {subscribedHere ? "Schakel uit op dit toestel" : "Activeer push"}
            </button>

            <div className="settings-section">
              <h3>Vaste momenten</h3>
              <div className="settings-list">
                <div className="settings-row">
                  <span className="settings-row-icon">
                    <SunMedium size={18} />
                  </span>
                  <div>
                    <strong>Impact Move</strong>
                    <small>
                      Dagelijks om {displayTime(settings.preferences.morningTime)}
                    </small>
                  </div>
                  <Toggle
                    checked={settings.preferences.morningEnabled}
                    disabled={busy}
                    label="Ochtendmelding"
                    onChange={() => void updatePreference("morningEnabled")}
                  />
                </div>
                <div className="settings-row">
                  <span className="settings-row-icon">
                    <Moon size={18} />
                  </span>
                  <div>
                    <strong>Avondcheck-in</strong>
                    <small>
                      Dagelijks om {displayTime(settings.preferences.eveningTime)}
                    </small>
                  </div>
                  <Toggle
                    checked={settings.preferences.eveningEnabled}
                    disabled={busy}
                    label="Avondcheck-in"
                    onChange={() => void updatePreference("eveningEnabled")}
                  />
                </div>
                <div className="settings-row settings-row-nested">
                  <span />
                  <div>
                    <strong>Follow-up indien nodig</strong>
                    <small>
                      Na {settings.preferences.eveningFollowupMinutes} minuten
                    </small>
                  </div>
                  <Toggle
                    checked={settings.preferences.eveningFollowupEnabled}
                    disabled={busy || !settings.preferences.eveningEnabled}
                    label="Avond follow-up"
                    onChange={() =>
                      void updatePreference("eveningFollowupEnabled")
                    }
                  />
                </div>
                <div className="settings-row">
                  <span className="settings-row-icon">
                    <CalendarDays size={18} />
                  </span>
                  <div>
                    <strong>Wekelijkse review</strong>
                    <small>
                      Zondag om {displayTime(settings.preferences.weeklyTime)}
                    </small>
                  </div>
                  <Toggle
                    checked={settings.preferences.weeklyEnabled}
                    disabled={busy}
                    label="Wekelijkse review"
                    onChange={() => void updatePreference("weeklyEnabled")}
                  />
                </div>
              </div>
            </div>

            <div className="settings-section">
              <h3>Privacy</h3>
              <div className="settings-list">
                <div className="settings-row">
                  <span className="settings-row-icon">
                    <Lock size={18} />
                  </span>
                  <div>
                    <strong>Discrete lockscreen-tekst</strong>
                    <small>Geen gevoelige journaldetails in meldingen</small>
                  </div>
                  <Toggle
                    checked={settings.preferences.privateLockScreen}
                    disabled={busy}
                    label="Discrete lockscreen-tekst"
                    onChange={() => void updatePreference("privateLockScreen")}
                  />
                </div>
              </div>
            </div>

            <button
              className="test-notification-button"
              onClick={() => void sendTest()}
              disabled={!subscribedHere || busy}
            >
              <Send size={17} />
              Stuur testmelding
              <ChevronRight size={17} />
            </button>
            <p className="settings-footnote">
              {settings.subscriptionCount
                ? `${settings.subscriptionCount} actief toestel${settings.subscriptionCount === 1 ? "" : "len"}`
                : "Geen actieve toestellen"}
              {" · "}
              {settings.preferences.timezone}
            </p>
          </>
        )}
      </section>
    </div>
  );
}
