import { NextResponse } from 'next/server';
import { PLANS } from '@/lib/billing';

export async function GET() {
  return NextResponse.json(PLANS);
}
