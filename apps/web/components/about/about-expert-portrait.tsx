"use client";

import { useCallback, useState } from "react";

type AboutExpertPortraitProps = {
  src: string | null | undefined;
  alt: string;
  initial: string;
};

/**
 * Portrait area with optional remote URL; falls back to a designed luxury
 * placeholder (gradient, texture, cameo silhouette) when no image is set.
 */
export function AboutExpertPortrait({ src, alt, initial }: AboutExpertPortraitProps) {
  const [useFallback, setUseFallback] = useState(!src?.trim());

  const onError = useCallback(() => {
    setUseFallback(true);
  }, []);

  if (!useFallback && src?.trim()) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src.trim()}
        alt={alt}
        onError={onError}
        className="h-full w-full object-cover object-[center_18%]"
        loading="lazy"
        decoding="async"
      />
    );
  }

  return (
    <div
      className="relative h-full w-full overflow-hidden shadow-[inset_0_0_0_1px_rgba(185,151,74,0.22)]"
      role="img"
      aria-label={alt}
    >
      <div
        className="absolute inset-0 bg-gradient-to-br from-[#fdf9f2] via-[#ebe3d4] to-[#d4c4a8]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_70%_55%_at_50%_38%,rgba(255,250,241,0.55)_0%,transparent_62%)]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.11]"
        style={{
          backgroundImage: `repeating-linear-gradient(
            -18deg,
            transparent,
            transparent 5px,
            rgba(31, 36, 32, 0.12) 5px,
            rgba(31, 36, 32, 0.12) 6px
          )`,
        }}
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_90%_70%_at_50%_100%,rgba(31,36,32,0.07)_0%,transparent_52%)]"
        aria-hidden
      />
      {/* Abstract portrait “cameo” */}
      <div
        className="pointer-events-none absolute bottom-0 left-1/2 h-[78%] w-[min(68%,200px)] -translate-x-1/2 rounded-t-[999px] bg-gradient-to-b from-[#2a382f]/[0.09] via-[#2a382f]/[0.04] to-transparent"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute left-0 top-0 h-20 w-20 bg-gradient-to-br from-[#c9a868]/25 to-transparent"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute bottom-0 right-0 h-16 w-24 bg-gradient-to-tl from-[#b9974a]/12 to-transparent"
        aria-hidden
      />

      <div className="relative flex h-full w-full items-center justify-center px-4">
        <span
          className="select-none font-heading text-5xl font-semibold tracking-[0.04em] text-[#243028]/[0.5] drop-shadow-[0_1px_0_rgba(255,250,241,0.85)] sm:text-6xl lg:text-[3.75rem] lg:tracking-[0.06em]"
          aria-hidden
        >
          {initial}
        </span>
      </div>
    </div>
  );
}
