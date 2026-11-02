import { cronJobs } from "convex/server";

import { internal } from "./_generated/api";

const crons = cronJobs();

// Nominatim's policy asks for caching and low request volume. Purge successful
// lookups after 30 days and keep stale failure rows from accumulating.
crons.daily(
  "purge geocode cache",
  { hourUTC: 3, minuteUTC: 15 },
  internal.geocoding.purgeExpired,
  {},
);

crons.hourly(
  "purge unfinalised uploads",
  { minuteUTC: 20 },
  internal.files.purgeUnfinalisedUploads,
  {},
);

export default crons;
