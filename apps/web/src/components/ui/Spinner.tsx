export default function Spinner({
  size = 24,
  className = "text-primary",
  label,
}: {
  size?: number;
  className?: string;
  label?: string;
}) {
  return (
    <span role="status" className="inline-flex items-center gap-2">
      <svg
        className={`animate-spin ${className}`}
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.2" strokeWidth="3" />
        <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      </svg>
      <span className="sr-only">{label ?? "Loading"}</span>
    </span>
  );
}

/** Full-screen splash shown while the session is being restored. */
export function Splash() {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-white">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/images/sheda-splash.png" alt="Sheda" width={200} height={200} className="mb-6" />
      <Spinner size={36} />
    </div>
  );
}
