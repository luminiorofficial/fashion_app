import {assert} from "../utils/api-error";
import {text} from "./common.validators";
import {outfitEventTypes, outfitReactions} from "../config/constants";

export function outfitEventType(value: unknown): string {
  const clean = text(value, "eventType", {max: 40});
  assert(outfitEventTypes.includes(clean as (typeof outfitEventTypes)[number]), 400, "INVALID_EVENT_TYPE", `eventType must be one of: ${outfitEventTypes.join(", ")}.`);
  return clean;
}

export function outfitReaction(value: unknown): string {
  const clean = text(value, "reaction", {max: 20});
  assert(outfitReactions.includes(clean as (typeof outfitReactions)[number]), 400, "INVALID_REACTION", `reaction must be one of: ${outfitReactions.join(", ")}.`);
  return clean;
}
