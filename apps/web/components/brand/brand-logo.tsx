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
  heightClass = "h-10",
  priority = false,
}: BrandLogoProps) {
  return (
    <span className={`relative inline-flex shrink-0 items-center ${className}`}>
      <Image
        src="/brand/alrouby-logo.png"
        alt="Alrouby Salon & Spa"
        width={160}
        height={64}
        className={`${heightClass} w-auto max-w-[min(200px,42vw)] object-contain object-left`}
        priority={priority}
      />
    </span>
  );
}
