import crypto from "node:crypto";
import type {User} from "../types/user.types";
import type {OtpChallenge, Session} from "../types/auth.types";
import type {MediaAsset, AnalysisJob} from "../types/asset.types";
import type {StyleProfile} from "../types/profile.types";
import type {WardrobeItem} from "../types/wardrobe.types";
import type {Outfit, OutfitFeedback} from "../types/outfit.types";
import type {TryOnRequest} from "../types/tryon.types";
import type {AiOperation} from "../types/repositories";

export const generateId = (): string => crypto.randomUUID();

// The temporary, in-process substitute for PostgreSQL used for local
// development without DATABASE_URL and by the test suite. Every memory
// repository (see ./repositories/memory) shares one instance so
// cross-table relationships (e.g. archiving a media asset when its
// wardrobe item is deleted) behave the same way a single Postgres
// transaction touching multiple tables would.
export class MemoryStore {
  users = new Map<string, User>();
  usersByPhone = new Map<string, string>();
  challenges = new Map<string, OtpChallenge>();
  sessions = new Map<string, Session>();
  assets = new Map<string, MediaAsset>();
  analysisJobs = new Map<string, AnalysisJob>();
  profiles = new Map<string, StyleProfile>();
  wardrobe = new Map<string, WardrobeItem>();
  outfits = new Map<string, Outfit>();
  outfitFeedback = new Map<string, OutfitFeedback>();
  tryOnRequests = new Map<string, TryOnRequest>();
  rateLimits = new Map<string, {count: number; resetAt: string}>();
  aiUsage = new Map<string, {id: string; userId: string; operation: AiOperation; requestKey: string | null; status: "started" | "succeeded" | "failed"; requestedAt: string; completedAt: string | null}>();
}
