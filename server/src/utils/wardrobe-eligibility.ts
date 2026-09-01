// Direct Virtual Try-On composites a wardrobe item's stored photo as-is —
// there is no garment isolation/cropping step — so a photo with a person in
// it is never safe to send directly, regardless of what the analysis
// provider itself reports. This is the single source of truth for that
// rule; both the /wardrobe/analyze draft response and the saved wardrobe
// item derive virtualTryOnEligible from it.
export function resolveVirtualTryOnEligibility(result: {virtual_tryon_eligible?: boolean; contains_person?: boolean} | null | undefined): boolean {
  return Boolean(result?.virtual_tryon_eligible) && !result?.contains_person;
}
