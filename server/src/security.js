const crypto = require("node:crypto");

const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const createToken = () => crypto.randomBytes(32).toString("base64url");
const createOtp = () => String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
const hashOtp = (secret, challengeId, otp) => crypto.createHmac("sha256", secret).update(`${challengeId}:${otp}`).digest("hex");
const safeEqual = (left, right) => {
  const a = Buffer.from(left || "");
  const b = Buffer.from(right || "");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

module.exports = {sha256, createToken, createOtp, hashOtp, safeEqual};
