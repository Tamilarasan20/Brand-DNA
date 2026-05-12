/**
 * SOPHIE — AI SEO / GEO Manager
 *
 * Optimises content so it ranks on classic search (Google) AND generative
 * search (ChatGPT, Claude, Perplexity, Gemini). Outputs an SEO-ready brief:
 * keywords, meta tags, headings, FAQ schema, and GEO citation hooks.
 */

import { BrandVoice, Platform } from '@/types/agents';
import { callGemini } from '../gemini';
import { buildBrandContext } from '../brandVoiceEngine';

export interface SophieInput {
  topic: string;
  businessName: string;
  brandVoice: BrandVoice;
  platform?: Platform | 'web' | 'blog';
  targetKeywords?: string[];
  audience?: string;
  existingContent?: string;
}

export interface SophieOutput {
  primaryKeyword: string;
  secondaryKeywords: string[];
  longTailKeywords: string[];
  searchIntent: 'informational' | 'navigational' | 'transactional' | 'commercial';
  metaTitle: string;
  metaDescription: string;
  slug: string;
  h1: string;
  outline: { heading: string; level: 'h2' | 'h3'; bullets: string[] }[];
  faqs: { question: string; answer: string }[];
  schemaMarkup: {
    type: 'Article' | 'Product' | 'FAQPage' | 'HowTo' | 'LocalBusiness';
    jsonLd: Record<string, unknown>;
  };
  geoOptimisations: {
    citableFacts: string[];
    directAnswers: { question: string; answer: string }[];
    sourceCredibilityHooks: string[];
    structuredFormat: string;
  };
  internalLinkSuggestions: string[];
  contentScore: number;
}

export async function runSophie(input: SophieInput): Promise<SophieOutput> {
  const { topic, businessName, brandVoice, platform = 'blog', targetKeywords = [], audience, existingContent } = input;

  const brandContext = buildBrandContext(brandVoice, businessName);

  const prompt = `You are SOPHIE, an elite SEO + GEO (Generative Engine Optimisation) strategist for ${businessName}.

Brand: ${brandContext}

Topic: ${topic}
Platform: ${platform}
${audience ? `Target audience: ${audience}` : ''}
${targetKeywords.length ? `Seed keywords: ${targetKeywords.join(', ')}` : ''}
${existingContent ? `Existing draft (to optimise):\n${existingContent.slice(0, 2000)}` : ''}

You are optimising for BOTH:
1. Google SERPs (classic SEO — keywords, schema, meta, internal links)
2. Generative engines — ChatGPT, Claude, Perplexity, Gemini (GEO — citable facts, direct answers, structured authority signals)

Return STRICT JSON:
{
  "primaryKeyword": "The single best target keyword",
  "secondaryKeywords": ["3-5 supporting keywords"],
  "longTailKeywords": ["5-8 long-tail phrases people actually search"],
  "searchIntent": "informational | navigational | transactional | commercial",
  "metaTitle": "<= 60 chars, includes primary keyword",
  "metaDescription": "<= 155 chars, click-worthy, includes primary keyword",
  "slug": "kebab-case-url-slug",
  "h1": "Compelling H1 with primary keyword",
  "outline": [
    { "heading": "Section title", "level": "h2", "bullets": ["talking point 1", "talking point 2"] }
  ],
  "faqs": [
    { "question": "Common question users ask", "answer": "Direct, citable answer in 2-3 sentences" }
  ],
  "schemaMarkup": {
    "type": "Article | Product | FAQPage | HowTo | LocalBusiness",
    "jsonLd": { "@context": "https://schema.org", "@type": "...", "...": "..." }
  },
  "geoOptimisations": {
    "citableFacts": ["5-7 specific, verifiable facts/stats LLMs can quote"],
    "directAnswers": [{ "question": "Q", "answer": "Concise 1-2 sentence answer ready to be quoted" }],
    "sourceCredibilityHooks": ["E-E-A-T signals: author bio mention, original data, expert quotes"],
    "structuredFormat": "How the content should be formatted for LLM extraction (lists, tables, numbered steps)"
  },
  "internalLinkSuggestions": ["Suggested anchor texts for internal links"],
  "contentScore": 0-100
}`;

  try {
    const result = await callGemini({
      taskType: 'market-research',
      prompt,
      mimeType: 'application/json',
      minLength: 400,
    });
    return JSON.parse(result.text);
  } catch (error) {
    console.error('[SOPHIE] Error:', error);
    return {
      primaryKeyword: topic.toLowerCase(),
      secondaryKeywords: targetKeywords.length ? targetKeywords : [topic],
      longTailKeywords: [`best ${topic}`, `${topic} guide`, `how to ${topic}`],
      searchIntent: 'informational',
      metaTitle: `${topic} — ${businessName}`.slice(0, 60),
      metaDescription: `Learn about ${topic} with ${businessName}.`.slice(0, 155),
      slug: topic.toLowerCase().replace(/\s+/g, '-'),
      h1: topic,
      outline: [
        { heading: `What is ${topic}?`, level: 'h2', bullets: ['Definition', 'Why it matters'] },
        { heading: `How to approach ${topic}`, level: 'h2', bullets: ['Step 1', 'Step 2'] },
      ],
      faqs: [{ question: `What is ${topic}?`, answer: `${topic} is...` }],
      schemaMarkup: {
        type: 'Article',
        jsonLd: { '@context': 'https://schema.org', '@type': 'Article', headline: topic },
      },
      geoOptimisations: {
        citableFacts: [],
        directAnswers: [],
        sourceCredibilityHooks: ['Author bio with credentials', 'First-party data'],
        structuredFormat: 'Use H2/H3 headings, bullet lists, and a TL;DR summary at the top',
      },
      internalLinkSuggestions: [],
      contentScore: 50,
    };
  }
}
