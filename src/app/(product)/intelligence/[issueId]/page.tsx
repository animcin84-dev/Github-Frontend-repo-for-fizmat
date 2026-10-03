import { notFound } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, ArrowRight, CircleDot, GitCommitHorizontal, MessageSquareText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Surface } from "@/components/ui/surface";
import { emergingIssues } from "@/lib/mocks/data";

export default async function IntelligenceIssuePage({ params }: { params: Promise<{ issueId: string }> }) {
  const { issueId } = await params;
  const issue = emergingIssues.find((candidate) => candidate.id === issueId);
  if (!issue) notFound();

  return (
    <div className="si-page mx-auto max-w-[1320px]">
      <div className="mb-4">
        <Link href="/intelligence" className="inline-flex items-center gap-1 text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)]">
          <ArrowLeft className="size-3.5" /> Intelligence
        </Link>
      </div>
      <div className="si-page-header">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2"><Badge tone="warning">{issue.status}</Badge><Badge>{issue.severity}</Badge></div>
          <h1 className="si-page-title">{issue.title}</h1>
          <p className="si-page-subtitle max-w-3xl">{issue.summary}</p>
        </div>
      </div>

      <Surface className="mb-4 border-[color-mix(in_srgb,var(--warning)_35%,var(--border))] p-4">
        <div className="flex items-start gap-3"><AlertTriangle className="mt-0.5 size-4 shrink-0 text-[var(--warning)]" /><div><div className="text-sm font-semibold">Observed pattern, not confirmed root cause</div><p className="mt-1 text-xs leading-5 text-[var(--muted-foreground)]">The signal is based on support-conversation velocity and representative evidence. Correlations below remain hypotheses until product or incident telemetry confirms them.</p></div></div>
      </Surface>

      <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
        <div className="space-y-4">
          <Surface className="p-4">
            <h2 className="text-sm font-semibold">Evidence summary</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <div><div className="text-xs text-[var(--muted-foreground)]">Conversations</div><div className="mt-1 text-2xl font-semibold">{issue.conversationCount}</div></div>
              <div><div className="text-xs text-[var(--muted-foreground)]">Unique customers</div><div className="mt-1 text-2xl font-semibold">{issue.uniqueCustomerCount}</div></div>
              <div><div className="text-xs text-[var(--muted-foreground)]">Velocity change</div><div className="mt-1 text-2xl font-semibold text-[var(--warning)]">+{issue.growthPercent}%</div></div>
            </div>
          </Surface>

          <Surface className="p-4">
            <div className="flex items-center gap-2"><MessageSquareText className="size-4 text-[var(--info)]" /><h2 className="text-sm font-semibold">Representative conversations</h2></div>
            <div className="mt-3 divide-y divide-[var(--border)]">
              {issue.representativeConversationIds.map((id) => (
                <Link key={id} href={`/inbox/${id}`} className="flex items-center gap-3 py-3 text-xs hover:text-[var(--accent)]">
                  <CircleDot className="size-3.5 text-[var(--muted-foreground)]" /><span className="font-medium">{id}</span><span className="ml-auto text-[var(--muted-foreground)]">Open evidence</span><ArrowRight className="size-3.5" />
                </Link>
              ))}
            </div>
          </Surface>
        </div>

        <Surface className="p-4">
          <div className="flex items-center gap-2"><GitCommitHorizontal className="size-4 text-[var(--ai)]" /><h2 className="text-sm font-semibold">Correlation candidates</h2></div>
          <div className="mt-3 space-y-3">
            {issue.correlationCandidates.map((candidate) => (
              <div key={candidate.label} className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] p-3">
                <div className="flex items-center justify-between gap-3"><span className="text-xs font-semibold">{candidate.label}</span><Badge tone={candidate.strength === "strong" ? "warning" : "neutral"}>{candidate.strength}</Badge></div>
                <p className="mt-2 text-[11px] leading-4 text-[var(--muted-foreground)]">{candidate.disclaimer}</p>
              </div>
            ))}
          </div>
        </Surface>
      </div>
    </div>
  );
}
