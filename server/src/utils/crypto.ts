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

// Derives a 32-byte AES-256 key from an arbitrary operator-supplied secret
// string, mirroring otpHashSecret's "any string works" ergonomics rather
// than requiring a precisely-formatted base64 key.
export const deriveEncryptionKey = (secret: string): Buffer => crypto.createHash("sha256").update(secret).digest();

const ENCRYPTION_VERSION = "v1";

// AES-256-GCM at-rest encryption for reversible secrets (Google OAuth
// tokens) that, unlike everything else in this file, must be decryptable
// later rather than only ever compared. Format is a version tag (so a
// future scheme change can be detected rather than silently misread) plus
// base64(iv | authTag | ciphertext).
export function encryptSecret(plaintext: string, key: Buffer): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${ENCRYPTION_VERSION}:${Buffer.concat([iv, authTag, ciphertext]).toString("base64")}`;
}

export function decryptSecret(stored: string, key: Buffer): string {
  const [version, payload] = stored.split(":", 2);
  if (version !== ENCRYPTION_VERSION || !payload) throw new Error("Unsupported encrypted secret format.");
  const buffer = Buffer.from(payload, "base64");
  const iv = buffer.subarray(0, 12);
  const authTag = buffer.subarray(12, 28);
  const ciphertext = buffer.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

// HMAC-signs an opaque payload string (used for the Gmail OAuth `state`
// parameter, which must round-trip through Google's redirect without a
// server-side session lookup being possible at that point).
export const signPayload = (secret: string, payload: string): string =>
  crypto.createHmac("sha256", secret).update(payload).digest("hex");

export const verifyPayload = (secret: string, payload: string, signature: string): boolean =>
  safeEqual(signPayload(secret, payload), signature);
