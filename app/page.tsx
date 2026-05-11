'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getReports, deleteReport } from '@/lib/storage';
import { deleteReportRemote, syncFromCloud } from '@/lib/sync';
import { useAuth } from '@/components/AuthProvider';
import type { DailyReport } from '@/types';
import {
  FileText, Plus, Mic, Clock, Trash2, ChevronRight,
  HardHat, Zap, Shield, ArrowRight, Check, LogOut,
} from 'lucide-react';

/* ─── Landing hero ─────────────────────────────────────────────────────────── */
function Landing() {
  const { user, signOut } = useAuth();
  return (
    <div className="flex flex-col min-h-screen">

      {/* ── Nav ── */}
      <nav className="bg-slate-950 border-b border-white/5">
        <div className="max-w-6xl mx-auto px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-amber-500 rounded-lg flex items-center justify-center">
              <HardHat size={17} className="text-slate-900" />
            </div>
            <span className="text-white font-bold text-lg tracking-tight">EndOfDay</span>
          </div>
          <div className="flex items-center gap-3">
            {user ? (
              <>
                <span className="hidden sm:block text-xs text-slate-500 max-w-[160px] truncate">{user.email}</span>
                <Link
                  href="/report/new"
                  className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-slate-900 font-semibold px-4 py-2 rounded-lg text-sm transition-all duration-150 shadow-lg shadow-amber-500/20"
                >
                  <Plus size={15} />
                  New Report
                </Link>
                <button
                  onClick={signOut}
                  title="Sign out"
                  className="p-2 text-slate-500 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                >
                  <LogOut size={15} />
                </button>
              </>
            ) : (
              <Link
                href="/auth"
                className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-slate-900 font-semibold px-4 py-2 rounded-lg text-sm transition-all duration-150 shadow-lg shadow-amber-500/20"
              >
                Sign In
              </Link>
            )}
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="relative bg-slate-950 bg-dot-grid overflow-hidden">
        {/* Ambient glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative max-w-4xl mx-auto px-5 pt-20 pb-24 text-center animate-fade-up">
          <div className="inline-flex items-center gap-2 bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-semibold px-3 py-1.5 rounded-full mb-8">
            <Zap size={11} />
            Powered by Claude AI
          </div>
          <h1 className="text-5xl md:text-6xl font-extrabold text-white tracking-tight leading-[1.1] mb-6">
            Daily reports in<br />
            <span className="text-gradient">under 60 seconds</span>
          </h1>
          <p className="text-slate-400 text-lg md:text-xl max-w-2xl mx-auto leading-relaxed mb-10">
            Speak or type your end-of-day field notes. AI instantly turns them into a clean,
            professional construction report — ready to send to your GC or owner.
          </p>
          <div className="flex flex-col items-center gap-3">
            <Link
              href={user ? '/report/new' : '/auth'}
              className="flex items-center gap-2.5 bg-amber-500 hover:bg-amber-400 text-slate-900 font-bold px-7 py-3.5 rounded-xl text-base transition-all duration-150 shadow-xl shadow-amber-500/25 group"
            >
              <Mic size={18} />
              {user ? 'Start Today\'s Report' : 'Get Started Free'}
              <ArrowRight size={16} className="group-hover:translate-x-0.5 transition-transform" />
            </Link>
            <span className="text-slate-600 text-sm">Free while in beta · Sync across devices</span>
          </div>

          {/* Stats bar */}
          <div className="flex flex-wrap items-center justify-center gap-8 mt-14 pt-8 border-t border-white/5">
            {[
              { value: '45 min', label: 'saved per day' },
              { value: '9',      label: 'report sections auto-filled' },
              { value: '< 20s',  label: 'to generate' },
            ].map(({ value, label }) => (
              <div key={label} className="text-center">
                <div className="text-2xl font-bold text-white">{value}</div>
                <div className="text-xs text-slate-500 mt-0.5">{label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section className="bg-white py-20 px-5">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-14">
            <div className="text-xs font-bold text-amber-600 uppercase tracking-widest mb-3">How it works</div>
            <h2 className="text-3xl font-extrabold text-slate-900">Three steps, then you&apos;re done</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                step: '01',
                title: 'Dump your notes',
                body: 'Speak or type anything — messy shorthand, incomplete sentences, whatever. No formatting required.',
                icon: Mic,
              },
              {
                step: '02',
                title: 'AI writes the report',
                body: 'Claude structures your notes into 9 professional sections: labor, weather, work completed, RFIs, lookahead, and more.',
                icon: Zap,
              },
              {
                step: '03',
                title: 'Review and send',
                body: 'Edit any section inline, then print to PDF or copy to clipboard. Done before you leave the trailer.',
                icon: FileText,
              },
            ].map(({ step, title, body, icon: Icon }) => (
              <div key={step} className="relative">
                <div className="text-6xl font-black text-slate-100 select-none mb-4 leading-none">{step}</div>
                <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center mb-4">
                  <Icon size={19} className="text-amber-600" />
                </div>
                <h3 className="text-lg font-bold text-slate-900 mb-2">{title}</h3>
                <p className="text-slate-500 text-sm leading-relaxed">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Feature grid ── */}
      <section className="bg-slate-50 py-20 px-5">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-14">
            <div className="text-xs font-bold text-amber-600 uppercase tracking-widest mb-3">Features</div>
            <h2 className="text-3xl font-extrabold text-slate-900">Built for the job site, not the office</h2>
          </div>
          <div className="grid md:grid-cols-2 gap-5">
            {[
              {
                icon: Mic,
                title: 'Voice-first input',
                body: "Hold up your phone after the shift, talk for 60 seconds. That's your whole report.",
              },
              {
                icon: FileText,
                title: 'Professional formatting',
                body: 'Looks like it was written by your most detail-oriented PM. Every time.',
              },
              {
                icon: Clock,
                title: 'Auto weather lookup',
                body: 'Opens with today\'s weather already filled in — one less thing to remember.',
              },
              {
                icon: Shield,
                title: 'Saved locally',
                body: 'All reports and projects live in your browser. Nothing leaves your device.',
              },
            ].map(({ icon: Icon, title, body }) => (
              <div key={title} className="bg-white rounded-2xl p-6 border border-slate-100 hover:border-amber-200 hover:shadow-md transition-all duration-200 group">
                <div className="w-11 h-11 bg-amber-50 group-hover:bg-amber-100 rounded-xl flex items-center justify-center mb-4 transition-colors">
                  <Icon size={20} className="text-amber-600" />
                </div>
                <h3 className="font-bold text-slate-900 mb-1.5">{title}</h3>
                <p className="text-slate-500 text-sm leading-relaxed">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing ── */}
      <section className="bg-white border-t border-slate-100 py-20 px-5">
        <div className="max-w-3xl mx-auto text-center">
          <div className="text-xs font-bold text-amber-600 uppercase tracking-widest mb-3">Pricing</div>
          <h2 className="text-3xl font-extrabold text-slate-900 mb-4">Free while we&apos;re in beta</h2>
          <p className="text-slate-500 text-lg mb-10 max-w-xl mx-auto leading-relaxed">
            No account. No credit card. Every feature is free right now.
            Advanced team features — shared dashboards, PDF delivery, and project integrations — are on the roadmap for Pro.
          </p>
          <div className="inline-flex flex-col sm:flex-row gap-4 justify-center">
            {[
              { label: 'Unlimited reports', free: true },
              { label: 'Voice + photo input', free: true },
              { label: 'AI generation',      free: true },
              { label: 'Team sharing & dashboards', free: false },
            ].map(({ label, free }) => (
              <div key={label} className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold ${
                free
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : 'bg-slate-50 text-slate-400 border border-slate-200'
              }`}>
                {free
                  ? <Check size={14} className="text-emerald-600" />
                  : <span className="text-slate-300 font-bold text-xs">PRO</span>
                }
                {label}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA banner ── */}
      <section className="bg-slate-950 py-20 px-5">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-3xl font-extrabold text-white mb-4">
            Stop wasting your evenings on paperwork
          </h2>
          <p className="text-slate-400 mb-8">
            Your crew goes home. So should you.
          </p>
          <Link
            href={user ? '/report/new' : '/auth'}
            className="inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-slate-900 font-bold px-8 py-4 rounded-xl text-lg transition-all duration-150 shadow-xl shadow-amber-500/25"
          >
            {user ? 'Start Today\'s Report' : 'Get Started — Free'}
            <ArrowRight size={18} />
          </Link>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="bg-slate-950 border-t border-white/5 py-6 px-5">
        <div className="max-w-6xl mx-auto flex items-center justify-between text-xs text-slate-600">
          <div className="flex items-center gap-2">
            <HardHat size={14} className="text-amber-500" />
            <span>EndOfDay</span>
          </div>
          <span>Built for construction professionals</span>
        </div>
      </footer>
    </div>
  );
}

/* ─── Dashboard ─────────────────────────────────────────────────────────────── */
function localDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function calcStats(reports: DailyReport[]) {
  const today = new Date();
  const todayStr = localDateStr(today);
  const reportedToday = reports.some(r => r.date === todayStr);

  // Reports in last 7 days
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 6);
  const thisWeek = reports.filter(r => new Date(r.date + 'T12:00:00') >= cutoff).length;

  // Unique projects
  const projects = new Set(reports.map(r => r.projectId)).size;

  // Consecutive-day streak (counts today if reported, or yesterday-backwards if not yet)
  const dateSet = new Set(reports.map(r => r.date));
  let streak = 0;
  const cursor = new Date();
  if (!dateSet.has(localDateStr(cursor))) cursor.setDate(cursor.getDate() - 1);
  while (dateSet.has(localDateStr(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }

  return { reportedToday, thisWeek, projects, streak };
}

function Dashboard({ reports, onDelete }: { reports: DailyReport[]; onDelete: (id: string) => void }) {
  const { user, signOut } = useAuth();
  const stats = calcStats(reports);
  const mostRecent = reports[0];

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-slate-950 border-b border-white/5 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-amber-500 rounded-lg flex items-center justify-center">
              <HardHat size={17} className="text-slate-900" />
            </div>
            <span className="text-white font-bold text-lg tracking-tight">EndOfDay</span>
          </div>
          <div className="flex items-center gap-3">
            {user && (
              <span className="hidden sm:block text-xs text-slate-500 max-w-[200px] truncate">{user.email}</span>
            )}
            <Link
              href="/report/new"
              className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-slate-900 font-semibold px-4 py-2 rounded-lg text-sm transition-all shadow-lg shadow-amber-500/20"
            >
              <Plus size={15} />
              New Report
            </Link>
            <button
              onClick={signOut}
              title="Sign out"
              className="p-2 text-slate-500 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
            >
              <LogOut size={15} />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-5 py-10 animate-fade-up">

        {/* ── Quick-start banner ── */}
        {!stats.reportedToday && mostRecent && (
          <Link
            href="/report/new"
            className="flex items-center justify-between gap-4 bg-amber-500 hover:bg-amber-400 text-slate-900 rounded-2xl px-6 py-5 mb-8 shadow-xl shadow-amber-500/20 group transition-all"
          >
            <div>
              <div className="font-extrabold text-lg leading-tight">Start today&apos;s report</div>
              <div className="text-sm text-slate-700 mt-0.5">
                Last report: {mostRecent.projectName} ·{' '}
                {new Date(mostRecent.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
              </div>
            </div>
            <ChevronRight size={22} className="flex-shrink-0 group-hover:translate-x-1 transition-transform" />
          </Link>
        )}

        {/* ── Stats row ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
          {[
            { label: 'Day streak',        value: stats.streak,       highlight: stats.streak >= 3 },
            { label: 'Reports this week', value: stats.thisWeek,     highlight: false },
            { label: 'Total reports',     value: reports.length,     highlight: false },
            { label: 'Active projects',   value: stats.projects,     highlight: false },
          ].map(({ label, value, highlight }) => (
            <div key={label} className={`rounded-xl border px-5 py-4 shadow-sm text-center transition-colors ${
              highlight ? 'bg-amber-50 border-amber-200' : 'bg-white border-slate-100'
            }`}>
              <div className={`text-2xl font-extrabold ${highlight ? 'text-amber-600' : 'text-slate-900'}`}>
                {highlight ? `🔥 ${value}` : value}
              </div>
              <div className="text-xs text-slate-400 mt-0.5 font-medium">{label}</div>
            </div>
          ))}
        </div>

        <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Recent Reports</h2>

        <div className="space-y-2">
          {reports.map((report) => (
            <div
              key={report.id}
              className="bg-white rounded-xl border border-slate-100 shadow-sm flex items-center gap-4 px-5 py-4 group hover:border-amber-200 hover:shadow-md transition-all duration-150"
            >
              <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center flex-shrink-0">
                <FileText size={17} className="text-amber-600" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <span className="font-semibold text-slate-900 truncate">{report.projectName}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                    report.status === 'final'
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-amber-100 text-amber-700'
                  }`}>
                    {report.status === 'final' ? 'Final' : 'Draft'}
                  </span>
                </div>
                <div className="text-sm text-slate-400 mt-0.5">
                  {new Date(report.date + 'T12:00:00').toLocaleDateString('en-US', {
                    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
                  })}
                  {' · '}{report.crewCount} crew · {report.weatherCondition}
                </div>
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => onDelete(report.id)}
                  aria-label="Delete report"
                  className="p-2 text-slate-300 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors"
                >
                  <Trash2 size={14} />
                </button>
                <Link
                  href={`/report/${report.id}`}
                  className="flex items-center gap-1 text-xs font-semibold text-slate-400 hover:text-amber-600 px-3 py-1.5 rounded-lg hover:bg-amber-50 transition-colors"
                >
                  View <ChevronRight size={14} />
                </Link>
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}

/* ─── Root ── */
export default function Home() {
  const { user } = useAuth();
  const [reports, setReports] = useState<DailyReport[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!user) {
      // Not signed in — show marketing page immediately, no DB calls needed
      setReady(true);
      return;
    }
    // Load local reports immediately, then sync cloud in background
    setReports(
      getReports().sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    );
    setReady(true);

    syncFromCloud().then(() => {
      setReports(
        getReports().sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      );
    }).catch(() => {});
  }, [user]);

  if (!ready) return null;

  // Unauthenticated visitors and authenticated users with no reports both see the landing page
  if (!user || reports.length === 0) return <Landing />;

  return (
    <Dashboard
      reports={reports}
      onDelete={(id) => {
        deleteReport(id);
        deleteReportRemote(id).catch(() => {});
        setReports((prev) => prev.filter((r) => r.id !== id));
      }}
    />
  );
}
