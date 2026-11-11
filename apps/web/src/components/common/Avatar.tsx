import getFullImageUrl from "@/utilities/imageUrl";

/** A round avatar: the photo if there is one, otherwise the first initial on red. */
export default function Avatar({
  url,
  name,
  size = 88,
}: {
  url?: string | null;
  name?: string | null;
  size?: number;
}) {
  const src = url ? getFullImageUrl(url) : null;
  return (
    <span
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-gray-200 bg-red-600 font-semibold text-white"
      style={{ width: size, height: size, fontSize: size * 0.36 }}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="h-full w-full object-cover" />
      ) : (
        (name || "U").charAt(0).toUpperCase()
      )}
    </span>
  );
}
