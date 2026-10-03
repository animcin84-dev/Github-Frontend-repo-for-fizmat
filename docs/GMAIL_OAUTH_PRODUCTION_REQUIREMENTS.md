# Gmail OAuth production requirements

This document records the compliance boundary for Phase F2. It is not a claim that the connector is ready for unrestricted public OAuth distribution.

## Requested scopes

- `gmail.readonly` — restricted Gmail scope used to read support threads/messages.
- `gmail.send` — sensitive scope used only for explicit human replies.

The connector intentionally does **not** request `https://mail.google.com/` or permanent-delete capability.

## Verification implications

Google classifies `gmail.readonly` as restricted. A public application that requests restricted Gmail data generally requires OAuth verification. If restricted-scope data is stored or transmitted through servers, additional restricted-scope/security-assessment requirements can apply.

Phase F2 target:

- development;
- demo;
- OAuth test users;
- dedicated support mailbox.

Before public production launch, verify the then-current Google API Services User Data Policy, sensitive/restricted scope verification requirements, privacy policy/terms requirements, data retention/deletion controls, and any required independent security assessment.

## Server-side storage

Refresh tokens are:

- never returned by the product API;
- never stored in localStorage or React state;
- encrypted application-side with AES-256-GCM before PostgreSQL persistence;
- removed from local storage on disconnect.

The encryption key comes only from `GMAIL_TOKEN_ENCRYPTION_KEY`.

## Production TODO

- Complete OAuth verification for the final production app identity.
- Complete any required restricted-scope security assessment.
- Establish encryption-key rotation and recovery procedure.
- Establish customer data retention/deletion policy.
- Configure authenticated Pub/Sub push and verify the OIDC audience/service account.
- Select a production scheduler and call the Gmail watch-renewal endpoint daily.
- Add production monitoring for OAuth revocation, Gmail quotas, sync lag, and webhook failures.
