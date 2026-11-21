import type { Metadata } from 'next';
import RecentlyAddedView from '@/components/library/RecentlyAddedView';

export const metadata: Metadata = {
  title: 'Recently added',
  description: 'The newest titles indexed from your local media server.',
};

export default function RecentlyAddedPage() {
  return <RecentlyAddedView />;
}
