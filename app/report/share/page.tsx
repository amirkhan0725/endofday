import { Suspense } from 'react';
import ShareViewer from '@/app/report/_components/ShareViewer';
import { HardHat } from 'lucide-react';

function LoadingFallback() {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center gap-4">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 bg-amber-500 rounded-lg flex items-center justify-center">
          <HardHat size={16} className="text-slate-900" />
        </div>
        <span className="text-slate-900 font-bold text-lg">EndOfDay</span>
      </div>
      <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

export default function SharePage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <ShareViewer />
    </Suspense>
  );
}
