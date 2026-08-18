"use client";

import { useEffect, useRef, useState } from "react";

const formatter = new Intl.NumberFormat("sv-SE");

export function JackpotCounter({ target }: { target: number }) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const [value, setValue] = useState(0);

  useEffect(() => {
    const node = ref.current;
    if (!node) {
      return;
    }

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const id = requestAnimationFrame(() => setValue(target));
      return () => cancelAnimationFrame(id);
    }

    let frame = 0;
    let start = 0;
    const duration = 1800;

    const run = () => {
      const animate = (timestamp: number) => {
        if (!start) {
          start = timestamp;
        }
        const progress = Math.min((timestamp - start) / duration, 1);
        // easeOutExpo for a satisfying slot-machine style ramp.
        const eased = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
        setValue(Math.round(eased * target));
        if (progress < 1) {
          frame = requestAnimationFrame(animate);
        }
      };
      frame = requestAnimationFrame(animate);
    };

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            run();
            observer.disconnect();
          }
        }
      },
      { threshold: 0.4 },
    );

    observer.observe(node);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [target]);

  return <span ref={ref}>{formatter.format(value)}</span>;
}
