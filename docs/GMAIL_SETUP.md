# Gmail connector setup — Phase F2

Phase F2 uses a **dedicated support mailbox** and server-side OAuth. It does not ingest a personal mailbox by default and it does not enable autonomous AI actions.

## 1. Google Cloud project

1. Create or select a Google Cloud project used for the development/demo environment.
2. Enable **Gmail API**.
3. Configure the OAuth consent screen.
4. During development, keep the OAuth app in testing and add the dedicated mailbox as a **test user**.
5. Create an **OAuth 2.0 Web application** client.

## 2. Redirect URI

Configure the exact redirect URI used by the deployment. For local development:

```text
http://localhost:3000/api/integrations/gmail/callback
```

Set the same value in:

```text
GOOGLE_REDIRECT_URI
```

## 3. Scopes requested

The connector requests only:

```text
https://www.googleapis.com/auth/gmail.readonly
https://www.googleapis.com/auth/gmail.send
```

`gmail.readonly` is a **restricted** Gmail scope. `gmail.send` is a **sensitive** scope. The broad `https://mail.google.com/` scope is intentionally not requested.

This development implementation must not be presented as a public SaaS OAuth launch. See `docs/GMAIL_OAUTH_PRODUCTION_REQUIREMENTS.md`.

## 4. Environment

Copy `.env.example` to a local ignored environment file and set:

```text
DATABASE_URL
SUPPORT_DATA_MODE=database
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
GOOGLE_REDIRECT_URI
GMAIL_TOKEN_ENCRYPTION_KEY
GMAIL_OAUTH_STATE_SECRET
```

Generate `GMAIL_TOKEN_ENCRYPTION_KEY` as 32 random bytes encoded as Base64 or 64 hex characters. Keep it stable for a database because existing refresh tokens cannot be decrypted after rotation without a migration/re-encryption plan.

Never commit the real values.

## 5. Database

Run:

```bash
npm ci
npm run db:check
npm run db:migrate
```

The application uses PostgreSQL through `DATABASE_URL` and Drizzle ORM. No table is created at application startup.

## 6. Dedicated mailbox / backfill

Default development query:

```text
in:inbox newer_than:30d
```

Override with:

```text
GMAIL_SYNC_QUERY
GMAIL_BACKFILL_DAYS
GMAIL_SYNC_MAX_THREADS
```

The initial synchronization follows Gmail pagination until completion or the configured explicit thread limit. Gmail messages are fetched with `format=full`: inline text/HTML and attachment metadata are normalized, but the connector does not call `messages.attachments.get` during ingestion and does not store attachment binary blobs in PostgreSQL. The product reports counts **after fetching**; it does not invent an exact preview count when Gmail does not provide one cheaply.

## 7. Connect

1. Start the app with `SUPPORT_DATA_MODE=database`.
2. Open `/integrations`.
3. Click **Connect Gmail**.
4. Complete Google consent.
5. The callback validates the signed, time-limited OAuth state.
6. The server exchanges the authorization code.
7. The refresh token is encrypted with AES-256-GCM and stored server-side.
8. Initial synchronization runs.
9. Open `/inbox` and verify the Gmail marker and **Untriaged / Analysis pending** state.

## 8. Manual synchronization

`Sync now` performs history-based incremental synchronization after the initial cursor exists. If Gmail returns HTTP 404 for an expired history cursor, the service records recovery and performs a controlled bounded full/recent resync. Provider message IDs and thread IDs keep the recovery idempotent.

## 9. Manual reply

A real reply requires an operator to:

1. open a real Gmail conversation;
2. type the reply;
3. click **Review real send**;
4. review the destination and Gmail thread;
5. click **Send real email**.

The server sends through Gmail with the existing `threadId`, matching subject, `In-Reply-To`, and `References`. The outbound operation has a unique client idempotency key.

Phase E automation actions remain mock/simulation actions.
