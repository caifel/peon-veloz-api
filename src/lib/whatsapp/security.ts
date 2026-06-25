import { createHmac } from "node:crypto";
import { APP_SECRET } from "./config";

export function verifySignature(
  rawBody: string,
  signatureHeader: string,
): boolean {
  if (!signatureHeader || !signatureHeader.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", APP_SECRET)
    .update(rawBody)
    .digest("hex");
  return signatureHeader === `sha256=${expected}`;
}
