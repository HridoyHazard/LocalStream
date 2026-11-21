import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Title details',
  description: 'Details, file information, and playback for a title in your local library.',
};

export default function DetailsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
