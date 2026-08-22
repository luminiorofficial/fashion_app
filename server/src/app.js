const express = require("express");
const multer = require("multer");
const {ApiError, assert} = require("./errors");
const {phone, birthDate, text, productUrl, wardrobeCategory, outfitEventType} = require("./validation");
const {createId, createOtp, createToken, hashOtp, safeEqual, sha256} = require("./security");
const {assertRepositoryContract} = require("./repository");
const {normalizeUploadedFile, processUploadedFile} = require("./storage");

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

function createApp({config, repository, assetStore, analyzer, smsProvider}) {
  assertRepositoryContract(repository);
  const app = express();
  const upload = multer({storage: multer.memoryStorage(), limits: {fileSize: MAX_IMAGE_BYTES, files: 1}});
  app.disable("x-powered-by");
  app.use(express.json({limit: "256kb"}));
  app.use((request, response, next) => {
    response.set({"Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Authorization, Content-Type", "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS"});
    if (request.method === "OPTIONS") return response.sendStatus(204);
    next();
  });
  app.use("/uploads", express.static(config.uploadDir, {fallthrough: false, immutable: true, maxAge: "1d"}));

  const route = express.Router();

  route.get("/health", async (_request, response) => {
    const database = repository.health ? await repository.health() : {status: "ok", adapter: "memory"};
    response.json({status: "ok", database, timestamp: new Date().toISOString()});
  });

  route.post("/auth/otp/request", async (request, response) => {
    const phoneNumber = phone(request.body?.phoneNumber);
    const challengeCount = await repository.countRecentChallenges(phoneNumber, new Date(Date.now() - config.otpRateLimitWindowMinutes * 60_000).toISOString());
    assert(challengeCount < config.otpRateLimitMax, 429, "OTP_RATE_LIMITED", "Too many OTP requests. Please wait before trying again.");
    const existingUser = await repository.findUserByPhone(phoneNumber);
    const purpose = existingUser ? "login" : "registration";
    let registration = null;
    if (!existingUser) {
      registration = {name: text(request.body?.name, "name", {min: 2, max: 120}), dateOfBirth: birthDate(request.body?.dateOfBirth)};
    }
    const challengeId = createId();
    const otp = createOtp();
    const challenge = await repository.createChallenge({id: challengeId, phoneNumber, userId: existingUser?.id || null, purpose, otpHash: hashOtp(config.otpHashSecret, challengeId, otp), provider: smsProvider.name || "unconfigured", expiresAt: new Date(Date.now() + config.otpTtlMinutes * 60_000).toISOString(), maxAttempts: config.otpMaxAttempts, registration});
    let delivery;
    try {
      delivery = await smsProvider.sendOtp(phoneNumber, otp);
    } catch (error) {
      await repository.recordChallengeAttempt(challenge.id, 0, {consumedAt: new Date().toISOString()});
      throw error;
    }
    if (delivery?.messageId) {
      await repository.markChallengeDelivered(challenge.id, {providerMessageId: delivery.messageId, submittedAt: new Date().toISOString()});
    }
    response.status(201).json({challengeId: challenge.id, purpose, expiresInSeconds: config.otpTtlMinutes * 60, ...(smsProvider.exposeOtp ? {developmentOtp: otp} : {})});
  });

  route.post("/auth/otp/verify", async (request, response) => {
    const challengeId = text(request.body?.challengeId, "challengeId", {max: 100});
    const otp = text(request.body?.otp, "otp", {min: 6, max: 6});
    assert(/^\d{6}$/.test(otp), 400, "INVALID_OTP_FORMAT", "otp must contain exactly 6 digits.");
    const challenge = await repository.getChallenge(challengeId);
    assert(challenge, 404, "CHALLENGE_NOT_FOUND", "The OTP challenge was not found.");
    assert(!challenge.consumedAt, 409, "OTP_ALREADY_USED", "This OTP has already been used.");
    assert(new Date(challenge.expiresAt) > new Date(), 410, "OTP_EXPIRED", "The OTP has expired. Request a new one.");
    assert(challenge.attempts < challenge.maxAttempts, 429, "OTP_ATTEMPTS_EXCEEDED", "Too many incorrect attempts. Request a new OTP.");
    const correct = safeEqual(challenge.otpHash, hashOtp(config.otpHashSecret, challenge.id, otp));
    const recorded = await repository.recordChallengeAttempt(challenge.id, challenge.attempts, {consumedAt: correct ? new Date().toISOString() : null});
    assert(recorded, 409, "OTP_CHALLENGE_CHANGED", "This OTP challenge was already updated. Please retry.");
    assert(correct, 401, "INVALID_OTP", "The OTP is incorrect.");
    let user;
    if (challenge.purpose === "login") {
      user = await repository.findUserByPhone(challenge.phoneNumber);
      assert(user, 404, "USER_NOT_FOUND", "No user exists for this phone number.");
    } else {
      const registration = challenge.registration || {};
      user = await repository.findOrCreateUser({
        ...registration,
        phoneNumber: challenge.phoneNumber,
      });
    }
    const token = createToken();
    const expiresAt = new Date(Date.now() + config.sessionTtlDays * 86_400_000).toISOString();
    await repository.createSession({userId: user.id, tokenHash: sha256(token), expiresAt});
    response.json({accessToken: token, tokenType: "Bearer", expiresAt, user: publicUser(user)});
  });

  const authenticate = async (request, _response, next) => {
    const header = request.get("authorization") || "";
    assert(header.startsWith("Bearer "), 401, "AUTH_REQUIRED", "Authentication is required.");
    const tokenHash = sha256(header.slice(7));
    const session = await repository.findSession(tokenHash);
    assert(session, 401, "INVALID_SESSION", "The session is invalid or expired.");
    const user = await repository.findUserById(session.userId);
    assert(user && user.status === "active", 401, "INVALID_SESSION", "The account is not active.");
    request.auth = {user, tokenHash, session};
    next();
  };

  route.get("/me", authenticate, (request, response) => response.json({user: publicUser(request.auth.user)}));
  route.post("/auth/logout", authenticate, async (request, response) => { await repository.revokeSession(request.auth.tokenHash); response.sendStatus(204); });

  route.get("/profile", authenticate, async (request, response) => response.json({profile: await repository.getProfile(request.auth.user.id)}));
  route.post("/profile/analyze", authenticate, upload.single("image"), async (request, response) => {
    const file = await processUploadedFile(normalizeUploadedFile(request.file));
    assert(file, 400, "IMAGE_REQUIRED", "A full-body image is required.");
    const stored = await assetStore.save(request.auth.user.id, file);
    const asset = await repository.createAsset({userId: request.auth.user.id, purpose: "profile_analysis", ...stored});
    const result = await analyzer.analyzeProfile(file);
    const job = await repository.createAnalysisJob({userId: request.auth.user.id, mediaAssetId: asset.id, analysisType: "style_profile", provider: config.geminiApiKey ? "gemini" : "development_fallback", model: config.geminiModel, result});
    const profile = await repository.saveProfile(request.auth.user.id, {bodyType: result.body_shape, skinTone: result.skin_tone, skinUndertone: result.skin_undertone, hairColor: result.hair_color, facialStructure: result.facial_structure, styleAttributes: result.style_attributes || [], stylingNotes: result.styling_notes, profileImageAssetId: asset.id, profileImageUrl: asset.publicUrl, latestAnalysisJobId: job.id});
    response.status(201).json({profile, analysisJobId: job.id});
  });

  route.get("/wardrobe/items", authenticate, async (request, response) => response.json({items: (await repository.listWardrobe(request.auth.user.id)).map(publicWardrobeItem)}));
  route.post("/wardrobe/analyze", authenticate, upload.single("image"), async (request, response) => {
    const file = await processUploadedFile(normalizeUploadedFile(request.file));
    assert(file, 400, "IMAGE_REQUIRED", "A clothing or accessory image is required.");
    const stored = await assetStore.save(request.auth.user.id, file);
    const asset = await repository.createAsset({userId: request.auth.user.id, purpose: "wardrobe_item", ...stored});
    const result = await analyzer.analyzeWardrobe(file);
    const job = await repository.createAnalysisJob({userId: request.auth.user.id, mediaAssetId: asset.id, analysisType: "wardrobe_item", provider: config.geminiApiKey ? "gemini" : "development_fallback", model: config.geminiModel, result});
    response.status(201).json({draft: {assetId: asset.id, imageUrl: asset.publicUrl, name: result.item_name, category: result.category, tags: result.tags, color: result.color ?? null, material: result.material ?? null, pattern: result.pattern ?? null, season: result.season || [], occasion: result.occasion || [], style: result.style || [], analysisJobId: job.id}});
  });
  route.delete("/wardrobe/drafts/:assetId", authenticate, async (request, response) => {
    const asset = await repository.getAsset(request.params.assetId);
    assert(asset && asset.userId === request.auth.user.id, 404, "ASSET_NOT_FOUND", "The wardrobe draft was not found.");
    const inUse = (await repository.listWardrobe(request.auth.user.id)).some((item) => item.mediaAssetId === asset.id);
    assert(!inUse, 409, "ASSET_IN_USE", "The image already belongs to a wardrobe item.");
    await assetStore.remove(asset.storageKey);
    await repository.archiveAsset(asset.id);
    response.sendStatus(204);
  });
  route.post("/wardrobe/items", authenticate, async (request, response) => {
    const assetId = text(request.body?.assetId, "assetId", {max: 100});
    const analysisJobId = text(request.body?.analysisJobId, "analysisJobId", {max: 100});
    const asset = await repository.getAsset(assetId);
    assert(asset && asset.userId === request.auth.user.id && asset.purpose === "wardrobe_item", 404, "ASSET_NOT_FOUND", "The wardrobe image was not found.");
    const analysisJob = await repository.getAnalysisJob(analysisJobId);
    assert(analysisJob && analysisJob.userId === request.auth.user.id && analysisJob.mediaAssetId === asset.id && analysisJob.analysisType === "wardrobe_item", 404, "ANALYSIS_NOT_FOUND", "The wardrobe analysis was not found.");
    const inUse = (await repository.listWardrobe(request.auth.user.id)).some((item) => item.mediaAssetId === asset.id);
    assert(!inUse, 409, "ASSET_IN_USE", "The image already belongs to a wardrobe item.");
    const metadata = analysisJob.result || {};
    const styleTags = cleanStringArray(metadata.style);
    const item = await repository.createWardrobeItem(request.auth.user.id, {
      sourceType: "upload", name: text(request.body?.name, "name", {max: 160}), category: wardrobeCategory(request.body?.category), tags: cleanTags(request.body?.tags),
      mediaAssetId: asset.id, analysisJobId: analysisJob.id, imageUrl: asset.publicUrl, productUrl: null,
      primaryColor: typeof metadata.color === "string" ? metadata.color.trim().slice(0, 100) || null : null,
      material: typeof metadata.material === "string" ? metadata.material.trim().slice(0, 160) || null : null,
      pattern: typeof metadata.pattern === "string" ? metadata.pattern.trim().slice(0, 120) || null : null,
      season: cleanStringArray(metadata.season, 4),
      occasion: cleanStringArray(metadata.occasion, 6),
      styleTags,
    });
    response.status(201).json({item: publicWardrobeItem(item)});
  });
  route.post("/wardrobe/links", authenticate, async (request, response) => {
    const item = await repository.createWardrobeItem(request.auth.user.id, {sourceType: "product_link", name: text(request.body?.name, "name", {max: 160}), category: wardrobeCategory(request.body?.category), tags: cleanTags(request.body?.tags), mediaAssetId: null, imageUrl: "", productUrl: productUrl(request.body?.productUrl)});
    response.status(201).json({item: publicWardrobeItem(item)});
  });
  route.delete("/wardrobe/items/:itemId", authenticate, async (request, response) => {
    const item = await repository.getWardrobeItem(request.params.itemId);
    assert(item && item.userId === request.auth.user.id && !item.deletedAt, 404, "WARDROBE_ITEM_NOT_FOUND", "The wardrobe item was not found.");
    await repository.deleteWardrobeItem(item.id);
    response.sendStatus(204);
  });

  route.post("/outfits/generate", authenticate, async (request, response) => {
    const eventType = outfitEventType(request.body?.eventType);
    const wardrobe = await repository.listWardrobe(request.auth.user.id);
    assert(wardrobe.length >= 2, 400, "WARDROBE_TOO_SMALL", "Add at least 2 wardrobe items before generating an outfit.");
    const profile = await repository.getProfile(request.auth.user.id);
    const suggestion = await analyzer.suggestOutfit({eventType, profile, wardrobe});
    const wardrobeIds = new Set(wardrobe.map((item) => item.id));
    const wardrobeItemIds = [...new Set(suggestion.wardrobe_item_ids || [])].filter((id) => wardrobeIds.has(id));
    assert(wardrobeItemIds.length > 0, 502, "INVALID_OUTFIT_SELECTION", "The styling AI did not return a valid outfit from your wardrobe.");
    const outfit = await repository.createOutfit(request.auth.user.id, {eventType, rationale: suggestion.rationale, wardrobeItemIds, analysisContext: {wardrobeItemCount: wardrobe.length}});
    response.status(201).json({outfit: publicOutfit(outfit)});
  });

  app.use("/api/v1", route);
  app.use((_request, _response, next) => next(new ApiError(404, "NOT_FOUND", "Endpoint not found.")));
  app.use((error, _request, response, _next) => {
    if (error instanceof multer.MulterError) error = new ApiError(error.code === "LIMIT_FILE_SIZE" ? 413 : 400, error.code, error.code === "LIMIT_FILE_SIZE" ? "Images must be 5 MB or smaller." : error.message);
    const status = error.status || 500;
    if (status >= 500) console.error(error);
    response.status(status).json({error: {code: error.code || "INTERNAL_ERROR", message: status >= 500 ? "The server could not complete the request." : error.message, ...(error.details ? {details: error.details} : {})}});
  });
  return app;
}

const publicUser = (user) => ({id: user.id, name: user.name, dateOfBirth: user.dateOfBirth, phoneNumber: user.phoneNumber, phoneVerifiedAt: user.phoneVerifiedAt});
const publicWardrobeItem = (item) => ({id: item.id, name: item.name, category: item.category, sourceType: item.sourceType, imageUrl: item.imageUrl || "", productUrl: item.productUrl, tags: item.tags, primaryColor: item.primaryColor || null, secondaryColors: item.secondaryColors || [], material: item.material || null, pattern: item.pattern || null, season: item.season || [], occasion: item.occasion || [], styleTags: item.styleTags || [], createdAt: item.createdAt});
const publicOutfit = (outfit) => ({id: outfit.id, eventType: outfit.eventType, wardrobeItemIds: outfit.wardrobeItemIds, rationale: outfit.rationale, createdAt: outfit.createdAt});
const cleanTags = (value) => Array.isArray(value) ? [...new Set(value.filter((tag) => typeof tag === "string").map((tag) => tag.trim().toLowerCase()).filter(Boolean))].slice(0, 12) : [];
const cleanStringArray = (value, max = 6) => Array.isArray(value) ? [...new Set(value.filter((entry) => typeof entry === "string").map((entry) => entry.trim()).filter(Boolean))].slice(0, max) : [];

module.exports = {createApp};
