import {assert} from "../utils/api-error";
import {createId, createOtp, createToken, hashOtp, safeEqual, sha256} from "../utils/crypto";
import {text} from "../validators/common.validators";
import {birthDate} from "../validators/auth.validators";
import type {AppConfig} from "../config/env";
import type {UsersRepository, SessionsRepository, OtpRepository} from "../types/repositories";
import type {SmsProvider} from "../types/provider.types";
import type {AssetStore} from "../types/provider.types";
import type {User, PublicUser} from "../types/user.types";
import type {OtpPurpose} from "../types/auth.types";
import {safeOperationalError} from "../utils/safe-logging";

export type AuthServiceConfig = Pick<AppConfig, "otpRateLimitWindowMinutes" | "otpRateLimitMax" | "otpTtlMinutes" | "otpHashSecret" | "otpMaxAttempts" | "sessionTtlDays">;

export interface RequestOtpInput {
  phoneNumber: string;
  name: unknown;
  dateOfBirth: unknown;
}

export interface RequestOtpResult {
  challengeId: string;
  purpose: OtpPurpose;
  expiresInSeconds: number;
  developmentOtp?: string;
}

export interface VerifyOtpInput {
  challengeId: unknown;
  otp: unknown;
}

export interface VerifyOtpResult {
  accessToken: string;
  tokenType: "Bearer";
  expiresAt: string;
  user: PublicUser;
}

export function toPublicUser(user: User): PublicUser {
  return {id: user.id, name: user.name, dateOfBirth: user.dateOfBirth, phoneNumber: user.phoneNumber, phoneVerifiedAt: user.phoneVerifiedAt};
}

export class AuthService {
  constructor(
    private readonly users: UsersRepository,
    private readonly sessions: SessionsRepository,
    private readonly otp: OtpRepository,
    private readonly sms: SmsProvider,
    private readonly config: AuthServiceConfig,
    private readonly assetStore?: AssetStore,
  ) {}

  async requestOtp({phoneNumber, name, dateOfBirth}: RequestOtpInput): Promise<RequestOtpResult> {
    const challengeCount = await this.otp.countRecentChallenges(
      phoneNumber,
      new Date(Date.now() - this.config.otpRateLimitWindowMinutes * 60_000).toISOString(),
    );
    assert(challengeCount < this.config.otpRateLimitMax, 429, "OTP_RATE_LIMITED", "Too many OTP requests. Please wait before trying again.");

    const existingUser = await this.users.findUserByPhone(phoneNumber);
    const purpose: OtpPurpose = existingUser ? "login" : "registration";
    const registration = existingUser
      ? null
      : {name: text(name, "name", {min: 2, max: 120}), dateOfBirth: birthDate(dateOfBirth)};

    const challengeId = createId();
    const otp = createOtp();
    const challenge = await this.otp.createChallenge({
      id: challengeId,
      phoneNumber,
      userId: existingUser?.id || null,
      purpose,
      otpHash: hashOtp(this.config.otpHashSecret, challengeId, otp),
      provider: this.sms.name || "unconfigured",
      expiresAt: new Date(Date.now() + this.config.otpTtlMinutes * 60_000).toISOString(),
      maxAttempts: this.config.otpMaxAttempts,
      registration,
    });

    let delivery;
    try {
      delivery = await this.sms.sendOtp(phoneNumber, otp);
    } catch (error) {
      await this.otp.recordChallengeAttempt(challenge.id, 0, {consumedAt: new Date().toISOString()});
      throw error;
    }
    if (delivery?.messageId) {
      await this.otp.markChallengeDelivered(challenge.id, {providerMessageId: delivery.messageId, submittedAt: new Date().toISOString()});
    }

    return {
      challengeId: challenge.id,
      purpose,
      expiresInSeconds: this.config.otpTtlMinutes * 60,
      ...(this.sms.exposeOtp ? {developmentOtp: otp} : {}),
    };
  }

  async verifyOtp({challengeId: rawChallengeId, otp: rawOtp}: VerifyOtpInput): Promise<VerifyOtpResult> {
    const challengeId = text(rawChallengeId, "challengeId", {max: 100});
    const otp = text(rawOtp, "otp", {min: 6, max: 6});
    assert(/^\d{6}$/.test(otp), 400, "INVALID_OTP_FORMAT", "otp must contain exactly 6 digits.");

    const challenge = await this.otp.getChallenge(challengeId);
    assert(challenge, 404, "CHALLENGE_NOT_FOUND", "The OTP challenge was not found.");
    assert(!challenge.consumedAt, 409, "OTP_ALREADY_USED", "This OTP has already been used.");
    assert(new Date(challenge.expiresAt) > new Date(), 410, "OTP_EXPIRED", "The OTP has expired. Request a new one.");
    assert(challenge.attempts < challenge.maxAttempts, 429, "OTP_ATTEMPTS_EXCEEDED", "Too many incorrect attempts. Request a new OTP.");

    const correct = safeEqual(challenge.otpHash, hashOtp(this.config.otpHashSecret, challenge.id, otp));
    const recorded = await this.otp.recordChallengeAttempt(challenge.id, challenge.attempts, {consumedAt: correct ? new Date().toISOString() : null});
    assert(recorded, 409, "OTP_CHALLENGE_CHANGED", "This OTP challenge was already updated. Please retry.");
    assert(correct, 401, "INVALID_OTP", "The OTP is incorrect.");

    let user: User;
    if (challenge.purpose === "login") {
      const found = await this.users.findUserByPhone(challenge.phoneNumber);
      assert(found, 404, "USER_NOT_FOUND", "No user exists for this phone number.");
      user = found;
    } else {
      const registration = challenge.registration || {name: "", dateOfBirth: ""};
      user = await this.users.findOrCreateUser({...registration, phoneNumber: challenge.phoneNumber});
    }

    const token = createToken();
    const expiresAt = new Date(Date.now() + this.config.sessionTtlDays * 86_400_000).toISOString();
    await this.sessions.createSession({userId: user.id, tokenHash: sha256(token), expiresAt});
    return {accessToken: token, tokenType: "Bearer", expiresAt, user: toPublicUser(user)};
  }

  async logout(tokenHash: string): Promise<void> {
    await this.sessions.revokeSession(tokenHash);
  }

  getCurrentUser(user: User): PublicUser {
    return toPublicUser(user);
  }

  async deleteAccount(userId: string): Promise<void> {
    const {storageKeys} = await this.users.deleteAccount(userId);
    if (this.assetStore) await Promise.all(storageKeys.map((key) => this.assetStore!.remove(key).catch((error) => safeOperationalError("Account media cleanup failed", error))));
  }
}
