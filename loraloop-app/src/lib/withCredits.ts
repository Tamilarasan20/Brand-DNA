import { NextResponse } from 'next/server';
import { getCurrentUser } from './supabase-server';
import { checkAndDeduct, CreditError } from './credits';

/**
 * Lightweight metering for routes that pre-date the billing system:
 * deducts credits only if the user is logged in, otherwise lets the request
 * through unchanged. Returns 402 when the user IS logged in but is out
 * of credits or past_due. Use this for routes that have public callers we
 * don't want to break yet — flip to `withCredits` once auth is mandatory.
 */
export async function meterIfAuthed(
  agent: string,
  action: string,
): Promise<{ ok: true; remaining?: number } | { ok: false; response: Response }> {
  const user = await getCurrentUser();
  if (!user) return { ok: true };

  try {
    const { remaining } = await checkAndDeduct(user.id, agent, action);
    return { ok: true, remaining };
  } catch (err) {
    if (err instanceof CreditError) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: err.message, reason: err.reason },
          { status: err.status },
        ),
      };
    }
    throw err;
  }
}

/**
 * Gate an API route handler behind authentication + credit metering.
 *
 * Usage:
 *
 *   export const POST = withCredits('clara', 'content', async (req, ctx) => {
 *     // ctx.user.id, ctx.deducted, ctx.remaining are available
 *     return NextResponse.json({ ok: true });
 *   });
 *
 * The wrapper:
 *   - returns 401 if no auth user
 *   - returns 402 if credits exhausted or payment past_due
 *   - deducts credits BEFORE running the handler so a successful run
 *     never overspends. If the handler throws, the deduction stands (this
 *     matches how OpenAI / most AI products work — partial output still costs).
 */
export function withCredits<TArgs extends unknown[]>(
  agent:   string,
  action:  string,
  handler: (req: Request, ctx: { userId: string; deducted: number; remaining: number }, ...args: TArgs) => Promise<Response>,
) {
  return async (req: Request, ...args: TArgs): Promise<Response> => {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    let deducted: number;
    let remaining: number;
    try {
      ({ deducted, remaining } = await checkAndDeduct(user.id, agent, action));
    } catch (err) {
      if (err instanceof CreditError) {
        return NextResponse.json(
          { error: err.message, reason: err.reason },
          { status: err.status },
        );
      }
      throw err;
    }

    return handler(req, { userId: user.id, deducted, remaining }, ...args);
  };
}
