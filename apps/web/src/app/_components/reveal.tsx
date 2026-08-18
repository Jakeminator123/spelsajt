"use client";

import type { ComponentType, CSSProperties, ElementType, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

type PolymorphicProps = Record<string, unknown> & {
  ref?: unknown;
  children?: ReactNode;
};

type RevealProps = {
  children: ReactNode;
  as?: ElementType;
  className?: string;
  /** Delay in ms before the reveal animation starts. */
  delay?: number;
  /** Direction the element travels in from. */
  from?: "up" | "down" | "left" | "right" | "scale";
  style?: CSSProperties;
  id?: string;
  "aria-label"?: string;
};

const offsets: Record<NonNullable<RevealProps["from"]>, string> = {
  up: "translate3d(0, 42px, 0)",
  down: "translate3d(0, -42px, 0)",
  left: "translate3d(-48px, 0, 0)",
  right: "translate3d(48px, 0, 0)",
  scale: "scale(0.92)",
};

export function Reveal({
  children,
  as,
  className,
  delay = 0,
  from = "up",
  style,
  ...rest
}: RevealProps) {
  const ref = useRef<HTMLElement | null>(null);
  const [visible, setVisible] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);

  // Cast the polymorphic element to a concrete component type so arbitrary
  // intrinsic props (ref, className, style, aria-*) can be forwarded without
  // TypeScript expanding the full intrinsic-element union.
  const Tag = (as ?? "div") as unknown as ComponentType<PolymorphicProps>;

  useEffect(() => {
    const node = ref.current;
    if (!node) {
      return;
    }

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const id = requestAnimationFrame(() => {
        setReduceMotion(true);
        setVisible(true);
      });
      return () => cancelAnimationFrame(id);
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisible(true);
            observer.disconnect();
          }
        }
      },
      { threshold: 0.16, rootMargin: "0px 0px -8% 0px" },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <Tag
      ref={ref}
      className={className}
      style={{
        ...style,
        opacity: visible ? 1 : 0,
        transform: visible ? "none" : offsets[from],
        transition: reduceMotion
          ? "none"
          : `opacity 720ms cubic-bezier(0.16, 1, 0.3, 1) ${delay}ms, transform 720ms cubic-bezier(0.16, 1, 0.3, 1) ${delay}ms`,
        willChange: visible ? "auto" : "opacity, transform",
      }}
      {...rest}
    >
      {children}
    </Tag>
  );
}
