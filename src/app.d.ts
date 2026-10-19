import type { AuthSession } from "#lib/server/auth/index.js";

declare module "*.sql?raw" {
  const source: string;
  export default source;
}

declare global {
  namespace App {
    interface Locals {
      session: AuthSession["session"] | null;
      user: AuthSession["user"] | null;
    }
  }
}

export {};
