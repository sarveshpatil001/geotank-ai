# VLY integration (AI commentary)

This project uses the deployment's `@vly-ai/integrations` gateway only for
optional metadata commentary. The deterministic engine, catalogue search,
validation and reports never depend on it.

## Environment variables

Server-side only:

- `VLY_INTEGRATION_KEY` — integration key. Missing means AI is reported as
  unavailable; the rest of the app still works.
- `VLY_INTEGRATION_BASE_URL` — optional gateway base URL; the email-OTP helper
  defaults to `https://integrations.vly.ai`.

Optional controls:

- `AI_ENABLED=false` — hard kill switch; `ai.interpret` returns `blocked`.
- `AI_DAILY_CAP` — positive integer daily per-user cap (default 100).

Never expose `VLY_INTEGRATION_KEY` through a `VITE_*` variable or any client
component.

## Actual usage

`src/convex/ai.ts` is a Node-runtime Convex action:

```typescript
"use node";

import { createVlyIntegrations } from "@vly-ai/integrations";
import { action } from "./_generated/server";

export const interpret = action({
  args: { projectId: v.id("researchProjects") },
  handler: async (ctx, args) => {
    const client = createVlyIntegrations({
      deploymentToken: process.env.VLY_INTEGRATION_KEY,
      debug: false,
    });

    const response = await client.ai.completion({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildUserPrompt(payload) },
      ],
      temperature: 0.2,
      maxTokens: 900,
    });
  },
});
```

Do not copy the illustrative snippet literally: ownership checks,
`AI_ENABLED`, rate limits, the per-project cooldown, JSON validation and the
scientific output filter are part of the real handler.

## Data sent

The prompt contains minimised catalogue/upload metadata only:

- no image pixels;
- no filename;
- no exact coordinates (coordinate-sourced locations become
  `user-entered coordinates (withheld)`);
- geocoder labels are reduced to their last two comma-separated components.

## Output handling

The model must return the structured JSON shape documented in `ai.ts`. The
server rejects malformed output and then applies `checkAiOutputSafety`:

- numbers carrying volume, length or percentage units are rejected;
- affirmative liquid-level, fill or inventory claims are rejected, while
  explicit negative limitations are allowed.

Rejected output is never stored; the record keeps its previous analysis and the
UI reports the rejection. Output is commentary, not evidence, and cannot add,
remove or upgrade validation checks or calculations.

## Availability

`api.aiStatus.status` is a reactive query used by Settings and the project
viewer. It reports whether a key is configured and whether the operator kill
switch is engaged, without calling the model. The action `api.ai.interpret` is
the only path that spends credits.

## Error handling

The adapter returns an `ApiResponse`-shaped result. The app distinguishes:

- `unavailable` — no integration key;
- `blocked` — kill switch or user setting;
- `malformed` / `rejected` — schema or safety failure, nothing stored;
- `error` — gateway failure, nothing stored.

All failures are recorded as audit actions without prompt text or credentials.
