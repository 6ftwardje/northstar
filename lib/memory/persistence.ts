import type { SupabaseClient } from "@supabase/supabase-js";
import type { z } from "zod";
import type { MemoryCandidateSchema } from "@/lib/coach/schemas";

type MemoryCandidate = z.infer<typeof MemoryCandidateSchema>;

type ExistingMemory = {
  id: string;
  kind: MemoryCandidate["kind"];
  status: "candidate" | "active" | "superseded" | "archived";
  title: string;
  content: string;
  confidence: number;
  importance: number;
  evidence_count: number;
  explicit: boolean;
};

export function memoryIdentity(kind: string, title: string) {
  return `${kind}:${title
    .toLocaleLowerCase("nl-BE")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()}`;
}

function nextStatus(
  memory: MemoryCandidate,
  evidenceCount: number,
): "candidate" | "active" {
  if (memory.kind === "pattern") {
    return evidenceCount >= 3 && memory.confidence >= 0.6
      ? "active"
      : "candidate";
  }
  if (memory.explicit && memory.confidence >= 0.65) return "active";
  return evidenceCount >= 2 && memory.confidence >= 0.55
    ? "active"
    : "candidate";
}

export async function persistMemoryCandidates({
  admin,
  userId,
  entryId,
  evidence,
  candidates,
  extractorModel,
  responseId,
}: {
  admin: SupabaseClient;
  userId: string;
  entryId: string;
  evidence: string;
  candidates: MemoryCandidate[];
  extractorModel: string;
  responseId: string;
}) {
  if (candidates.length === 0) return [];

  const { data, error } = await admin
    .from("memories")
    .select(
      "id, kind, status, title, content, confidence, importance, evidence_count, explicit",
    )
    .eq("user_id", userId)
    .in("status", ["candidate", "active"])
    .limit(200);
  if (error) throw error;

  const existing = (data ?? []) as ExistingMemory[];
  const ids: string[] = [];

  for (const candidate of candidates) {
    const identity = memoryIdentity(candidate.kind, candidate.title);
    const match = existing.find(
      (memory) => memoryIdentity(memory.kind, memory.title) === identity,
    );

    let memoryId: string;
    if (match) {
      const evidenceCount = match.evidence_count + 1;
      const confidence = Math.min(
        1,
        Math.max(
          Number(match.confidence),
          candidate.confidence,
          (Number(match.confidence) + candidate.confidence) / 2 + 0.05,
        ),
      );
      const { error: updateError } = await admin
        .from("memories")
        .update({
          status: nextStatus({ ...candidate, confidence }, evidenceCount),
          content:
            candidate.content.length >= match.content.length
              ? candidate.content
              : match.content,
          confidence,
          importance: Math.max(
            Number(match.importance),
            candidate.importance,
          ),
          evidence_count: evidenceCount,
          explicit: match.explicit || candidate.explicit,
          last_confirmed_at: new Date().toISOString(),
          metadata: {
            extractor_model: extractorModel,
            response_id: responseId,
            consolidation: "reinforced",
          },
        })
        .eq("id", match.id)
        .eq("user_id", userId);
      if (updateError) throw updateError;
      memoryId = match.id;
    } else {
      const { data: inserted, error: insertError } = await admin
        .from("memories")
        .insert({
          user_id: userId,
          kind: candidate.kind,
          status: nextStatus(candidate, 1),
          title: candidate.title,
          content: candidate.content,
          confidence: candidate.confidence,
          importance: candidate.importance,
          evidence_count: 1,
          explicit: candidate.explicit,
          last_confirmed_at: candidate.explicit
            ? new Date().toISOString()
            : null,
          tags: candidate.tags,
          metadata: {
            extractor_model: extractorModel,
            response_id: responseId,
            consolidation: "new",
          },
        })
        .select("id")
        .single();
      if (insertError || !inserted) throw insertError;
      memoryId = inserted.id;
    }

    const { error: sourceError } = await admin.from("memory_sources").upsert(
      {
        memory_id: memoryId,
        entry_id: entryId,
        evidence_excerpt: evidence.slice(0, 500),
      },
      { onConflict: "memory_id,entry_id" },
    );
    if (sourceError) throw sourceError;
    ids.push(memoryId);
  }

  return ids;
}
