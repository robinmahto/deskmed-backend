// Runs once before the whole suite: create/sync the test database schema.
// Uses `prisma db push` (creates deskmed_test if missing, no migration history needed).
const path = require("path");
const fs = require("fs");
const { execSync } = require("child_process");
const dotenv = require("dotenv");

module.exports = async () => {
  const testEnv = dotenv.parse(fs.readFileSync(path.resolve(__dirname, ".env.test")));
  // --url overrides the datasource so we never touch the dev DB; creates deskmed_test if missing.
  // NODE_OPTIONS works around the TLS-intercepting proxy for the Prisma engine download.
  execSync(`npx prisma db push --accept-data-loss --url "${testEnv.DATABASE_URL}"`, {
    cwd: __dirname,
    stdio: "inherit",
    env: { ...process.env, ...testEnv, NODE_OPTIONS: "--use-system-ca" },
  });
};
