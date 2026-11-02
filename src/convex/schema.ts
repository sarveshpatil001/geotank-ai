import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { Infer, v } from "convex/values";

import {
  calculationFields,
  locationValidator,
  researchProjectFields,
} from "./validators";

// default user roles. can add / remove based on the project as needed
export const ROLES = {
  ADMIN: "admin",
  USER: "user",
  MEMBER: "member",
} as const;

export const roleValidator = v.union(
  v.literal(ROLES.ADMIN),
  v.literal(ROLES.USER),
  v.literal(ROLES.MEMBER),
);
export type Role = Infer<typeof roleValidator>;

const schema = defineSchema(
  {
    // default auth tables using convex auth.
    ...authTables, // do not remove or modify

    // the users table is the default users table that is brought in by the authTables
    users: defineTable({
      name: v.optional(v.string()), // name of the user. do not remove
      image: v.optional(v.string()), // image of the user. do not remove
      email: v.optional(v.string()), // email of the user. do not remove
      emailVerificationTime: v.optional(v.number()), // email verification time. do not remove
      isAnonymous: v.optional(v.boolean()), // is the user anonymous. do not remove

      role: v.optional(roleValidator), // role of the user. do not remove
    }).index("email", ["email"]), // index for the email. do not remove or modify

    researchProjects: defineTable(researchProjectFields)
      .index("by_user", ["userId"])
      .index("by_user_created", ["userId", "createdAt"])
      .index("by_upload_storage", ["uploadStorageId"]),

    // Upload URLs are issued before a storage id exists. registerUpload records
    // the id and the hourly cron removes rows (and their blobs) that were never
    // finalised into a research record.
    pendingUploads: defineTable({
      userId: v.id("users"),
      storageId: v.string(),
      filename: v.string(),
      contentType: v.string(),
      sizeBytes: v.number(),
      createdAt: v.number(),
    })
      .index("by_storage", ["storageId"])
      .index("by_user", ["userId"])
      .index("by_created", ["createdAt"]),

    calculations: defineTable(calculationFields)
      .index("by_user", ["userId"])
      .index("by_user_created", ["userId", "createdAt"])
      .index("by_project", ["projectId"]),

    userSettings: defineTable({
      userId: v.id("users"),
      aiEnabled: v.boolean(),
      updatedAt: v.number(),
    }).index("by_user", ["userId"]),

    auditLog: defineTable({
      userId: v.id("users"),
      action: v.string(),
      detail: v.string(),
      at: v.number(),
    }).index("by_user_at", ["userId", "at"]),

    geocodeCache: defineTable({
      key: v.string(),
      payload: v.object({
        candidates: v.array(locationValidator),
        mode: v.union(v.literal("geocoder"), v.literal("coordinates")),
        rawQuery: v.string(),
      }),
      fetchedAt: v.number(),
    })
      .index("by_key", ["key"])
      .index("by_fetched_at", ["fetchedAt"]),

    geocodeFailures: defineTable({
      key: v.string(),
      kind: v.string(),
      message: v.string(),
      at: v.number(),
    })
      .index("by_key", ["key"])
      .index("by_at", ["at"]),

    // Token buckets are keyed per user/action or per global service. Rows are
    // small and reused in place; no raw query text or credentials are stored.
    rateLimits: defineTable({
      key: v.string(),
      tokens: v.number(),
      updatedAt: v.number(),
    }).index("by_key", ["key"]),
  },
  {
    schemaValidation: true,
  },
);

export default schema;
