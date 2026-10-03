# Gmail push / Cloud Pub/Sub setup

Push is optional in Phase F2. Manual incremental synchronization remains supported when Pub/Sub is not configured.

Architecture:

```text
Gmail users.watch
  -> Cloud Pub/Sub topic
  -> push subscription
  -> /api/integrations/gmail/webhook
  -> decode { emailAddress, historyId }
  -> users.history.list
  -> idempotent persistence
```

A push message is only a **trigger**. It does not contain the email body and it never directly executes an outbound action.

## Topic

1. Create a Cloud Pub/Sub topic.
2. Set its full resource name in:

```text
GMAIL_PUBSUB_TOPIC=projects/PROJECT_ID/topics/TOPIC
```

3. Grant Pub/Sub publisher permission on the topic to:

```text
gmail-api-push@system.gserviceaccount.com
```

## Push subscription

Create a push subscription whose endpoint is:

```text
https://YOUR_HOST/api/integrations/gmail/webhook
```

For production-shaped deployments, configure authenticated push with an OIDC service account and set:

```text
GMAIL_PUBSUB_AUDIENCE=
GMAIL_PUBSUB_SERVICE_ACCOUNT_EMAIL=
```

When an audience is configured, the webhook requires a Bearer ID token and verifies it with Google token information, including audience, expiry, verified email, and the configured service-account email when supplied.

Without authenticated push configuration, Phase F2 still validates the Pub/Sub envelope, Base64URL payload, email/history shape, connected mailbox mapping, and notification message-id deduplication. Treat that configuration as development-only.

## Watch

From `/integrations`, click **Renew watch**, or call:

```text
POST /api/integrations/gmail/watch
```

The response history ID and expiration are persisted. Gmail requires watch renewal at least every 7 days and recommends renewing daily. Phase F2 exposes an executable endpoint but does not invent a scheduler before a deployment platform is selected.

Recommended production schedule:

```text
daily -> POST/execute renewGmailWatch()
```

## Reliability

Gmail documents that rare push notifications can be delayed or dropped. Therefore:

```text
Push = trigger
Gmail history = incremental source of truth
```

Keep a periodic/manual reconciliation path even after push is enabled. The implementation also deduplicates Pub/Sub `messageId` and uses an integration-level synchronization lock so push and manual sync cannot process the same Gmail account concurrently.

## Rate behavior

Gmail documents a maximum notification rate per watched user. Do not create a webhook/send loop. The webhook only synchronizes Gmail history and never sends an email or invokes Phase E external actions.
