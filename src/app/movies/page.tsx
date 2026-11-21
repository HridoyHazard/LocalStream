import BrowseView from '@/components/browse/BrowseView';

export default function MoviesPage() {
  return (
    <BrowseView
      kind="movie"
      eyebrow="Feature presentations"
      title="Movies"
      description="Every film on your server, beautifully arranged and ready to play. Browse the complete local collection — no internet required."
    />
  );
}
