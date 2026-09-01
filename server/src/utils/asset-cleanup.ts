import type {AssetStore} from "../types/provider.types";
import type {AssetsRepository} from "../types/repositories";
import {safeOperationalError} from "./safe-logging";

// Best-effort cleanup for an asset that was stored but should not be kept:
// either the request that created it failed after upload (a rejected
// analysis, a DB error), or it is being superseded by a newly saved asset.
// Storage/DB failures here are swallowed so cleanup never masks, or itself
// becomes, the error the caller is already handling.
export async function cleanupOrphanedAsset(
  assetStore: AssetStore,
  assets: AssetsRepository,
  storageKey: string | null | undefined,
  asset?: {id: string} | null,
): Promise<void> {
  if (storageKey) await assetStore.remove(storageKey).catch((error) => safeOperationalError("Media cleanup failed", error));
  if (asset) await assets.archiveAsset(asset.id).catch((error) => safeOperationalError("Media archive failed", error));
}
