import type { Metadata, Viewport } from 'next';
import { Geist } from 'next/font/google';
import AuthProvider from '@/components/AuthProvider';
import './globals.css';

const geist = Geist({ subsets: ['latin'], variable: '--font-geist' });

export const metadata: Metadata = {
  title: 'EndOfDay – AI Construction Report Generator',
  description: 'Turn your end-of-day field notes into a professional daily construction report in seconds.',
  appleWebApp: {
    capable: true,
    title: 'EndOfDay',
    statusBarStyle: 'black-translucent',
  },
};

export const viewport: Viewport = {
  themeColor: '#f59e0b',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geist.variable} h-full`}>
      <body className="min-h-full bg-slate-50 text-slate-900 antialiased">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
