export type ReportTemplate =
  | 'standard'
  | 'residential'
  | 'heavy-civil'
  | 'owner-summary'
  | 'custom';

export interface Project {
  id: string;
  name: string;
  address: string;
  clientName: string;
  gcName: string;
  superintendentName: string;
  createdAt: string;
  template?: ReportTemplate;       // defaults to 'standard'
  sampleReportText?: string;       // pasted previous report (custom template)
  sampleReportImage?: string;      // compressed base64 scan of previous report
  gcEmails?: string[];             // auto-email final reports to these addresses
}

export interface ReportSections {
  projectInfo: string;
  weatherConditions: string;
  laborSummary: string;
  workCompleted: string;
  materialsUsed: string;
  equipmentOnSite: string;
  issuesAndDelays: string;
  safetyNotes: string;
  lookahead: string;
}

export interface SubEntry {
  company: string;
  trade: string;
  workers: number;
}

export interface VisitorEntry {
  name: string;
  company: string;
  purpose: string;
}

export interface DailyReport {
  id: string;
  projectId: string;
  projectName: string;
  date: string;
  rawInput: string;
  crewCount: number;
  weatherCondition: string;
  temperature: string;
  sections: ReportSections;
  status: 'draft' | 'final';
  createdAt: string;
  photos?: string[];         // client-compressed base64 JPEGs
  subs?: SubEntry[];         // subcontractor crew breakdown
  visitors?: VisitorEntry[]; // inspector / visitor log
  template?: ReportTemplate; // which style was used
}
