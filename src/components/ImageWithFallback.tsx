import React, { useState } from "react";
import { Image as ImageIcon, User as UserIcon } from "lucide-react";

interface ImageWithFallbackProps {
  src?: string;
  alt: string;
  className?: string;
  fallbackText?: string;
  isAvatar?: boolean;
  referrerPolicy?: "no-referrer" | "origin" | "no-referrer-when-downgrade" | "origin-when-cross-origin" | "same-origin" | "strict-origin" | "strict-origin-when-cross-origin" | "unsafe-url";
}

export default function ImageWithFallback({
  src,
  alt,
  className = "",
  fallbackText,
  isAvatar = false,
  referrerPolicy,
}: ImageWithFallbackProps) {
  const [hasError, setHasError] = useState(!src);

  const handleImgError = () => {
    setHasError(true);
  };

  if (hasError || !src) {
    if (isAvatar) {
      // Elegant avatar placeholder with a nice gradient and initials or icon
      const initials = alt
        ? alt
            .split(" ")
            .map((n) => n[0])
            .join("")
            .slice(0, 2)
            .toUpperCase()
        : "";

      return (
        <div
          className={`${className} flex items-center justify-center bg-gradient-to-tr from-slate-950 via-slate-900 to-indigo-950/40 text-sky-400 font-black text-xs border border-slate-800 shadow-inner`}
          title={alt}
        >
          {initials || <UserIcon className="h-3.5 w-3.5 text-sky-400" />}
        </div>
      );
    }

    // General fallback block
    return (
      <div
        className={`${className} flex flex-col items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-slate-850 p-4 border border-slate-800 text-center select-none relative`}
      >
        <div className="absolute inset-0 bg-radial-gradient from-transparent to-slate-950/20 pointer-events-none" />
        <ImageIcon className="h-5 w-5 text-slate-600 mb-1.5" />
        {fallbackText ? (
          <span className="text-[10px] text-slate-400 font-semibold tracking-wide uppercase line-clamp-1 px-2">
            {fallbackText}
          </span>
        ) : (
          <span className="text-[10px] text-slate-500 font-medium truncate max-w-full px-2">
            {alt}
          </span>
        )}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy={referrerPolicy}
      onError={handleImgError}
      className={className}
    />
  );
}
