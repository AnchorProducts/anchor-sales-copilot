"use client";

// Compact multi-image picker with thumbnail previews + remove. Holds File
// objects in the parent's state; the parent submits them as FormData.
export default function ImagePicker({
  images,
  onChange,
  max = 6,
}: {
  images: File[];
  onChange: (next: File[]) => void;
  max?: number;
}) {
  return (
    <div>
      <input
        type="file"
        accept="image/*"
        multiple
        onChange={(e) => {
          const files = Array.from(e.target.files || []);
          onChange([...images, ...files].slice(0, max));
          e.currentTarget.value = "";
        }}
        className="block w-full text-sm text-[var(--anchor-gray)] file:mr-3 file:rounded-full file:border-0 file:bg-[var(--anchor-mint)] file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-[var(--anchor-deep)]"
      />
      {images.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {images.map((f, i) => (
            <div key={i} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={URL.createObjectURL(f)}
                alt={f.name}
                className="h-14 w-14 rounded-lg border border-[var(--border-default)] object-cover"
              />
              <button
                type="button"
                onClick={() => onChange(images.filter((_, j) => j !== i))}
                aria-label="Remove image"
                className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-[11px] font-bold text-white"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
