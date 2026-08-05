const express = require("express");
const multer = require("multer");
const path = require("node:path");
const {ApiError, assert} = require("./errors");
const {phone, birthDate, text, productUrl} = require("./validation");
const {createOtp, createToken, hashOtp, safeEqual, sha256} = require("./security");

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

function createApp({config, repository, assetStore, analyzer, smsProvider}) {
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

  route.get("/health", (_request, response) => response.json({status: "ok", database: "repository-adapter", timestamp: new Date().toISOString()}));

  route.post("/auth/otp/request", async (request, response) => {
    const phoneNumber = phone(request.body?.phoneNumber);
    const existingUser = await repository.findUserByPhone(phoneNumber);
    const purpose = existingUser ? "login" : "registration";
    let registration = null;
    if (!existingUser) {
      registration = {name: text(request.body?.name, "name", {min: 2, max: 120}), dateOfBirth: birthDate(request.body?.dateOfBirth)};
    }
    const placeholder = await repository.createChallenge({phoneNumber, purpose, otpHash: "pending", expiresAt: new Date(Date.now() + config.otpTtlMinutes * 60_000).toISOString(), maxAttempts: config.otpMaxAttempts, registration});
    const otp = createOtp();
    await repository.updateChallenge(placeholder.id, {otpHash: hashOtp(config.otpHashSecret, placeholder.id, otp)});
    await smsProvider.sendOtp(phoneNumber, otp);
    response.status(201).json({challengeId: placeholder.id, purpose, expiresInSeconds: config.otpTtlMinutes * 60, ...(config.env !== "production" ? {developmentOtp: otp} : {})});
  });

  route.post("/auth/otp/verify", async (request, response) => {
    const challengeId = text(request.body?.challengeId, "challengeId", {max: 100});
    const otp = text(request.body?.otp, "otp", {min: 6, max: 6});
    const challenge = await repository.getChallenge(challengeId);
    assert(challenge, 404, "CHALLENGE_NOT_FOUND", "The OTP challenge was not found.");
    assert(!challenge.consumedAt, 409, "OTP_ALREADY_USED", "This OTP has already been used.");
    assert(new Date(challenge.expiresAt) > new Date(), 410, "OTP_EXPIRED", "The OTP has expired. Request a new one.");
    assert(challenge.attempts < challenge.maxAttempts, 429, "OTP_ATTEMPTS_EXCEEDED", "Too many incorrect attempts. Request a new OTP.");
    const correct = safeEqual(challenge.otpHash, hashOtp(config.otpHashSecret, challenge.id, otp));
    await repository.updateChallenge(challenge.id, {attempts: challenge.attempts + 1, ...(correct ? {consumedAt: new Date().toISOString()} : {})});
    assert(correct, 401, "INVALID_OTP", "The OTP is incorrect.");
    let user = await repository.findUserByPhone(challenge.phoneNumber);
    if (!user) user = await repository.createUser({...challenge.registration, phoneNumber: challenge.phoneNumber});
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
    assert(request.file, 400, "IMAGE_REQUIRED", "A full-body image is required.");
    const stored = await assetStore.save(request.auth.user.id, request.file);
    const asset = await repository.createAsset({userId: request.auth.user.id, purpose: "profile_analysis", ...stored});
    const result = await analyzer.analyzeProfile(request.file);
    const job = await repository.createAnalysisJob({userId: request.auth.user.id, mediaAssetId: asset.id, analysisType: "style_profile", provider: config.geminiApiKey ? "gemini" : "development_fallback", model: config.geminiModel, result});
    const profile = await repository.saveProfile(request.auth.user.id, {bodyType: result.body_shape, skinTone: result.skin_tone, skinUndertone: result.skin_undertone, hairColor: result.hair_color, facialStructure: result.facial_structure, styleAttributes: result.style_attributes || [], stylingNotes: result.styling_notes, profileImageUrl: asset.publicUrl, latestAnalysisJobId: job.id});
    response.status(201).json({profile, analysisJobId: job.id});
  });

  route.get("/wardrobe/items", authenticate, async (request, response) => response.json({items: (await repository.listWardrobe(request.auth.user.id)).map(publicWardrobeItem)}));
  route.post("/wardrobe/analyze", authenticate, upload.single("image"), async (request, response) => {
    assert(request.file, 400, "IMAGE_REQUIRED", "A clothing or accessory image is required.");
    const stored = await assetStore.save(request.auth.user.id, request.file);
    const asset = await repository.createAsset({userId: request.auth.user.id, purpose: "wardrobe_item", ...stored});
    const result = await analyzer.analyzeWardrobe(request.file);
    const job = await repository.createAnalysisJob({userId: request.auth.user.id, mediaAssetId: asset.id, analysisType: "wardrobe_item", provider: config.geminiApiKey ? "gemini" : "development_fallback", model: config.geminiModel, result});
    response.status(201).json({draft: {assetId: asset.id, imageUrl: asset.publicUrl, name: result.item_name, category: result.category, tags: result.tags, analysisJobId: job.id}});
  });
  route.delete("/wardrobe/drafts/:assetId", authenticate, async (request, response) => {
    const asset = await repository.getAsset(request.params.assetId);
    assert(asset && asset.userId === request.auth.user.id, 404, "ASSET_NOT_FOUND", "The wardrobe draft was not found.");
    const inUse = (await repository.listWardrobe(request.auth.user.id)).some((item) => item.mediaAssetId === asset.id);
    assert(!inUse, 409, "ASSET_IN_USE", "The image already belongs to a wardrobe item.");
    await assetStore.remove(asset.storageKey);
    await repository.deleteAsset(asset.id);
    response.sendStatus(204);
  });
  route.post("/wardrobe/items", authenticate, async (request, response) => {
    const assetId = text(request.body?.assetId, "assetId", {max: 100});
    const asset = await repository.getAsset(assetId);
    assert(asset && asset.userId === request.auth.user.id && asset.purpose === "wardrobe_item", 404, "ASSET_NOT_FOUND", "The wardrobe image was not found.");
    const item = await repository.createWardrobeItem(request.auth.user.id, {sourceType: "upload", name: text(request.body?.name, "name", {max: 160}), category: text(request.body?.category, "category", {max: 40}), tags: cleanTags(request.body?.tags), mediaAssetId: asset.id, imageUrl: asset.publicUrl, productUrl: null});
    response.status(201).json({item: publicWardrobeItem(item)});
  });
  route.post("/wardrobe/links", authenticate, async (request, response) => {
    const item = await repository.createWardrobeItem(request.auth.user.id, {sourceType: "product_link", name: text(request.body?.name, "name", {max: 160}), category: text(request.body?.category, "category", {max: 40}), tags: cleanTags(request.body?.tags), mediaAssetId: null, imageUrl: typeof request.body?.imageUrl === "string" ? request.body.imageUrl.slice(0, 2048) : "", productUrl: productUrl(request.body?.productUrl)});
    response.status(201).json({item: publicWardrobeItem(item)});
  });
  route.delete("/wardrobe/items/:itemId", authenticate, async (request, response) => {
    const item = await repository.getWardrobeItem(request.params.itemId);
    assert(item && item.userId === request.auth.user.id && !item.deletedAt, 404, "WARDROBE_ITEM_NOT_FOUND", "The wardrobe item was not found.");
    await repository.deleteWardrobeItem(item.id);
    response.sendStatus(204);
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
const publicWardrobeItem = (item) => ({id: item.id, name: item.name, category: item.category, sourceType: item.sourceType, imageUrl: item.imageUrl || "", productUrl: item.productUrl, tags: item.tags, createdAt: item.createdAt});
const cleanTags = (value) => Array.isArray(value) ? [...new Set(value.filter((tag) => typeof tag === "string").map((tag) => tag.trim().toLowerCase()).filter(Boolean))].slice(0, 12) : [];

module.exports = {createApp};
