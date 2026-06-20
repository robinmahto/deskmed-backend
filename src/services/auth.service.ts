import { prisma, Prisma } from "../lib/prisma";
import type { User } from "../lib/prisma";
import { hashPassword, verifyPassword } from "../lib/bcrypt";
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  type JwtPayload,
} from "../lib/jwt";
import { AppError } from "../lib/errors";

const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7d (spec §9)

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return base || "clinic";
}

function publicUser(u: User) {
  return {
    id: u.id,
    organizationId: u.organizationId,
    name: u.name,
    email: u.email,
    role: u.role,
    isActive: u.isActive,
    createdAt: u.createdAt,
  };
}

async function persistRefreshToken(userId: string, token: string): Promise<void> {
  await prisma.refreshToken.create({
    data: { userId, token, expiresAt: new Date(Date.now() + REFRESH_TTL_MS) },
  });
}

export async function register(input: {
  clinicName: string;
  name: string;
  email: string;
  password: string;
}) {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) {
    throw new AppError(409, "Email already registered");
  }

  const passwordHash = await hashPassword(input.password);
  const slug = `${slugify(input.clinicName)}-${Math.random().toString(36).slice(2, 7)}`;

  const result = await prisma
    .$transaction(async (tx) => {
      const org = await tx.organization.create({
        data: { name: input.clinicName, slug },
      });
      const user = await tx.user.create({
        data: {
          organizationId: org.id,
          name: input.name,
          email: input.email,
          passwordHash,
          role: "ADMIN",
        },
      });
      return { org, user };
    })
    .catch((e: unknown) => {
      // Race between the pre-check above and the unique constraint → clean 409.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        throw new AppError(409, "Email already registered");
      }
      throw e;
    });

  const payload: JwtPayload = {
    userId: result.user.id,
    orgId: result.org.id,
    role: result.user.role,
  };
  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(payload);
  await persistRefreshToken(result.user.id, refreshToken);

  return { user: publicUser(result.user), accessToken, refreshToken };
}

export async function login(input: { email: string; password: string }) {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  if (!user || !user.isActive) {
    throw new AppError(401, "Invalid email or password");
  }
  const ok = await verifyPassword(input.password, user.passwordHash);
  if (!ok) {
    throw new AppError(401, "Invalid email or password");
  }

  const payload: JwtPayload = {
    userId: user.id,
    orgId: user.organizationId,
    role: user.role,
  };
  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(payload);
  await persistRefreshToken(user.id, refreshToken);

  return { user: publicUser(user), accessToken, refreshToken };
}

export async function refresh(input: { refreshToken: string }) {
  try {
    verifyRefreshToken(input.refreshToken);
  } catch {
    throw new AppError(401, "Invalid refresh token");
  }

  const stored = await prisma.refreshToken.findUnique({
    where: { token: input.refreshToken },
  });
  if (!stored || stored.expiresAt <= new Date()) {
    throw new AppError(401, "Invalid refresh token");
  }

  // Reject tokens for users deactivated since the token was issued, and mint
  // from current user state rather than the (possibly stale) token claims.
  const user = await prisma.user.findUnique({ where: { id: stored.userId } });
  if (!user || !user.isActive) {
    throw new AppError(401, "Invalid refresh token");
  }

  const accessToken = signAccessToken({
    userId: user.id,
    orgId: user.organizationId,
    role: user.role,
  });
  return { accessToken };
}

export async function logout(input: { refreshToken: string }): Promise<void> {
  await prisma.refreshToken.deleteMany({ where: { token: input.refreshToken } });
}
