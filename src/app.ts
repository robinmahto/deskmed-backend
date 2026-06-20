import "dotenv/config";
import express from "express";
import cors from "cors";
import { rateLimiter } from "./middleware/rateLimiter";
import { errorHandler } from "./middleware/errorHandler";
import { authRouter } from "./routes/auth";
import { patientsRouter } from "./routes/patients";
import { appointmentsRouter } from "./routes/appointments";
import { usersRouter } from "./routes/users";
import { orgRouter } from "./routes/org";
import { prescriptionsRouter } from "./routes/prescriptions";
import { invoicesRouter } from "./routes/invoices";
import { labOrdersRouter } from "./routes/lab-orders";
import { doctorsRouter } from "./routes/doctors";

const app = express();

const corsOrigins = (process.env.CORS_ORIGINS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

// Middleware order is load-bearing (spec §4): rateLimit -> cors -> json -> routes -> errorHandler.
app.use(rateLimiter);
app.use(cors({ origin: corsOrigins.length ? corsOrigins : true, credentials: true }));
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/auth", authRouter);
app.use("/api/patients", patientsRouter);
app.use("/api/appointments", appointmentsRouter);
app.use("/api/users", usersRouter);
app.use("/api/org", orgRouter);
app.use("/api/prescriptions", prescriptionsRouter);
app.use("/api/invoices", invoicesRouter);
app.use("/api/lab-orders", labOrdersRouter);
app.use("/api/doctors", doctorsRouter);

app.use(errorHandler);

// Listening happens in server.ts so this module can be imported by tests (supertest)
// without binding a port.
export { app };
