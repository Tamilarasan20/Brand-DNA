/**
 * POST /api/agents/nick
 * Performance analytics — winners, losers, insights, next actions
 */

import { NextResponse } from 'next/server';
import { runNick, type NickInput, type NickContentItem } from '@/lib/agents/nick';
import { loadBrandContext } from '@/lib/agents/_loadBrand';
import { meterIfAuthed } from '@/lib/withCredits';

export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Partial<NickInput> & { businessId?: string };

    if (!Array.isArray(body.items)) {
      return NextResponse.json({ error: 'items must be an array of content performance records' }, { status: 400 });
    }

    const metered = await meterIfAuthed('nick', 'analyze');
    if (!metered.ok) return metered.response;

    const brand = await loadBrandContext(body.businessId);

    const result = await runNick({
      businessName: brand.businessName,
      brandVoice: brand.brandVoice,
      items: body.items as NickContentItem[],
      goal: body.goal,
      periodLabel: body.periodLabel,
    });

    return NextResponse.json({ agent: 'nick', remaining: metered.remaining, result });
  } catch (error) {
    console.error('[API/nick] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Nick failed' },
      { status: 500 },
    );
  }
}
