import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

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

export const prismaClient = new PrismaClient();