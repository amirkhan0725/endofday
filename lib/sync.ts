import { supabase } from './supabase';
import { saveProject, saveReport } from './storage';
import type { Project, DailyReport } from '@/types';

export async function getUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

export async function pushProject(project: Project, userId: string): Promise<void> {
  // sampleReportImage (base64) is intentionally excluded — too large for DB
  const { sampleReportImage: _img, ...rest } = project;
  await supabase.from('projects').upsert({
    id: rest.id,
    user_id: userId,
    name: rest.name,
    address: rest.address ?? '',
    client_name: rest.clientName ?? '',
    gc_name: rest.gcName ?? '',
    superintendent_name: rest.superintendentName ?? '',
    template: rest.template ?? 'standard',
    sample_report_text: rest.sampleReportText ?? null,
    gc_emails: rest.gcEmails ?? [],
    created_at: rest.createdAt,
  });
}

export async function pushReport(report: DailyReport, userId: string): Promise<void> {
  // photos (base64 array) intentionally excluded — stays in localStorage only
  const { photos: _photos, ...rest } = report;
  await supabase.from('reports').upsert({
    id: rest.id,
    project_id: rest.projectId,
    user_id: userId,
    project_name: rest.projectName,
    date: rest.date,
    raw_input: rest.rawInput ?? '',
    crew_count: rest.crewCount ?? 0,
    weather_condition: rest.weatherCondition ?? '',
    temperature: rest.temperature ?? '',
    sections: rest.sections,
    status: rest.status ?? 'draft',
    subs: rest.subs ?? [],
    visitors: rest.visitors ?? [],
    template: rest.template ?? null,
    created_at: rest.createdAt,
  });
}

async function pullProjects(): Promise<void> {
  const { data, error } = await supabase.from('projects').select('*');
  if (error || !data) return;
  for (const row of data) {
    saveProject({
      id: row.id,
      name: row.name,
      address: row.address ?? '',
      clientName: row.client_name ?? '',
      gcName: row.gc_name ?? '',
      superintendentName: row.superintendent_name ?? '',
      createdAt: row.created_at,
      template: row.template,
      sampleReportText: row.sample_report_text ?? undefined,
      gcEmails: row.gc_emails?.length ? row.gc_emails : undefined,
    });
  }
}

async function pullReports(): Promise<void> {
  const { data, error } = await supabase.from('reports').select('*');
  if (error || !data) return;
  for (const row of data) {
    saveReport({
      id: row.id,
      projectId: row.project_id,
      projectName: row.project_name,
      date: row.date,
      rawInput: row.raw_input ?? '',
      crewCount: row.crew_count ?? 0,
      weatherCondition: row.weather_condition ?? '',
      temperature: row.temperature ?? '',
      sections: row.sections,
      status: row.status ?? 'draft',
      createdAt: row.created_at,
      subs: row.subs ?? [],
      visitors: row.visitors ?? [],
      template: row.template ?? undefined,
    });
  }
}

export async function syncFromCloud(): Promise<void> {
  await Promise.allSettled([pullProjects(), pullReports()]);
}

export async function deleteProjectRemote(id: string): Promise<void> {
  await supabase.from('projects').delete().eq('id', id);
}

export async function deleteReportRemote(id: string): Promise<void> {
  await supabase.from('reports').delete().eq('id', id);
}
