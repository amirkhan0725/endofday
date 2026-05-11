'use client';
import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { HardHat } from 'lucide-react';
import { Suspense } from 'react';

function CallbackHandler() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    async function verify() {
      const tokenHash = searchParams.get('token_hash');
      const type = searchParams.get('type');

      if (tokenHash && type) {
        // PKCE flow: exchange token hash for session
        const { error } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: type as 'magiclink' | 'email',
        });
        if (error) {
          router.replace('/auth?error=invalid_link');
          return;
        }
      }

      // For hash-based flow the SDK sets the session automatically from the URL fragment.
      // Give it a moment, then check.
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        router.replace('/');
      } else {
        // retry once for hash-based
        setTimeout(async () => {
          const { data: retry } = await supabase.auth.getSession();
          router.replace(retry.session ? '/' : '/auth?error=invalid_link');
        }, 1000);
      }
    }

    verify();
  }, [router, searchParams]);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center gap-4">
      <div className="w-10 h-10 bg-amber-500 rounded-xl flex items-center justify-center">
        <HardHat size={20} className="text-slate-900" />
      </div>
      <div className="w-5 h-5 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
      <p className="text-sm text-slate-500">Signing you in…</p>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense>
      <CallbackHandler />
    </Suspense>
  );
}
