"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { analyzeConversation } from "@/lib/client/conversation-api";
import type { ConversationDetail } from "@/lib/domain";

export function ConversationAnalysisPanel({ detail }: { detail: ConversationDetail }) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const analysis = detail.analysis;
  const running = busy || analysis?.status === "running" || (analysis?.status === "pending" && Boolean(analysis.id));
  const result = analysis?.result;
  const canAnalyze = detail.source === "gmail" && analysis?.configured;
  const status = running ? "running" : analysis?.stale ? "pending" : detail.analysisState;
  const run = async () => {
    setBusy(true);
    setError("");
    try {
      await analyzeConversation(detail.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Analysis failed. Try again.");
    } finally {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["conversation", detail.id] }),
        queryClient.invalidateQueries({ queryKey: ["conversations"] }),
      ]);
      setBusy(false);
    }
  };

  return <section aria-label="Conversation triage" className="rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-2 text-xs font-semibold"><Sparkles className="size-3.5 text-[var(--ai)]" />AI analysis</div>
      <Badge tone={status === "completed" ? "success" : status === "failed" ? "danger" : "warning"}>{status === "completed" ? "Complete" : status}</Badge>
    </div>
    {result ? <>
      <p className="mt-2 text-sm leading-6">{result.summary}</p>
      <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
        {[
          ["Category", result.category], ["Subcategory", result.subcategory ?? "None identified"],
          ["Language", result.language], ["Intent", result.intent.replaceAll("_", " ")],
          ["Risk", result.riskFlags.join(", ") || "None identified"], ["Impact", result.impact.replaceAll("_", " ")],
          ["Customer blocked", result.customerBlocked ? "Yes" : "No"], ["Route", result.route.replaceAll("_", " ")],
          ["Requested action", result.requestedAction], ["Priority", analysis?.priority ?? "Untriaged"],
        ].map(([label, value]) => <div key={label} className="rounded-md bg-[var(--surface-2)] p-2.5"><dt className="text-[var(--muted-foreground)]">{label}</dt><dd className="mt-1 break-words font-medium">{value}</dd></div>)}
      </dl>
      {result.entities.length ? <div className="mt-2 flex flex-wrap gap-1">{result.entities.map((entity, index) => <Badge key={index}>{entity.type.replaceAll("_", " ")}: {entity.value}</Badge>)}</div> : null}
      <div className="mt-3 text-xs text-[var(--muted-foreground)]"><div className="font-medium">Application priority rules</div><ul className="mt-1 list-disc space-y-1 pl-4">{analysis?.priorityReasons?.map((reason) => <li key={reason}>{reason}</li>)}</ul></div>
    </> : <p className="mt-3 text-xs leading-5 text-[var(--muted-foreground)]">{analysis?.stale ? "New inbound content needs a fresh analysis. Earlier facts and priority are no longer current." : running ? "Extracting structured facts. Priority is computed by application rules." : "This is real provider data. Analysis has not completed on these messages."}</p>}
    <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
      {[ ["Knowledge evidence", "Not generated yet"], ["Answer readiness", "Not evaluated"], ["AI draft", "Not generated"], ["Automation", "Not evaluated"] ].map(([label, value]) => <div key={label} className="rounded-md bg-[var(--surface-2)] p-2.5"><div className="text-[10px] uppercase tracking-[0.08em] text-[var(--muted-foreground)]">{label}</div><div className="mt-1 font-semibold">{value}</div></div>)}
    </div>
    {detail.source === "gmail" ? <div className="mt-3">
      <Button size="sm" onClick={run} disabled={!canAnalyze || running}>{running ? "Analyzing…" : status === "failed" ? "Retry analysis" : status === "completed" ? "Analyze again" : "Analyze conversation"}</Button>
      <p className="mt-2 text-[11px] leading-5 text-[var(--muted-foreground)]">{canAnalyze ? "This action sends the subject and recent inbound message text to OpenAI for triage. It does not send a customer reply." : "Configure OPENAI_API_KEY on the server to enable real triage."}</p>
    </div> : <p className="mt-3 text-xs text-[var(--muted-foreground)]">WhatsApp analysis is not enabled in P2A.</p>}
    {error || analysis?.error ? <p role="alert" className="mt-2 text-xs text-[var(--danger)]">{error || analysis?.error?.message}</p> : null}
    {analysis?.id ? <details className="mt-3 text-[10px] text-[var(--muted-foreground)]"><summary className="cursor-pointer">Analysis provenance</summary><div className="mt-2 break-words leading-5">{analysis.provider} · {analysis.model}<br />{analysis.promptVersion} · {analysis.workflowVersion} · {analysis.priorityPolicyVersion}<br />{analysis.startedAt ? `Started ${new Date(analysis.startedAt).toLocaleString()}` : null}<br />{analysis.finishedAt ? `Finished ${new Date(analysis.finishedAt).toLocaleString()}` : null}{analysis.inputTruncated ? <div>Input was limited to recent message excerpts.</div> : null}</div></details> : null}
  </section>;
}
