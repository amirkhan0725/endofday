'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getProjects, saveProject, saveReport, getReports } from '@/lib/storage';
import { pushProject, pushReport, getUserId } from '@/lib/sync';
import { supabase } from '@/lib/supabase';
import { REPORT_SECTIONS, REPORT_TEMPLATES } from '@/lib/constants';
import type { Project, DailyReport, ReportSections, SubEntry, VisitorEntry, ReportTemplate } from '@/types';
import {
  HardHat, Mic, MicOff, Loader2, ChevronLeft, ChevronRight,
  Plus, CloudSun, Users, FileText, Check, AlertCircle, Building2,
  History, Camera, X, UserCheck, Trash2, WifiOff, RotateCcw,
  Palette, Upload, Mail, Link2,
} from 'lucide-react';

type Step = 'project' | 'input' | 'generating' | 'review';

function uid() { return Math.random().toString(36).slice(2) + Date.now().toString(36); }

// ── Draft persistence ──────────────────────────────────────────────────────────
const DRAFT_KEY = 'endofday_wizard_draft';

interface WizardDraft {
  selectedId: string;
  date: string;
  crewCount: number;
  rawInput: string;
  weather: string;
  temp: string;
  subs: SubEntry[];
  visitors: VisitorEntry[];
  savedAt: string;
}

function loadDraft(): WizardDraft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function formatTimeAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1)  return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function compressPhoto(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const MAX = 800;
      const scale = Math.min(1, MAX / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width  = Math.round(img.width  * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.72));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Failed to load image')); };
    img.src = url;
  });
}

const STEPS: { key: Step; label: string }[] = [
  { key: 'project',   label: 'Project' },
  { key: 'input',     label: 'Notes'   },
  { key: 'review',    label: 'Review'  },
];

const GEN_MESSAGES = [
  'Reading your field notes…',
  'Analyzing site photos…',
  'Organizing into sections…',
  'Drafting work summary…',
  'Polishing language…',
];

export default function ReportWizard() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('project');

  // ── Project state ──────────────────────────────────────────────────────────
  const [projects, setProjects]     = useState<Project[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [showNew, setShowNew]       = useState(false);
  const [newProj, setNewProj]       = useState<Omit<Project, 'id' | 'createdAt'>>({
    name: '', address: '', clientName: '', gcName: '', superintendentName: '',
  });

  // ── Report style (template) ────────────────────────────────────────────────
  const [template, setTemplate]             = useState<ReportTemplate>('standard');
  const [sampleText, setSampleText]         = useState('');
  const [sampleImage, setSampleImage]       = useState('');  // compressed base64
  const [showStylePanel, setShowStylePanel] = useState(false);

  // ── GC email notifications ─────────────────────────────────────────────────
  const [gcEmails, setGcEmails]           = useState<string[]>([]);
  const [gcEmailInput, setGcEmailInput]   = useState('');
  const [showGcPanel, setShowGcPanel]     = useState(false);
  const [feedLinkCopied, setFeedLinkCopied] = useState(false);

  // ── Notes state ────────────────────────────────────────────────────────────
  const [date, setDate]                   = useState(today());
  const [crewCount, setCrewCount]         = useState(10);
  const [rawInput, setRawInput]           = useState('');
  const [weather, setWeather]             = useState('');
  const [temp, setTemp]                   = useState('');
  const [weatherLoading, setWeatherLoading] = useState(false);

  // Voice
  const [listening, setListening]     = useState(false);
  const [interimText, setInterimText] = useState('');
  const [voiceSupported, setVoiceSupported] = useState(true);
  const recognitionRef = useRef<{ stop: () => void } | null>(null);

  // Photos
  const [photos, setPhotos]               = useState<string[]>([]);
  const [photoProcessing, setPhotoProcessing] = useState(false);

  // Subs
  const [subs, setSubs]         = useState<SubEntry[]>([]);
  const [showSubs, setShowSubs] = useState(false);

  // Visitors
  const [visitors, setVisitors]       = useState<VisitorEntry[]>([]);
  const [showVisitors, setShowVisitors] = useState(false);

  // ── Draft + connectivity ───────────────────────────────────────────────────
  const [hasDraft, setHasDraft]         = useState(false);
  const [draftSavedAt, setDraftSavedAt] = useState('');
  const [isOnline, setIsOnline]         = useState(true);

  // ── Generation state ───────────────────────────────────────────────────────
  const [editedSections, setEditedSections] = useState<ReportSections | null>(null);
  const [generating, setGenerating] = useState(false);
  const [genMsgIdx, setGenMsgIdx]   = useState(0);
  const [error, setError]           = useState('');

  // Previous day context
  const [prevLookahead, setPrevLookahead]         = useState<string | null>(null);
  const [prevLookaheadDate, setPrevLookaheadDate] = useState('');
  const [usePrevLookahead, setUsePrevLookahead]   = useState(true);

  // ── Effects ────────────────────────────────────────────────────────────────
  const fetchWeather = useCallback(async () => {
    if (!navigator.geolocation) return;
    setWeatherLoading(true);
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        try {
          const res = await fetch(`/api/weather?lat=${coords.latitude}&lon=${coords.longitude}`);
          const d = await res.json();
          // Only fill in if the user hasn't typed their own values
          setWeather(prev => prev || d.condition);
          setTemp(prev => prev || d.temperature);
        } catch { /* silent — user can fill in manually */ }
        setWeatherLoading(false);
      },
      () => setWeatherLoading(false)
    );
  }, []);

  useEffect(() => {
    const stored = getProjects();
    setProjects(stored);

    // Restore draft if one exists
    const draft = loadDraft();
    if (draft?.rawInput?.trim()) {
      setHasDraft(true);
      setDraftSavedAt(draft.savedAt);
      setSelectedId(draft.selectedId);
      setDate(draft.date);
      setCrewCount(draft.crewCount);
      setRawInput(draft.rawInput);
      setWeather(draft.weather);
      setTemp(draft.temp);
      if (draft.subs?.length)     setSubs(draft.subs);
      if (draft.visitors?.length) setVisitors(draft.visitors);
    } else if (stored.length > 0) {
      // Auto-select the most recently used project
      const allReports = getReports().sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      const lastReport = allReports[0];
      if (lastReport) {
        setSelectedId(lastReport.projectId);
        setCrewCount(lastReport.crewCount);
      } else {
        setSelectedId(stored[0].id);
      }
    }

    fetchWeather();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    setVoiceSupported(!!(w.SpeechRecognition || w.webkitSpeechRecognition));

    // Online / offline tracking
    setIsOnline(navigator.onLine);
    const goOnline  = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener('online',  goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online',  goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, [fetchWeather]);

  // Sync template/sample/gcEmails from the selected project
  useEffect(() => {
    if (!selectedId) return;
    const proj = projects.find(p => p.id === selectedId);
    if (!proj) return;
    setTemplate(proj.template ?? 'standard');
    setSampleText(proj.sampleReportText ?? '');
    setSampleImage(proj.sampleReportImage ?? '');
    setGcEmails(proj.gcEmails ?? []);
  }, [selectedId, projects]);

  // Persist template/sample/gcEmails back to project whenever they change
  useEffect(() => {
    if (!selectedId) return;
    const proj = projects.find(p => p.id === selectedId);
    if (!proj) return;
    const updated: Project = {
      ...proj,
      template,
      sampleReportText:  sampleText  || undefined,
      sampleReportImage: sampleImage || undefined,
      gcEmails:          gcEmails.length ? gcEmails : undefined,
    };
    saveProject(updated);
    setProjects(prev => prev.map(p => p.id === selectedId ? updated : p));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [template, sampleText, sampleImage, gcEmails]);

  // Cycle through generation messages while AI is running
  useEffect(() => {
    if (!generating) return;
    const t = setInterval(() => setGenMsgIdx(i => (i + 1) % GEN_MESSAGES.length), 2200);
    return () => clearInterval(t);
  }, [generating]);

  // Auto-save draft whenever notes content changes (photos excluded — too large)
  useEffect(() => {
    if (!rawInput.trim()) return;
    const t = setTimeout(() => {
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify({
          selectedId, date, crewCount, rawInput, weather, temp, subs, visitors,
          savedAt: new Date().toISOString(),
        } satisfies WizardDraft));
      } catch { /* storage full — silent */ }
    }, 800);
    return () => clearTimeout(t);
  }, [selectedId, date, crewCount, rawInput, weather, temp, subs, visitors]);

  // ── Voice ──────────────────────────────────────────────────────────────────
  function startListening() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    const API = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!API) { setError('Voice input requires Chrome or Edge.'); return; }

    const rec = new API();
    rec.continuous     = true;
    rec.interimResults = true;
    rec.lang           = 'en-US';
    let final = rawInput;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (e: any) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) final += (final ? ' ' : '') + e.results[i][0].transcript;
        else interim += e.results[i][0].transcript;
      }
      setInterimText(interim);
      setRawInput(final);
    };
    rec.onend   = () => { setListening(false); setInterimText(''); };
    rec.onerror = () => { setListening(false); setInterimText(''); };

    recognitionRef.current = rec;
    rec.start();
    setListening(true);
    setError('');
  }

  function stopListening() {
    recognitionRef.current?.stop();
    setListening(false);
    setInterimText('');
  }

  // ── Photos ─────────────────────────────────────────────────────────────────
  async function handlePhotoFiles(files: FileList) {
    if (!files.length) return;
    setPhotoProcessing(true);
    const incoming = Array.from(files).slice(0, 8 - photos.length);
    const results = await Promise.allSettled(incoming.map(compressPhoto));
    const compressed = results.flatMap(r => r.status === 'fulfilled' ? [r.value] : []);
    setPhotos(prev => [...prev, ...compressed].slice(0, 8));
    setPhotoProcessing(false);
  }

  // ── Subs ───────────────────────────────────────────────────────────────────
  function addSub() { setSubs(prev => [...prev, { company: '', trade: '', workers: 1 }]); }
  function updateSub(i: number, field: keyof SubEntry, val: string | number) {
    setSubs(prev => prev.map((s, idx) => idx === i ? { ...s, [field]: val } : s));
  }
  function removeSub(i: number) { setSubs(prev => prev.filter((_, idx) => idx !== i)); }

  // ── Visitors ───────────────────────────────────────────────────────────────
  function addVisitor() { setVisitors(prev => [...prev, { name: '', company: '', purpose: '' }]); }
  function updateVisitor(i: number, field: keyof VisitorEntry, val: string) {
    setVisitors(prev => prev.map((v, idx) => idx === i ? { ...v, [field]: val } : v));
  }
  function removeVisitor(i: number) { setVisitors(prev => prev.filter((_, idx) => idx !== i)); }

  // ── Draft management ───────────────────────────────────────────────────────
  function discardDraft() {
    localStorage.removeItem(DRAFT_KEY);
    setHasDraft(false);
    setRawInput('');
    setDate(today());
    setCrewCount(10);
    setWeather('');
    setTemp('');
    setSubs([]);
    setVisitors([]);
    // Re-auto-select last used project and refetch weather
    const allReports = getReports().sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    const last = allReports[0];
    if (last) { setSelectedId(last.projectId); setCrewCount(last.crewCount); }
    fetchWeather();
  }

  // ── Previous day context ───────────────────────────────────────────────────
  function loadPrevContext(projectId: string) {
    const all = getReports()
      .filter(r => r.projectId === projectId && r.sections.lookahead?.trim())
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const prev = all[0];
    if (prev) {
      setPrevLookahead(prev.sections.lookahead);
      setPrevLookaheadDate(prev.date);
      setUsePrevLookahead(true);
    } else {
      setPrevLookahead(null);
    }
  }

  // ── Project management ─────────────────────────────────────────────────────
  function addProject() {
    if (!newProj.name.trim()) return;
    const p: Project = { ...newProj, id: uid(), createdAt: new Date().toISOString() };
    saveProject(p);
    setProjects(prev => [...prev, p]);
    setSelectedId(p.id);
    setShowNew(false);
    setNewProj({ name: '', address: '', clientName: '', gcName: '', superintendentName: '' });
  }

  // ── Generate & Save ────────────────────────────────────────────────────────
  async function generate() {
    const proj = projects.find(p => p.id === selectedId);
    if (!proj || !rawInput.trim()) { setError('Add your field notes first.'); return; }
    if (!navigator.onLine) {
      setError('No internet connection — your notes are saved. Come back when you have signal.');
      return;
    }
    setError('');
    setGenerating(true);
    setGenMsgIdx(0);
    setStep('generating');

    const validSubs     = subs.filter(s => s.company.trim());
    const validVisitors = visitors.filter(v => v.name.trim());

    try {
      const res = await fetch('/api/generate-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rawInput,
          projectName: proj.name,
          clientName:  proj.clientName,
          gcName:      proj.gcName,
          address:     proj.address,
          superintendentName: proj.superintendentName,
          date, crewCount,
          weatherCondition: weather || 'Not recorded',
          temperature:      temp    || 'N/A',
          previousLookahead: usePrevLookahead && prevLookahead ? prevLookahead : undefined,
          photos:            photos.length        ? photos        : undefined,
          subs:              validSubs.length     ? validSubs     : undefined,
          visitors:          validVisitors.length ? validVisitors : undefined,
          template,
          sampleReportText:  template === 'custom' && sampleText  ? sampleText  : undefined,
          sampleReportImage: template === 'custom' && sampleImage ? sampleImage : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Generation failed');
      setEditedSections(data.sections);
      setStep('review');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed — check your API key in .env.local');
      setStep('input');
    } finally {
      setGenerating(false);
    }
  }

  async function save(status: 'draft' | 'final') {
    const proj = projects.find(p => p.id === selectedId);
    if (!proj || !editedSections) return;
    const validSubs     = subs.filter(s => s.company.trim());
    const validVisitors = visitors.filter(v => v.name.trim());
    const report: DailyReport = {
      id: uid(), projectId: proj.id, projectName: proj.name,
      date, rawInput, crewCount,
      weatherCondition: weather || 'Not recorded',
      temperature:      temp    || 'N/A',
      sections: editedSections, status, template,
      createdAt: new Date().toISOString(),
      photos:   photos.length        ? photos        : undefined,
      subs:     validSubs.length     ? validSubs     : undefined,
      visitors: validVisitors.length ? validVisitors : undefined,
    };
    saveReport(report);
    localStorage.removeItem(DRAFT_KEY);

    // Fire-and-forget cloud sync
    getUserId().then(cloudUid => {
      if (!cloudUid) return;
      pushReport(report, cloudUid).catch(() => {});
      pushProject(proj, cloudUid).catch(() => {});
    });

    // Auto-email GC recipients on final save
    if (status === 'final' && proj.gcEmails?.length) {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      const formattedDate = new Date(date + 'T12:00:00').toLocaleDateString('en-US', {
        month: 'long', day: 'numeric', year: 'numeric',
      });
      proj.gcEmails.forEach(email => {
        fetch('/api/send-report', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            email,
            projectName: proj.name,
            date: formattedDate,
            sections: editedSections,
            reportId: report.id,
            projectId: proj.id,
          }),
        }).catch(() => {});
      });
    }

    router.push(`/report/${report.id}`);
  }

  // ── Derived ────────────────────────────────────────────────────────────────
  const selectedProj   = projects.find(p => p.id === selectedId);
  const stepIdx        = STEPS.findIndex(s => s.key === step);
  const displayStepIdx = step === 'generating' ? 1 : stepIdx;
  const wordCount      = rawInput.trim() ? rawInput.trim().split(/\s+/).length : 0;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">

      {/* ── Header ── */}
      <header className="bg-slate-950 border-b border-white/5 sticky top-0 z-10 no-print">
        <div className="max-w-3xl mx-auto px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" aria-label="Back to dashboard" className="text-slate-500 hover:text-white transition-colors p-1 -ml-1 rounded-lg hover:bg-white/5">
              <ChevronLeft size={20} />
            </Link>
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 bg-amber-500 rounded-md flex items-center justify-center">
                <HardHat size={14} className="text-slate-900" />
              </div>
              <span className="text-white font-bold">EndOfDay</span>
            </div>
          </div>
          <span className="text-slate-400 text-sm">New Report</span>
        </div>
      </header>

      {/* ── Progress bar ── */}
      {step !== 'generating' && (
        <div className="bg-white border-b border-slate-100 no-print">
          <div className="max-w-3xl mx-auto px-5">
            <div className="relative pt-5 pb-4">
              <div className="absolute top-[26px] left-[calc(16.67%)] right-[calc(16.67%)] h-0.5 bg-slate-100">
                <div
                  className="h-full bg-amber-400 transition-all duration-500"
                  style={{ width: displayStepIdx === 0 ? '0%' : displayStepIdx === 1 ? '50%' : '100%' }}
                />
              </div>
              <div className="flex justify-between relative">
                {STEPS.map((s, i) => {
                  const active = step === s.key;
                  const done   = displayStepIdx > i;
                  return (
                    <div key={s.key} className="flex flex-col items-center gap-1.5 w-1/3">
                      <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs font-bold transition-all duration-300 ${
                        done   ? 'bg-amber-500 border-amber-500 text-slate-900' :
                        active ? 'bg-white border-amber-500 text-amber-600 shadow-sm shadow-amber-200' :
                                 'bg-white border-slate-200 text-slate-400'
                      }`}>
                        {done ? <Check size={12} /> : i + 1}
                      </div>
                      <span className={`text-xs font-semibold transition-colors ${active ? 'text-amber-600' : done ? 'text-slate-500' : 'text-slate-300'}`}>
                        {s.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      <main className="flex-1 max-w-3xl mx-auto w-full px-5 py-8">

        {/* ══════════════════════════════════════════════════════════════
            Step 1 — Project
        ══════════════════════════════════════════════════════════════ */}
        {step === 'project' && (
          <div className="space-y-5 animate-fade-up">
            <h2 className="text-xl font-extrabold text-slate-900">Which project is this for?</h2>

            {/* ── Draft resume banner ── */}
            {hasDraft && (
              <div className="bg-blue-50 border border-blue-200 rounded-2xl px-5 py-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <RotateCcw size={16} className="text-blue-500 flex-shrink-0" />
                  <div className="min-w-0">
                    <div className="font-bold text-blue-800 text-sm">Unfinished report found</div>
                    <div className="text-xs text-blue-500 mt-0.5 truncate">
                      Your notes from {formatTimeAgo(draftSavedAt)} are waiting
                    </div>
                  </div>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <button
                    onClick={discardDraft}
                    className="text-xs text-blue-400 hover:text-blue-600 px-3 py-1.5 rounded-lg hover:bg-blue-100 transition-colors"
                  >
                    Discard
                  </button>
                  <button
                    onClick={() => { setHasDraft(false); loadPrevContext(selectedId); setStep('input'); }}
                    className="text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg transition-colors"
                  >
                    Resume →
                  </button>
                </div>
              </div>
            )}

            {projects.length === 0 && !showNew && (
              <div className="bg-white rounded-2xl border border-dashed border-slate-200 p-10 text-center">
                <Building2 size={32} className="mx-auto text-slate-300 mb-3" />
                <p className="text-slate-500 text-sm mb-4">No projects yet. Create your first one.</p>
                <button
                  onClick={() => setShowNew(true)}
                  className="inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-slate-900 font-semibold px-5 py-2.5 rounded-xl text-sm transition-all"
                >
                  <Plus size={15} /> Create Project
                </button>
              </div>
            )}

            {projects.length > 0 && (
              <div className="grid gap-2">
                {projects.map(p => (
                  <button
                    key={p.id}
                    onClick={() => setSelectedId(p.id)}
                    className={`w-full text-left rounded-xl border-2 px-5 py-4 transition-all duration-150 ${
                      selectedId === p.id
                        ? 'border-amber-400 bg-amber-50 shadow-sm shadow-amber-100'
                        : 'border-slate-100 bg-white hover:border-slate-200 hover:shadow-sm'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="font-semibold text-slate-900">{p.name}</div>
                        <div className="text-sm text-slate-400 mt-0.5">
                          {[p.address, p.gcName].filter(Boolean).join(' · ') || 'No details added'}
                        </div>
                      </div>
                      {selectedId === p.id && (
                        <div className="w-5 h-5 bg-amber-500 rounded-full flex items-center justify-center flex-shrink-0 ml-3">
                          <Check size={11} className="text-white" />
                        </div>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}

            {!showNew && projects.length > 0 && (
              <button
                onClick={() => setShowNew(true)}
                className="flex items-center gap-2 text-sm font-semibold text-amber-600 hover:text-amber-700 transition-colors"
              >
                <Plus size={15} /> Add another project
              </button>
            )}

            {showNew && (
              <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
                <h3 className="font-bold text-slate-900">New Project</h3>
                {[
                  { label: 'Project name',      key: 'name',                placeholder: 'Downtown Office Tower',   required: true },
                  { label: 'Site address',       key: 'address',             placeholder: '123 Main St, Chicago, IL' },
                  { label: 'Client / Owner',     key: 'clientName',          placeholder: 'Acme Development LLC'     },
                  { label: 'General Contractor', key: 'gcName',              placeholder: 'BuildCo Construction'     },
                  { label: 'Superintendent',     key: 'superintendentName',  placeholder: 'John Smith'               },
                ].map(({ label, key, placeholder, required }) => (
                  <div key={key}>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                      {label}{required && <span className="text-amber-500 ml-0.5">*</span>}
                    </label>
                    <input
                      type="text"
                      placeholder={placeholder}
                      value={newProj[key as keyof typeof newProj]}
                      onChange={e => setNewProj(prev => ({ ...prev, [key]: e.target.value }))}
                      className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-transparent transition-all"
                    />
                  </div>
                ))}
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={addProject}
                    disabled={!newProj.name.trim()}
                    className="bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-900 font-bold px-4 py-2.5 rounded-lg text-sm transition-all"
                  >
                    Save Project
                  </button>
                  <button onClick={() => setShowNew(false)} className="text-slate-400 hover:text-slate-600 px-4 py-2.5 rounded-lg text-sm transition-colors">
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* ── Report style panel ── */}
            {selectedId && (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <button
                  onClick={() => setShowStylePanel(v => !v)}
                  className="w-full flex items-center justify-between px-5 py-3.5 text-left hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Palette size={15} className="text-slate-400" />
                    <span className="text-sm font-bold text-slate-700">Report style</span>
                    <span className="text-xs text-slate-400 font-medium">
                      — {REPORT_TEMPLATES.find(t => t.key === template)?.label ?? 'Standard GC'}
                    </span>
                  </div>
                  <ChevronRight size={15} className={`text-slate-400 transition-transform ${showStylePanel ? 'rotate-90' : ''}`} />
                </button>

                {showStylePanel && (
                  <div className="border-t border-slate-100 px-5 py-4 space-y-3">
                    <div className="grid gap-2">
                      {REPORT_TEMPLATES.map(t => (
                        <button
                          key={t.key}
                          onClick={() => setTemplate(t.key)}
                          className={`w-full text-left px-4 py-3 rounded-xl border-2 transition-all text-sm ${
                            template === t.key
                              ? 'border-amber-400 bg-amber-50'
                              : 'border-slate-100 hover:border-slate-200 bg-white'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-slate-800">{t.label}</span>
                            {template === t.key && <Check size={14} className="text-amber-600" />}
                          </div>
                          <div className="text-xs text-slate-400 mt-0.5">{t.description}</div>
                        </button>
                      ))}
                    </div>

                    {/* Custom template inputs */}
                    {template === 'custom' && (
                      <div className="space-y-3 pt-1">
                        <div>
                          <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                            Paste a previous report
                          </label>
                          <textarea
                            rows={6}
                            value={sampleText}
                            onChange={e => setSampleText(e.target.value.slice(0, 5000))}
                            placeholder="Paste any previous daily report here — the AI will match your exact writing style, section names, and level of detail on every future report for this project."
                            className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-transparent resize-none placeholder:text-slate-300"
                          />
                          <div className="text-xs text-slate-400 mt-1 text-right">{sampleText.length}/5000</div>
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                            Or upload a photo / scan of a report
                          </label>
                          {sampleImage ? (
                            <div className="relative inline-block">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={sampleImage} alt="Sample report" className="h-32 rounded-xl object-cover border border-slate-200" />
                              <button
                                onClick={() => setSampleImage('')}
                                aria-label="Remove sample image"
                                className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-slate-800 text-white rounded-full flex items-center justify-center shadow hover:bg-red-500 transition-colors"
                              >
                                <X size={10} />
                              </button>
                            </div>
                          ) : (
                            <label htmlFor="sample-upload" className="flex items-center gap-2 cursor-pointer text-sm font-semibold text-amber-600 hover:text-amber-700 transition-colors">
                              <Upload size={14} /> Upload report image
                              <input
                                id="sample-upload"
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={async e => {
                                  const file = e.target.files?.[0];
                                  if (file) setSampleImage(await compressPhoto(file));
                                }}
                              />
                            </label>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ── GC auto-email panel ── */}
            {selectedId && (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <button
                  onClick={() => setShowGcPanel(v => !v)}
                  className="w-full flex items-center justify-between px-5 py-3.5 text-left hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Mail size={15} className="text-slate-400" />
                    <span className="text-sm font-bold text-slate-700">Auto-send final reports</span>
                    {gcEmails.length > 0 && (
                      <span className="text-xs bg-emerald-100 text-emerald-700 font-semibold px-2 py-0.5 rounded-full">
                        {gcEmails.length} recipient{gcEmails.length > 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                  <ChevronRight size={15} className={`text-slate-400 transition-transform ${showGcPanel ? 'rotate-90' : ''}`} />
                </button>

                {showGcPanel && (
                  <div className="border-t border-slate-100 px-5 py-4 space-y-3">
                    <p className="text-xs text-slate-500 leading-relaxed">
                      Every time you save a <strong>Final</strong> report, it gets emailed to these addresses automatically. Add your GC, PM, or owner.
                    </p>

                    {gcEmails.map((email, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <div className="flex-1 flex items-center gap-2 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2 text-sm text-slate-700">
                          <Mail size={12} className="text-slate-400 flex-shrink-0" />
                          <span className="truncate">{email}</span>
                        </div>
                        <button
                          onClick={() => setGcEmails(prev => prev.filter((_, idx) => idx !== i))}
                          className="text-slate-300 hover:text-red-500 transition-colors p-1.5 rounded-lg hover:bg-red-50 flex-shrink-0"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ))}

                    <form
                      onSubmit={e => {
                        e.preventDefault();
                        const email = gcEmailInput.trim().toLowerCase();
                        if (!email || gcEmails.includes(email)) return;
                        setGcEmails(prev => [...prev, email]);
                        setGcEmailInput('');
                      }}
                      className="flex gap-2"
                    >
                      <input
                        type="email"
                        value={gcEmailInput}
                        onChange={e => setGcEmailInput(e.target.value)}
                        placeholder="gc@company.com"
                        className="flex-1 border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300"
                      />
                      <button
                        type="submit"
                        disabled={!gcEmailInput.trim()}
                        className="bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-900 font-bold px-4 py-2.5 rounded-lg text-sm transition-all"
                      >
                        Add
                      </button>
                    </form>

                    <div className="pt-2 border-t border-slate-100">
                      <p className="text-xs text-slate-400 mb-2">Share a live project feed link with your GC or owner:</p>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(`${window.location.origin}/projects/${selectedId}`);
                          setFeedLinkCopied(true);
                          setTimeout(() => setFeedLinkCopied(false), 2500);
                        }}
                        className="flex items-center gap-2 text-sm font-semibold text-amber-600 hover:text-amber-700 transition-colors"
                      >
                        {feedLinkCopied
                          ? <><Check size={13} className="text-emerald-500" /> Link copied!</>
                          : <><Link2 size={13} /> Copy project feed link</>
                        }
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-end pt-2">
              <button
                onClick={() => { loadPrevContext(selectedId); setStep('input'); }}
                disabled={!selectedId}
                className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-900 font-bold px-6 py-3 rounded-xl transition-all shadow-lg shadow-amber-500/20 disabled:shadow-none"
              >
                Next <ChevronRight size={17} />
              </button>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════
            Step 2 — Notes
        ══════════════════════════════════════════════════════════════ */}
        {step === 'input' && (
          <div className="space-y-5 animate-fade-up">
            {/* ── Offline banner ── */}
            {!isOnline && (
              <div className="flex items-center gap-2.5 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm">
                <WifiOff size={15} className="text-amber-500 flex-shrink-0" />
                <span className="text-amber-800">No internet — notes are saving automatically. Generate when you&apos;re back online.</span>
              </div>
            )}

            <div className="flex items-center justify-between">
              <h2 className="text-xl font-extrabold text-slate-900">What happened today?</h2>
              <button onClick={() => setStep('project')} className="text-sm text-slate-400 hover:text-slate-600 transition-colors">
                ← {selectedProj?.name}
              </button>
            </div>

            {/* Previous day context */}
            {prevLookahead && (
              <div className={`rounded-xl border px-4 py-3.5 text-sm transition-all ${
                usePrevLookahead ? 'bg-blue-50 border-blue-200' : 'bg-slate-50 border-slate-200 opacity-60'
              }`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5 min-w-0">
                    <History size={15} className={`flex-shrink-0 mt-0.5 ${usePrevLookahead ? 'text-blue-500' : 'text-slate-400'}`} />
                    <div className="min-w-0">
                      <div className={`font-semibold text-xs uppercase tracking-wider mb-1 ${usePrevLookahead ? 'text-blue-600' : 'text-slate-400'}`}>
                        From {new Date(prevLookaheadDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
                      </div>
                      <p className={`text-sm leading-relaxed line-clamp-2 ${usePrevLookahead ? 'text-slate-700' : 'text-slate-400'}`}>
                        {prevLookahead}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setUsePrevLookahead(v => !v)}
                    className={`flex-shrink-0 text-xs font-bold px-3 py-1.5 rounded-lg transition-all ${
                      usePrevLookahead
                        ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                        : 'bg-slate-200 text-slate-500 hover:bg-slate-300'
                    }`}
                  >
                    {usePrevLookahead ? 'Using ✓' : 'Off'}
                  </button>
                </div>
              </div>
            )}

            {/* ── Meta row ── */}
            <div className="grid grid-cols-2 gap-3">
              {/* Date — full width on mobile */}
              <div className="col-span-2 sm:col-span-1">
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Date</label>
                <input
                  type="date"
                  value={date}
                  onChange={e => setDate(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-transparent bg-white transition-all"
                />
              </div>
              {/* Crew */}
              <div>
                <label className="flex items-center gap-1 text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                  <Users size={11} /> Crew on site
                </label>
                <input
                  type="number"
                  min={0}
                  value={crewCount}
                  onChange={e => setCrewCount(Number(e.target.value))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-transparent bg-white transition-all"
                />
              </div>
              {/* Weather */}
              <div>
                <label className="flex items-center gap-1 text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                  <CloudSun size={11} /> Weather
                </label>
                <input
                  type="text"
                  value={weatherLoading ? '' : weather}
                  onChange={e => setWeather(e.target.value)}
                  placeholder={weatherLoading ? 'Fetching…' : 'Clear skies'}
                  className="w-full border border-slate-200 rounded-lg px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-transparent bg-white transition-all"
                />
              </div>
              {/* Temp */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Temp</label>
                <input
                  type="text"
                  value={weatherLoading ? '' : temp}
                  onChange={e => setTemp(e.target.value)}
                  placeholder={weatherLoading ? '…' : '72°F'}
                  className="w-full border border-slate-200 rounded-lg px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-transparent bg-white transition-all"
                />
              </div>
            </div>

            {/* ── Voice / text area ── */}
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
              {voiceSupported ? (
                <div className={`flex items-center justify-between px-5 py-4 border-b ${listening ? 'bg-red-50 border-red-100' : 'border-slate-100'} transition-colors`}>
                  <div>
                    <div className="text-sm font-bold text-slate-900">
                      {listening ? 'Recording…' : 'Speak your notes'}
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      {listening ? "Tap stop when you're done talking" : 'Or type below — messy is fine'}
                    </div>
                  </div>
                  <button
                    onClick={listening ? stopListening : startListening}
                    className={`relative flex items-center gap-2.5 font-bold px-5 py-3 rounded-xl text-sm transition-all duration-150 ${
                      listening
                        ? 'bg-red-500 text-white shadow-lg shadow-red-200'
                        : 'bg-slate-900 text-white hover:bg-slate-700 shadow-md'
                    }`}
                  >
                    {listening && <span className="voice-ring" />}
                    {listening ? <MicOff size={16} /> : <Mic size={16} />}
                    {listening ? 'Stop' : 'Record'}
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100 bg-amber-50/60">
                  <Mic size={16} className="text-amber-500 flex-shrink-0" />
                  <div>
                    <div className="text-sm font-semibold text-slate-700">Voice input isn&apos;t available in this browser</div>
                    <div className="text-xs text-slate-500 mt-0.5">Type your notes below — use Chrome on desktop or Android for voice</div>
                  </div>
                </div>
              )}

              <div className="relative">
                <textarea
                  rows={8}
                  value={rawInput + (interimText ? ' ' + interimText : '')}
                  onChange={e => setRawInput(e.target.value)}
                  placeholder={`Example: "Poured the slab on the north wing, about 200 yards. Weather held up. Had an issue with rebar spacing on east corner — called the SE. Crew of 14 today, no safety incidents. Tomorrow we're setting formwork on level 2."`}
                  className="w-full px-5 py-4 text-sm text-slate-800 leading-relaxed focus:outline-none resize-none placeholder:text-slate-300 font-mono"
                />
                {wordCount > 0 && (
                  <div className={`absolute bottom-3 right-4 text-xs ${wordCount < 15 ? 'text-amber-400' : 'text-slate-300'}`}>
                    {wordCount} words{wordCount < 15 ? ' — add more for a better report' : ''}
                  </div>
                )}
              </div>
            </div>

            {/* ── Site photos ── */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <Camera size={15} className="text-slate-400" />
                  <span className="text-sm font-bold text-slate-700">Site photos</span>
                  <span className="text-xs text-slate-400">— AI will analyze them</span>
                </div>
                <label
                  htmlFor="photo-upload"
                  className={`cursor-pointer text-xs font-bold px-3 py-1.5 rounded-lg transition-all ${
                    photoProcessing || photos.length >= 8
                      ? 'text-slate-300 pointer-events-none'
                      : 'text-amber-600 hover:bg-amber-50'
                  }`}
                >
                  {photoProcessing ? 'Processing…' : photos.length >= 8 ? 'Max 8' : '+ Add photos'}
                </label>
                <input
                  id="photo-upload"
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={e => e.target.files && handlePhotoFiles(e.target.files)}
                />
              </div>
              {photos.length > 0 ? (
                <div className="p-4 grid grid-cols-4 gap-2">
                  {photos.map((photo, i) => (
                    <div key={i} className="relative aspect-square">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={photo} alt={`Site photo ${i + 1}`} className="w-full h-full object-cover rounded-xl" />
                      <button
                        onClick={() => setPhotos(prev => prev.filter((_, idx) => idx !== i))}
                        aria-label="Remove photo"
                        className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-slate-800 text-white rounded-full flex items-center justify-center shadow-md hover:bg-red-500 transition-colors"
                      >
                        <X size={10} />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <label
                  htmlFor="photo-upload"
                  className="flex flex-col items-center justify-center gap-2 py-8 cursor-pointer text-slate-300 hover:text-slate-400 transition-colors"
                >
                  <Camera size={28} />
                  <span className="text-xs font-medium">Tap to add site photos</span>
                </label>
              )}
            </div>

            {/* ── Sub crews (collapsible) ── */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <button
                onClick={() => { setShowSubs(v => !v); if (!showSubs && subs.length === 0) addSub(); }}
                className="w-full flex items-center justify-between px-5 py-3.5 text-left hover:bg-slate-50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Users size={15} className="text-slate-400" />
                  <span className="text-sm font-bold text-slate-700">Sub crews on site</span>
                  {subs.filter(s => s.company.trim()).length > 0 && (
                    <span className="text-xs bg-amber-100 text-amber-700 font-semibold px-2 py-0.5 rounded-full">
                      {subs.filter(s => s.company.trim()).length} added
                    </span>
                  )}
                </div>
                <ChevronRight size={15} className={`text-slate-400 transition-transform ${showSubs ? 'rotate-90' : ''}`} />
              </button>
              {showSubs && (
                <div className="px-5 pb-4 space-y-2 border-t border-slate-100 pt-4">
                  {subs.map((sub, i) => (
                    <div key={i} className="flex gap-2 items-center">
                      <input
                        placeholder="Company"
                        value={sub.company}
                        onChange={e => updateSub(i, 'company', e.target.value)}
                        className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-transparent"
                      />
                      <input
                        placeholder="Trade"
                        value={sub.trade}
                        onChange={e => updateSub(i, 'trade', e.target.value)}
                        className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-transparent"
                      />
                      <input
                        type="number"
                        min={1}
                        placeholder="Workers"
                        value={sub.workers}
                        onChange={e => updateSub(i, 'workers', Math.max(1, Number(e.target.value) || 1))}
                        className="w-20 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-transparent"
                      />
                      <button onClick={() => removeSub(i)} aria-label="Remove sub" className="text-slate-300 hover:text-red-500 transition-colors p-1">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={addSub}
                    className="flex items-center gap-1.5 text-sm font-semibold text-amber-600 hover:text-amber-700 transition-colors mt-1"
                  >
                    <Plus size={14} /> Add sub
                  </button>
                </div>
              )}
            </div>

            {/* ── Visitors / inspectors (collapsible) ── */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <button
                onClick={() => { setShowVisitors(v => !v); if (!showVisitors && visitors.length === 0) addVisitor(); }}
                className="w-full flex items-center justify-between px-5 py-3.5 text-left hover:bg-slate-50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <UserCheck size={15} className="text-slate-400" />
                  <span className="text-sm font-bold text-slate-700">Visitors & inspections</span>
                  {visitors.filter(v => v.name.trim()).length > 0 && (
                    <span className="text-xs bg-amber-100 text-amber-700 font-semibold px-2 py-0.5 rounded-full">
                      {visitors.filter(v => v.name.trim()).length} logged
                    </span>
                  )}
                </div>
                <ChevronRight size={15} className={`text-slate-400 transition-transform ${showVisitors ? 'rotate-90' : ''}`} />
              </button>
              {showVisitors && (
                <div className="px-5 pb-4 space-y-2 border-t border-slate-100 pt-4">
                  {visitors.map((v, i) => (
                    <div key={i} className="flex gap-2 items-center">
                      <input
                        placeholder="Name"
                        value={v.name}
                        onChange={e => updateVisitor(i, 'name', e.target.value)}
                        className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-transparent"
                      />
                      <input
                        placeholder="Company"
                        value={v.company}
                        onChange={e => updateVisitor(i, 'company', e.target.value)}
                        className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-transparent"
                      />
                      <input
                        placeholder="Purpose / inspection"
                        value={v.purpose}
                        onChange={e => updateVisitor(i, 'purpose', e.target.value)}
                        className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-transparent"
                      />
                      <button onClick={() => removeVisitor(i)} aria-label="Remove visitor" className="text-slate-300 hover:text-red-500 transition-colors p-1">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={addVisitor}
                    className="flex items-center gap-1.5 text-sm font-semibold text-amber-600 hover:text-amber-700 transition-colors mt-1"
                  >
                    <Plus size={14} /> Add visitor
                  </button>
                </div>
              )}
            </div>

            {error && (
              <div className="flex items-center gap-2.5 text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm">
                <AlertCircle size={15} className="flex-shrink-0" /> {error}
              </div>
            )}

            <div className="flex flex-col items-end gap-2">
              <p className="text-xs text-slate-400">
                Notes are sent to Claude AI during generation only — nothing else leaves your browser.
              </p>
              <button
                onClick={generate}
                disabled={!rawInput.trim() || generating}
                className="flex items-center gap-2.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-900 font-bold px-8 py-4 rounded-xl transition-all shadow-xl shadow-amber-500/25 disabled:shadow-none text-base"
              >
                <FileText size={18} />
                Generate Report
                {photos.length > 0 && <span className="bg-slate-900/20 text-slate-900 text-xs font-bold px-2 py-0.5 rounded-full">{photos.length} photo{photos.length > 1 ? 's' : ''}</span>}
              </button>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════
            Generating
        ══════════════════════════════════════════════════════════════ */}
        {step === 'generating' && (
          <div className="flex flex-col items-center justify-center py-28 space-y-6 animate-fade-in">
            <div className="relative w-20 h-20">
              <div className="absolute inset-0 rounded-full bg-amber-100 animate-ping opacity-40" />
              <div className="relative w-20 h-20 bg-amber-50 rounded-full flex items-center justify-center">
                <Loader2 size={32} className="text-amber-500 animate-spin" />
              </div>
            </div>
            <div className="text-center">
              <h2 className="text-xl font-extrabold text-slate-900 mb-2">Generating your report</h2>
              <p className="text-slate-400 text-sm min-h-[20px] transition-all">{GEN_MESSAGES[genMsgIdx]}</p>
            </div>
            <div className="flex gap-1.5 mt-2">
              {GEN_MESSAGES.map((_, i) => (
                <div key={i} className={`h-1 rounded-full transition-all duration-500 ${i === genMsgIdx ? 'w-6 bg-amber-500' : 'w-1.5 bg-slate-200'}`} />
              ))}
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════
            Step 3 — Review
        ══════════════════════════════════════════════════════════════ */}
        {step === 'review' && editedSections && (
          <div className="space-y-5 animate-fade-up">
            <div className="flex items-center justify-between flex-wrap gap-3 pb-2">
              <div>
                <h2 className="text-xl font-extrabold text-slate-900">Review your report</h2>
                <p className="text-xs text-slate-400 mt-0.5">Click any section to edit it inline</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setStep('input')}
                  className="text-sm text-slate-500 hover:text-slate-700 px-3 py-2 rounded-lg hover:bg-slate-100 transition-colors"
                >
                  ← Edit notes
                </button>
                <button
                  onClick={() => save('draft')}
                  className="text-sm font-semibold px-4 py-2 rounded-xl border-2 border-slate-200 text-slate-600 hover:border-slate-300 transition-all"
                >
                  Save draft
                </button>
                <button
                  onClick={() => save('final')}
                  className="flex items-center gap-1.5 text-sm font-bold px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-900 shadow-lg shadow-amber-500/20 transition-all"
                >
                  <Check size={14} /> Finalize
                </button>
              </div>
            </div>

            {/* Report header preview */}
            <div className="bg-slate-950 text-white rounded-2xl p-6">
              <div className="text-xs text-slate-500 uppercase tracking-widest font-semibold mb-2">Daily Construction Report</div>
              <div className="text-xl font-extrabold">{selectedProj?.name}</div>
              <div className="text-slate-400 text-sm mt-1">
                {new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
              </div>
              <div className="flex flex-wrap gap-4 mt-4 pt-4 border-t border-white/10 text-sm">
                <span className="text-slate-300"><span className="text-slate-500">Crew:</span> {crewCount} workers</span>
                {weather && <span className="text-slate-300"><span className="text-slate-500">Weather:</span> {weather}{temp ? `, ${temp}` : ''}</span>}
                {selectedProj?.gcName && <span className="text-slate-300"><span className="text-slate-500">GC:</span> {selectedProj.gcName}</span>}
                {photos.length > 0 && <span className="text-slate-300"><span className="text-slate-500">Photos:</span> {photos.length}</span>}
                {template !== 'standard' && (
                  <span className="text-slate-300">
                    <span className="text-slate-500">Style:</span>{' '}
                    {REPORT_TEMPLATES.find(t => t.key === template)?.label}
                  </span>
                )}
              </div>
            </div>

            {/* Photo strip in review */}
            {photos.length > 0 && (
              <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
                {photos.map((photo, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={i} src={photo} alt={`Site photo ${i + 1}`} className="w-full aspect-square object-cover rounded-xl shadow-sm" />
                ))}
              </div>
            )}

            {/* Editable section cards */}
            {REPORT_SECTIONS.map(({ key, label, color }) => (
              <div key={key} className={`bg-white rounded-2xl border border-l-4 ${color} border-slate-100 shadow-sm overflow-hidden report-card hover:shadow-md transition-shadow`}>
                <div className="px-5 py-3 bg-slate-50/50 border-b border-slate-100">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">{label}</span>
                </div>
                <div className="px-5 py-4">
                  <textarea
                    rows={Math.max(2, Math.ceil(editedSections[key].length / 90))}
                    value={editedSections[key]}
                    onChange={e => setEditedSections(prev => prev ? { ...prev, [key]: e.target.value } : prev)}
                    className="w-full text-sm text-slate-700 leading-relaxed focus:outline-none resize-none bg-transparent"
                  />
                </div>
              </div>
            ))}

            <div className="flex justify-end gap-2 pb-8">
              <button onClick={() => save('draft')} className="text-sm font-semibold px-4 py-2.5 rounded-xl border-2 border-slate-200 text-slate-600 hover:border-slate-300 transition-all">
                Save as draft
              </button>
              <button onClick={() => save('final')} className="flex items-center gap-1.5 text-sm font-bold px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-900 shadow-lg shadow-amber-500/20 transition-all">
                <Check size={14} /> Finalize & Save
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
