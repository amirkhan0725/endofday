import { createAdminClient } from '@/lib/supabase-server';

// Simple in-memory rate limiter — resets on cold start
const ackWindows = new Map<string, { count: number; windowStart: number }>();
const ACK_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const ACK_LIMIT = 10; // max 10 acknowledges per IP per hour

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const rec = ackWindows.get(ip);
  if (!rec || now - rec.windowStart > ACK_WINDOW_MS) {
    ackWindows.set(ip, { count: 1, windowStart: now });
    return false;
  }
  if (rec.count >= ACK_LIMIT) return true;
  rec.count++;
  return false;
}

export async function POST(
  request: Request,
  ctx: { params: Promise<{ reportId: string }> },
) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'anonymous';
  if (isRateLimited(ip)) {
    return Response.json({ error: 'Too many requests' }, { status: 429 });
  }

  const { reportId } = await ctx.params;
  if (!reportId?.trim()) {
    return Response.json({ error: 'Missing report ID' }, { status: 400 });
  }

  let body: { name?: string; email?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const name = body.name?.trim().slice(0, 120);
  if (!name) {
    return Response.json({ error: 'Name is required' }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase().slice(0, 200) || null;

  const admin = createAdminClient();
  const { error } = await admin.from('report_acknowledgments').insert({
    report_id: reportId,
    acknowledged_by: name,
    acknowledged_email: email,
  });

  if (error) {
    console.error('Acknowledge insert error:', error.message);
    return Response.json({ error: 'Failed to record acknowledgment' }, { status: 500 });
  }

  return Response.json({ success: true });
}
