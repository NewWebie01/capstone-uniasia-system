"use client";
import Link, { LinkProps } from "next/link";
import { PropsWithChildren, MouseEvent } from "react";
import { usePathname } from "next/navigation";
import { useNavPending } from "@/stores/useNavPending";

type Props = LinkProps & PropsWithChildren & { className?: string };

export default function NavLink({ children, href, ...rest }: Props) {
  const pathname = usePathname();
  const setNavigating = useNavPending((s) => s.setNavigating);

  // normalize target pathname (handles string or URL-like object)
  const targetPath =
    typeof href === "string"
      ? new URL(
          href,
          typeof window !== "undefined" ? window.location.origin : "http://n"
        ).pathname
      : (href as any).pathname ?? pathname;

  const handleClick = (e: MouseEvent<HTMLAnchorElement>) => {
    // If already on the same path, do nothing (and don't show loader)
    if (targetPath === pathname) {
      e.preventDefault();
      return;
    }
    setNavigating(true);
  };

  return (
    <Link href={href} onClick={handleClick} {...rest}>
      {children}
    </Link>
  );
}
