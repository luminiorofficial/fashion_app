export interface StyleProfile {
  userId?: string;
  bodyType?: string | null;
  skinTone?: string | null;
  skinUndertone?: string | null;
  hairColor?: string | null;
  facialStructure?: string | null;
  styleAttributes?: string[];
  stylingNotes?: string | null;
  profileImageAssetId?: string | null;
  profileImageStorageKey?: string | null;
  profileImageStorageProvider?: string | null;
  latestAnalysisJobId?: string | null;
  updatedAt?: string;
}

export interface SaveProfileInput {
  bodyType: string | null;
  skinTone: string | null;
  skinUndertone: string | null;
  hairColor: string | null;
  facialStructure: string | null;
  styleAttributes: string[];
  stylingNotes: string | null;
  profileImageAssetId: string;
  profileImageStorageKey: string;
  profileImageStorageProvider: string;
  latestAnalysisJobId: string;
}

export interface PublicProfile {
  bodyType?: string | null;
  skinTone?: string | null;
  skinUndertone?: string | null;
  hairColor?: string | null;
  facialStructure?: string | null;
  styleAttributes?: string[];
  stylingNotes?: string | null;
  preferredStyles?: string[];
  profileImageUrl: string;
  updatedAt?: string;
}

export interface ProfileAnalysisResult {
  body_shape: string;
  skin_tone: string;
  skin_undertone: string | null;
  hair_color: string | null;
  facial_structure: string | null;
  style_attributes: string[];
  styling_notes: string;
}

export interface FullLengthValidationResult {
  is_full_length: boolean;
  reasons: string[];
}
