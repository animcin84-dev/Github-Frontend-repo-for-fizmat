# P2A: persisted Gmail triage

P2A adds an explicit operator action to the existing real Inbox. It does not run
analysis on page load, Gmail sync, WhatsApp webhooks, or an automatic schedule.
The pipeline is:

```text
PostgreSQL Gmail conversation + inbound messages
  → explicit Analyze conversation POST
  → persisted pending → running execution
  → OpenAI structured facts
  → strict server validation
  → deterministic priority rules
  → persisted completed result → existing Inbox
```

Knowledge retrieval, evidence bundles, Answer Readiness, AI drafts, and automation
remain ungenerated/unevaluated. The existing Gmail **Review real send → Send real
email** flow remains a separate human action. WhatsApp transport foundations and
fixture mode remain intact; WhatsApp triage is not enabled in P2A.

## Local configuration

Keep these server-only values in ignored `.env.local`:

```dotenv
SUPPORT_DATA_MODE=database
AI_PROVIDER=openai
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4.1-mini-2025-04-14
```

Supply your own `OPENAI_API_KEY`; there is no substitute provider or fake-result
fallback. Keep the existing database and Gmail OAuth settings. Never use a
`NEXT_PUBLIC_` prefix for provider credentials. Run `npm run db:migrate`, then
restart with `npm run dev:gmail` (binds to `127.0.0.1`).

Open a persisted Gmail conversation in `/inbox`, then select **Analyze
conversation**. This sends the subject and recent normalized inbound text to
OpenAI. It does not transmit attachments or outbound replies. Missing credentials
disable the UI action; direct POST returns HTTP 503 before creating a run or
calling a provider. Provider failures do not turn into successful fixture results.

The single real adapter uses the Responses API with strict JSON-schema output,
`store: false`, a 45-second timeout, and no tools or automatic retries. Its request
format follows [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
and the pinned [GPT-4.1 mini model](https://developers.openai.com/api/docs/models/gpt-4.1-mini).
The small `TriageProvider` interface permits isolated server-test injection; HTTP
clients cannot select a provider, supply extracted facts, or override priority.

## Facts and application priority

The schema requires language, category, nullable subcategory, intent, entities,
risk flags, impact, customer-blocked status, requested action, route, and summary.
Unknown extra fields (including model-selected priority) are rejected. Customer
text is treated as untrusted input, and allegations are not verified account facts.

The ordered application rules are versioned as `triage-priority-v1`:

| Priority | Extracted facts |
| --- | --- |
| Critical | Safety risk, or service-wide impact with customers blocked |
| High | Security risk, or financial risk + duplicate-charge intent + customer blocked |
| Medium | Other financial risk, blocked customer, or multiple customers affected |
| Low | None of the above rules applies |

Every computed priority has persisted, visible rule reasons. A duplicate-charge
complaint that does not say the customer is blocked can truthfully receive Medium;
the provider must not invent blocked status to produce High.

## Persistence and recovery

Migration `0002_conversation_analyses` adds one table, without altering existing
Gmail/WhatsApp messages. Each execution stores status, provider/model selection,
provider response ID, prompt/workflow versions, source hash, selected input-message
IDs, truncation flag, structured result, priority/rule version/reasons, timestamps,
and safe error state. Raw provider errors, prompts, credentials, and customer text
are not copied into logs or error responses.

Input is limited to the latest 20 inbound messages, 6,000 characters per message,
30,000 message characters total, and a 1,000-character subject. Truncation is
recorded. A hash over the entire normalized inbound source detects changes even
outside the selected excerpts. Outbound replies do not invalidate inbound triage.
Changed inbound content immediately hides stale facts/priority and requires a new
explicit analysis. Arrivals during inference also make that result stale.

A partial unique index allows only one pending/running execution per conversation.
Unchanged completed input with the same selected provider/model and prompt/workflow
versions reuses the stored result. Failed runs can be retried explicitly. Pending
or running rows untouched for three minutes become failed on the next read/action;
late workers cannot overwrite that recovered state. Reloading or restarting Next.js
reads the persisted execution from PostgreSQL.

GET `/api/conversations/:id/analysis` reads status without inference. POST
`/api/conversations/:id/analyze` processes only a persisted Gmail conversation in
database mode. The operator action remains subject to the app's existing deployment
access boundary; P2A does not add an authentication system.

## Verification boundary and next acceptance step

Server regressions inject fake providers in a separate disposable PostgreSQL test
database. Adapter tests stub HTTP responses. Fixture E2E and accessibility checks
do not call an LLM. The real adapter rejects all CI calls even when a key is present.

**Real AI acceptance has not run: the local `OPENAI_API_KEY` is missing.** Existing
real Gmail data remains untriaged until it is explicitly processed. Fake-provider
test results are not written into the real mailbox database.

After supplying the key and restarting, select a real Gmail conversation, run
analysis, and verify the structured facts, application-computed priority/reasons,
completed status, and persistence after reload/restart. Confirm that customer
messages remain unchanged and evidence/drafts/automation remain unclaimed. That
real provider acceptance is the next required step before proceeding beyond P2A.
