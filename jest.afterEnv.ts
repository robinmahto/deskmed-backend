import { prisma } from "./src/lib/prisma";

// Quoted, case-sensitive table names (Prisma uses the model name verbatim, no @@map here).
const TABLES = [
  '"AuditLog"',
  '"Appointment"',
  '"RefreshToken"',
  '"Patient"',
  '"User"',
  '"Organization"',
];

beforeEach(async () => {
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${TABLES.join(", ")} RESTART IDENTITY CASCADE`
  );
});

afterAll(async () => {
  await prisma.$disconnect();
});
