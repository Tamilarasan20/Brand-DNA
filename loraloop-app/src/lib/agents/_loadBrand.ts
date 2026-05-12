/**
 * Shared brand-loading helper used by autonomous agent API routes.
 * Loads a business from Supabase by id, or falls back to mock data.
 */

import type { BrandVoice, BusinessKnowledgeBase } from '@/types/agents';
import { extractBrandVoice } from '../brandVoiceEngine';
import { getMockBusiness } from '../mockData';
import { getServiceSupabase } from '../supabase';

export interface BrandContext {
  businessName: string;
  brandVoice: BrandVoice;
  kb: BusinessKnowledgeBase;
}

export async function loadBrandContext(businessId?: string): Promise<BrandContext> {
  let kb: BusinessKnowledgeBase;

  if (businessId) {
    try {
      const supabase = getServiceSupabase();
      const { data } = await supabase
        .from('businesses')
        .select('*')
        .eq('id', businessId)
        .single();

      if (data) {
        const enrichedData = data.enriched_data || {};
        const brandGuidelines = data.brand_guidelines || {};

        const colorsArray: Array<{ usage: string; hex: string }> = brandGuidelines.colors || [];
        const colorsObj = colorsArray.reduce((acc: Record<string, string>, c) => {
          acc[c.usage] = c.hex;
          return acc;
        }, {});

        const logosArray: Array<{ url: string }> = brandGuidelines.logos || [];
        const typographyArray: Array<{ usage: string; family: string }> = brandGuidelines.typography || [];
        const headingFont = typographyArray.find((t) => t.usage === 'headings')?.family || 'Inter Bold';
        const bodyFont = typographyArray.find((t) => t.usage === 'body')?.family || 'Inter Regular';

        kb = {
          enrichedData: {
            brandName: data.business_name || '',
            businessOverview: enrichedData.businessOverview || '',
            brandValues: enrichedData.brandValues || [],
            brandAesthetic: enrichedData.brandAesthetic || '',
            toneOfVoice: enrichedData.brandTone || enrichedData.toneOfVoice || '',
            tagline: enrichedData.tagline || '',
            logoUrl: logosArray[0]?.url || '',
          },
          brandGuidelines: {
            colors: colorsObj,
            typography: { headingFont, bodyFont },
            logos: logosArray.map((l) => l.url),
            images: brandGuidelines.images || [],
          },
          businessProfile: data.business_profile || '',
          marketResearch: data.market_research || '',
          socialStrategy: data.social_strategy || '',
        };
      } else {
        kb = getMockBusiness();
      }
    } catch (err) {
      console.warn('[loadBrandContext] Supabase load failed, using mock:', err);
      kb = getMockBusiness();
    }
  } else {
    kb = getMockBusiness();
  }

  return {
    businessName: kb.enrichedData.brandName,
    brandVoice: extractBrandVoice(kb),
    kb,
  };
}
