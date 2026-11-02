import { query } from "./_generated/server";
import { AI_ADAPTER_VERSION, AI_MODEL } from "./lib/aiConfig";
import { requireUser } from "./lib/auth";
import { aiKillSwitchEngaged } from "./lib/limits";

/**
 * Availability is a read-only query. It deliberately lives in a V8 module:
 * ai.ts uses the Node runtime for the integration adapter and Node modules
 * cannot export queries.
 */
export const status = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    const configured = Boolean(process.env.VLY_INTEGRATION_KEY);
    const enabled = !aiKillSwitchEngaged();
    return {
      configured,
      enabled,
      model: AI_MODEL,
      adapter: AI_ADAPTER_VERSION,
      checkedAt: Date.now(),
      note: !enabled
        ? "AI interpretation is disabled by the deployment operator (AI_ENABLED=false)."
        : configured
          ? "The deployment has an AI integration key. The model is only called when you press Run AI interpretation, and only minimised metadata text is sent (no image pixels, filenames or exact coordinates)."
          : "No AI integration key is configured for this deployment, so AI commentary is unavailable. Deterministic calculations and validation are unaffected.",
    };
  },
});
