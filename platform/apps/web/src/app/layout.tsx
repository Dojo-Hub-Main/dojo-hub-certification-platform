import type { Metadata } from 'next';
import localFont from 'next/font/local';
import './globals.css';
import { QueryProvider } from '@/lib/query-provider';
import { AuthProvider } from '@/lib/auth-context';
import { SocketProvider } from '@/lib/socket-provider';

// The fonts ship with the app rather than coming from next/font/google, which downloads
// them during every build: when Google Fonts didn't answer in time, the Render build
// failed. These are the variable Latin files (from Fontsource), covering every weight.
const inter = localFont({
  src: './fonts/inter-latin-wght-normal.woff2',
  variable: '--font-inter',
  weight: '100 900',
});
const jetbrainsMono = localFont({
  src: './fonts/jetbrains-mono-latin-wght-normal.woff2',
  variable: '--font-jetbrains-mono',
  weight: '100 800',
});

export const metadata: Metadata = {
  title: 'Dojo Hub Learning Platform',
  description: 'Structured certification courses in software, hardware and data science, with supervisor-reviewed capstones and verifiable certificates.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <body className="antialiased font-sans">
        <QueryProvider>
          <AuthProvider>
            <SocketProvider>{children}</SocketProvider>
          </AuthProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
