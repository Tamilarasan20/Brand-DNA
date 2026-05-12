/**
 * THEO — AI Video Producer
 *
 * Plans and scripts short-form video content for TikTok, Instagram Reels,
 * YouTube Shorts. Generates a full shot list, hook, voiceover, captions,
 * b-roll suggestions, music mood, and CTA — all platform-locked.
 */

import { BrandVoice, Platform } from '@/types/agents';
import { callGemini } from '../gemini';
import { buildBrandContext } from '../brandVoiceEngine';

export type VideoPlatform = 'tiktok' | 'instagram' | 'youtube' | 'linkedin' | 'twitter';

const PLATFORM_SPECS: Record<VideoPlatform, { aspectRatio: string; idealLengthSec: [number, number]; dimensions: string }> = {
  tiktok:    { aspectRatio: '9:16', idealLengthSec: [15, 60],  dimensions: '1080x1920' },
  instagram: { aspectRatio: '9:16', idealLengthSec: [15, 90],  dimensions: '1080x1920' },
  youtube:   { aspectRatio: '9:16', idealLengthSec: [30, 60],  dimensions: '1080x1920' },
  linkedin:  { aspectRatio: '1:1',  idealLengthSec: [30, 90],  dimensions: '1080x1080' },
  twitter:   { aspectRatio: '16:9', idealLengthSec: [15, 45],  dimensions: '1920x1080' },
};

export interface TheoInput {
  topic: string;
  businessName: string;
  brandVoice: BrandVoice;
  platform: VideoPlatform;
  goal?: string;
  durationSec?: number;
  style?: 'talking-head' | 'cinematic' | 'tutorial' | 'ugc' | 'animation' | 'product-demo';
  hookExamples?: string[];
}

export interface TheoShot {
  shotNumber: number;
  durationSec: number;
  visual: string;
  voiceover: string;
  onScreenText: string;
  bRoll: string[];
  cameraMovement: string;
  transition: string;
}

export interface TheoOutput {
  title: string;
  hook: string;
  fullScript: string;
  shots: TheoShot[];
  totalDurationSec: number;
  platform: VideoPlatform;
  aspectRatio: string;
  dimensions: string;
  captions: { time: string; text: string }[];
  musicMood: string;
  soundEffects: string[];
  thumbnailIdea: string;
  caption: string;
  hashtags: string[];
  callToAction: string;
  productionNotes: string[];
}

export async function runTheo(input: TheoInput): Promise<TheoOutput> {
  const { topic, businessName, brandVoice, platform, goal, durationSec, style = 'cinematic', hookExamples = [] } = input;

  const spec = PLATFORM_SPECS[platform];
  const targetDuration = durationSec ?? spec.idealLengthSec[0];
  const brandContext = buildBrandContext(brandVoice, businessName);

  const prompt = `You are THEO, a top-tier short-form video producer for ${businessName}.

Brand: ${brandContext}

Video brief:
- Topic: ${topic}
- Platform: ${platform} (${spec.aspectRatio}, ${spec.dimensions})
- Target duration: ${targetDuration}s
- Style: ${style}
${goal ? `- Goal: ${goal}` : ''}
${hookExamples.length ? `- Hook references: ${hookExamples.join(' | ')}` : ''}

Produce a complete short-form video plan with shot-by-shot direction. The opening 1.5 seconds is the most important moment — it must stop the scroll. Build the script around platform native patterns (pattern interrupt, curiosity gap, payoff).

Return STRICT JSON:
{
  "title": "Working title",
  "hook": "First 1.5s — the scroll-stopper",
  "fullScript": "Complete voiceover script with [SHOT N] markers",
  "shots": [
    {
      "shotNumber": 1,
      "durationSec": 1.5,
      "visual": "What's on screen — concrete visual description",
      "voiceover": "What the narrator says",
      "onScreenText": "Burned-in caption / kinetic text",
      "bRoll": ["b-roll clip 1", "b-roll clip 2"],
      "cameraMovement": "static | push-in | pull-out | pan-left | whip-pan | handheld",
      "transition": "cut | whip-pan | match-cut | jump-cut | fade"
    }
  ],
  "totalDurationSec": ${targetDuration},
  "platform": "${platform}",
  "aspectRatio": "${spec.aspectRatio}",
  "dimensions": "${spec.dimensions}",
  "captions": [
    { "time": "0:00", "text": "Caption text appearing on screen" }
  ],
  "musicMood": "Specific mood / BPM / genre suggestion",
  "soundEffects": ["whoosh on transition 1", "ding on reveal"],
  "thumbnailIdea": "What the cover frame should look like",
  "caption": "Platform caption (description below the video)",
  "hashtags": ["#tag1", "#tag2"],
  "callToAction": "One clear CTA at the end",
  "productionNotes": ["Lighting, framing, edit pace notes"]
}`;

  try {
    const result = await callGemini({
      taskType: 'steve-design',
      prompt,
      mimeType: 'application/json',
      minLength: 500,
    });
    return JSON.parse(result.text);
  } catch (error) {
    console.error('[THEO] Error:', error);
    return {
      title: topic,
      hook: `Wait — ${topic}?`,
      fullScript: `[SHOT 1] Wait — ${topic}?\n[SHOT 2] Here's why it matters.\n[SHOT 3] ${brandVoice.tagline || businessName}.`,
      shots: [
        { shotNumber: 1, durationSec: 1.5, visual: 'Close-up of subject', voiceover: `Wait — ${topic}?`, onScreenText: topic.toUpperCase(), bRoll: [], cameraMovement: 'push-in', transition: 'cut' },
        { shotNumber: 2, durationSec: 8,   visual: 'Talking head, mid-shot', voiceover: 'Here\'s why it matters.', onScreenText: '', bRoll: ['product shot'], cameraMovement: 'static', transition: 'cut' },
        { shotNumber: 3, durationSec: 5,   visual: 'Logo end card', voiceover: brandVoice.tagline || businessName, onScreenText: businessName, bRoll: [], cameraMovement: 'static', transition: 'fade' },
      ],
      totalDurationSec: targetDuration,
      platform,
      aspectRatio: spec.aspectRatio,
      dimensions: spec.dimensions,
      captions: [{ time: '0:00', text: topic }],
      musicMood: 'Upbeat, 120 BPM, modern pop',
      soundEffects: ['whoosh', 'pop'],
      thumbnailIdea: `Bold text "${topic.toUpperCase()}" over brand-coloured background`,
      caption: `${topic} — ${businessName}`,
      hashtags: brandVoice.values.slice(0, 5).map((v) => `#${v.replace(/\s+/g, '')}`),
      callToAction: 'Follow for more',
      productionNotes: ['Shoot vertical', 'Hard cuts every 2-3s for retention'],
    };
  }
}
