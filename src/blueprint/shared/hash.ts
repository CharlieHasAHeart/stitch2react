import { createHash } from "node:crypto";

export function checksumJson(input: unknown): string {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}
