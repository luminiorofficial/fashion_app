import crypto from "node:crypto";

export const sha256 = (value: string): string => crypto.createHash("sha256").update(value).digest("hex");
export const createId = (): string => crypto.randomUUID();
export const createToken = (): string => crypto.randomBytes(32).toString("base64url");
export const createOtp = (): string => String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
export const hashOtp = (secret: string, challengeId: string, otp: string): string =>
  crypto.createHmac("sha256", secret).update(`${challengeId}:${otp}`).digest("hex");

export const safeEqual = (left: string | null | undefined, right: string | null | undefined): boolean => {
  const a = Buffer.from(left || "");
  const b = Buffer.from(right || "");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};
