export type MemoryKind =
  | "fact"
  | "preference"
  | "goal"
  | "commitment"
  | "pattern"
  | "relationship"
  | "project";

export type MemoryRecord = {
  id: string;
  kind: MemoryKind;
  title: string;
  content: string;
  confidence: number;
  importance: number;
  status: "candidate" | "active" | "superseded" | "archived";
  validFrom: string;
  validUntil?: string;
  lastConfirmedAt?: string;
  sourceEntryIds: string[];
  tags: string[];
};

export type ContextInput = {
  profile?: {
    displayName: string;
    timezone: string;
    coachSettings: Record<string, unknown>;
  };
  currentEntry: string;
  todaysEntries: Array<{ id: string; createdAt: string; content: string }>;
  recentSummaries: Array<{ date: string; content: string }>;
  activeMemories: MemoryRecord[];
  activeCommitments: MemoryRecord[];
  relevantMemories: MemoryRecord[];
};

export type CompiledContext = {
  profile?: ContextInput["profile"];
  currentEntry: string;
  today: ContextInput["todaysEntries"];
  recentSummaries: ContextInput["recentSummaries"];
  activeState: MemoryRecord[];
  relevantHistory: MemoryRecord[];
  rules: string[];
};

/**
 * Produces the bounded, inspectable context that is sent to the coach.
 * Retrieval and token trimming will eventually happen before this function;
 * keeping the compiler pure makes context runs reproducible and debuggable.
 */
export function compileCoachContext(input: ContextInput): CompiledContext {
  const activeState = [...input.activeCommitments, ...input.activeMemories]
    .filter((memory) => memory.status === "active")
    .sort((a, b) => b.importance - a.importance)
    .slice(0, 18);

  const activeIds = new Set(activeState.map((memory) => memory.id));
  const relevantHistory = input.relevantMemories
    .filter(
      (memory) =>
        memory.status === "active" &&
        memory.confidence >= 0.45 &&
        !activeIds.has(memory.id),
    )
    .sort(
      (a, b) =>
        b.importance * b.confidence - a.importance * a.confidence,
    )
    .slice(0, 12);

  return {
    profile: input.profile,
    currentEntry: input.currentEntry,
    today: input.todaysEntries.slice(-20),
    recentSummaries: input.recentSummaries.slice(-7),
    activeState,
    relevantHistory,
    rules: [
      "Behandel expliciete uitspraken als sterker bewijs dan afgeleide patronen.",
      "Noem een hypothese nooit een feit.",
      "Benoem inconsistenties direct en zonder schuldtaal.",
      "Stel maximaal twee concrete volgende acties voor.",
      "Sla geen nieuwe herinnering op zonder bronverwijzing.",
    ],
  };
}
