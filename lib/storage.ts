import type { Project, DailyReport } from '@/types';

const PROJECTS_KEY = 'endofday_projects';
const REPORTS_KEY = 'endofday_reports';

export function getProjects(): Project[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(PROJECTS_KEY) || '[]');
  } catch {
    return [];
  }
}

export function saveProject(project: Project): void {
  const projects = getProjects();
  const idx = projects.findIndex((p) => p.id === project.id);
  if (idx >= 0) projects[idx] = project;
  else projects.push(project);
  localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects));
}

export function deleteProject(id: string): void {
  const projects = getProjects().filter((p) => p.id !== id);
  localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects));
}

export function getReports(): DailyReport[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(REPORTS_KEY) || '[]');
  } catch {
    return [];
  }
}

export function getReport(id: string): DailyReport | null {
  return getReports().find((r) => r.id === id) || null;
}

export function saveReport(report: DailyReport): void {
  const reports = getReports();
  const idx = reports.findIndex((r) => r.id === report.id);
  if (idx >= 0) reports[idx] = report;
  else reports.push(report);
  localStorage.setItem(REPORTS_KEY, JSON.stringify(reports));
}

export function deleteReport(id: string): void {
  const reports = getReports().filter((r) => r.id !== id);
  localStorage.setItem(REPORTS_KEY, JSON.stringify(reports));
}
