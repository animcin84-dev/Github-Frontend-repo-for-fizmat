# P1 WhatsApp Cloud API foundations

Starting point: accepted Gmail F2 commit `50517002627b359325b6eb8e91681c57c4a5c99a`.
P1 uses the existing PostgreSQL tables and unified Inbox. Gmail remains the email
adapter; Meta payloads remain inside the WhatsApp adapter. No autonomous actions,
AI/RAG, media downloads, or WhatsApp outbound Graph requests are implemented here.

## Small implementation commits

1. Shared normalized email/phone contacts, provider-aware persistence and Inbox
   mapping, concurrent conversation upsert, nullable integration email migration.
2. Official text webhook parsing, GET challenge, POST exact-byte HMAC verification,
   account filtering, durable message dedupe, synthetic contract/database tests.
3. Setup status in the existing Integrations page, environment contract, browser
   regressions and these setup notes.

## User-owned configuration

Keep real values in ignored `.env.local` or server secret storage:

```dotenv
SUPPORT_DATA_MODE=database
DATABASE_URL=<existing PostgreSQL URL>
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_WABA_ID=
WHATSAPP_WEBHOOK_VERIFY_TOKEN=
META_APP_SECRET=
WHATSAPP_API_VERSION=
```

The access token, phone number ID, WABA ID and app secret come from the user's Meta
app/business setup. Choose a strong verification token locally and enter the same
value in Meta webhook configuration. `META_APP_SECRET` is the HMAC key; it is
different from the verification token. API version has one centralized setting;
no Graph request uses it yet. Select an officially supported version when the
send adapter is implemented. Never commit credentials or log token values.

Run `npm run db:check` and `npm run db:migrate` with `DATABASE_URL` configured.
Migration `0001` only drops the required-email constraint on integration accounts.
Existing Gmail rows, encrypted tokens, indexes, and provider IDs are preserved.
No fake account is created when credentials are merely present or GET succeeds.

## Webhook setup

Register this exact callback path on a publicly reachable HTTPS host:

```text
https://<public-host>/api/integrations/whatsapp/webhook
```

Configure the matching verification token and subscribe the intended WhatsApp
Business Account to message webhooks in Meta. Local preview stays on
`127.0.0.1`; this task does not create a public tunnel or deploy the app.

GET accepts `hub.mode=subscribe`, the matching `hub.verify_token`, and a bounded
`hub.challenge`, returning the challenge as plain text. Request logging excludes
this path to prevent verification tokens from appearing in local request logs.

POST requires database mode, `META_APP_SECRET`, phone number ID and WABA ID. It
fails closed with 503 when ingestion settings are missing, 403 for missing or
invalid `X-Hub-Signature-256`, 400 for malformed supported payloads, and 413 above
1 MiB. Signature verification covers raw bytes before JSON parsing. Verification
token and access token are not substitutes for the app secret.

Only inbound text messages for the configured WABA/phone number ID are ingested.
Valid signed events for other accounts and unsupported media/status events are
acknowledged with ignored counts, without creating an account or downloading
media. Customer text stays literal/untrusted and renders as escaped text.
Replies are never triggered by a webhook.

Conversation identity is scoped by integration account and sender phone digits;
message identity is scoped by integration account and provider message ID.
Transactional upserts serialize concurrent deliveries. Partial batch failure
returns an error, so Meta can retry; earlier durable messages dedupe on retry.
The legacy database `provider_thread_id` stores the canonical provider
conversation ID for either provider; it does not imply a Gmail-only thread.

## Status and tests

The WhatsApp status endpoint exposes presence flags, missing variable names and
stored inbound counts, never credential values. Configured means settings are
present. Inbound received means messages exist in PostgreSQL. Neither means
end-to-end acceptance passed. `connected=false`, `replyEnabled=false` and
`realAcceptance=not_verified` remain explicit at this foundation stage.

New Inbox messages show WhatsApp provenance, Untriaged and Analysis pending.
WhatsApp details have no mock AI evidence or simulated send controls. Gmail keeps
its explicit real-send review flow. The existing outbound-operation model remains
available for the future WhatsApp sender; no fake sent row is created now.

Server/database and browser tests use synthetic Meta payloads. Database tests
truncate their database: use a separate `support_intelligence_test` database
locally, never the preserved Gmail demo database. CI uses its disposable service
database. Browser tests clear Google/Meta credential variables and use mock mode
or explicitly intercepted synthetic responses. They are not real phone tests.

Official protocol references:
[Meta webhook example](https://github.com/fbsamples/whatsapp-api-examples/tree/main/receive-webhook-js),
[Meta signature example](https://github.com/fbsamples/whatsapp-api-examples/tree/main/signature-validation-with-webhooks-payloads),
[Meta payload reference](https://www.postman.com/meta/whatsapp-business-platform/folder/tduohwq/webhook-payload-reference).

## Remaining real acceptance

1. Supply the Meta settings and public HTTPS callback; complete Meta verification
   and message subscription with the intended business phone number.
2. Send an actual phone text; verify provider IDs/body/direction, PostgreSQL rows,
   existing Inbox display and dedupe after redelivery.
3. Implement the official manual WhatsApp send adapter with explicit human review,
   account/recipient checks and outbound-operation reconciliation.
4. Send from the Inbox to the same real customer phone; verify delivery on that
   phone, provider IDs, no duplicate sends and persistence after restart.
5. Rerun Gmail regressions and all quality gates before merge consideration.

**REAL WHATSAPP TEST NOT RUN.** Credential/public-webhook setup and the real
manual reply path remain pending. Stop here until the user supplies the setup.
