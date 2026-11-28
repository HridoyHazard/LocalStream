import SearchView from '@/components/search/SearchView';

type Param = string | string[] | undefined;

function first(value: Param) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, Param>>;
}) {
  const params = await searchParams;
  return (
    <SearchView
      initialQuery={first(params.q) ?? ''}
      initialFilters={{
        kind: first(params.kind),
        year: first(params.year),
        genre: first(params.genre),
        language: first(params.language),
        actor: first(params.actor),
        director: first(params.director),
      }}
    />
  );
}
