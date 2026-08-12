import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Synth — Swarm Deep Research',
  description: 'AI-powered research using agent swarms',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-[#0a0a0f] text-gray-100 antialiased min-h-screen">
        {children}
      </body>
    </html>
  );
}
