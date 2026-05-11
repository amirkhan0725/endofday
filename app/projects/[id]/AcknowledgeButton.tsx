'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, ThumbsUp, X, Loader2 } from 'lucide-react';

interface Props {
  reportId: string;
  acknowledged?: { by: string; at: string } | null;
}

export function AcknowledgeButton({ reportId, acknowledged }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (acknowledged) {
    const date = new Date(acknowledged.at).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric',
    });
    return (
      <div className="flex items-center gap-1.5 text-xs text-emerald-600 font-semibold bg-emerald-50 border border-emerald-200 rounded-full px-3 py-1">
        <Check size={11} />
        <span>Acknowledged by {acknowledged.by} · {date}</span>
      </div>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError('Please enter your name.'); return; }
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch(`/api/acknowledge/${reportId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), email: email.trim() || undefined }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || 'Failed');
      }
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
      setSubmitting(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-full px-3 py-1 transition-all"
      >
        <ThumbsUp size={11} />
        Acknowledge
      </button>

      {open && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4"
          onClick={e => { if (e.target === e.currentTarget) setOpen(false); }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-extrabold text-slate-900">Acknowledge this report</h3>
                <p className="text-xs text-slate-400 mt-0.5">Confirms you&apos;ve reviewed today&apos;s report</p>
              </div>
              <button onClick={() => setOpen(false)} className="text-slate-300 hover:text-slate-500 transition-colors">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={submit} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                  Your name <span className="text-amber-500">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Jane Smith"
                  autoFocus
                  className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                  Email <span className="text-slate-300 font-normal normal-case">(optional)</span>
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="jane@gccompany.com"
                  className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-transparent"
                />
              </div>

              {error && (
                <p className="text-xs text-red-500">{error}</p>
              )}

              <button
                type="submit"
                disabled={submitting || !name.trim()}
                className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold px-4 py-3 rounded-xl transition-all mt-1"
              >
                {submitting
                  ? <><Loader2 size={15} className="animate-spin" /> Saving…</>
                  : <><Check size={15} /> Acknowledge Report</>
                }
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
