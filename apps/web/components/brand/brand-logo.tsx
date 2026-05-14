import Image from "next/image";

type BrandLogoProps = {
  /** Outer wrapper classes (layout, hover). */
  className?: string;
  /** Tailwind height class for the logo mark (width stays auto). */
  heightClass?: string;
  priority?: boolean;
};

export function BrandLogo({
  className = "",
  heightClass = "h-12",
  priority = false,
}: BrandLogoProps) {
  return (
    <span className={`relative inline-flex shrink-0 items-center ${className}`}>
      <Image
        src="/brand/alrouby-logo.png"
        alt="Alrouby Salon & Spa"
        width={320}
        height={128}
        className={`${heightClass} w-auto max-w-[min(380px,90vw)] object-contain object-left`}
        priority={priority}
      />
    </span>
  );
}
