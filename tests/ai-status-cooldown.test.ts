import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "../src/convex/_generated/api";
import schema from "../src/convex/schema";

const { completionMock } = vi.hoisted(() => ({
  completionMock: vi.fn(),
}));

vi.mock("@vly-ai/integrations", () => ({
  createVlyIntegrations: () => ({
    ai: { completion: completionMock },
  }),
}));

const modules = import.meta.glob("../src/convex/**/*.ts");

function testBackend() {
  return convexTest(schema, modules);
}

type Backend = ReturnType<typeof testBackend>;

async function seedUser(t: Backend, email: string) {
  return await t.run(async (ctx) => {
    return await ctx.db.insert("users", { email });
  });
}

function identity(userId: string) {
  return {
    subject: `${userId}|test-session`,
    issuer: "https://convex.test",
    tokenIdentifier: `https://convex.test|${userId}|test-session`,
  };
}

async function seedProject(t: Backend, userId: string) {
  return await t.run(async (ctx) => {
    return await ctx.db.insert("researchProjects", {
      userId: userId as never,
      title: "Cooldown record",
      source: "upload",
      location: null,
      requestedDate: "2024-06-28",
      dateMatch: "upload",
      scene: null,
      upload: null,
      checks: [],
      analysis: null,
      createdAt: 1,
      updatedAt: 1,
    });
  });
}

const CLEAN_ANALYSIS = JSON.stringify({
  summary:
    "The catalogue metadata records a provider collection and acquisition time.",
  sections: [
    {
      title: "Metadata",
      body: "The provider supplied the scene metadata shown in the record.",
    },
  ],
  limitations: ["No liquid level can be inferred from an external image."],
});

afterEach(() => {
  vi.unstubAllEnvs();
  completionMock.mockReset();
});

beforeEach(() => {
  vi.stubEnv("VLY_INTEGRATION_KEY", "test-integration-key");
  vi.stubEnv("AI_ENABLED", "true");
  completionMock.mockResolvedValue({
    success: true,
    data: { choices: [{ message: { content: CLEAN_ANALYSIS } }] },
    usage: { credits: 1 },
  });
});

describe("AI status query and project cooldown", () => {
  it("reports status as an authenticated query", async () => {
    const t = testBackend();
    const userId = await seedUser(t, "ai-status@test.dev");
    const asUser = t.withIdentity(identity(userId));

    const status = await asUser.query(api.aiStatus.status, {});
    expect(status.configured).toBe(true);
    expect(status.model).toBe("gpt-4o-mini");
    await expect(t.query(api.aiStatus.status, {})).rejects.toThrow(/sign in/i);
  });

  it("allows one model call per project per 60 seconds", async () => {
    vi.useFakeTimers();
    try {
      const t = testBackend();
      const userId = await seedUser(t, "cooldown@test.dev");
      const projectId = await seedProject(t, userId);
      const asUser = t.withIdentity(identity(userId));

      const first = await asUser.action(api.ai.interpret, { projectId });
      expect(first.status).toBe("ok");
      expect(completionMock).toHaveBeenCalledTimes(1);

      await expect(
        asUser.action(api.ai.interpret, { projectId }),
      ).rejects.toThrow(/rate limit reached/i);
      expect(completionMock).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects unsafe model output without storing commentary", async () => {
    completionMock.mockResolvedValue({
      success: true,
      data: {
        choices: [
          {
            message: {
              content: JSON.stringify({
                summary: "The tank is 70% full.",
                sections: [
                  {
                    title: "Observation",
                    body: "Internal liquid level is approximately 4.2 m.",
                  },
                ],
                limitations: [],
              }),
            },
          },
        ],
      },
      usage: { credits: 1 },
    });

    const t = testBackend();
    const userId = await seedUser(t, "unsafe@test.dev");
    const projectId = await seedProject(t, userId);
    const asUser = t.withIdentity(identity(userId));

    const result = await asUser.action(api.ai.interpret, { projectId });
    expect(result.status).toBe("rejected");
    const stored = await asUser.query(api.projects.get, { id: projectId });
    expect(stored?.analysis).toBeNull();
  });
});
