import { Email } from "@convex-dev/auth/providers/Email";
import axios from "axios";
import { RandomReader, generateRandomString } from "@oslojs/crypto/random";
import { ConvexError } from "convex/values";

import { internal } from "../_generated/api";

export const EMAIL_CODE_ADDRESS_LIMIT = 5;
export const EMAIL_CODE_GLOBAL_DAILY_LIMIT = 500;
const HOUR_MS = 60 * 60 * 1_000;
const DAY_MS = 24 * HOUR_MS;

type EmailOtpContext = {
  runMutation: (
    reference: typeof internal.rateLimits.consume,
    args: {
      key: string;
      capacity: number;
      windowMs: number;
      now: number;
    },
  ) => Promise<{ allowed: boolean; remaining: number; retryAfterMs: number }>;
};

export const emailOtp = Email({
  id: "email-otp",
  maxAge: 60 * 15, // 15 minutes
  // This function can be asynchronous
  async generateVerificationToken() {
    const random: RandomReader = {
      read(bytes: Uint8Array) {
        crypto.getRandomValues(bytes);
      },
    };
    const alphabet = "0123456789";
    return generateRandomString(random, alphabet, 6);
  },
  async sendVerificationRequest(
    { identifier: email, token },
    ctx?: EmailOtpContext,
  ) {
    // Convex Auth passes the action context as a second argument at runtime,
    // but its public Email type does not declare it yet. Fail closed if that
    // changes rather than sending unmetered email.
    if (!ctx) {
      throw new Error(
        "Sign-in code limits are unavailable, so no code was sent.",
      );
    }

    const headers = freebuffEmailOtpHeaders();
    const now = Date.now();
    const addressKey = await emailRateLimitKey(email);

    const address = await ctx.runMutation(internal.rateLimits.consume, {
      key: addressKey,
      capacity: EMAIL_CODE_ADDRESS_LIMIT,
      windowMs: HOUR_MS,
      now,
    });
    if (!address.allowed) {
      throw new ConvexError(
        "Too many sign-in codes were requested for this email address.",
      );
    }

    const global = await ctx.runMutation(internal.rateLimits.consume, {
      key: "auth:email:send:global:day",
      capacity: EMAIL_CODE_GLOBAL_DAILY_LIMIT,
      windowMs: DAY_MS,
      now,
    });
    if (!global.allowed) {
      throw new ConvexError(
        "The daily limit for sign-in codes has been reached.",
      );
    }

    try {
      await axios.post(
        freebuffEmailOtpUrl(),
        { to: email, otp: token },
        { headers },
      );
    } catch (error) {
      throw freebuffEmailOtpError(error);
    }
  },
});

// Store only a one-way digest of the address in the rate-limit row.
async function emailRateLimitKey(email: string): Promise<string> {
  const bytes = new TextEncoder().encode(email.trim().toLowerCase());
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hash = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return `auth:email:send:${hash}`;
}

// Sign-in codes are sent by the Freebuff integrations gateway, which knows
// this project by its own key: VLY_INTEGRATION_KEY, a Convex environment
// variable set when the project was created. The email's wording is fixed by
// the gateway.
function freebuffEmailOtpUrl(): string {
  const base =
    process.env.VLY_INTEGRATION_BASE_URL || "https://integrations.vly.ai";
  return `${base.replace(/\/+$/, "")}/v1/email/otp`;
}

function freebuffEmailOtpHeaders(): Record<string, string> {
  const key = process.env.VLY_INTEGRATION_KEY;
  if (!key) {
    throw new Error(
      "VLY_INTEGRATION_KEY is not set on this Convex deployment, so email sign-in cannot send codes.",
    );
  }
  return { Authorization: `Bearer ${key}` };
}

// Never stringify the whole request error: it carries the request headers.
function freebuffEmailOtpError(error: unknown): Error {
  const response = (
    error as { response?: { status?: number; data?: { error?: unknown } } }
  )?.response;
  if (response) {
    const detail =
      typeof response.data?.error === "string" ? `: ${response.data.error}` : "";
    return new Error(
      `Could not send the sign-in code (HTTP ${response.status})${detail}`,
    );
  }
  const message = error instanceof Error ? error.message : String(error);
  return new Error(`Could not send the sign-in code: ${message}`);
}
