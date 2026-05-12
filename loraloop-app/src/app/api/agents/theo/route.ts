/**
 * POST /api/agents/theo
 * Short-form video plan + shot list
 */

import { NextResponse } from 'next/server';
import { runTheo, type TheoInput, type VideoPlatform } from '@/lib/agents/theo';
import { loadBrandContext } from '@/lib/agents/_loadBrand';
import { meterIfAuthed } from '@/lib/withCredits';

export const maxDuration = 60;

const VALID_PLATFORMS: VideoPlatform[] = ['tiktok', 'instagram', 'youtube', 'linkedin', 'twitter'];

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Partial<TheoInput> & { businessId?: string };

    if (!body.topic) {
      return NextResponse.json({ error: 'Missing required field: topic' }, { status: 400 });
    }
    if (!body.platform || !VALID_PLATFORMS.includes(body.platform)) {
      return NextResponse.json({ error: `platform must be one of: ${VALID_PLATFORMS.join(', ')}` }, { status: 400 });
    }

    const metered = await meterIfAuthed('theo', 'video');
    if (!metered.ok) return metered.response;

    const brand = await loadBrandContext(body.businessId);

    const result = await runTheo({
      topic: body.topic,
      businessName: brand.businessName,
      brandVoice: brand.brandVoice,
      platform: body.platform,
      goal: body.goal,
      durationSec: body.durationSec,
      style: body.style,
      hookExamples: body.hookExamples,
    });

    return NextResponse.json({ agent: 'theo', remaining: metered.remaining, result });
  } catch (error) {
    console.error('[API/theo] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Theo failed' },
      { status: 500 },
    );
  }
}
