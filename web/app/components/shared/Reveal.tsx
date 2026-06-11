"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Viewport-triggered reveal system.
 * - Respects prefers-reduced-motion (a11y)
 * - Single IntersectionObserver per element, disconnects after firing
 * - Stagger support for child sequences
 */

export function useInView(threshold = 0.12) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          obs.disconnect();
        }
      },
      { threshold, rootMargin: "0px 0px -40px 0px" }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);

  return { ref, visible };
}

type Direction = "up" | "down" | "left" | "right" | "scale" | "none";

const TRANSFORMS: Record<Direction, string> = {
  up:    "translateY(28px)",
  down:  "translateY(-28px)",
  left:  "translateX(-24px)",
  right: "translateX(24px)",
  scale: "scale(0.96)",
  none:  "none",
};

export function Reveal({
  children,
  delay = 0,
  className = "",
  direction = "up",
  duration = 0.7,
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
  direction?: Direction;
  duration?: number;
}) {
  const { ref, visible } = useInView();

  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translate(0,0) scale(1)" : TRANSFORMS[direction],
        transition: `opacity ${duration}s cubic-bezier(.16,1,.3,1) ${delay}ms, transform ${duration}s cubic-bezier(.16,1,.3,1) ${delay}ms`,
        willChange: visible ? "auto" : "opacity, transform",
      }}
    >
      {children}
    </div>
  );
}

/**
 * Staggers direct children automatically.
 * Usage: <Stagger gap={60}>{items.map(...)}</Stagger>
 */
export function Stagger({
  children,
  gap = 60,
  className = "",
}: {
  children: React.ReactNode[];
  gap?: number;
  className?: string;
}) {
  return (
    <>
      {children.map((child, i) => (
        <Reveal key={i} delay={i * gap} className={className}>
          {child}
        </Reveal>
      ))}
    </>
  );
}