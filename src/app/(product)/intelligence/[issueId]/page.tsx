import { notFound } from "next/navigation";
import { IntelligenceIssueWorkspace } from "@/components/intelligence/intelligence-issue-workspace";
import { emergingIssues } from "@/lib/mocks/data";

export default async function IntelligenceIssuePage({ params }: { params: Promise<{ issueId: string }> }) {
  const { issueId } = await params;
  const issue = emergingIssues.find((candidate) => candidate.id === issueId);
  if (!issue) notFound();
  return <IntelligenceIssueWorkspace issue={issue} />;
}
