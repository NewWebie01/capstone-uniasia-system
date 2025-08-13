"use client";
import Link, { LinkProps } from "next/link";
import { PropsWithChildren, MouseEvent } from "react";
import { useNavPending } from "@/stores/useNavPending";

type Props = LinkProps & PropsWithChildren & {
  className?: string;
  onClick?: (e: MouseEvent<HTMLAnchorElement>) => void;
};

export default function NavLink({ children, onClick, ...props }: Props) {
  const setNavigating = useNavPending((s) => s.setNavigating);

  const handleClick = (e: MouseEvent<HTMLAnchorElement>) => {
    setNavigating(true);       // show loader immediately
    onClick?.(e);
  };

  return (
    <Link {...props} onClick={handleClick}>
      {children}
    </Link>
  );
}
