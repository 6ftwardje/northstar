"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Circle,
  Clock3,
  ListTodo,
  LoaderCircle,
  Plus,
  Sparkles,
  X,
} from "lucide-react";
import { northstarActionHeaders } from "@/lib/client/action";

type Task = {
  id: string;
  title: string;
  desired_outcome: string;
  estimated_minutes: number;
  due_at: string | null;
  status: "open" | "done";
  impact_domain: string | null;
  source: "manual" | "coach" | "review";
  coach_revision: number;
  created_at: string;
  updated_at: string;
};

type ActivityDay = {
  date: string;
  entryCount: number;
  reviewCompleted: boolean;
  entries: Array<{
    id: string;
    kind: string;
    text: string;
    occurredAt: string;
  }>;
  review: {
    impact_summary: string | null;
    coach_summary: string | null;
    movement: boolean | null;
    cannabis_used: boolean | null;
    energy: number | null;
  } | null;
};

type ActivityResponse = {
  month: string;
  timezone: string;
  days: ActivityDay[];
};

const WEEKDAYS = ["Ma", "Di", "Wo", "Do", "Vr", "Za", "Zo"];

function currentMonth() {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
  })
    .format(new Date())
    .slice(0, 7);
}

function currentDate() {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function shiftMonth(month: string, amount: number) {
  const [year, value] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, value - 1 + amount, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(
    2,
    "0",
  )}`;
}

function monthLabel(month: string) {
  const [year, value] = month.split("-").map(Number);
  const label = new Intl.DateTimeFormat("nl-BE", {
    month: "long",
    year: "numeric",
  }).format(new Date(Date.UTC(year, value - 1, 1)));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function dateLabel(date: string) {
  const label = new Intl.DateTimeFormat("nl-BE", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(`${date}T12:00:00`));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function timeLabel(value: string) {
  return new Intl.DateTimeFormat("nl-BE", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function PlannerView({
  refreshKey,
  onToast,
}: {
  refreshKey: number;
  onToast: (message: string) => void;
}) {
  const [mode, setMode] = useState<"tasks" | "history">("tasks");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [month, setMonth] = useState(currentMonth);
  const [activity, setActivity] = useState<ActivityResponse | null>(null);
  const [selectedDate, setSelectedDate] = useState(currentDate);
  const [loading, setLoading] = useState(true);
  const [busyTask, setBusyTask] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [outcome, setOutcome] = useState("");
  const [minutes, setMinutes] = useState(15);

  const loadTasks = useCallback(async () => {
    const response = await fetch("/api/tasks", { cache: "no-store" });
    if (!response.ok) throw new Error("TASKS_LOAD_FAILED");
    const result = (await response.json()) as { tasks: Task[] };
    setTasks(result.tasks);
  }, []);

  const loadActivity = useCallback(async (targetMonth: string) => {
    const response = await fetch(
      `/api/activity?month=${encodeURIComponent(targetMonth)}`,
      { cache: "no-store" },
    );
    if (!response.ok) throw new Error("ACTIVITY_LOAD_FAILED");
    setActivity((await response.json()) as ActivityResponse);
  }, []);

  useEffect(() => {
    let active = true;
    const frame = window.requestAnimationFrame(() => {
      setLoading(true);
      Promise.all([loadTasks(), loadActivity(month)])
        .catch(() => {
          if (active) onToast("Plan kon niet volledig laden");
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    });
    return () => {
      active = false;
      window.cancelAnimationFrame(frame);
    };
  }, [loadActivity, loadTasks, month, onToast, refreshKey]);

  const openTasks = tasks.filter((task) => task.status === "open");
  const doneTasks = tasks.filter((task) => task.status === "done").slice(0, 8);
  const selectedDay = activity?.days.find(
    (day) => day.date === selectedDate,
  );

  const calendarCells = useMemo(() => {
    const [year, value] = month.split("-").map(Number);
    const first = new Date(Date.UTC(year, value - 1, 1));
    const days = new Date(Date.UTC(year, value, 0)).getUTCDate();
    const mondayOffset = (first.getUTCDay() + 6) % 7;
    return [
      ...Array.from({ length: mondayOffset }, () => null),
      ...Array.from({ length: days }, (_, index) => index + 1),
    ];
  }, [month]);

  async function toggleTask(task: Task) {
    if (busyTask) return;
    const nextStatus = task.status === "open" ? "done" : "open";
    setBusyTask(task.id);
    setTasks((current) =>
      current.map((item) =>
        item.id === task.id ? { ...item, status: nextStatus } : item,
      ),
    );
    try {
      const response = await fetch(
        `/api/tasks/${encodeURIComponent(task.id)}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            ...northstarActionHeaders(),
          },
          body: JSON.stringify({ status: nextStatus }),
        },
      );
      if (!response.ok) throw new Error("TASK_UPDATE_FAILED");
      onToast(nextStatus === "done" ? "Afgerond" : "Teruggezet");
    } catch {
      await loadTasks();
      onToast("Taak kon niet worden aangepast");
    } finally {
      setBusyTask(null);
    }
  }

  async function addTask(event: FormEvent) {
    event.preventDefault();
    if (!title.trim() || !outcome.trim()) return;
    setBusyTask("new");
    try {
      const response = await fetch("/api/tasks", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...northstarActionHeaders(),
        },
        body: JSON.stringify({
          title,
          desiredOutcome: outcome,
          estimatedMinutes: minutes,
          dueAt: null,
          impactDomain: null,
        }),
      });
      if (!response.ok) {
        const result = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(result?.error ?? "TASK_CREATE_FAILED");
      }
      setTitle("");
      setOutcome("");
      setMinutes(15);
      setAdding(false);
      await loadTasks();
      onToast("Actie toegevoegd");
    } catch (error) {
      onToast(
        error instanceof Error && error.message === "TASK_NOT_CONCRETE"
          ? "Begin met een concreet werkwoord en resultaat"
          : "Actie kon niet worden toegevoegd",
      );
    } finally {
      setBusyTask(null);
    }
  }

  function selectMonth(next: string) {
    setMonth(next);
    setSelectedDate(
      next === currentMonth() ? currentDate() : `${next}-01`,
    );
  }

  return (
    <div className="page planner-page">
      <div className="planner-heading">
        <div>
          <span className="eyebrow">Actie en ritme</span>
          <h1>Plan</h1>
        </div>
        {mode === "tasks" && (
          <button
            className="planner-add"
            onClick={() => setAdding((value) => !value)}
            aria-label={adding ? "Nieuwe actie sluiten" : "Nieuwe actie"}
          >
            {adding ? <X size={18} /> : <Plus size={18} />}
          </button>
        )}
      </div>

      <div className="planner-segment" role="tablist">
        <button
          role="tab"
          aria-selected={mode === "tasks"}
          className={mode === "tasks" ? "is-active" : ""}
          onClick={() => setMode("tasks")}
        >
          <ListTodo size={16} /> Taken
        </button>
        <button
          role="tab"
          aria-selected={mode === "history"}
          className={mode === "history" ? "is-active" : ""}
          onClick={() => setMode("history")}
        >
          <CalendarDays size={16} /> Historiek
        </button>
      </div>

      {loading && !activity && !tasks.length ? (
        <div className="planner-loading">
          <LoaderCircle className="spin" size={18} /> Plan laden…
        </div>
      ) : mode === "tasks" ? (
        <>
          {adding && (
            <form className="task-create" onSubmit={addTask}>
              <label>
                Actie
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="Bel de arts voor een afspraak"
                  maxLength={140}
                />
              </label>
              <label>
                Klaar wanneer…
                <input
                  value={outcome}
                  onChange={(event) => setOutcome(event.target.value)}
                  placeholder="Een consultatie staat ingepland"
                  maxLength={280}
                />
              </label>
              <div className="task-create-footer">
                <label>
                  Duur
                  <select
                    value={minutes}
                    onChange={(event) => setMinutes(Number(event.target.value))}
                  >
                    {[5, 10, 15, 20, 25, 30].map((value) => (
                      <option value={value} key={value}>
                        {value} min
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="submit"
                  disabled={
                    busyTask === "new" || !title.trim() || !outcome.trim()
                  }
                >
                  Voeg toe
                </button>
              </div>
            </form>
          )}

          <section className="task-section">
            <div className="planner-section-title">
              <h2>Nu uitvoerbaar</h2>
              <span>{openTasks.length}</span>
            </div>
            {openTasks.length ? (
              <div className="task-list">
                {openTasks.map((task) => (
                  <button
                    className="task-row"
                    key={task.id}
                    onClick={() => void toggleTask(task)}
                    disabled={busyTask === task.id}
                  >
                    <span className="task-check">
                      {busyTask === task.id ? (
                        <LoaderCircle className="spin" size={17} />
                      ) : (
                        <Circle size={19} />
                      )}
                    </span>
                    <span className="task-copy">
                      <strong>{task.title}</strong>
                      <small>{task.desired_outcome}</small>
                      <span>
                        <Clock3 size={12} /> {task.estimated_minutes} min
                        {task.due_at && ` · ${dateLabel(task.due_at.slice(0, 10))}`}
                        {task.source === "coach" && (
                          <em>
                            <Sparkles size={11} /> Coach
                          </em>
                        )}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="planner-empty">
                <Check size={22} />
                <strong>Alles helder</strong>
                <p>Geen open acties. Voeg alleen toe wat echt uitgevoerd wordt.</p>
              </div>
            )}
          </section>

          {doneTasks.length > 0 && (
            <details className="completed-tasks">
              <summary>
                Recent afgerond <ChevronDown size={15} />
              </summary>
              {doneTasks.map((task) => (
                <button key={task.id} onClick={() => void toggleTask(task)}>
                  <Check size={16} />
                  <span>{task.title}</span>
                </button>
              ))}
            </details>
          )}
        </>
      ) : (
        <section className="history-workspace">
          <div className="month-controls">
            <button
              onClick={() => selectMonth(shiftMonth(month, -1))}
              aria-label="Vorige maand"
            >
              <ChevronLeft size={19} />
            </button>
            <strong>{monthLabel(month)}</strong>
            <button
              onClick={() => selectMonth(shiftMonth(month, 1))}
              aria-label="Volgende maand"
              disabled={month >= currentMonth()}
            >
              <ChevronRight size={19} />
            </button>
          </div>
          <div className="history-weekdays">
            {WEEKDAYS.map((day) => (
              <span key={day}>{day}</span>
            ))}
          </div>
          <div className="history-grid">
            {calendarCells.map((day, index) => {
              if (!day) return <span key={`empty-${index}`} />;
              const date = `${month}-${String(day).padStart(2, "0")}`;
              const data = activity?.days.find((item) => item.date === date);
              const active = data && (data.entryCount || data.reviewCompleted);
              return (
                <button
                  key={date}
                  className={[
                    active ? "has-activity" : "",
                    data?.reviewCompleted ? "has-review" : "",
                    selectedDate === date ? "is-selected" : "",
                    date === currentDate() ? "is-today" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onClick={() => setSelectedDate(date)}
                >
                  <span>{day}</span>
                  {active && (
                    <i aria-label={`${data?.entryCount ?? 0} entries`} />
                  )}
                </button>
              );
            })}
          </div>

          <div className="day-history">
            <div className="planner-section-title">
              <h2>{dateLabel(selectedDate)}</h2>
              {selectedDay && (
                <span>
                  {selectedDay.entryCount}{" "}
                  {selectedDay.entryCount === 1 ? "entry" : "entries"}
                </span>
              )}
            </div>
            {!selectedDay ? (
              <div className="planner-empty compact">
                <p>Op deze dag is nog niets vastgelegd.</p>
              </div>
            ) : (
              <>
                {selectedDay.review && (
                  <div className="history-review">
                    <span>
                      <Check size={14} /> Avondcheck-in
                    </span>
                    <strong>
                      Energie {selectedDay.review.energy ?? "—"}/10
                    </strong>
                    {selectedDay.review.impact_summary && (
                      <p>{selectedDay.review.impact_summary}</p>
                    )}
                    {selectedDay.review.coach_summary && (
                      <blockquote>
                        {selectedDay.review.coach_summary}
                      </blockquote>
                    )}
                  </div>
                )}
                <div className="history-entry-list">
                  {selectedDay.entries
                    .filter((entry) => entry.kind !== "evening_review")
                    .map((entry) => (
                      <article key={entry.id}>
                        <time>{timeLabel(entry.occurredAt)}</time>
                        <p>{entry.text}</p>
                      </article>
                    ))}
                </div>
              </>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
