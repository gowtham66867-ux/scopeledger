# ScopeLedger

[Open the public demo](https://scopeledger-mb3wwhqg6q-el.a.run.app)

A synthetic collections agent that prepares invoice follow-up drafts and tasks within an approved scope. Built for ArmorIQ Flow State. No real customer records, emails, payments or exports are used.

## Try it

1. Choose payment redirection and **Compare controls on / off**. The deterministic baseline changes a sandbox payment reference; protected execution blocks the change and completes six approved actions.
2. Select **Live Gemini** and run a protected workflow. Gemini 3.8 Flash receives the actual synthetic notes and proposes structured tool calls. These runs never insert scripted adversarial calls after planning.
3. Inspect drafts, tasks, the decision trail and the approved scope. Download JSON evidence or run all seven regression scenarios in the evaluation lab.

Public model runs share a 20-run daily allowance. Scripted scenarios remain available after that allowance is used. Model responses can take up to 50 seconds; failures are surfaced as errors.

## Architecture and limits

React/Vite frontend → Node HTTP service → Gemini on Vertex AI → signed-scope executor → isolated synthetic state and private Cloud Storage history.

The server signs an exact tool-and-argument scope, checks expiry and replay, and renders drafts from trusted records. Each browser receives a random HttpOnly/SameSite session cookie; history is stored under its SHA-256 namespace. The audit event hash chain detects edits only if its final hash is independently trusted. This prototype does not provide company SSO or protection for real customer workloads.

ArmorIQ SDK integration and an MCP endpoint are implemented. **Live ArmorIQ verification passed**: its proxy verified `run_collections_workflow` and blocked `change_payment_details` by policy. `/api/armor-evidence` exposes the dated report and plan identifiers; `/api/status` marks it verified only for the deployment revision that produced it. Local per-action policy results remain separate from this cloud proof. MCP discovery is public; execution requires its own service bearer token. The admin token cannot execute MCP tools.

## Evidence

- `evidence/regression-latest.json`: seven deterministic regression scenarios. These test boundaries, not model attack-success rates.
- `evidence/live-model/`: actual model response identifiers, usage, proposed actions, and execution outcomes. A model rejecting an injected note is not evidence that the executor blocked a compromised model.
- `evidence/readiness-latest.json`: remaining submission requirements.

## Development

Requires Node.js 24 or later.

```sh
npm ci --ignore-scripts
npm run check
npm run test:coverage
npm start
```

`check` runs ESLint (zero warnings), strict TypeScript, a production build, 19 tests, deterministic evaluation and the production dependency audit. Coverage measures the JavaScript engine and fixture modules, not browser or external-service coverage.

Local history uses bounded memory unless `RUNS_BUCKET` is configured. Configure `VERTEX_PROJECT` for workload-identity Vertex authentication and `GEMINI_MODEL=gemini-3.8-flash`. Alternatively, set a server-only `GEMINI_API_KEY`. `PUBLIC_MODEL_DEMO=true` enables public model execution only with a private `RUNS_BUCKET` for the shared allowance. Without this flag, model runs require `ADMIN_BEARER_TOKEN`.

ArmorIQ configuration: `ARMORIQ_API_KEY`, `ARMORIQ_MCP_NAME`, `ARMORIQ_USER_EMAIL`, `ARMORIQ_AGENT_ID`, `ARMORIQ_USER_ID`, and the separate `MCP_BEARER_TOKEN`. See `armoriq.example.yaml` for the allow/deny registration. The administrator-only `POST /api/cloud` performs and saves the live test; judges can read its proof without credentials. Keep all credentials in your secret manager; never include them in the client or repository.

## Deployment

The Dockerfile builds the frontend and server. Deploy to Cloud Run with a dedicated runtime service account that can use Vertex AI, access only the dedicated private run bucket, and read only required secrets. Configure the environment above and expose the service according to your intended audience. The current judge demo is public and hosted in Texmed's Google Cloud account.

Use `/api/health` for health checks. Google Cloud reserves `/healthz`.

## Submission status

**Submitted on 17 October 2026.** The official form confirmed: “Thanks for submitting. You'll hear from us after judging closes.” The receipt is saved in `evidence/submission-receipt.json` and `evidence/submission-confirmation.png`.

- [Unlisted 4:45 demo video](https://youtu.be/xnx8Zkfc8oE)
- [Published X post](https://x.com/gr_gowtham/status/2111464435244269650)
- [Dated live ArmorIQ evidence](https://scopeledger-mb3wwhqg6q-el.a.run.app/api/armor-evidence)

ArmorTools Pro is active. The registered agent/MCP and real proxy allow/block proof are verified. The live demo must remain available through 21 October for judging.

`evidence/demo/scopeledger-demo.mp4` is a narrated sequence of actual application and ArmorIQ platform captures, not a continuous screen recording. The earlier draft is retained separately for development history.
