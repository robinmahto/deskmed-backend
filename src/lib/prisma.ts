import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// Prisma 7 connects through a driver adapter rather than a schema-level URL.
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

const adapter = new PrismaPg({ connectionString });

// Single shared client for the whole app (org-scoping happens in services).
export const prisma = new PrismaClient({ adapter });

// Re-export model + namespace types so the rest of the app imports them from
// one place. If a path below is wrong for your generated client, fix it here only.
export type { User, Patient, Appointment, Organization } from "../generated/prisma/client";
export { Prisma } from "../generated/prisma/client";
