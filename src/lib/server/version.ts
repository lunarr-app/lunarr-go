import pkg from "../../../package.json";
import { appEnv } from "./config/env";

export const APP_VERSION = appEnv.LUNARR_APP_VERSION || pkg.version;
