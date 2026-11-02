"use node";

import { createVlyIntegrations } from "@vly-ai/integrations";
import { v } from "convex/values";

import { internal } from "./_generated/api";
import { action } from "./_generated/server";
import { AI_MODEL } from "./lib/aiConfig";
import { checkAiOutputSafety } from "./lib/aiGuard";
import { buildAiPayload } from "./lib/aiPayload";
import { requireUser } from "./lib/auth";
import {
  aiKillSwitchEngaged,
  enforceAiLimits,
  enforceAiProjectCooldown,
} from "./lib/limits";

/**
 * AI adapter — commentary only.
 *
 * Model: gpt-4o-mini through the deployment's VLY integration gateway.
 * Adapter: @vly-ai/integrations 0.6.14 `ai.completion`.
 *
 * Hard boundaries:
 *  - The model receives minimally redacted catalogue/upload metadata as text.
 *    It never receives image pixels, filenames or exact coordinates.
 *  - The model cannot write validation checks, cannot write calculations, and
 *    its output is stored in a separate field that every screen labels as
 *    model-generated commentary.
 *  - If the model is not configured, fails, or returns unparseable output, the
 *    call reports that state and stores nothing.
 */

const MAX_OUTPUT_TOKENS = 900;

export type AiInterpretResult =
  | { status: "ok"; analysis: StoredAnalysis }
  | {
      status: "blocked" | "unavailable" | "error" | "malformed" | "rejected";
      message: string;
    }
  | { status: "invalid"; message: string };

type StoredAnalysis = {
  status: "succeeded";
  model: string;
  ranAt: number;
  summary: string;
  sections: { title: string; body: string }[];
  limitations: string[];
  credits: number | null;
  error: null;
};

const SYSTEM_PROMPT = [
  "You are a metadata interpretation assistant inside a scientific research tool called Tank Calculator AI.",
  "You receive only catalogue metadata and validation check results for one research record.",
  "",
  "Absolute rules:",
  "1. Never calculate, estimate, guess or state any tank volume, capacity, diameter, height, liquid level, fill percentage or inventory figure. Those come only from the tool's deterministic engine and are not your concern.",
  "2. Never claim that any measurement was taken from imagery.",
  "3. Never state that a satellite image reveals the internal liquid level of a tank.",
  "4. Use only facts present in the input. If a field is missing, say it is not reported. Never invent provider values, dates or identifiers.",
  "5. Mark every statement that depends on assumption as an assumption, and prefer stating limits over speculation.",
  "6. Do not give operational advice about facilities, storage levels or stock changes.",
  "",
  "Reply with JSON only, no prose around it, in exactly this shape:",
  '{"summary": string (max 400 chars), "sections": [{"title": string, "body": string}], "limitations": [string]}',
  "Provide 2 to 4 sections such as: what the provider metadata actually establishes; what this data cannot support; what the user should verify independently.",
].join("\n");

function buildUserPrompt(payload: unknown): string {
  return [
    "Research record metadata (JSON). Everything you may reference is here:",
    JSON.stringify(payload, null, 2),
    "",
    "Explain what this metadata supports and what it does not. Do not produce any numeric result.",
  ].join("\n");
}

function extractJson(content: string): unknown | null {
  const trimmed = content.trim();
  const withoutFence = trimmed
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();
  const start = withoutFence.indexOf("{");
  const end = withoutFence.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(withoutFence.slice(start, end + 1));
  } catch {
    return null;
  }
}

function validateAnalysis(
  value: unknown,
): { summary: string; sections: { title: string; body: string }[]; limitations: string[] } | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  const summary = typeof record.summary === "string" ? record.summary.trim() : "";
  if (!summary) return null;

  const sectionsRaw = Array.isArray(record.sections) ? record.sections : [];
  const sections: { title: string; body: string }[] = [];
  for (const entry of sectionsRaw.slice(0, 6)) {
    if (typeof entry !== "object" || entry === null) continue;
    const section = entry as Record<string, unknown>;
    const title = typeof section.title === "string" ? section.title.trim() : "";
    const body = typeof section.body === "string" ? section.body.trim() : "";
    if (!title || !body) continue;
    sections.push({
      title: title.slice(0, 140),
      body: body.slice(0, 2400),
    });
  }
  if (sections.length === 0) return null;

  const limitations = Array.isArray(record.limitations)
    ? record.limitations
        .filter((entry): entry is string => typeof entry === "string")
        .map((entry) => entry.trim().slice(0, 300))
        .filter((entry) => entry.length > 0)
        .slice(0, 8)
    : [];

  return { summary: summary.slice(0, 800), sections, limitations };
}

export const interpret = action({
  args: { projectId: v.id("researchProjects") },
  handler: async (ctx, args): Promise<AiInterpretResult> => {
    const userId = (await requireUser(ctx))._id;

    if (aiKillSwitchEngaged()) {
      return {
        status: "blocked",
        message:
          "AI is turned off by the operator. Checks and calculations still work.",
      };
    }

    const project = await ctx.runQuery(internal.projects.getOwnedInternal, {
      projectId: args.projectId,
      userId,
    });
    if (!project) {
      return { status: "invalid", message: "Research record not found." };
    }

    const settings = await ctx.runQuery(internal.settings.getInternal, {
      userId,
    });
    if (!settings.aiEnabled) {
      return {
        status: "blocked",
        message:
          "AI is off in Settings → AI and privacy. Checks and calculations still run. Turn it on there if you want commentary.",
      };
    }

    if (!process.env.VLY_INTEGRATION_KEY) {
      return {
        status: "unavailable",
        message:
          "This deployment has no AI key, so commentary cannot run. Nothing was marked as analysed.",
      };
    }

    await enforceAiProjectCooldown(ctx, args.projectId);
    await enforceAiLimits(ctx, userId);

    const payload = buildAiPayload(project);

    const client = createVlyIntegrations({
      deploymentToken: process.env.VLY_INTEGRATION_KEY,
      debug: false,
    });

    try {
      const response = await client.ai.completion({
        model: AI_MODEL,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: buildUserPrompt(payload) },
        ],
        temperature: 0.2,
        maxTokens: MAX_OUTPUT_TOKENS,
      });

      if (!response.success || !response.data) {
        await ctx.runMutation(internal.audit.record, {
          userId,
          action: "analysis.failed",
          detail: `model call failed: ${response.error ?? "unknown error"}`,
        });
        return {
          status: "error",
          message: `The model call failed: ${response.error ?? "unknown error"}. Nothing was saved.`,
        };
      }

      const content = response.data.choices?.[0]?.message?.content ?? "";
      const parsed = extractJson(content);
      const validated = parsed ? validateAnalysis(parsed) : null;

      if (!validated) {
        await ctx.runMutation(internal.audit.record, {
          userId,
          action: "analysis.malformed",
          detail: "model output was not valid analysis JSON",
        });
        return {
          status: "malformed",
          message:
            "The model sent an output with the wrong shape. It was rejected and nothing was saved. Try again.",
        };
      }

      const safety = checkAiOutputSafety(validated);
      if (!safety.ok) {
        await ctx.runMutation(internal.audit.record, {
          userId,
          action: "analysis.rejected",
          detail: `safety filter: ${safety.reason}`,
        });
        return {
          status: "rejected",
          message: `The model output was rejected by the safety filter (${safety.reason}). Nothing was saved.`,
        };
      }

      const analysis: StoredAnalysis = {
        status: "succeeded",
        model: AI_MODEL,
        ranAt: Date.now(),
        summary: validated.summary,
        sections: validated.sections,
        limitations: validated.limitations,
        credits: response.usage?.credits ?? null,
        error: null,
      };

      await ctx.runMutation(internal.projects.setAnalysis, {
        projectId: args.projectId,
        userId,
        analysis,
      });
      await ctx.runMutation(internal.audit.record, {
        userId,
        action: "analysis.completed",
        detail: `${AI_MODEL} commentary stored for ${args.projectId}`,
      });

      return { status: "ok", analysis };
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown error";
      await ctx.runMutation(internal.audit.record, {
        userId,
        action: "analysis.failed",
        detail: `adapter threw: ${message}`,
      });
      return {
        status: "error",
        message: `The AI service failed (${message}). Nothing was saved, and no other result was affected.`,
      };
    }
  },
});
