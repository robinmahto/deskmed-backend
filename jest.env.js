// Runs before each test file's imports — loads the test DB connection + secrets.
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, ".env.test") });
process.env.NODE_ENV = "test";
