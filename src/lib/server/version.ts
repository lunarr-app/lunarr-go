import pkg from "../../../package.json";

export const APP_VERSION = process.env.LUNARR_APP_VERSION?.trim() || pkg.version;
