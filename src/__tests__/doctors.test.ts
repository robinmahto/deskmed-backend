import request from "supertest";
import { app } from "../app";
import { registerOrg, createStaff, tokenFor, auth } from "../test/helpers";

describe("Doctors", () => {
  it("lists only the org's DOCTOR users as { id, name }", async () => {
    const { accessToken } = await registerOrg("doc");
    await createStaff(accessToken, "DOCTOR", "doc");
    await createStaff(accessToken, "RECEPTIONIST", "doc");
    const res = await request(app).get("/api/doctors").set(auth(accessToken));
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(Object.keys(res.body[0]).sort()).toEqual(["id", "name"]);
    expect(JSON.stringify(res.body)).not.toContain("passwordHash");
  });

  it("allows RECEPTIONIST but blocks LAB_TECHNICIAN", async () => {
    const { accessToken } = await registerOrg("docrbac");
    await createStaff(accessToken, "RECEPTIONIST", "docrbac");
    await createStaff(accessToken, "LAB_TECHNICIAN", "docrbac");
    const recToken = await tokenFor("receptionist+docrbac@test.in");
    const labToken = await tokenFor("lab_technician+docrbac@test.in");
    expect((await request(app).get("/api/doctors").set(auth(recToken))).status).toBe(200);
    expect((await request(app).get("/api/doctors").set(auth(labToken))).status).toBe(403);
  });

  it("does not return another org's doctors", async () => {
    const orgA = await registerOrg("docA");
    await createStaff(orgA.accessToken, "DOCTOR", "docA");
    const orgB = await registerOrg("docB");
    const res = await request(app).get("/api/doctors").set(auth(orgB.accessToken));
    expect(res.body).toHaveLength(0);
  });
});
