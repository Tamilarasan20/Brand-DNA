/**
 * POST /api/agents/elena
 * Paid ad campaign plan + creatives + optimisation rules
 */

import { NextResponse } from 'next/server';
import { runElena, type ElenaInput, type AdNetwork, type CampaignObjective } from '@/lib/agents/elena';
import { loadBrandContext } from '@/lib/agents/_loadBrand';
import { meterIfAuthed } from '@/lib/withCredits';

export const maxDuration = 60;

const VALID_NETWORKS: AdNetwork[] = ['meta', 'google', 'tiktok', 'linkedin', 'youtube'];
const VALID_OBJECTIVES: CampaignObjective[] = ['awareness', 'traffic', 'leads', 'sales', 'app-installs', 'engagement'];

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Partial<ElenaInput> & { businessId?: string };

    if (!body.product) {
      return NextResponse.json({ error: 'Missing required field: product' }, { status: 400 });
    }
    if (!body.network || !VALID_NETWORKS.includes(body.network)) {
      return NextResponse.json({ error: `network must be one of: ${VALID_NETWORKS.join(', ')}` }, { status: 400 });
    }
    if (!body.objective || !VALID_OBJECTIVES.includes(body.objective)) {
      return NextResponse.json({ error: `objective must be one of: ${VALID_OBJECTIVES.join(', ')}` }, { status: 400 });
    }
    if (typeof body.budgetUsdPerDay !== 'number' || body.budgetUsdPerDay <= 0) {
      return NextResponse.json({ error: 'budgetUsdPerDay must be a positive number' }, { status: 400 });
    }

    const metered = await meterIfAuthed('elena', 'ads');
    if (!metered.ok) return metered.response;

    const brand = await loadBrandContext(body.businessId);

    const result = await runElena({
      product: body.product,
      businessName: brand.businessName,
      brandVoice: brand.brandVoice,
      network: body.network,
      objective: body.objective,
      budgetUsdPerDay: body.budgetUsdPerDay,
      durationDays: body.durationDays,
      audienceHints: body.audienceHints,
      currentPerformance: body.currentPerformance,
    });

    return NextResponse.json({ agent: 'elena', remaining: metered.remaining, result });
  } catch (error) {
    console.error('[API/elena] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Elena failed' },
      { status: 500 },
    );
  }
}
