import VideoPlayer from '@/components/player/VideoPlayer';

export default async function WatchPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ episode?: string; restart?: string }>;
}) {
  const resolvedParams = await params;
  const resolvedSearch = await searchParams;
  const titleId = decodeURIComponent(resolvedParams.id);

  return (
    <VideoPlayer
      key={`${titleId}:${resolvedSearch.episode ?? 'auto'}`}
      titleId={titleId}
      episodeId={resolvedSearch.episode ?? null}
      restart={resolvedSearch.restart === '1'}
    />
  );
}
