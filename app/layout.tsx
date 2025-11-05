import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'RTAA - Real-Time Agent Assist',
  description: 'Real-time transcript analysis and knowledge base recommendations',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
