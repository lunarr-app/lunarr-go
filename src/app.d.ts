import type { AuthSession } from "$lib/server/auth";

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
