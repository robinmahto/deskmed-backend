import request from "supertest";
import { app } from "../app";
import { prisma } from "../lib/prisma";
import { registerOrg, createStaff, auth } from "../test/helpers";

async function makePatient(token: string, name: string): Promise<string> {
  const res = await request(app)
    .post("/api/patients")
    .set(auth(token))
    .send({ name, phone: "1" });
  return res.body.id as string;
}

describe("Appointments", () => {
  it("books with a DOCTOR and rejects a non-doctor as the doctor", async () => {
    const { accessToken, user } = await registerOrg("appt");
    const doctor = await createStaff(accessToken, "DOCTOR", "appt");
    const pid = await makePatient(accessToken, "Pat");

    const ok = await request(app)
      .post("/api/appointments")
      .set(auth(accessToken))
      .send({ patientId: pid, doctorId: doctor.id, slot: "2026-06-10T09:30:00.000Z" });
    expect(ok.status).toBe(201);
    expect(ok.body.status).toBe("SCHEDULED");
    expect(ok.body.type).toBe("consultation");

    // The admin is not a DOCTOR → 404 Doctor not found.
    const bad = await request(app)
      .post("/api/appointments")
      .set(auth(accessToken))
      .send({ patientId: pid, doctorId: user.id, slot: "2026-06-10T10:00:00.000Z" });
    expect(bad.status).toBe(404);
  });

  it("cannot book with another org's patient (org-scoping)", async () => {
    const orgA = await registerOrg("apptA");
    const orgB = await registerOrg("apptB");
    const docB = await createStaff(orgB.accessToken, "DOCTOR", "apptB");
    const pidA = await makePatient(orgA.accessToken, "A-Pat");

    const res = await request(app)
      .post("/api/appointments")
      .set(auth(orgB.accessToken))
      .send({ patientId: pidA, doctorId: docB.id, slot: "2026-06-10T09:30:00.000Z" });
    expect(res.status).toBe(404);
  });

  it("writes an AuditLog row on appointment create", async () => {
    const { accessToken, user } = await registerOrg("apptAudit");
    const doctor = await createStaff(accessToken, "DOCTOR", "apptAudit");
    const pid = await makePatient(accessToken, "Pat");

    const created = await request(app)
      .post("/api/appointments")
      .set(auth(accessToken))
      .send({ patientId: pid, doctorId: doctor.id, slot: "2026-06-10T09:30:00.000Z" });

    const logs = await prisma.auditLog.findMany({
      where: { organizationId: user.organizationId, entity: "Appointment" },
    });
    expect(logs).toHaveLength(1);
    expect(logs[0].entityId).toBe(created.body.id);
  });

  it("does not leak the doctor's passwordHash in list responses", async () => {
    const { accessToken } = await registerOrg("leak");
    const doctor = await createStaff(accessToken, "DOCTOR", "leak");
    const pid = await makePatient(accessToken, "Pat");
    await request(app)
      .post("/api/appointments")
      .set(auth(accessToken))
      .send({ patientId: pid, doctorId: doctor.id, slot: "2026-06-10T09:30:00.000Z" });

    const list = await request(app).get("/api/appointments").set(auth(accessToken));
    expect(list.status).toBe(200);
    expect(JSON.stringify(list.body)).not.toContain("passwordHash");
  });
});
