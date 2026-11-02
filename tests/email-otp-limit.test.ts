import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const postMock = vi.hoisted(() => vi.fn());
vi.mock("axios", () => ({ default: { post: postMock } }));

import { emailOtp } from "../src/convex/auth/emailOtp";

type SendParams = { identifier: string; token: string };
type LimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
};
type LimitArgs = {
  key: string;
  capacity: number;
  windowMs: number;
  now: number;
};
type Send = (
  params: SendParams,
  ctx:
    | {
        runMutation: (
          reference: unknown,
          args: LimitArgs,
        ) => Promise<LimitResult>;
      }
    | undefined,
) => Promise<void>;

const send = emailOtp.sendVerificationRequest as unknown as Send;
const params = {
  identifier: "person@example.com",
  token: "123456",
};

beforeEach(() => {
  process.env.VLY_INTEGRATION_KEY = "test-key";
  process.env.VLY_INTEGRATION_BASE_URL = "https://gateway.example";
  postMock.mockReset();
  postMock.mockResolvedValue({ status: 200 });
});

afterEach(() => {
  delete process.env.VLY_INTEGRATION_KEY;
  delete process.env.VLY_INTEGRATION_BASE_URL;
});

function contextWith(
  ...results: LimitResult[]
): { runMutation: ReturnType<typeof vi.fn> } {
  const runMutation = vi.fn();
  for (const result of results) runMutation.mockResolvedValueOnce(result);
  return { runMutation };
}

const allowed = { allowed: true, remaining: 4, retryAfterMs: 0 };
const denied = { allowed: false, remaining: 0, retryAfterMs: 60_000 };

describe("email sign-in code send limits", () => {
  it("debits an address bucket and a global daily bucket before sending", async () => {
    const ctx = contextWith(allowed, allowed);

    await send(params, ctx);

    expect(ctx.runMutation).toHaveBeenCalledTimes(2);
    const first = ctx.runMutation.mock.calls[0][1] as LimitArgs;
    const second = ctx.runMutation.mock.calls[1][1] as LimitArgs;

    expect(first.capacity).toBe(5);
    expect(first.windowMs).toBe(3_600_000);
    expect(first.key).toMatch(/^auth:email:send:[a-f0-9]{64}$/);
    expect(first.key).not.toContain(params.identifier);

    expect(second.capacity).toBe(500);
    expect(second.windowMs).toBe(86_400_000);
    expect(second.key).toBe("auth:email:send:global:day");

    expect(postMock).toHaveBeenCalledWith(
      "https://gateway.example/v1/email/otp",
      { to: params.identifier, otp: params.token },
      { headers: { Authorization: "Bearer test-key" } },
    );
  });

  it("does not send after the per-address limit is reached", async () => {
    const ctx = contextWith(denied);

    await expect(send(params, ctx)).rejects.toThrow(
      "Too many sign-in codes were requested for this email address.",
    );
    expect(postMock).not.toHaveBeenCalled();
  });

  it("does not send after the global daily limit is reached", async () => {
    const ctx = contextWith(allowed, denied);

    await expect(send(params, ctx)).rejects.toThrow(
      "The daily limit for sign-in codes has been reached.",
    );
    expect(postMock).not.toHaveBeenCalled();
  });

  it("fails closed when the Convex context is unavailable", async () => {
    await expect(send(params, undefined)).rejects.toThrow(
      "Sign-in code limits are unavailable, so no code was sent.",
    );
    expect(postMock).not.toHaveBeenCalled();
  });
});
