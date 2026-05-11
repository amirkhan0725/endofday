import ReportViewer from '@/app/report/_components/ReportViewer';

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ReportViewer id={id} />;
}
