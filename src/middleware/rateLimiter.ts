import rateLimit from "express-rate-limit";

// 100 requests / 15 min per IP (spec §9). Disabled under test so the suite's many
// requests from a single IP don't trip the limit.
export const rateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === "test",
});
