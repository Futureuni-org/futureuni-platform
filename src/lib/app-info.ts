import packageJson from "../../package.json";

/** The app version from package.json, reported by /api/health. */
export const APP_VERSION: string = packageJson.version;
