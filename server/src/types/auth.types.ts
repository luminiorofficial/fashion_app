import type {User} from "./user.types";

export type OtpPurpose = "login" | "registration";

export interface PendingRegistration {
  name: string;
  dateOfBirth: string;
}

export interface OtpChallenge {
  id: string;
  userId: string | null;
  phoneNumber: string;
  purpose: OtpPurpose;
  otpHash: string;
  registration: PendingRegistration | null;
  provider: string;
  providerMessageId?: string | null;
  submittedAt?: string | null;
  attempts: number;
  maxAttempts: number;
  expiresAt: string;
  consumedAt: string | null;
  createdAt: string;
}

export interface CreateChallengeInput {
  id: string;
  phoneNumber: string;
  userId: string | null;
  purpose: OtpPurpose;
  otpHash: string;
  provider: string;
  expiresAt: string;
  maxAttempts: number;
  registration: PendingRegistration | null;
}

export interface Session {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: string;
  revokedAt: string | null;
  createdAt: string;
}

export interface AuthContext {
  user: User;
  tokenHash: string;
  session: Session;
}
