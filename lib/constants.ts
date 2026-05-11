import type { ReportSections, ReportTemplate } from '@/types';

export const REPORT_TEMPLATES: {
  key: ReportTemplate;
  label: string;
  description: string;
}[] = [
  {
    key: 'standard',
    label: 'Standard GC',
    description: 'Full 9-section narrative — the industry default',
  },
  {
    key: 'residential',
    label: 'Residential / Remodel',
    description: 'Shorter, plain-language format homeowners can read',
  },
  {
    key: 'heavy-civil',
    label: 'Heavy Civil',
    description: 'Quantities installed, equipment hours, production rates',
  },
  {
    key: 'owner-summary',
    label: 'Owner / Client Summary',
    description: 'Executive brief — no jargon, schedule and cost focus',
  },
  {
    key: 'custom',
    label: 'Match my format',
    description: 'Paste or upload a previous report — AI copies your style',
  },
];

export const REPORT_SECTIONS: { key: keyof ReportSections; label: string; color: string }[] = [
  { key: 'projectInfo',       label: 'Project Information',        color: 'border-slate-300'  },
  { key: 'weatherConditions', label: 'Weather Conditions',         color: 'border-sky-400'    },
  { key: 'laborSummary',      label: 'Labor Summary',              color: 'border-violet-400' },
  { key: 'workCompleted',     label: 'Work Completed Today',       color: 'border-amber-400'  },
  { key: 'materialsUsed',     label: 'Materials Delivered / Used', color: 'border-orange-400' },
  { key: 'equipmentOnSite',   label: 'Equipment On Site',          color: 'border-amber-300'  },
  { key: 'issuesAndDelays',   label: 'Issues, Delays & RFIs',      color: 'border-red-400'    },
  { key: 'safetyNotes',       label: 'Safety Observations',        color: 'border-emerald-400'},
  { key: 'lookahead',         label: 'Plan for Tomorrow',          color: 'border-blue-400'   },
];
