import { randomUUID } from "node:crypto";

export function createId() {
  return randomUUID();
}
