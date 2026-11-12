export default function Loading() {
  return (
    <div className="grid gap-5" aria-hidden>
      <div className="h-12 w-40 animate-pulse rounded-md bg-shelf/60 motion-reduce:animate-none" />
      <div className="h-24 animate-pulse rounded-md bg-shelf/60 motion-reduce:animate-none" />
      <div className="h-12 animate-pulse rounded-md bg-shelf/60 motion-reduce:animate-none" />
      <div className="grid gap-2">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="h-16 animate-pulse rounded-md bg-shelf/60 motion-reduce:animate-none" />
        ))}
      </div>
    </div>
  );
}
