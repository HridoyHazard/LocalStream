import type { Metadata } from 'next';
import HistoryView from '@/components/library/HistoryView';

export const metadata: Metadata = {
  title: 'Watch history',
  description: 'Resume playback or revisit anything you have watched.',
};

export default function HistoryPage() {
  return <HistoryView />;
}
