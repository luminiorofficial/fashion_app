const express = require("express");
const multer = require("multer");
const {ApiError, assert} = require("./errors");
const {phone, birthDate, text, productUrl, wardrobeCategory, outfitEventType, outfitReaction, wardrobeItemIdList} = require("./validation");
const {createId, createOtp, createToken, hashOtp, safeEqual, sha256} = require("./security");
const {assertRepositoryContract} = require("./repository");
const {normalizeUploadedFile, processUploadedFile} = require("./storage");

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_FETCHED_ASSET_BYTES = 8 * 1024 * 1024;

function createApp({config, repository, assetStore, analyzer, smsProvider, tryonProvider}) {
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
  if (config.imageStorageProvider === "local") {
    app.use("/uploads", express.static(config.uploadDir, {fallthrough: false, immutable: true, maxAge: "1d"}));
  }

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

  route.get("/profile", authenticate, async (request, response) => response.json({profile: await publicProfile(assetStore, await repository.getProfile(request.auth.user.id))}));
  route.post("/profile/analyze", authenticate, upload.single("image"), async (request, response) => {
    const file = await processUploadedFile(normalizeUploadedFile(request.file), "profile_analysis");
    assert(file, 400, "IMAGE_REQUIRED", "A full-body image is required.");
    const stored = await assetStore.save(request.auth.user.id, file, "profile_analysis");
    let asset;
    try {
      asset = await repository.createAsset({userId: request.auth.user.id, purpose: "profile_analysis", ...stored});
      const result = await analyzer.analyzeProfile(file);
      const job = await repository.createAnalysisJob({userId: request.auth.user.id, mediaAssetId: asset.id, analysisType: "style_profile", provider: config.geminiTextApiKey ? "gemini" : "development_fallback", model: config.geminiModel, result});
      const previousProfile = await repository.getProfile(request.auth.user.id);
      const profile = await repository.saveProfile(request.auth.user.id, {bodyType: result.body_shape, skinTone: result.skin_tone, skinUndertone: result.skin_undertone, hairColor: result.hair_color, facialStructure: result.facial_structure, styleAttributes: result.style_attributes || [], stylingNotes: result.styling_notes, profileImageAssetId: asset.id, profileImageStorageKey: asset.storageKey, profileImageStorageProvider: asset.storageProvider, latestAnalysisJobId: job.id});
      if (previousProfile?.profileImageAssetId && previousProfile.profileImageAssetId !== asset.id) {
        await cleanupOrphanedAsset(assetStore, repository, previousProfile.profileImageStorageKey, {id: previousProfile.profileImageAssetId});
      }
      // The full Gemini JSON is only ever needed once, right here, to build
      // the profile above — prune it so analysis_jobs doesn't keep a
      // permanent duplicate of data already normalized into
      // user_style_profiles. Best-effort: a failure here shouldn't turn an
      // otherwise-successful profile save into an error response.
      await repository.pruneAnalysisJobResult(job.id).catch(() => {});
      response.status(201).json({profile: await publicProfile(assetStore, profile), analysisJobId: job.id});
    } catch (error) {
      await cleanupOrphanedAsset(assetStore, repository, stored.storageKey, asset);
      throw error;
    }
  });

  route.get("/wardrobe/items", authenticate, async (request, response) => {
    const items = await repository.listWardrobe(request.auth.user.id);
    response.json({items: await Promise.all(items.map((item) => publicWardrobeItem(assetStore, item)))});
  });
  route.post("/wardrobe/analyze", authenticate, upload.single("image"), async (request, response) => {
    const file = await processUploadedFile(normalizeUploadedFile(request.file), "wardrobe_item");
    assert(file, 400, "IMAGE_REQUIRED", "A clothing or accessory image is required.");
    const stored = await assetStore.save(request.auth.user.id, file, "wardrobe_item");
    let asset;
    try {
      asset = await repository.createAsset({userId: request.auth.user.id, purpose: "wardrobe_item", ...stored});
      const result = await analyzer.analyzeWardrobe(file);
      const job = await repository.createAnalysisJob({userId: request.auth.user.id, mediaAssetId: asset.id, analysisType: "wardrobe_item", provider: config.geminiTextApiKey ? "gemini" : "development_fallback", model: config.geminiModel, result});
      response.status(201).json({draft: {assetId: asset.id, imageUrl: await assetStore.signedUrl(asset.storageKey), name: result.item_name, category: result.category, tags: result.tags, color: result.color ?? null, material: result.material ?? null, pattern: result.pattern ?? null, season: result.season || [], occasion: result.occasion || [], style: result.style || [], analysisJobId: job.id}});
    } catch (error) {
      await cleanupOrphanedAsset(assetStore, repository, stored.storageKey, asset);
      throw error;
    }
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
    const inUseAssetIds = new Set((await repository.listWardrobe(request.auth.user.id)).map((item) => item.mediaAssetId));
    const resolved = await resolveWardrobeDraft(repository, request.auth.user.id, request.body, inUseAssetIds);
    const item = await repository.createWardrobeItem(request.auth.user.id, resolved.payload);
    // See the matching comment in /profile/analyze: the full analysis JSON
    // is redundant the moment it's normalized into wardrobe_items columns.
    await repository.pruneAnalysisJobResult(resolved.analysisJobId).catch(() => {});
    response.status(201).json({item: await publicWardrobeItem(assetStore, item)});
  });
  route.post("/wardrobe/items/batch", authenticate, async (request, response) => {
    const rawItems = Array.isArray(request.body?.items) ? request.body.items : [];
    assert(rawItems.length > 0 && rawItems.length <= 20, 400, "INVALID_BATCH", "Provide 1 to 20 wardrobe items.");
    const inUseAssetIds = new Set((await repository.listWardrobe(request.auth.user.id)).map((item) => item.mediaAssetId));
    const resolvedItems = [];
    for (const raw of rawItems) resolvedItems.push(await resolveWardrobeDraft(repository, request.auth.user.id, raw, inUseAssetIds));
    // One transaction for every item in the batch (see createWardrobeItemsBatch):
    // either the whole reviewed batch is saved, or none of it is.
    const items = await repository.createWardrobeItemsBatch(request.auth.user.id, resolvedItems.map((entry) => entry.payload));
    await Promise.all(resolvedItems.map((entry) => repository.pruneAnalysisJobResult(entry.analysisJobId).catch(() => {})));
    response.status(201).json({items: await Promise.all(items.map((item) => publicWardrobeItem(assetStore, item)))});
  });
  route.post("/wardrobe/links", authenticate, async (request, response) => {
    const item = await repository.createWardrobeItem(request.auth.user.id, {sourceType: "product_link", name: text(request.body?.name, "name", {max: 160}), category: wardrobeCategory(request.body?.category), tags: cleanTags(request.body?.tags), mediaAssetId: null, imageStorageKey: null, productUrl: productUrl(request.body?.productUrl)});
    response.status(201).json({item: await publicWardrobeItem(assetStore, item)});
  });
  route.delete("/wardrobe/items/:itemId", authenticate, async (request, response) => {
    const item = await repository.getWardrobeItem(request.params.itemId);
    assert(item && item.userId === request.auth.user.id && !item.deletedAt, 404, "WARDROBE_ITEM_NOT_FOUND", "The wardrobe item was not found.");
    // The DB side (wardrobe_items soft-delete + media_assets archive + tag/
    // analysis cleanup) commits as one transaction, so it can never diverge
    // from what Cloudinary ends up holding. Cloudinary removal is therefore
    // best-effort here — a failure doesn't error the request or leave the
    // item stuck; the periodic cleanup sweep retries it (see cleanup.js).
    await repository.deleteWardrobeItem(item.id, item.mediaAssetId);
    if (item.imageStorageKey) {
      await assetStore.remove(item.imageStorageKey).catch(() => {});
    }
    response.sendStatus(204);
  });

  route.post("/outfits/generate", authenticate, async (request, response) => {
    const eventType = outfitEventType(request.body?.eventType);
    const wardrobe = await repository.listWardrobe(request.auth.user.id);
    assert(wardrobe.length >= 2, 400, "WARDROBE_TOO_SMALL", "Add at least 2 wardrobe items before generating an outfit.");
    const profile = await repository.getProfile(request.auth.user.id);
    const affinity = await repository.getWardrobeAffinity(request.auth.user.id);
    const suggestion = await analyzer.suggestOutfit({eventType, profile, wardrobe, affinityNotes: buildAffinityNotes(wardrobe, affinity)});
    const wardrobeIds = new Set(wardrobe.map((item) => item.id));
    const wardrobeItemIds = [...new Set(suggestion.wardrobe_item_ids || [])].filter((id) => wardrobeIds.has(id));
    assert(wardrobeItemIds.length > 0, 502, "INVALID_OUTFIT_SELECTION", "The styling AI did not return a valid outfit from your wardrobe.");
    const suggestedPurchaseItem = sanitizeSuggestedPurchase(suggestion.suggested_purchase_item);
    const outfit = await repository.createOutfit(request.auth.user.id, {eventType, rationale: suggestion.rationale, wardrobeItemIds, suggestedPurchaseItem, analysisContext: {wardrobeItemCount: wardrobe.length}});
    response.status(201).json({outfit: {...publicOutfit(outfit), matchScore: computeMatchScore(wardrobeItemIds, affinity)}});
  });

  route.get("/outfits", authenticate, async (request, response) => {
    const outfits = await repository.listOutfits(request.auth.user.id, {limit: 30});
    response.json({outfits: outfits.map((outfit) => ({...publicOutfit(outfit), feedback: outfit.feedback || null}))});
  });

  route.post("/outfits/:outfitId/feedback", authenticate, async (request, response) => {
    const outfit = await repository.getOutfit(request.params.outfitId);
    assert(outfit && outfit.userId === request.auth.user.id, 404, "OUTFIT_NOT_FOUND", "The outfit was not found.");
    const reaction = outfitReaction(request.body?.reaction);
    const feedback = await repository.upsertOutfitFeedback(request.auth.user.id, outfit.id, {reaction});
    response.status(200).json({feedback: publicFeedback(feedback)});
  });

  route.post("/outfits/:outfitId/wear", authenticate, async (request, response) => {
    const outfit = await repository.getOutfit(request.params.outfitId);
    assert(outfit && outfit.userId === request.auth.user.id, 404, "OUTFIT_NOT_FOUND", "The outfit was not found.");
    const feedback = await repository.upsertOutfitFeedback(request.auth.user.id, outfit.id, {wornAt: new Date().toISOString()});
    response.status(200).json({feedback: publicFeedback(feedback)});
  });

  route.post("/tryon/generate", authenticate, async (request, response) => {
    const wardrobeItemIds = wardrobeItemIdList(request.body?.wardrobeItemIds);
    logDevelopment(config, `try-on selected wardrobe IDs: ${wardrobeItemIds.join(", ")}`);
    const outfitId = request.body?.outfitId ? text(request.body.outfitId, "outfitId", {max: 100}) : null;
    if (outfitId) {
      const outfit = await repository.getOutfit(outfitId);
      assert(outfit && outfit.userId === request.auth.user.id, 404, "OUTFIT_NOT_FOUND", "The outfit was not found.");
    }
    const wardrobe = await repository.listWardrobe(request.auth.user.id);
    const wardrobeById = new Map(wardrobe.map((item) => [item.id, item]));
    const garmentItems = wardrobeItemIds.map((itemId) => wardrobeById.get(itemId));
    assert(garmentItems.every(Boolean), 404, "WARDROBE_ITEM_NOT_FOUND", "One or more wardrobe items were not found.");
    for (const item of garmentItems) {
      logDevelopment(config, `try-on wardrobe asset: id=${item.id} provider=${item.imageStorageProvider || "missing"}`);
      assert(item.mediaAssetId && item.imageStorageKey, 400, "WARDROBE_ITEM_HAS_NO_IMAGE", `Re-upload photo for ${item.name} (${item.id}) to use Virtual Try-On.`);
      assert(item.imageStorageProvider === "cloudinary", 400, "WARDROBE_ASSET_UNAVAILABLE", `Re-upload photo for ${item.name} (${item.id}); its image is not available in Cloudinary.`);
    }

    const profile = await repository.getProfile(request.auth.user.id);
    assert(profile?.profileImageAssetId && profile.profileImageStorageKey, 400, "PROFILE_PHOTO_REQUIRED", "Analyze your style profile with a full-body photo before using virtual try-on.");
    logDevelopment(config, `try-on profile asset: id=${profile.profileImageAssetId} provider=${profile.profileImageStorageProvider || "missing"}`);
    assert(profile.profileImageStorageProvider === "cloudinary", 400, "PROFILE_ASSET_UNAVAILABLE", "Re-upload your full-body profile photo; it is not available in Cloudinary.");

    // Fetch the profile photo and every garment photo from Cloudinary
    // concurrently rather than one at a time, since they're independent
    // reads — this is the dominant latency cost before the Gemini call.
    const [profileFile, garmentFiles] = await Promise.all([
      readTryOnAsset({config, assetStore, storageKey: profile.profileImageStorageKey, description: `profile id=${profile.profileImageAssetId}`, error: new ApiError(422, "PROFILE_ASSET_FETCH_FAILED", "Re-upload your full-body profile photo; the stored Cloudinary image could not be retrieved.")}),
      Promise.all(garmentItems.map((item) => readTryOnAsset({
        config,
        assetStore,
        storageKey: item.imageStorageKey,
        description: `wardrobe id=${item.id} name=${JSON.stringify(item.name)}`,
        error: new ApiError(422, "WARDROBE_ASSET_FETCH_FAILED", `Re-upload photo for ${item.name} (${item.id}); the stored Cloudinary image could not be retrieved.`),
      }))),
    ]);
    for (const file of [profileFile, ...garmentFiles]) {
      assert(file.buffer.length <= MAX_FETCHED_ASSET_BYTES, 502, "ASSET_TOO_LARGE", "A stored image is too large to process.");
    }

    const generation = await tryonProvider.generate({
      profileFile,
      garmentFiles,
      notes: garmentItems.map((item) => `${item.category}: ${item.name}`).join("; "),
    });
    const processed = await processUploadedFile({buffer: generation.buffer, mimetype: generation.mimeType, originalname: "tryon-result.jpg", size: generation.buffer.length}, "tryon_result");
    const stored = await assetStore.save(request.auth.user.id, processed, "tryon_result");
    let resultAsset;
    try {
      resultAsset = await repository.createAsset({userId: request.auth.user.id, purpose: "tryon_result", ...stored});
      const tryOn = await repository.createTryOnRequest(request.auth.user.id, {
        outfitId,
        wardrobeItemIds,
        profileMediaAssetId: profile.profileImageAssetId,
        resultMediaAssetId: resultAsset.id,
        status: "completed",
        provider: generation.developmentFallback ? "development_fallback" : "gemini",
        model: generation.developmentFallback ? null : config.geminiImageModel,
        completedAt: new Date().toISOString(),
      });
      response.status(201).json({tryOn: await publicTryOn(assetStore, tryOn, stored.storageKey, generation.developmentFallback)});
    } catch (error) {
      await cleanupOrphanedAsset(assetStore, repository, stored.storageKey, resultAsset);
      throw error;
    }
  });

  route.post("/tryon/:id/save", authenticate, async (request, response) => {
    const tryOn = await repository.getTryOnRequest(request.params.id);
    assert(tryOn && tryOn.userId === request.auth.user.id, 404, "TRYON_NOT_FOUND", "The try-on result was not found.");
    const saved = await repository.markTryOnSaved(tryOn.id);
    const resultAsset = await repository.getAsset(saved.resultMediaAssetId);
    response.json({tryOn: await publicTryOn(assetStore, saved, resultAsset?.storageKey || "", false)});
  });

  route.get("/tryon/saved", authenticate, async (request, response) => {
    const items = await repository.listSavedTryOns(request.auth.user.id);
    response.json({tryOns: await Promise.all(items.map((tryOn) => publicTryOn(assetStore, tryOn, tryOn.resultStorageKey || "", false)))});
  });

  route.post("/tryon/:id/unsave", authenticate, async (request, response) => {
    const tryOn = await repository.getTryOnRequest(request.params.id);
    assert(tryOn && tryOn.userId === request.auth.user.id, 404, "TRYON_NOT_FOUND", "The try-on result was not found.");
    const unsaved = await repository.unsaveTryOn(tryOn.id);
    const resultAsset = await repository.getAsset(unsaved.resultMediaAssetId);
    response.json({tryOn: await publicTryOn(assetStore, unsaved, resultAsset?.storageKey || "", false)});
  });

  app.use("/api/v1", route);
  app.use((_request, _response, next) => next(new ApiError(404, "NOT_FOUND", "Endpoint not found.")));
  app.use((error, _request, response, _next) => {
    if (error instanceof multer.MulterError) error = new ApiError(error.code === "LIMIT_FILE_SIZE" ? 413 : 400, error.code, error.code === "LIMIT_FILE_SIZE" ? "Images must be 5 MB or smaller." : error.message);
    const status = error.status || 500;
    if (status >= 500) console.error(error);
    if (config.env === "development") console.error(`[NERA API ${error.code || "INTERNAL_ERROR"}]`, error.message);
    const message = error.code === "WARDROBE_ITEM_HAS_NO_IMAGE" || status < 500
      ? error.message
      : "The server could not complete the request.";
    response.status(status).json({error: {code: error.code || "INTERNAL_ERROR", message, ...(error.details ? {details: error.details} : {})}});
  });
  return app;
}

// Best-effort cleanup for an asset that was stored but should not be kept:
// either the request that created it failed after upload (a rejected
// analysis, a DB error), or it is being superseded by a newly saved asset.
// Storage/DB failures here are swallowed so cleanup never masks, or itself
// becomes, the error the caller is already handling.
const cleanupOrphanedAsset = async (assetStore, repository, storageKey, asset) => {
  await assetStore.remove(storageKey).catch(() => {});
  if (asset) await repository.archiveAsset(asset.id).catch(() => {});
};

const publicUser = (user) => ({id: user.id, name: user.name, dateOfBirth: user.dateOfBirth, phoneNumber: user.phoneNumber, phoneVerifiedAt: user.phoneVerifiedAt});
const publicWardrobeItem = async (assetStore, item) => ({id: item.id, name: item.name, category: item.category, sourceType: item.sourceType, imageUrl: await assetStore.signedUrl(item.imageStorageKey), imageStorageProvider: item.imageStorageProvider || null, productUrl: item.productUrl, tags: item.tags, primaryColor: item.primaryColor || null, secondaryColors: item.secondaryColors || [], material: item.material || null, pattern: item.pattern || null, season: item.season || [], occasion: item.occasion || [], styleTags: item.styleTags || [], createdAt: item.createdAt});
const publicProfile = async (assetStore, profile) => ({...profile, profileImageUrl: await assetStore.signedUrl(profile.profileImageStorageKey)});

const logDevelopment = (config, message) => {
  if (config.env === "development") console.info(`[NERA try-on] ${message}`);
};

const readTryOnAsset = async ({config, assetStore, storageKey, description, error}) => {
  try {
    const file = await assetStore.readBytes(storageKey);
    logDevelopment(config, `asset fetch success: ${description}`);
    return file;
  } catch (cause) {
    logDevelopment(config, `asset fetch failure: ${description} code=${cause.code || cause.name || "UNKNOWN"}`);
    throw error;
  }
};
const publicOutfit = (outfit) => ({id: outfit.id, eventType: outfit.eventType, wardrobeItemIds: outfit.wardrobeItemIds, rationale: outfit.rationale, suggestedPurchaseItem: outfit.suggestedPurchaseItem || null, createdAt: outfit.createdAt});
const publicFeedback = (feedback) => ({outfitId: feedback.outfitId, reaction: feedback.reaction || null, wornAt: feedback.wornAt || null, updatedAt: feedback.updatedAt});
const publicTryOn = async (assetStore, tryOn, resultStorageKey, developmentFallback) => ({id: tryOn.id, outfitId: tryOn.outfitId || null, wardrobeItemIds: tryOn.wardrobeItemIds, imageUrl: await assetStore.signedUrl(resultStorageKey), status: tryOn.status, isSaved: tryOn.isSaved, developmentFallback: !!developmentFallback, createdAt: tryOn.createdAt});

// Surfaces a compact preference summary (not the whole history) to the
// styling AI so it can lean toward previously liked/worn items; this is a
// hint, not a hard filter — the local matchScore below is the source of
// truth for "personalized score" shown to the user.
const buildAffinityNotes = (wardrobe, affinity) => {
  const entries = wardrobe
    .map((item) => ({id: item.id, name: item.name, score: affinity[item.id] || 0}))
    .filter((entry) => entry.score !== 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
    .map((entry) => ({id: entry.id, name: entry.name, affinity: entry.score > 0 ? "positive" : "negative"}));
  return entries.length ? entries : null;
};

// A simple, local (non-AI) 0-100 personalization score for a chosen outfit:
// items with no feedback history sit at a neutral baseline, and each past
// reaction/wear nudges their contribution up or down.
const computeMatchScore = (wardrobeItemIds, affinity) => {
  if (!wardrobeItemIds.length) return null;
  const neutral = 60;
  const scores = wardrobeItemIds.map((id) => Math.max(0, Math.min(100, neutral + (affinity[id] || 0) * 8)));
  return Math.round(scores.reduce((sum, value) => sum + value, 0) / scores.length);
};
const cleanTags = (value) => Array.isArray(value) ? [...new Set(value.filter((tag) => typeof tag === "string").map((tag) => tag.trim().toLowerCase()).filter(Boolean))].slice(0, 12) : [];
const cleanStringArray = (value, max = 6) => Array.isArray(value) ? [...new Set(value.filter((entry) => typeof entry === "string").map((entry) => entry.trim()).filter(Boolean))].slice(0, max) : [];

// Shared by POST /wardrobe/items and POST /wardrobe/items/batch: resolves a
// draft's asset + analysis job, checks it isn't already saved (including
// against other items already resolved earlier in the same batch, via the
// shared inUseAssetIds set), and builds the createWardrobeItem payload from
// the analysis JSON.
const resolveWardrobeDraft = async (repository, userId, raw, inUseAssetIds) => {
  const assetId = text(raw?.assetId, "assetId", {max: 100});
  const analysisJobId = text(raw?.analysisJobId, "analysisJobId", {max: 100});
  const asset = await repository.getAsset(assetId);
  assert(asset && asset.userId === userId && asset.purpose === "wardrobe_item", 404, "ASSET_NOT_FOUND", "The wardrobe image was not found.");
  const analysisJob = await repository.getAnalysisJob(analysisJobId);
  assert(analysisJob && analysisJob.userId === userId && analysisJob.mediaAssetId === asset.id && analysisJob.analysisType === "wardrobe_item", 404, "ANALYSIS_NOT_FOUND", "The wardrobe analysis was not found.");
  assert(!inUseAssetIds.has(asset.id), 409, "ASSET_IN_USE", "The image already belongs to a wardrobe item.");
  inUseAssetIds.add(asset.id);
  const metadata = analysisJob.result || {};
  return {
    analysisJobId: analysisJob.id,
    payload: {
      sourceType: "upload", name: text(raw?.name, "name", {max: 160}), category: wardrobeCategory(raw?.category), tags: cleanTags(raw?.tags),
      mediaAssetId: asset.id, analysisJobId: analysisJob.id, imageStorageKey: asset.storageKey, imageStorageProvider: asset.storageProvider, productUrl: null,
      primaryColor: typeof metadata.color === "string" ? metadata.color.trim().slice(0, 100) || null : null,
      material: typeof metadata.material === "string" ? metadata.material.trim().slice(0, 160) || null : null,
      pattern: typeof metadata.pattern === "string" ? metadata.pattern.trim().slice(0, 120) || null : null,
      season: cleanStringArray(metadata.season, 4),
      occasion: cleanStringArray(metadata.occasion, 6),
      styleTags: cleanStringArray(metadata.style),
    },
  };
};
// The suggested purchase comes from the styling AI, not a trusted product
// catalog: keep only a plain name/type pair (never a URL) so nothing it
// hallucinates can be surfaced as a clickable link to the client.
const sanitizeSuggestedPurchase = (value) => {
  if (!value || typeof value !== "object") return null;
  const name = typeof value.name === "string" ? value.name.trim().slice(0, 160) : "";
  const type = typeof value.type === "string" ? value.type.trim().slice(0, 80) : "";
  return name && type ? {name, type} : null;
};

module.exports = {createApp};
