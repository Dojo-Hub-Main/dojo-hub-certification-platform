'use client';

import { useEffect, useState } from 'react';

/**
 * Rotating hero imagery. Each slide is paired with the discipline it represents, so
 * the picture reinforces the caption rather than being decoration.
 */
const SLIDES = [
  // Two photos per course, alternated so the same course never shows twice in a row.
  { src: '/hero/software-code.jpg', label: 'Software Engineering', caption: 'Write code that ships' },
  { src: '/hero/automation-line.jpg', label: 'Industrial Automation', caption: 'Program the machines that run production' },
  { src: '/hero/embedded-board.jpg', label: 'Embedded Systems & Hardware', caption: 'Understand the boards behind every device' },
  { src: '/hero/software-desk.jpg', label: 'Software Engineering', caption: 'Build and ship real software' },
  { src: '/hero/automation-panel.jpg', label: 'Industrial Automation', caption: 'Wire, test and commission PLC panels' },
  { src: '/hero/embedded-hands.jpg', label: 'Embedded Systems & Hardware', caption: 'Work hands-on with real hardware' },
];

const INTERVAL_MS = 5000;

export function HeroCarousel() {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    // Honour reduced-motion: hold on the first slide rather than auto-advancing.
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced || paused) return;

    const id = setInterval(() => setIndex((i) => (i + 1) % SLIDES.length), INTERVAL_MS);
    return () => clearInterval(id);
  }, [paused]);

  // The frame is 3/2 from `sm` up because every photo is pre-cropped to 3:2 at 1500x1000,
  // so object-cover shows each one whole there. Portrait phones keep 4/3, where a taller
  // crop reads better and only the sides are trimmed.
  return (
    <div
      className="relative w-full aspect-[4/3] sm:aspect-[3/2] lg:aspect-[3/2] rounded-3xl overflow-hidden bg-navy-900 shadow-2xl shadow-black/30"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {SLIDES.map((slide, i) => (
        // eslint-disable-next-line @next/next/no-img-element -- static assets, cross-faded by CSS
        <img
          key={slide.src}
          src={slide.src}
          alt={slide.label}
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-1000 ${
            i === index ? 'opacity-100' : 'opacity-0'
          }`}
        />
      ))}

      <div className="absolute inset-0 bg-gradient-to-t from-navy-950/85 via-navy-950/20 to-transparent" />

      <div className="absolute bottom-0 left-0 right-0 p-5 sm:p-7">
        <p className="text-[12px] font-mono uppercase tracking-[0.18em] text-crimson-400 font-bold">
          {SLIDES[index].label}
        </p>
        <p className="text-white font-bold text-lg sm:text-xl tracking-tight mt-1">{SLIDES[index].caption}</p>

        <div className="flex gap-1.5 mt-4" role="tablist" aria-label="Choose a highlight">
          {SLIDES.map((slide, i) => (
            <button
              key={slide.src}
              role="tab"
              aria-selected={i === index}
              aria-label={slide.label}
              onClick={() => setIndex(i)}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === index ? 'w-8 bg-crimson-500' : 'w-4 bg-white/40 hover:bg-white/70'
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
