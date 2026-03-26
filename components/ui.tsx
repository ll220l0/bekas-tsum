import clsx from "clsx";
import Image from "next/image";
import type { CSSProperties, ReactNode } from "react";

export function Card({
  children,
  className,
  style
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      style={style}
      className={clsx(
        "rounded-[26px] border border-[#ecd9bc] bg-white/90 shadow-[0_20px_50px_-28px_rgba(217,119,6,0.28)] backdrop-blur",
        "transition-[transform,box-shadow,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
        className
      )}
    >
      {children}
    </div>
  );
}

export function Pill({ children, active }: { children: ReactNode; active?: boolean }) {
  return (
    <div
      className={clsx(
        "rounded-full px-4 py-2 text-sm font-semibold transition",
        active
          ? "bg-orange-500 text-white shadow-[0_10px_24px_-16px_rgba(249,115,22,0.55)]"
          : "border border-[#eadbc4] bg-[#fff8ee] text-[#7b6a54]"
      )}
    >
      {children}
    </div>
  );
}

export function Photo({
  src,
  alt,
  className,
  imgClassName,
  sizes = "96px"
}: {
  src: string;
  alt: string;
  className?: string;
  imgClassName?: string;
  sizes?: string;
}) {
  return (
    <div
      className={clsx(
        "relative h-20 w-20 shrink-0 overflow-hidden rounded-[20px] bg-[#f6ead7]",
        className
      )}
    >
      <Image
        src={src}
        alt={alt}
        fill
        className={clsx("object-cover", imgClassName)}
        sizes={sizes}
      />
    </div>
  );
}

export function Button({
  children,
  onClick,
  variant = "primary",
  type = "button",
  disabled,
  className
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "ghost" | "food";
  type?: "button" | "submit";
  disabled?: boolean;
  className?: string;
}) {
  const base =
    "inline-flex items-center justify-center rounded-full px-5 py-3 text-center font-bold leading-none transition-all duration-200 active:scale-[0.97] disabled:opacity-40 disabled:active:scale-100";

  const styles =
    variant === "primary" || variant === "food"
      ? "bg-orange-500 text-white shadow-[0_16px_32px_-20px_rgba(249,115,22,0.55)] hover:bg-orange-400"
      : variant === "secondary"
        ? "border border-[#eadbc4] bg-white text-[#3b2f21] hover:bg-[#fff7eb]"
        : "bg-transparent text-[#8a7a66] hover:text-[#2f2419]";

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={clsx(base, styles, className)}
    >
      {children}
    </button>
  );
}
