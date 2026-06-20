# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **STATUS: BUILT — Phase 1 (Auth, Patients, Appointments, Users, Org).** The Express + Prisma
> REST API is implemented, type-checks, builds, and runs against a local PostgreSQL `deskmed`
> database. Tests are tracked separately (see §12). Source spec:
> [../docs/superpowers/specs/2026-06-03-deskmed-initial-setup-design.md](../docs/superpowers/specs/2026-06-03-deskmed-initial-setup-design.md);
> build plan: [../docs/superpowers/plans/2026-06-09-deskmed-backend-phase1-api.md](../docs/superpowers/plans/2026-06-09-deskmed-backend-phase1-api.md).

---

## 1. Purpose

The **DeskMed backend** is the Express.js REST API for the clinic platform. It owns all business
logic, authentication, authorization, and database access. The Next.js dashboard (`../frontend/`)
is its only first-party client; the API never serves HTML. Every request (except the auth routes)
carries a JWT, and **every data query is scoped to the caller's organization**.

---

## 2. Tech Stack (as built)

| Concern | Choice | Notes |
|---|---|---|
| Runtime/lang | Node.js + TypeScript (strict, CommonJS) | `tsc` → `dist/`; `ts-node`/`nodemon` for dev |
| Framework | **Express 5** (`^5.2.x`) | async throws/rejections auto-forward to the error handler |
| ORM | **Prisma 7** with the **`@prisma/adapter-pg` driver adapter** | see §4 — Prisma 7 differs from older guides |
| DB | PostgreSQL (local DB name `deskmed`) | |
| Auth | `jsonwebtoken` (access 15m / refresh 7d) + `bcryptjs` (12 rounds) | bcryptjs, not native bcrypt, for Windows portability |
| Validation | `zod` (v4) | schemas in `src/lib/validators.ts` |
| Hardening | `express-rate-limit` (100/15min), `cors` (origin whitelist) | |

> **bcryptjs vs bcrypt:** the spec says "bcrypt"; we use the pure-JS `bcryptjs` (same API, no native
> build step). Don't swap it back to `bcrypt` without a reason.

---

## 3. Folder Structure (as built)

```
backend/
├── prisma/
│   ├── schema.prisma            # 6 models + 2 enums (Organization, User, RefreshToken,
│   │                            #   Patient, Appointment, AuditLog; Role, AppointmentStatus)
│   └── migrations/              # 20260609073826_init
├── prisma.config.ts             # Prisma 7 config: schema path + datasource URL from env
├── src/
│   ├── app.ts                   # builds + exports the Express app (middleware stack + routes)
│   ├── generated/prisma/        # GENERATED Prisma client (gitignored) — do not edit
│   ├── lib/
│   │   ├── prisma.ts            # shared PrismaClient via pg adapter + model/type re-exports
│   │   ├── jwt.ts               # signAccess/Refresh + verifyAccess/Refresh
│   │   ├── bcrypt.ts            # hashPassword / verifyPassword (12 rounds)
│   │   ├── errors.ts            # AppError(status, message)
│   │   ├── validators.ts        # all Zod request schemas
│   │   └── audit.ts             # writeAuditLog() — accepts a tx client
│   ├── middleware/
│   │   ├── rateLimiter.ts       # express-rate-limit
│   │   ├── errorHandler.ts      # central error → JSON (ZodError 400, AppError status, else 500)
│   │   ├── authenticateJWT.ts   # Bearer verify → req.user = { userId, orgId, role }
│   │   └── checkRole.ts         # checkRole(...roles) factory
│   ├── routes/                  # auth, patients, appointments, users, org (thin handlers)
│   ├── services/                # *.service.ts — all Prisma access (org-scoped) lives here
│   └── types/
│       ├── auth.ts              # Role union + AuthUser
│       └── express.d.ts         # augments Express Request with `user?: AuthUser`
├── .env / .env.example          # secrets (real .env is gitignored)
└── tsconfig.json                # strict; note `"ts-node": { "files": true }` (see §4)
```

**Layering rule:** `routes/` are thin — validate input with a Zod schema, call a `services/`
function, send the result. **All Prisma access lives in `services/`.** Never query Prisma from a
route handler.

---

## 4. Prisma 7 specifics (READ THIS — it differs from most guides)

Prisma 7 changed two things that trip up older patterns:

1. **No `url` in `schema.prisma`.** The datasource block has only `provider = "postgresql"`. The
   connection URL lives in `prisma.config.ts` (for the CLI) and is passed to the client via a
   **driver adapter** at runtime.
2. **The client connects through a driver adapter**, not a built-in engine URL. We use
   `@prisma/adapter-pg` + `pg`. The generated client is emitted to `src/generated/prisma/`
   (gitignored) — import model TYPES from `src/lib/prisma.ts`, which re-exports them from one place.

The shared client ([src/lib/prisma.ts](src/lib/prisma.ts)):

```ts
import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not set");

const adapter = new PrismaPg({ connectionString });
export const prisma = new PrismaClient({ adapter });

// One place for model/namespace types so the rest of the app never imports the generated path.
export type { User, Patient, Appointment, Organization } from "../generated/prisma/client";
export { Prisma } from "../generated/prisma/client";
```

**Gotchas baked into this repo:**
- **TLS proxy:** any `prisma` CLI command in this environment must be prefixed with
  `NODE_OPTIONS=--use-system-ca` (the proxy breaks the engine download otherwise). Runtime
  (`ts-node`, `node`) does not need it.
- **`tsconfig.json` has `"ts-node": { "files": true }`** so `ts-node` picks up the
  `src/types/express.d.ts` Request augmentation (without it, `req.user` is untyped at runtime).
- `req.params.id` is typed `string | string[]` under `@types/express` v5 — cast with `as string`
  when passing to a service.

---

## 5. API Surface + RBAC (Phase 1 + Phase 2)

All protected routes require a Bearer access token (`authenticateJWT`) and a role whitelist
(`checkRole`). Roles: `ADMIN`, `DOCTOR`, `RECEPTIONIST`, `LAB_TECHNICIAN`.

### Public — `/api/auth`
```
POST /api/auth/register   → create Organization + admin User, return { user, accessToken, refreshToken }   (201)
POST /api/auth/login      → validate credentials, return { user, accessToken, refreshToken }                (200)
POST /api/auth/refresh    → { refreshToken } → { accessToken }                                              (200)
POST /api/auth/logout     → { refreshToken } → invalidate it in DB                                          (204)
```

### Protected — roles that may call each route
```
GET  /api/patients          ADMIN, DOCTOR, RECEPTIONIST
POST /api/patients          ADMIN, RECEPTIONIST
GET  /api/patients/:id      ADMIN, DOCTOR, RECEPTIONIST
PUT  /api/patients/:id      ADMIN, RECEPTIONIST

GET  /api/appointments      ADMIN, DOCTOR, RECEPTIONIST
POST /api/appointments      ADMIN, RECEPTIONIST       (patient + DOCTOR-role doctor must be in caller's org)
GET  /api/appointments/:id  ADMIN, DOCTOR, RECEPTIONIST
PUT  /api/appointments/:id  ADMIN, RECEPTIONIST

GET/POST/PUT  /api/users    ADMIN only
GET/PUT       /api/org       ADMIN only
```

### Phase 2 — Prescriptions (doctors write, reception reads)
```
GET  /api/prescriptions       ADMIN, DOCTOR, RECEPTIONIST   (optional ?patientId=)
POST /api/prescriptions       ADMIN, DOCTOR                 (patient + DOCTOR-role doctor in org; items min 1)
GET  /api/prescriptions/:id   ADMIN, DOCTOR, RECEPTIONIST
PUT  /api/prescriptions/:id   ADMIN, DOCTOR                 (edit fields/items wholesale, or status=CANCELLED)
```
Models: `Prescription` (diagnosis/notes, status `ACTIVE|CANCELLED`) + free-text `PrescriptionItem[]`
(child rows, no `organizationId`). Audited on create/update. No PDF (deferred).

### Phase 2 — Billing (front-desk writes, clinicians read)
```
GET  /api/invoices                ADMIN, DOCTOR, RECEPTIONIST   (optional ?patientId= , ?status=)
POST /api/invoices                ADMIN, RECEPTIONIST           (items min 1; total computed server-side)
GET  /api/invoices/:id            ADMIN, DOCTOR, RECEPTIONIST
POST /api/invoices/:id/payments   ADMIN, RECEPTIONIST           (record a payment; status recomputed)
POST /api/invoices/:id/cancel     ADMIN, RECEPTIONIST           (status → CANCELLED)
```
Models: `Invoice` (status `UNPAID|PARTIAL|PAID|CANCELLED`, `total` in **paise**) + `InvoiceItem[]`
(`amount = quantity*unitPrice`) + `Payment[]` (`method` enum; child rows, no `organizationId`). All
money is integer paise; status is derived from `Σpayments`; reads add computed `amountPaid`/`balance`.
Audited on create/payment/cancel (`action: CREATE|PAYMENT|CANCEL`). No GST/discounts/refunds (deferred).

> **No general `PUT` on invoices** — they're not editable after issue; correct via cancel + re-issue.

### Phase 3 — Lab Orders (clinical only; first use of LAB_TECHNICIAN)
```
GET  /api/lab-orders               ADMIN, DOCTOR, LAB_TECHNICIAN   (optional ?patientId= , ?status=)
POST /api/lab-orders               ADMIN, DOCTOR                   (patient + DOCTOR-role doctor in org; tests min 1)
GET  /api/lab-orders/:id           ADMIN, DOCTOR, LAB_TECHNICIAN
PUT  /api/lab-orders/:id/results   ADMIN, LAB_TECHNICIAN           (enter/update results → status COMPLETED)
POST /api/lab-orders/:id/cancel    ADMIN, DOCTOR                   (status → CANCELLED)
```
Models: `LabOrder` (status `ORDERED|COMPLETED|CANCELLED`) + free-text `LabTest[]` (child rows, no
`organizationId`; each holds `resultValue/unit/referenceRange/flag`, null until a lab tech enters
them). Doctors order & cancel; lab techs enter results (which completes the order); **reception is
excluded entirely**. Audited on create/results/cancel (`action: CREATE|RESULTS|CANCEL`). No report
files/PDF (S3 deferred with Notifications).

---

## 6. Middleware order (load-bearing — see [src/app.ts](src/app.ts))

```
rateLimiter  →  cors  →  express.json  →  routers  →  errorHandler (MUST be last)
```

Per route, the chain extends: `authenticateJWT → checkRole([...]) → handler`. `errorHandler`
([src/middleware/errorHandler.ts](src/middleware/errorHandler.ts)) shapes every error:
`ZodError → 400` (with `.flatten()` details), `AppError → its status`, anything else → `500`.

Because this is **Express 5**, handlers may `throw` (including `schema.parse()` on bad input) and
the rejection is auto-forwarded to `errorHandler` — no `try/catch` or `next(err)` needed:

```ts
authRouter.post("/login", async (req, res) => {
  const input = loginSchema.parse(req.body);     // throws ZodError → 400
  const result = await authService.login(input); // throws AppError → its status
  res.json(result);
});
```

---

## 7. The cross-cutting rule: org-scoping (non-negotiable)

Every JWT payload is `{ userId, orgId, role }`. **Every Prisma query in a service must be
constrained to `req.user.orgId`.** A record from another org must be unreachable (404/empty),
never returned or mutated.

Reads scope directly; single-record reads use `findFirst` with the org in the `where`:

```ts
// src/services/patient.service.ts
export async function getPatient(orgId: string, id: string) {
  const patient = await prisma.patient.findFirst({
    where: { id, organizationId: orgId },           // ← org scope, not just { id }
    include: { appointments: { orderBy: { slot: "desc" } } },
  });
  if (!patient) throw new AppError(404, "Patient not found");
  return patient;
}
```

Updates first prove the row is in-org (scoped `findFirst`), then update by id — inside a
transaction (see §8).

> **Never return a full `User` row to a client** — it carries `passwordHash`. Map through a
> `publicUser` allowlist, and when including a related user (e.g. an appointment's doctor) use a
> `select`, not `include: { doctor: true }`:
> ```ts
> include: { patient: true, doctor: { select: { id: true, name: true, email: true, role: true } } }
> ```

---

## 8. Audit logging (Patient + Appointment mutations)

Every Patient/Appointment **create and update** writes an `AuditLog` row, **atomically with the
mutation**. `writeAuditLog` accepts a transaction client so a failed audit insert rolls the whole
thing back (no unaudited writes):

```ts
// src/services/patient.service.ts
export async function createPatient(ctx: Ctx, data: PatientInput) {
  return prisma.$transaction(async (tx) => {
    const patient = await tx.patient.create({ data: { organizationId: ctx.orgId, ...data } });
    await writeAuditLog(
      { organizationId: ctx.orgId, userId: ctx.userId, action: "CREATE", entity: "Patient", entityId: patient.id },
      tx,                                            // ← same transaction
    );
    return patient;
  });
}
```

`writeAuditLog` ([src/lib/audit.ts](src/lib/audit.ts)) signature:
`writeAuditLog(params, db: Prisma.TransactionClient = prisma)`. Users/Org mutations are **not**
audited (spec §9 only requires it for patients/appointments).

---

## 9. Auth flow details

- **Passwords**: `bcryptjs`, 12 rounds ([src/lib/bcrypt.ts](src/lib/bcrypt.ts)).
- **Tokens** ([src/lib/jwt.ts](src/lib/jwt.ts)): access 15m, refresh 7d, payload `{ userId, orgId, role }`.
- **Refresh tokens are persisted** to the `RefreshToken` table on register/login and deleted on
  logout. `refresh` verifies the JWT signature **and** checks the token exists + is unexpired in
  the DB **and** that the user is still `isActive` (deactivated users can't mint new access tokens).
- **Register** creates the Organization + admin User in one `$transaction`; a duplicate-email race
  (unique-constraint `P2002`) is mapped to a clean `409`.

Adding the caller context inside a protected handler:

```ts
patientsRouter.post("/", checkRole("ADMIN", "RECEPTIONIST"), async (req, res) => {
  const data = patientCreateSchema.parse(req.body);
  const patient = await patientService.createPatient(
    { orgId: req.user!.orgId, userId: req.user!.userId }, // req.user is set by authenticateJWT
    data,
  );
  res.status(201).json(patient);
});
```

---

## 10. How to add a new endpoint (the pattern)

1. **Zod schema** in `src/lib/validators.ts` for the request body.
2. **Service function** in `src/services/<resource>.service.ts` — all Prisma access, org-scoped,
   `writeAuditLog` on mutations of audited entities, throw `AppError(status, msg)` for failures.
3. **Route** in `src/routes/<resource>.ts` — `router.use(authenticateJWT)`, then
   `checkRole(...)` per handler, `schema.parse(req.body)`, call the service, send the result.
4. **Mount** in `src/app.ts` (`app.use("/api/<resource>", <resource>Router)`), keeping
   `errorHandler` last.
5. Type-check: `npx tsc --noEmit`.

---

## 11. Dev commands & environment

```bash
# from backend/
npm install
NODE_OPTIONS=--use-system-ca npx prisma migrate dev      # apply/create migrations (needs Postgres)
NODE_OPTIONS=--use-system-ca npx prisma generate         # regenerate client after schema edits
npm run dev        # ts-node + nodemon, http://localhost:4000  (GET /health → {"status":"ok"})
npm run build      # tsc → dist/  (test files are excluded from the build)
npm start          # node dist/server.js
npm test           # Jest + supertest (serial). Needs a .env.test → separate deskmed_test DB.
```

> **Entry point:** `src/app.ts` builds and exports the Express `app` **without** listening (so
> supertest can import it); `src/server.ts` is the runnable entry that calls `app.listen`.

### Tests
Jest + supertest, transpiled with `@swc/jest` (ts-jest doesn't support TypeScript 6 yet). They run
against a **separate `deskmed_test` database** (never the dev DB): copy `.env.test.example` →
`.env.test`. `jest.globalSetup.js` runs `prisma db push` to create/sync that DB once, and
`jest.afterEnv.ts` truncates all tables before each test. Rate limiting is skipped under
`NODE_ENV=test`. Suites live in `src/__tests__/`; shared helpers in `src/test/helpers.ts`.

`.env` (copy from `.env.example`, never commit the real one):
```
DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/deskmed?schema=public"
JWT_ACCESS_SECRET=... JWT_REFRESH_SECRET=...
JWT_ACCESS_TTL=15m   JWT_REFRESH_TTL=7d
CORS_ORIGINS="http://localhost:3000,http://localhost:3001"
PORT=4000
```

### Quick manual smoke (curl)
```bash
# register → returns tokens
curl.exe -s -X POST http://localhost:4000/api/auth/register -H "Content-Type: application/json" \
  -d '{"clinicName":"Demo Clinic","name":"Asha","email":"asha@demo.in","password":"password123"}'

# use the accessToken as a Bearer header on protected routes
curl.exe -s http://localhost:4000/api/patients -H "Authorization: Bearer <accessToken>"
```

---

## 12. Scope & status

- **Built (Phase 1):** auth, patients, appointments, users, org.
- **Built (Phase 2):** prescriptions, billing (invoices + payments).
- **Built (Phase 3, slice 1):** lab orders (orders + results). All resources are org-scoped,
  RBAC-gated, with audit logging on the relevant mutations.
- **Tests:** **41 passing** (Jest + supertest) across `src/__tests__/` — auth
  (register/login/refresh/logout, 409/401/400), org-scoping (org A can't read/mutate org B),
  RBAC (per the route table), audit-row writes, the `passwordHash` no-leak guarantee, validation,
  prescriptions (create/RBAC/cancel), billing (total/payment-status/cancel), and lab orders
  (order/results→completed/cancel-rules/RBAC). Run with `npm test`.
- **Do not build ahead:** notifications (Phase 3, slice 2 — needs Redis/BullMQ/S3/WhatsApp, infra-
  gated), analytics (Phase 4). No `lib/mailer.ts` yet — no built flow sends email.
- **Known hardening follow-ups:** put `organizationId` on update `where` clauses themselves
  (currently safe via the in-transaction scoped pre-check); expired-refresh-token cleanup;
  graceful shutdown (`prisma.$disconnect` on SIGTERM).
```

