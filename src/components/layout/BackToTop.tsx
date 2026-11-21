'use client';

import { useCallback, useEffect, useState } from 'react';
import { ArrowUp } from 'lucide-react';

export default function BackToTop({ threshold = 400 }: { threshold?: number }) {
  const [visible, setVisible] = useState(false);
  const [progress, setProgress] = useState(0);

  const calculate = useCallback(() => {
    const scrollY = window.scrollY || document.documentElement.scrollTop;
    const scrollable = document.documentElement.scrollHeight - window.innerHeight;
    setVisible(scrollY > threshold);
    setProgress(scrollable > 0 ? Math.min(100, Math.max(0, (scrollY / scrollable) * 100)) : 0);
  }, [threshold]);

  useEffect(() => {
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(() => {
        calculate();
        ticking = false;
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    calculate();
    return () => window.removeEventListener('scroll', onScroll);
  }, [calculate]);

  const size = 44;
  const strokeWidth = 2.5;
  const radius = (size - strokeWidth * 2) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (progress / 100) * circumference;

  return (
    <div
      className={`fixed bottom-24 right-4 z-40 transition-all duration-300 ease-out md:bottom-8 md:right-8 ${
        visible ? 'pointer-events-auto translate-y-0 opacity-100' : 'pointer-events-none translate-y-4 opacity-0'
      }`}
    >
      <button
        type="button"
        onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        aria-label="Scroll back to top"
        title={`Scroll to top (${Math.round(progress)}%)`}
        className="group relative flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-[#161619]/90 text-neutral-300 shadow-xl backdrop-blur-md transition-all duration-200 hover:border-[#e50914]/60 hover:bg-[#202024] hover:text-white active:scale-90"
      >
        <svg
          className="pointer-events-none absolute inset-0 h-full w-full -rotate-90 select-none"
          viewBox={`0 0 ${size} ${size}`}
          aria-hidden="true"
        >
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="rgba(255, 255, 255, 0.08)"
            strokeWidth={strokeWidth}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="#e50914"
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            className="transition-[stroke-dashoffset] duration-150 ease-out"
          />
        </svg>
        <ArrowUp className="h-4 w-4 transition-transform duration-200 group-hover:-translate-y-0.5" />
      </button>
    </div>
  );
}
