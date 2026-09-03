import type {Express} from "express";
import {createApp} from "./app";
import {createApiRouter, type Controllers} from "./routes";
import {createAuthMiddleware} from "./middleware/auth.middleware";
import {upload} from "./middleware/upload.middleware";
import {createRateLimitMiddleware, createAiProtectionMiddleware} from "./middleware/security.middleware";
import {AuthService} from "./services/auth.service";
import {ProfileService} from "./services/profile.service";
import {WardrobeService} from "./services/wardrobe.service";
import {OutfitService} from "./services/outfit.service";
import {TryOnService} from "./services/tryon.service";
import {HealthService} from "./services/health.service";
import {WeatherService} from "./services/weather.service";
import {AuthController} from "./controllers/auth.controller";
import {ProfileController} from "./controllers/profile.controller";
import {WardrobeController} from "./controllers/wardrobe.controller";
import {OutfitController} from "./controllers/outfit.controller";
import {TryOnController} from "./controllers/tryon.controller";
import {HealthController} from "./controllers/health.controller";
import {WeatherController} from "./controllers/weather.controller";
import {CommerceController} from "./controllers/commerce.controller";
import {GmailOAuthService} from "./commerce/gmail/gmail-oauth.service";
import {GmailParserService} from "./commerce/gmail/gmail-parser.service";
import {GmailSyncService} from "./commerce/gmail/gmail-sync.service";
import {PurchaseImportService} from "./commerce/purchase-import.service";
import {AmazonEmailParser} from "./commerce/parsers/amazon-email.parser";
import {GenericEmailParser} from "./commerce/parsers/generic-email.parser";
import type {AppConfig} from "./config/env";
import type {Repositories} from "./types/repositories";
import type {AssetStore, TextAnalysisProvider, TryOnProvider, SmsProvider, WeatherProvider, GmailApiClient} from "./types/provider.types";

// Everything createApiApp needs to wire the app together. bootstrap.ts
// builds a real instance of this (Postgres/Cloudinary/Gemini/Twilio) for
// server.ts and the Vercel entrypoints; tests build one directly from
// in-memory repositories and fake providers, without going through
// bootstrap.ts at all.
export interface AppDependencies {
  config: AppConfig;
  repositories: Repositories;
  assetStore: AssetStore;
  textAnalyzer: TextAnalysisProvider;
  tryonProvider: TryOnProvider;
  smsProvider: SmsProvider;
  weatherProvider: WeatherProvider;
  gmailApiClient: GmailApiClient;
}

// The composition root: constructs every service and controller from the
// given dependencies, wires them into the /api/v1 router, and hands that
// to app.ts to become a configured Express app. This is the one place that
// knows about the full Route → Middleware → Controller → Service →
// Repository/Provider chain end to end.
export function createApiApp(deps: AppDependencies): Express {
  const {config, repositories, assetStore, textAnalyzer, tryonProvider, smsProvider, weatherProvider, gmailApiClient} = deps;

  const authService = new AuthService(repositories.users, repositories.sessions, repositories.otp, smsProvider, config, assetStore);
  const profileService = new ProfileService(repositories.profiles, repositories.assets, assetStore, textAnalyzer, config);
  const wardrobeService = new WardrobeService(repositories.wardrobe, repositories.assets, assetStore, textAnalyzer, config);
  const weatherService = new WeatherService(weatherProvider, config.weatherCacheTtlMinutes * 60_000);
  const outfitService = new OutfitService(repositories.outfits, repositories.wardrobe, repositories.profiles, textAnalyzer, weatherService);
  const tryonService = new TryOnService(
    repositories.tryon, repositories.wardrobe, repositories.profiles, repositories.assets, repositories.outfits,
    assetStore, tryonProvider, config,
  );
  const healthService = new HealthService(repositories);

  // Commerce/Gmail purchase detection (server/src/commerce): kept fully
  // separate from WardrobeService, which is never modified for this —
  // PurchaseImportService only ever calls wardrobeService's existing public
  // methods (analyzeDraft/createWardrobeItem) to reuse its AI-analysis
  // pipeline. Amazon has a structured parser; GenericEmailParser is the
  // fallback for every other allow-listed fashion retailer domain (see its
  // header comment) and must stay registered last so a marketplace-specific
  // parser is always preferred when both could match.
  const gmailOAuthService = new GmailOAuthService(repositories.gmail, gmailApiClient, config);
  const gmailParserService = new GmailParserService([new AmazonEmailParser(), new GenericEmailParser()]);
  const purchaseImportService = new PurchaseImportService(repositories.purchaseImports, wardrobeService);
  const gmailSyncService = new GmailSyncService(
    repositories.gmail, repositories.purchaseImports, purchaseImportService, gmailOAuthService, gmailApiClient, gmailParserService, config,
  );

  const controllers: Controllers = {
    health: new HealthController(healthService),
    auth: new AuthController(authService),
    profile: new ProfileController(profileService),
    wardrobe: new WardrobeController(wardrobeService),
    outfit: new OutfitController(outfitService),
    tryon: new TryOnController(tryonService),
    weather: new WeatherController(weatherService),
    commerce: new CommerceController(repositories.gmail, gmailOAuthService, gmailSyncService, purchaseImportService, config),
  };

  const authenticate = createAuthMiddleware({
    users: repositories.users,
    sessions: repositories.sessions,
    security: repositories.security,
    rateLimit: {limit: config.rateLimitApiMax, windowSeconds: config.rateLimitWindowSeconds},
  });
  const ipKey = (request: import("express").Request) => request.ip || request.socket.remoteAddress || "unknown";
  const phoneKey = (request: import("express").Request) => typeof request.body?.phoneNumber === "string" ? request.body.phoneNumber : "invalid";
  const userKey = (request: import("express").Request) => request.auth?.user.id || "unknown";
  const rate = (namespace: string, limit: number, windowSeconds: number, key: (request: import("express").Request) => string) =>
    createRateLimitMiddleware({security: repositories.security, namespace, limit, windowSeconds, key});
  const routeSecurity = {
    requestOtp: [
      rate("otp-request-ip-window", config.rateLimitAuthMax, config.rateLimitWindowSeconds, ipKey),
      rate("otp-request-phone-cooldown", 1, config.otpResendCooldownSeconds, phoneKey),
      rate("otp-request-phone-daily", config.otpDailyPhoneLimit, 86_400, phoneKey),
      rate("otp-request-ip-daily", config.otpDailyIpLimit, 86_400, ipKey),
    ],
    verifyOtp: [rate("otp-verify-ip", config.rateLimitAuthMax, config.rateLimitWindowSeconds, ipKey)],
    profileAnalysis: createAiProtectionMiddleware(repositories.security, config, "profile_analysis"),
    wardrobeAnalysis: createAiProtectionMiddleware(repositories.security, config, "wardrobe_analysis"),
    outfitGeneration: createAiProtectionMiddleware(repositories.security, config, "outfit_generation"),
    virtualTryon: createAiProtectionMiddleware(repositories.security, config, "virtual_tryon"),
    // Not billed AI usage (createAiProtectionMiddleware is the wrong fit) —
    // just a per-user cap on how often a Gmail sync can be triggered.
    gmailSync: [rate("gmail-sync-user", config.gmailSyncRateLimitMax, config.rateLimitWindowSeconds, userKey)],
    // The OAuth callback bypasses `authenticate` entirely (Google redirects
    // the browser directly, no bearer token), so it also bypasses the
    // blanket per-user API rate limit baked into authenticate — rate-limit
    // it by IP instead so the Google token-exchange call isn't wide open.
    gmailOAuthCallback: [rate("gmail-oauth-callback-ip", config.rateLimitAuthMax, config.rateLimitWindowSeconds, ipKey)],
  };
  const apiRouter = createApiRouter(controllers, authenticate, upload, routeSecurity);

  return createApp({config, apiRouter});
}
