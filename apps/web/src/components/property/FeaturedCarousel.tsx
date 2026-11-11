"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, BadgeCheck, Building2, CalendarCheck, KeyRound, Lock, Megaphone } from "lucide-react";
import type { LucideIcon } from "lucide-react";

/** Cloudinary resizes, crops to the subject and picks AVIF/WebP per browser. */
const img = (path: string) => `https://res.cloudinary.com/l0kmcvzv/image/upload/c_fill,w_1400,h_600,g_auto,f_auto,q_auto/${path}`;

interface Slide {
  id: string;
  tag: string;
  icon: LucideIcon;
  title: string;
  body: string;
  cta: string;
  href: string;
  image: string;
}

const SLIDES: Slide[] = [
  {
    id: "find-a-home",
    tag: "Verified listings",
    icon: BadgeCheck,
    title: "Find a home you can trust",
    body: "Every property is recorded on the blockchain, so who owns it is never in doubt.",
    cta: "Browse homes",
    href: "/see-all",
    image: img("v1794425491/property/19/7dc04c29728544a2836cef748480f5e5-villaGhana.jpg"),
  },
  {
    id: "escrow",
    tag: "Escrow protection",
    icon: Lock,
    title: "Your money waits in escrow",
    body: "Pay into a smart contract. It's released to the seller only when the documents are confirmed.",
    cta: "Start a safe deal",
    href: "/see-all",
    image: img("v1794425509/property/19/04b054a82a584d4babb124f67593d208-kitchenDining.jpg"),
  },
  {
    id: "viewings",
    tag: "Viewings",
    icon: CalendarCheck,
    title: "Book a viewing in a tap",
    body: "Pick a time that suits you from the seller's own calendar. No back-and-forth calls.",
    cta: "Find a place to view",
    href: "/see-all",
    image: img("v1794425501/property/19/d0ea16abcdb04226a1227a7bebc8e413-livingView.jpg"),
  },
  {
    id: "collections",
    tag: "Sheda Collections",
    icon: Building2,
    title: "Own a share of a new building",
    body: "Invest in new builds unit by unit. Money is released phase by phase, after an independent inspection.",
    cta: "Explore Collections",
    href: "/invest",
    image: img("v1794425622/property/21/2eaa973d13c44451a02d712d0910d6b0-revitDuplex.jpg"),
  },
  {
    id: "rentals",
    tag: "Rentals & shortlets",
    icon: KeyRound,
    title: "Rent with your deposit protected",
    body: "Your damage deposit sits in escrow and comes back automatically when the lease ends.",
    cta: "Find rentals",
    href: "/see-all",
    image: img("v1794425580/property/21/1ac925780d7f4e0e8454bf448d73e9f8-hotelBedroom.jpg"),
  },
  {
    id: "list",
    tag: "For owners",
    icon: Megaphone,
    title: "List your property in minutes",
    body: "Reach serious buyers and tenants, and get paid through escrow with no middleman taking a cut.",
    cta: "List a property",
    href: "/list",
    image: img("v1794425531/property/19/32c5da12e6c449a696621ecdd6711d05-flemington.jpg"),
  },
];

/**
 * Featured slides. Native horizontal scroll with snap points, so swiping,
 * trackpads and keyboard scrolling all work without a carousel library.
 * Advances on its own unless hovered, focused, hidden, or the visitor
 * prefers reduced motion.
 */
export default function FeaturedCarousel() {
  const track = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const onScroll = () => setActive(Math.round(el.scrollLeft / el.clientWidth));
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (paused) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => {
      const el = track.current;
      if (!el || document.visibilityState !== "visible") return;
      const next = (Math.round(el.scrollLeft / el.clientWidth) + 1) % SLIDES.length;
      el.scrollTo({ left: next * el.clientWidth, behavior: "smooth" });
    }, 6000);
    return () => clearInterval(t);
  }, [paused]);

  const goTo = (i: number) => {
    const el = track.current;
    el?.scrollTo({ left: i * el.clientWidth, behavior: "smooth" });
  };

  return (
    <section
      aria-label="Featured"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      <div
        ref={track}
        className="flex snap-x snap-mandatory overflow-x-auto rounded-2xl [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        aria-roledescription="carousel"
      >
        {SLIDES.map((s, i) => {
          const Icon = s.icon;
          return (
            <div
              key={s.id}
              className="relative h-[190px] w-full shrink-0 snap-start overflow-hidden sm:h-[220px] md:h-[260px]"
              role="group"
              aria-roledescription="slide"
              aria-label={`${i + 1} of ${SLIDES.length}: ${s.title}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={s.image} alt="" loading={i === 0 ? "eager" : "lazy"} className="h-full w-full object-cover" />
              {/* Dark from the left so the words always read; the photo stays visible on the right. */}
              <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/50 to-black/5" />
              <div className="absolute inset-0 flex flex-col justify-center gap-1.5 px-5 py-4 sm:max-w-[70%] md:max-w-[55%] md:px-8">
                <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur-sm">
                  <Icon size={13} aria-hidden="true" /> {s.tag}
                </span>
                <p className="text-lg font-bold leading-tight text-white md:text-2xl">{s.title}</p>
                <p className="line-clamp-2 text-xs leading-5 text-white/85 md:text-sm">{s.body}</p>
                <Link
                  href={s.href}
                  tabIndex={active === i ? 0 : -1}
                  className="mt-1.5 inline-flex w-fit items-center gap-1.5 rounded-full bg-primary px-3.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#a82227] md:text-sm"
                >
                  {s.cta} <ArrowRight size={14} aria-hidden="true" />
                </Link>
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-2.5 flex justify-center gap-1.5">
        {SLIDES.map((s, i) => (
          <button
            key={s.id}
            type="button"
            onClick={() => goTo(i)}
            aria-label={`Show slide ${i + 1}: ${s.title}`}
            aria-current={active === i}
            className={`h-2 rounded-full transition-all ${active === i ? "w-5 bg-primary" : "w-2 bg-black/10 hover:bg-black/20"}`}
          />
        ))}
      </div>
    </section>
  );
}
