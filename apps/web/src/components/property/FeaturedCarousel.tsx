"use client";

import { useEffect, useRef, useState } from "react";

const SLIDES = [
  {
    id: "verified-properties",
    title: "Verified Properties, Nationwide",
    subtitle: "Every listing checked before it goes live",
    image: "/images/apt-1.png",
  },
  {
    id: "escrow-protection",
    title: "Blockchain-Secured Escrow",
    subtitle: "Your funds stay protected until the deal is done",
    image: "/images/apt-2.png",
  },
  {
    id: "list-with-sheda",
    title: "List Your Property in Minutes",
    subtitle: "Reach thousands of buyers and renters on Sheda",
    image: "/images/hero.png",
  },
];

/**
 * Featured slides. Native horizontal scroll with snap points, so swiping,
 * trackpads and keyboard scrolling all work without a carousel library.
 */
export default function FeaturedCarousel() {
  const track = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const onScroll = () => setActive(Math.round(el.scrollLeft / el.clientWidth));
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  // Advance every few seconds, wrapping round. Pauses while hovered.
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused) return;
    const t = setInterval(() => {
      const el = track.current;
      if (!el) return;
      const next = (Math.round(el.scrollLeft / el.clientWidth) + 1) % SLIDES.length;
      el.scrollTo({ left: next * el.clientWidth, behavior: "smooth" });
    }, 5000);
    return () => clearInterval(t);
  }, [paused]);

  const goTo = (i: number) => {
    const el = track.current;
    el?.scrollTo({ left: i * el.clientWidth, behavior: "smooth" });
  };

  return (
    <div onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      <div
        ref={track}
        className="flex snap-x snap-mandatory overflow-x-auto rounded-lg [scrollbar-width:none]"
        aria-roledescription="carousel"
      >
        {SLIDES.map((s, i) => (
          <div
            key={s.id}
            className="relative h-[155px] w-full shrink-0 snap-start md:h-[200px]"
            aria-roledescription="slide"
            aria-label={`${i + 1} of ${SLIDES.length}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={s.image} alt="" className="h-full w-full object-cover" />
            <div className="absolute inset-0 bg-black/40" />
            <div className="absolute inset-x-0 bottom-0 px-4 pb-4">
              <p className="text-base font-bold text-white md:text-lg">{s.title}</p>
              <p className="mt-1 text-xs text-white/80">{s.subtitle}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-2.5 flex justify-center gap-1.5">
        {SLIDES.map((s, i) => (
          <button
            key={s.id}
            type="button"
            onClick={() => goTo(i)}
            aria-label={`Show slide ${i + 1}`}
            aria-current={active === i}
            className={`h-2 rounded-full transition-all ${active === i ? "w-5 bg-primary" : "w-2 bg-black/10"}`}
          />
        ))}
      </div>
    </div>
  );
}
