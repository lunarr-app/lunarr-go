import path from "node:path";
import { appEnv } from "./config/env";

export const DATA_DIR = path.resolve(appEnv.LUNARR_DATA_DIR);
export const DB_FILE = path.join(DATA_DIR, "lunarr.db");
