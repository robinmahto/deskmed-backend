/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: "node",
  // Load .env.test into process.env BEFORE any module (app/prisma) is imported.
  setupFiles: ["<rootDir>/jest.env.js"],
  // Truncate tables before each test + disconnect after the suite.
  setupFilesAfterEnv: ["<rootDir>/jest.afterEnv.ts"],
  // Create/sync the test DB schema once before the whole run.
  globalSetup: "<rootDir>/jest.globalSetup.js",
  testMatch: ["<rootDir>/src/**/*.test.ts"],
  // Transpile TS with swc (ts-jest doesn't support TypeScript 6 yet).
  transform: {
    "^.+\\.(t|j)s$": [
      "@swc/jest",
      { jsc: { parser: { syntax: "typescript" } }, module: { type: "commonjs" } },
    ],
  },
};
