import { notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase-server';
import { REPORT_SECTIONS } from '@/lib/constants';
import { HardHat, CloudSun, Users, CalendarDays, AlertCircle } from 'lucide-react';
import type { Metadata } from 'next';
import { AcknowledgeButton } from './AcknowledgeButton';

interface Props { params: Promise<{ id: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const admin = createAdminClient();
  const { data } = await admin
    .from('projects')
    .select('name, address, superintendent_name')
    .eq('id', id)
    .single();

  if (!data) return { title: 'Project Feed — EndOfDay' };

  const title = `${data.name} — Daily Reports`;
  const description = [
    `Live construction report feed for ${data.name}`,
    data.address ? `at ${data.address}` : null,
    data.superintendent_name ? `Superintendent: ${data.superintendent_name}` : null,
    'Powered by EndOfDay.',
  ].filter(Boolean).join('. ');

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'website',
      siteName: 'EndOfDay',
    },
    twitter: {
      card: 'summary',
      title,
      description,
    },
  };
}

export default async function ProjectFeedPage({ params }: Props) {
  const { id } = await params;
  const admin = createAdminClient();

  const [{ data: project }, { data: reports }] = await Promise.all([
    admin.from('projects').select('*').eq('id', id).single(),
    admin
      .from('reports')
      .select('*')
      .eq('project_id', id)
      .eq('status', 'final')
      .order('date', { ascending: false }),
  ]);

  if (!project) notFound();

  const reportList = reports ?? [];

  // Fetch all acknowledgments for the reports on this feed in one query
  const reportIds = reportList.map(r => r.id);
  const { data: allAcks } = reportIds.length
    ? await admin
        .from('report_acknowledgments')
        .select('report_id, acknowledged_by, acknowledged_at')
        .in('report_id', reportIds)
        .order('acknowledged_at', { ascending: false })
    : { data: [] };

  // Build a map: reportId → first (most recent) acknowledgment
  const ackMap = new Map<string, { by: string; at: string }>();
  for (const ack of (allAcks ?? [])) {
    if (!ackMap.has(ack.report_id)) {
      ackMap.set(ack.report_id, {
        by: ack.acknowledged_by,
        at: ack.acknowledged_at,
      });
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">

      {/* ── Header ── */}
      <header className="bg-slate-950 border-b border-white/5">
        <div className="max-w-3xl mx-auto px-5 py-6">
          <div className="flex items-center gap-2 mb-5">
            <div className="w-7 h-7 bg-amber-500 rounded-md flex items-center justify-center">
              <HardHat size={14} className="text-slate-900" />
            </div>
            <span className="text-white/60 text-sm font-medium">EndOfDay</span>
          </div>

          <div className="mb-1">
            <div className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">
              Daily Construction Reports
            </div>
            <h1 className="text-2xl font-extrabold text-white leading-tight">{project.name}</h1>
            {project.address && (
              <div className="text-slate-400 text-sm mt-1">{project.address}</div>
            )}
          </div>

          <div className="flex flex-wrap gap-4 mt-5 text-xs text-slate-500">
            {project.client_name && <span><span className="text-slate-600">Owner:</span> {project.client_name}</span>}
            {project.gc_name     && <span><span className="text-slate-600">GC:</span> {project.gc_name}</span>}
            {project.superintendent_name && <span><span className="text-slate-600">Super:</span> {project.superintendent_name}</span>}
            <span className="ml-auto">{reportList.length} report{reportList.length !== 1 ? 's' : ''}</span>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-5 py-8 space-y-6">

        {reportList.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-100 p-12 text-center">
            <CalendarDays size={36} className="mx-auto text-slate-200 mb-3" />
            <p className="text-slate-500 font-medium">No finalized reports yet</p>
            <p className="text-slate-400 text-sm mt-1">Check back after the superintendent submits today&apos;s report.</p>
          </div>
        ) : reportList.map((report, idx) => (
          <ReportCard
            key={report.id}
            report={report}
            isLatest={idx === 0}
            acknowledged={ackMap.get(report.id) ?? null}
          />
        ))}

      </main>

      <footer className="max-w-3xl mx-auto px-5 py-8 text-center text-xs text-slate-300">
        Powered by <strong className="text-slate-400">EndOfDay</strong> — AI Construction Reports
      </footer>
    </div>
  );
}

/* ── Individual report card ──────────────────────────────────────────────── */
function ReportCard({
  report,
  isLatest,
  acknowledged,
}: {
  report: Record<string, unknown>;
  isLatest: boolean;
  acknowledged: { by: string; at: string } | null;
}) {
  const sections = report.sections as Record<string, string>;
  const date = new Date((report.date as string) + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });
  const hasIssues = sections.issuesAndDelays &&
    !sections.issuesAndDelays.toLowerCase().includes('no issues') &&
    !sections.issuesAndDelays.toLowerCase().includes('none reported');

  return (
    <div className={`bg-white rounded-2xl border shadow-sm overflow-hidden ${
      isLatest ? 'border-amber-200 shadow-amber-50' : 'border-slate-100'
    }`}>
      {/* Card header */}
      <div className={`px-6 py-4 flex items-start justify-between gap-4 ${
        isLatest ? 'bg-amber-50 border-b border-amber-100' : 'bg-slate-50 border-b border-slate-100'
      }`}>
        <div className="flex-1 min-w-0">
          {isLatest && (
            <div className="text-xs font-bold text-amber-600 uppercase tracking-widest mb-1">Most Recent</div>
          )}
          <div className="font-extrabold text-slate-900 text-lg leading-tight">{date}</div>
          {/* Acknowledgment status */}
          <div className="mt-2">
            <AcknowledgeButton
              reportId={report.id as string}
              acknowledged={acknowledged}
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-2 flex-shrink-0 text-xs font-semibold">
          <span className="flex items-center gap-1 bg-white border border-slate-200 text-slate-600 rounded-full px-3 py-1">
            <Users size={11} /> {report.crew_count as number} crew
          </span>
          <span className="flex items-center gap-1 bg-white border border-slate-200 text-slate-600 rounded-full px-3 py-1">
            <CloudSun size={11} /> {report.weather_condition as string}
          </span>
          {hasIssues && (
            <span className="flex items-center gap-1 bg-red-50 border border-red-200 text-red-600 rounded-full px-3 py-1">
              <AlertCircle size={11} /> Issues
            </span>
          )}
        </div>
      </div>

      {/* Sections */}
      <div className="divide-y divide-slate-50">
        {REPORT_SECTIONS.filter(s => s.key !== 'projectInfo').map(({ key, label, color }) => {
          const text = sections[key];
          if (!text) return null;
          return (
            <div key={key} className={`px-6 py-4 border-l-4 ${color}`}>
              <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">{label}</div>
              <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{text}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
