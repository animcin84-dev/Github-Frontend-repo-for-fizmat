# Phase F2 Gmail demo

Use the existing connected support mailbox and PostgreSQL data. Keep `.env.local`
private and `SUPPORT_DATA_MODE=database`. The redirect URI remains
`http://localhost:3000/api/integrations/gmail/callback`. Gmail uses `gmail.readonly`
and `gmail.send`; Pub/Sub is optional and has not been verified.

## Startup and demonstration

From the repository directory, in two steps:

```sh
docker start support-intelligence-postgres
npm run dev:gmail
```

1. Start the database with the command above. Confirm readiness with
   `docker exec support-intelligence-postgres pg_isready -U support -d support_intelligence`.
2. Start the app with `npm run dev:gmail`. Use one Next.js process.
3. Open `http://localhost:3000/integrations`.
4. Confirm Gmail **Connected**, the intended mailbox, and an idle sync state.
5. Open `http://localhost:3000/inbox`. Check **REAL**, **Gmail**, **Untriaged**,
   and **Analysis pending**.
6. Reuse **Hackathon Gmail E2E Test** where possible. If a fresh demonstration
   needs another message, send one email from a second account with that subject:
   `Hello, I was charged twice for order #10452. Please help me.`
7. Click **Sync now** on Integrations and wait for completion.
8. Open the real conversation and confirm the sender and normalized body.
9. Only when another real reply is wanted, write it, click **Review real send**,
   inspect the recipient and thread, then click **Send real email**. Do not resend
   merely to repeat QA; the existing reply already demonstrates the flow.
10. Confirm the recipient received it in the same Gmail thread.
11. Optionally sync again. The inbound and sent provider IDs must each appear once.
12. Stop Next.js with Ctrl-C, restart with `npm run dev:gmail`, and reload the
    conversation's URL. Connection and messages should persist from PostgreSQL.

The local Gmail command retains the IPv4-first Node options because the user
previously reproduced token-endpoint timeouts under default network-family
selection. During final QA, both configurations reached Google's token endpoint
with HTTP 400 for an intentionally invalid credential-free request. This is a
local transport workaround, not a Gmail product requirement.

`npm run build` uses Next.js's supported Webpack option. The default Turbopack
production build hit a port-binding permission error in this desktop execution
environment. The application architecture is unchanged.

## Safe automated verification

Server data-plane tests truncate tables. Always use a separate disposable database,
such as `support_intelligence_test`; never point them at the connected mailbox's
`support_intelligence` database. Create and migrate the test database first.
This local wrapper explicitly selects the test database without printing credentials:

```sh
node --env-file=.env.local --input-type=module - <<'JS'
import { spawnSync } from 'node:child_process';
const url = new URL(process.env.DATABASE_URL);
if (url.pathname !== '/support_intelligence') throw new Error('Unexpected local database');
url.pathname = '/support_intelligence_test';
process.exit(spawnSync('npm', ['run', 'test:server'], {
  stdio: 'inherit',
  env: { ...process.env, DATABASE_URL: url.toString(), SUPPORT_DATA_MODE: 'mock' },
}).status ?? 1);
JS
```

Stop the real app before `npm run test:e2e` or `npm run test:a11y`. Playwright starts
its own loopback-only mock server, disables Google credentials, and refuses to
reuse an existing server. Database-mode selection regressions use synthetic API
responses. These tests do not prove real Gmail acceptance.

## Security and remaining debt

Application log redaction is regression-tested. Next.js development request
logging excludes the Gmail OAuth callback to avoid logging authorization codes
in its URL. This does not redact browser history, reverse proxies, or historical
logs. Unknown server errors return a generic message instead of SQL parameters.
Credentials, tokens, encryption keys, screenshots, and traces stay out of Git.

The final audit found zero runtime vulnerabilities and nine development-tooling
findings. No non-breaking fix was offered by npm for either affected dependency
chain; the advertised remediation downgraded major versions. No forced audit fix
or unrelated dependency upgrade was applied.

| Package | Severity | Relationship | Scope |
| --- | --- | --- | --- |
| eslint-config-next | High | Direct | Development |
| @next/eslint-plugin-next | High | Transitive | Development |
| fast-glob | High | Transitive | Development |
| micromatch | High | Transitive | Development |
| braces | High | Transitive | Development |
| drizzle-kit | Moderate | Direct | Development |
| @esbuild-kit/esm-loader | Moderate | Transitive | Development |
| @esbuild-kit/core-utils | Moderate | Transitive | Development |
| esbuild | Moderate | Transitive | Development |

Pub/Sub delivery and broader production deployment remain unverified. A Gmail
401 clears the cached access token but currently requires a subsequent read/sync
to retry. The existing React Compiler warning for TanStack Table in AI Quality
is outside F2. Do not begin another product phase or merge main as part of this demo.
