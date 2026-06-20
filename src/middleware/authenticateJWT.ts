import type { Request, Response, NextFunction } from "express";
import { verifyAccessToken } from "../lib/jwt";
import { AppError } from "../lib/errors";

// Verifies the Bearer access token and attaches { userId, orgId, role } to req.user.
export function authenticateJWT(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    throw new AppError(401, "Missing or invalid Authorization header");
  }
  const token = header.slice("Bearer ".length);
  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch {
    throw new AppError(401, "Invalid or expired token");
  }
  req.user = { userId: payload.userId, orgId: payload.orgId, role: payload.role };
  next();
}
