import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";

function loadNearestEnv(): void {
  let dir = process.cwd();
  for (let i = 0; i < 10; i++) {
    const candidate = path.join(dir, ".env");
    if (fs.existsSync(candidate)) {
      dotenv.config({ path: candidate, override: true });
      return;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }
}

loadNearestEnv();

const jwtSecret = process.env.JWT_SECRET?.trim();
if (!jwtSecret) {
  throw new Error(
    "[@repo/backend-common] JWT_SECRET is missing. Add it to the repo root .env (copy from .env.example).",
  );
}

export const JWT_SECRET = jwtSecret;
