/**
 * Loraloop Brand DNA - Type Definitions
 */

export interface EnrichedData {
  brandName: string;
  businessOverview: string;
  brandValues: string[];
  brandAesthetic: string;
  toneOfVoice: string;
  tagline: string;
  logoUrl?: string;
}

export interface BrandColors {
  primary?: string;
  secondary?: string;
  background?: string;
  accent?: string;
  textHighContrast?: string;
  [key: string]: string | undefined;
}

export interface BrandTypography {
  headingFont: string;
  bodyFont: string;
}

export interface BrandGuidelines {
  colors: BrandColors;
  typography: BrandTypography;
  logos?: string[];
  images: string[];
}

export interface BusinessKnowledgeBase {
  enrichedData: EnrichedData;
  brandGuidelines: BrandGuidelines;
  businessProfile?: string;
  marketResearch?: string;
  socialStrategy?: string;
}

export interface BrandVoice {
  tone: string;
  vocabulary: string[];
  colors: BrandColors;
  fonts: BrandTypography;
  imageStyle: string;
  videoStyle: string;
  tagline: string;
  values: string[];
  aesthetic: string;
}
