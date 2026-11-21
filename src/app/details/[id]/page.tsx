import DetailsView from '@/components/details/DetailsView';

export default async function DetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = await params;
  return <DetailsView titleId={decodeURIComponent(resolvedParams.id)} />;
}
