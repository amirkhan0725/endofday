'use client';
import { createContext, useContext, useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import type { User } from '@supabase/supabase-js';
import { HardHat } from 'lucide-react';

interface AuthCtx {
  user: User | null;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthCtx>({ user: null, signOut: async () => {} });
export const useAuth = () => useContext(Ctx);

// Pages that don't require a signed-in user.
// '/' is handled separately with an exact match so it doesn't accidentally
// make every path public (since every path starts with '/').
const PUBLIC_PATHS = ['/auth', '/report/share', '/projects/'];
const isPublicPath = (p: string) => p === '/' || PUBLIC_PATHS.some(pub => p.startsWith(pub));

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      setUser(session?.user ?? null);
      if (event === 'SIGNED_IN') {
        const { syncFromCloud } = await import('@/lib/sync');
        syncFromCloud().catch(() => {}); // background — don't block UI
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Redirect unauthenticated users to sign-in
  useEffect(() => {
    if (loading) return;
    if (!user && !isPublicPath(pathname)) router.replace('/auth');
  }, [loading, user, pathname, router]);

  async function signOut() {
    await supabase.auth.signOut();
    router.replace('/auth');
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 bg-amber-500 rounded-xl flex items-center justify-center">
            <HardHat size={20} className="text-slate-900" />
          </div>
          <div className="w-5 h-5 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  return <Ctx.Provider value={{ user, signOut }}>{children}</Ctx.Provider>;
}
