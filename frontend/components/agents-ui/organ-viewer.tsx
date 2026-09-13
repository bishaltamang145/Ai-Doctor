'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';

/* ─────────────────────────────────────────────────────────────
   Organ metadata — facts carousel per organ
───────────────────────────────────────────────────────────── */
const ORGAN_FACTS: Record<string, string[]> = {
  heart:     ['Beats ~100,000 times/day', 'Pumps ~5L of blood per minute', '4 chambers: 2 atria + 2 ventricles', 'Generates enough pressure to squirt blood 9m', 'Weighs 250–350g in adults'],
  liver:     ['Largest internal organ (~1.5kg)', '500+ vital functions', 'Produces bile for fat digestion', 'Detoxifies blood from the digestive tract', 'Can regenerate if 75% removed'],
  lungs:     ['Surface area ~70m² when unfolded', 'Left: 2 lobes, Right: 3 lobes', '~22,000 breaths per day', '~600 million alveoli total', 'Exchange O₂ and CO₂'],
  brain:     ['~86 billion neurons', '20% of the body\'s total energy', '~150,000km of blood vessels', 'Generates 12–25W of electrical power', '60% fat — body\'s fattiest organ'],
  kidney:    ['Filters ~200L of blood daily', 'Produces 1–2L urine/day', '~1 million nephrons each', 'Regulates blood pressure via RAAS', 'Weighs ~150g each'],
  stomach:   ['Holds ~1L of food when full', 'Produces ~2L gastric acid/day', 'pH 1–3 (extremely acidic)', 'Lining replaced every 3–4 days', '4–5h to empty after a meal'],
  skeleton:  ['206 bones in the adult body', '5× stronger than steel by weight', 'Red blood cells form in bone marrow', 'Smallest bone: stapes (2.8mm)', 'Constantly remodeling throughout life'],
  eye:       ['Distinguishes ~10 million colors', '120M rod cells for dim light', '6–7M cone cells for color', 'Processes images in ~13ms', 'Blinks 15–20 times per minute'],
  muscle:    ['600+ muscles in the body', '~40% of total body weight', 'Strongest by force: masseter (jaw)', 'Longest muscle: sartorius (thigh)', 'Smallest: stapedius in ear (1.27mm)'],
  spine:     ['33 vertebrae total (24 movable)', '5 regions: cervical, thoracic, lumbar, sacral, coccygeal', 'Spinal cord ~45cm long', 'Supports the full upper body weight', '31 pairs of spinal nerves'],
  appendix:  ['At junction of small/large intestine', 'Average length: 9cm', 'May harbor beneficial gut bacteria', 'Appendicitis affects ~7% of people', 'Removed via appendectomy'],
  pancreas:  ['Produces insulin and glucagon', 'Secretes ~1.5L digestive juice/day', 'Endocrine + exocrine functions', 'Located behind the stomach', 'Weighs ~70–100g'],
  intestine: ['Small intestine: ~6m long', 'Large intestine: ~1.5m long', 'Trillions of bacteria in the gut', 'Absorbs ~90% of all nutrients', 'Lining replaced every 5 days'],
  thyroid:   ['Located in front of the trachea', 'Produces T3 and T4 hormones', 'Regulates metabolism and heart rate', 'Weighs ~25g in adults', 'Iodine essential for its function'],
  bladder:   ['Holds 300–600ml of urine', 'Signals to void at ~250ml', 'Stretchy muscular (detrusor) organ', 'Urine exits via the urethra', 'Empties completely when voiding'],
};

const ORGAN_COLOR: Record<string, string> = {
  heart: '#ef4444', liver: '#b45309', lungs: '#db2777', brain: '#d97706',
  kidney: '#dc2626', stomach: '#7c3aed', skeleton: '#6b7280', eye: '#2563eb',
  muscle: '#dc2626', spine: '#475569', appendix: '#ea580c', pancreas: '#16a34a',
  intestine: '#d97706', thyroid: '#0891b2', bladder: '#9333ea',
};

interface OrganViewerProps {
  organ: string;
  label: string;
  description: string;
  embedUrl?: string;
}

export function OrganViewer({ organ, label, description, embedUrl }: OrganViewerProps) {
  const [factIdx, setFactIdx] = useState(0);
  const [loaded, setLoaded] = useState(false);

  const key = organ.toLowerCase();
  const facts = ORGAN_FACTS[key] ?? ['An essential part of the human body.'];
  const accent = ORGAN_COLOR[key] ?? '#8b5cf6';

  /* Build the final iframe URL — use the verified embedUrl from the backend,
     or fall back to a known-working Sketchfab search link */
  const iframeSrc = embedUrl ?? `https://sketchfab.com/models/search?q=${encodeURIComponent(label)}&type=models`;

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-[#06060f]">

      {/* ── 3D Model iframe — real Sketchfab embed ── */}
      <div className="relative flex-1 overflow-hidden">
        {/* Loading overlay */}
        <AnimatePresence>
          {!loaded && (
            <motion.div
              initial={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.5 }}
              className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-[#06060f]"
            >
              <div
                className="size-14 animate-spin rounded-full border-4 border-t-transparent"
                style={{ borderColor: `${accent}55`, borderTopColor: 'transparent' }}
              />
              <p className="text-sm font-bold" style={{ color: accent }}>
                Loading 3D Model…
              </p>
              <p className="text-[10px] text-slate-500">
                Powered by Sketchfab · Drag to rotate · Scroll to zoom
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Sketchfab iframe — real 3D model, fully interactive */}
        <iframe
          title={label}
          src={iframeSrc}
          className="h-full w-full border-0"
          allow="autoplay; fullscreen; xr-spatial-tracking"
          allowFullScreen
          onLoad={() => setLoaded(true)}
        />

        {/* Top label badge */}
        <div className="pointer-events-none absolute left-3 top-3 z-20">
          <span
            className="rounded-xl px-3 py-1.5 text-[11px] font-extrabold text-white shadow-lg backdrop-blur-sm"
            style={{ background: `${accent}cc` }}
          >
            🫀 {label}
          </span>
        </div>
      </div>

      {/* ── Info panel ── */}
      <div
        className="flex shrink-0 flex-col gap-3 border-t px-4 py-3"
        style={{ borderColor: `${accent}30`, background: '#0c0c1e' }}
      >
        {/* Description */}
        <p className="text-[11px] leading-relaxed text-slate-400">{description}</p>

        {/* Fact carousel */}
        <motion.button
          onClick={() => setFactIdx(i => (i + 1) % facts.length)}
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.97 }}
          className="w-full cursor-pointer rounded-xl border px-4 py-2.5 text-left transition-colors"
          style={{
            borderColor: `${accent}40`,
            background: `${accent}12`,
          }}
        >
          <p
            className="mb-0.5 text-[9px] font-bold uppercase tracking-widest"
            style={{ color: accent }}
          >
            💡 Did You Know? · {factIdx + 1}/{facts.length} · Tap for next
          </p>
          <AnimatePresence mode="wait">
            <motion.p
              key={factIdx}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.2 }}
              className="text-[12px] font-semibold text-slate-200"
            >
              {facts[factIdx]}
            </motion.p>
          </AnimatePresence>
        </motion.button>

        {/* Controls hint */}
        <p className="text-center text-[9px] font-semibold text-slate-600">
          🖱 Drag to rotate · Scroll to zoom · Right-drag to pan · Double-click to reset
        </p>
      </div>
    </div>
  );
}
