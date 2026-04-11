"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.JWT_SECRET = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
function loadNearestEnv() {
    let dir = process.cwd();
    for (let i = 0; i < 10; i++) {
        const candidate = node_path_1.default.join(dir, ".env");
        if (node_fs_1.default.existsSync(candidate)) {
            dotenv_1.default.config({ path: candidate, override: true });
            return;
        }
        const parent = node_path_1.default.dirname(dir);
        if (parent === dir) {
            break;
        }
        dir = parent;
    }
}
loadNearestEnv();
exports.JWT_SECRET = process.env.JWT_SECRET || "123123";
// src/index.ts
// module.exports.JWT_SECRET = process.env.JWT_SECRET || "123123";
