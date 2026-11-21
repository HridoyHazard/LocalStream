import type { Metadata } from 'next';
import WatchlistView from '@/components/library/WatchlistView';

export const metadata: Metadata = {
  title: 'My list',
  description: 'Titles you saved for later on LocalStream.',
};

export default function WatchlistPage() {
  return <WatchlistView />;
}
