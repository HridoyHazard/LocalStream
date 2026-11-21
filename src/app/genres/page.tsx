import type { Metadata } from 'next';
import GenresView from '@/components/library/GenresView';

export const metadata: Metadata = {
  title: 'Genres & collections',
  description: 'Explore your local library by genre, decade, and server collection.',
};

export default function GenresPage() {
  return <GenresView />;
}
