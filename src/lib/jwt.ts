import { randomUUID } from "crypto";
import jwt from "jsonwebtoken";
import type { Role } from "../types/auth";

export interface JwtPayload {
  userId: string;
  orgId: string;
  role: Role;
}

if (!process.env.JWT_ACCESS_SECRET || !process.env.JWT_REFRESH_SECRET) {
  throw new Error("JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be set");
}

// Asserted non-null after the guard above; TypeScript cannot narrow module-scope
// env vars through an if-throw, so we use the non-null assertion operator.
const accessSecret = process.env.JWT_ACCESS_SECRET as string;
const refreshSecret = process.env.JWT_REFRESH_SECRET as string;

const accessTtl = process.env.JWT_ACCESS_TTL ?? "15m";
const refreshTtl = process.env.JWT_REFRESH_TTL ?? "7d";

export function signAccessToken(payload: JwtPayload): string {
  return jwt.sign(payload, accessSecret, { expiresIn: accessTtl } as jwt.SignOptions);
}

export function signRefreshToken(payload: JwtPayload): string {
  // jwtid makes each refresh token unique, so two issued in the same second
  // (e.g. register immediately followed by login) can't collide on the DB's
  // unique `token` column.
  return jwt.sign(payload, refreshSecret, {
    expiresIn: refreshTtl,
    jwtid: randomUUID(),
  } as jwt.SignOptions);
}

export function verifyAccessToken(token: string): JwtPayload {
  return jwt.verify(token, accessSecret) as unknown as JwtPayload;
}

export function verifyRefreshToken(token: string): JwtPayload {
  return jwt.verify(token, refreshSecret) as unknown as JwtPayload;
}
