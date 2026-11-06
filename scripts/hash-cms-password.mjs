import { randomBytes, scrypt as scryptCallback } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const password = process.env.CMS_ADMIN_PASSWORD;
if (!password || password.length < 16 || password.length > 256) {
  console.error("Set CMS_ADMIN_PASSWORD to a unique password of 16–256 characters before running this script.");
  process.exit(1);
}
const salt = randomBytes(16);
const digest = await scrypt(password, salt, 64);
console.log("CMS_ADMIN_PASSWORD_HASH=scrypt$" + salt.toString("hex") + "$" + Buffer.from(digest).toString("hex"));
console.log("CMS_SESSION_SECRET=" + randomBytes(48).toString("base64url"));
console.log("\nCopy these values directly into the Neon Function environment for the cms function. Do not commit them or paste them into source files.");
