import Anthropic from '@anthropic-ai/sdk';
import type { SubEntry, VisitorEntry } from '@/types';

// Client is created per-request so process.env is guaranteed populated at call time
function getClient() {
  // Named APP_ANTHROPIC_KEY (not ANTHROPIC_API_KEY) to avoid conflict with
  // the empty ANTHROPIC_API_KEY that Claude Code injects into subprocesses.
  const apiKey = process.env.APP_ANTHROPIC_KEY;
  if (!apiKey) throw new Error('APP_ANTHROPIC_KEY environment variable is not set');
  return new Anthropic({ apiKey });
}

// Sonnet for custom/owner templates that require style-matching intelligence.
// Haiku for standard templates — 12x cheaper, fast enough for routine reports.
// Update MODEL_LITE to your preferred haiku model name if it differs.
const MODEL_FULL = 'claude-sonnet-4-6';
const MODEL_LITE = 'claude-haiku-4-5';

function selectModel(template: string | undefined): string {
  // Custom requires understanding a reference document/image — use full model
  // Owner-summary needs concise executive translation — use full model
  // Everything else is routine formatting — lite model is plenty
  if (template === 'custom' || template === 'owner-summary') return MODEL_FULL;
  return MODEL_LITE;
}

// In-memory rate limiter — resets on cold start (serverless caveat).
const ipWindows = new Map<string, { count: number; windowStart: number }>();
const RATE_WINDOW_MS = 60 * 60 * 1000;
const RATE_LIMIT = 20;

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const rec = ipWindows.get(ip);
  if (!rec || now - rec.windowStart > RATE_WINDOW_MS) {
    ipWindows.set(ip, { count: 1, windowStart: now });
    return false;
  }
  if (rec.count >= RATE_LIMIT) return true;
  rec.count++;
  return false;
}

function sanitize(text: string): string {
  return text
    .replace(/<[^>]*>/g, '') // strip HTML/XML tags to prevent prompt injection
    .slice(0, 8000);
}

function buildTemplateInstructions(
  template: string | undefined,
  sampleText: string | undefined,
  hasSampleImage: boolean,
): string {
  if (template === 'custom') {
    const imageNote = hasSampleImage
      ? 'The FIRST image provided is a scan of a previous daily report written by this superintendent. '
      : '';
    const textNote = sampleText
      ? `\nFORMAT REFERENCE — match the style, tone, verbosity, and section structure of this previous report:\n---\n${sanitize(sampleText).slice(0, 3000)}\n---\n`
      : '';
    return `\nSTYLE INSTRUCTIONS: ${imageNote}Analyze the format, section names, writing style, and level of detail from this reference. Generate today's report using exactly the same style and tone — same formality, same verbosity, same way of organizing information.${textNote}`;
  }
  switch (template) {
    case 'residential':
      return `\nSTYLE INSTRUCTIONS: Use plain, conversational language a homeowner can understand. Avoid trade jargon — spell out acronyms, use everyday terms. Keep each section concise (2-4 sentences). Focus on visible progress, decisions the homeowner needs to make, and anything that affects their timeline or budget.\n`;
    case 'heavy-civil':
      return `\nSTYLE INSTRUCTIONS: Use heavy civil/infrastructure report format. Include specific quantities installed with units (LF, CY, tons, SF, each, etc.), major equipment utilization hours by unit number or type, and production rates where calculable. Track material deliveries by type and quantity. Be precise and numeric — field engineers and inspectors will review this report.\n`;
    case 'owner-summary':
      return `\nSTYLE INSTRUCTIONS: Write a concise executive summary for a non-technical project owner. No construction jargon — translate everything into plain business language. Maximum 2-3 sentences per section. Lead with schedule status (ahead/on/behind) and cost impact. Flag anything requiring owner decisions or approval. The owner is not on site and reads this in 90 seconds.\n`;
    default:
      return ''; // 'standard' — no modification needed
  }
}

export async function POST(request: Request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'anonymous';
  if (isRateLimited(ip)) {
    return Response.json({ error: 'Too many requests. Try again in an hour.' }, { status: 429 });
  }

  try {
    const body = await request.json();
    const {
      rawInput,
      projectName,
      clientName,
      gcName,
      address,
      superintendentName,
      date,
      crewCount,
      weatherCondition,
      temperature,
      previousLookahead,
      photos,
      subs,
      visitors,
      template,
      sampleReportText,
      sampleReportImage,
    }: {
      rawInput: string;
      projectName: string;
      clientName?: string;
      gcName?: string;
      address?: string;
      superintendentName?: string;
      date: string;
      crewCount: number;
      weatherCondition: string;
      temperature: string;
      previousLookahead?: string;
      photos?: string[];
      subs?: SubEntry[];
      visitors?: VisitorEntry[];
      template?: string;
      sampleReportText?: string;
      sampleReportImage?: string;
    } = body;

    if (!rawInput?.trim()) {
      return Response.json({ error: 'No input provided' }, { status: 400 });
    }

    const safeInput         = sanitize(rawInput);
    const safePrevLookahead = previousLookahead ? sanitize(previousLookahead) : undefined;

    const subSection = subs?.length
      ? `\nSUBCONTRACTOR BREAKDOWN:\n${subs.map(s => `- ${sanitize(s.company)} (${sanitize(s.trade)}): ${s.workers} workers`).join('\n')}\n`
      : '';

    const visitorSection = visitors?.length
      ? `\nVISITORS / INSPECTIONS ON SITE:\n${visitors.map(v => `- ${sanitize(v.name)}, ${sanitize(v.company)}: ${sanitize(v.purpose)}`).join('\n')}\n`
      : '';

    const sitePhotoCount = photos?.length ?? 0;
    const photoNote = sitePhotoCount > 0
      ? `\nPHOTO DOCUMENTATION: ${sitePhotoCount} site photo(s) are attached${sampleReportImage ? ' (after the format reference image)' : ''}. Analyze them to identify additional details about work progress, site conditions, materials, or issues that supplement the field notes.\n`
      : '';

    const templateInstructions = buildTemplateInstructions(
      template,
      sampleReportText,
      !!sampleReportImage,
    );

    const prompt = `You are an expert construction document specialist. Generate a professional Daily Construction Report from a superintendent's field notes.
${templateInstructions}
PROJECT DETAILS:
- Project Name: ${projectName}
- Location: ${address || 'Not specified'}
- Client/Owner: ${clientName || 'Not specified'}
- General Contractor: ${gcName || 'Not specified'}
- Superintendent: ${superintendentName || 'Not specified'}
- Date: ${date}
- Crew on Site: ${crewCount} workers
- Weather: ${weatherCondition}, ${temperature}
${subSection}${visitorSection}${photoNote}
SUPERINTENDENT'S FIELD NOTES:
${safeInput}
${safePrevLookahead ? `\nPREVIOUS REPORT'S PLAN FOR TODAY:\n${safePrevLookahead}\n\nCross-reference this plan against today's notes. In the "Work Completed" section, briefly note whether planned work was accomplished. In "Issues" section, flag anything planned that wasn't completed.` : ''}
Return ONLY a valid JSON object — no markdown, no code fences, no extra text:
{
  "projectInfo": "Full project header paragraph with project name, location, client, GC, superintendent, date, and report number",
  "weatherConditions": "Full weather description including conditions, temperature, and any impact on work or schedule",
  "laborSummary": "Summary of all labor on site: trade breakdown, crew counts, subcontractors, total hours",
  "workCompleted": "Detailed narrative of all work activities completed today, organized by area or trade",
  "materialsUsed": "Materials received, used, or staged on site today",
  "equipmentOnSite": "All equipment present and how it was utilized",
  "issuesAndDelays": "Issues, RFIs, delays, conflicts, or action items (state 'No issues reported' if none mentioned)",
  "safetyNotes": "Safety meetings held, incidents, near-misses, compliance observations, PPE compliance",
  "lookahead": "Work planned for tomorrow and the next several days"
}`;

    // Build content array: sample report image first (format reference), then site photos, then prompt
    const strippedSample = sampleReportImage?.replace(/^data:image\/\w+;base64,/, '');
    const strippedPhotos = (photos ?? []).map(p => p.replace(/^data:image\/\w+;base64,/, ''));

    const hasImages = !!strippedSample || strippedPhotos.length > 0;

    const content: Anthropic.MessageParam['content'] = hasImages
      ? [
          ...(strippedSample ? [{
            type: 'image' as const,
            source: { type: 'base64' as const, media_type: 'image/jpeg' as const, data: strippedSample },
          }] : []),
          ...strippedPhotos.map(data => ({
            type: 'image' as const,
            source: { type: 'base64' as const, media_type: 'image/jpeg' as const, data },
          })),
          { type: 'text' as const, text: prompt },
        ]
      : prompt;

    const message = await getClient().messages.create({
      model: selectModel(template),
      max_tokens: 4096,
      messages: [{ role: 'user', content }],
    });

    const first = message.content[0];
    if (first.type !== 'text') {
      return Response.json({ error: 'Invalid AI response' }, { status: 500 });
    }

    let sections;
    try {
      sections = JSON.parse(first.text);
    } catch {
      const match = first.text.match(/\{[\s\S]*\}/);
      if (match) {
        sections = JSON.parse(match[0]);
      } else {
        return Response.json({ error: 'Could not parse AI response' }, { status: 500 });
      }
    }

    return Response.json({ sections });
  } catch (error) {
    console.error('Generate report error:', error instanceof Error ? error.message : String(error));
    return Response.json({ error: 'Failed to generate report' }, { status: 500 });
  }
}
