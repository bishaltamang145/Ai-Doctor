'use client';

import { useEffect, useRef, useState } from 'react';
import { useTheme } from 'next-themes';
import Image from 'next/image';
import {
  BarChart2,
  Bookmark,
  CheckCircle2,
  ClipboardList,
  Clock,
  Compass,
  Crown,
  FileText,
  Heart,
  Home as HomeIcon,
  LayoutGrid,
  Menu,
  MessageSquare,
  Mic,
  Moon,
  Settings,
  Shield,
  Sparkles,
  Sprout,
  Sun,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/shadcn/utils';
import { AGENTS, type AgentDefinition } from './app';

interface WelcomeViewProps {
  startButtonText: string;
  onStartCall: () => void;
  onSelectAgent: (agent: AgentDefinition) => void;
}

export const WelcomeView = ({
  onSelectAgent,
  startButtonText: _startButtonText,
  onStartCall: _onStartCall,
}: WelcomeViewProps) => {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showNotesModal, setShowNotesModal] = useState(false);
  const [notes, setNotes] = useState([
    {
      id: '1',
      title: 'Wellness Consultation Summary',
      date: 'Today, 2:30 PM',
      content:
        'Dr. Martha reviewed daily hydration (2.5L recommended), moderate cardio 3x/week, and advised monitoring sleep consistency.',
    },
    {
      id: '2',
      title: 'Medication Safety Notes',
      date: 'Yesterday',
      content:
        'RxNorm lookup verified no adverse drug interactions. Continue daily vitamins with food.',
    },
  ]);
  const [newNoteTitle, setNewNoteTitle] = useState('');
  const [newNoteContent, setNewNoteContent] = useState('');

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  const doctorAgent = AGENTS.find((a) => a.id === 'doctor') || AGENTS[0];

  const menuItems = [
    { label: 'Home', icon: HomeIcon, active: true },
    { label: 'Chats', icon: MessageSquare, active: false },
    { label: 'Agents', icon: Compass, active: false },
    { label: 'Tasks', icon: LayoutGrid, active: false },
    { label: 'History', icon: Clock, active: false },
    { label: 'Bookmarks', icon: Bookmark, active: false, badgeColor: 'text-rose-500' },
    { label: 'Settings', icon: Settings, active: false },
  ];

  const features = [
    {
      icon: Shield,
      iconColor: 'text-blue-500',
      text: 'Provides general wellness guidance',
    },
    {
      icon: ClipboardList,
      iconColor: 'text-amber-500',
      text: 'Helps analyze symptoms and concerns',
    },
    {
      icon: BarChart2,
      iconColor: 'text-teal-500',
      text: 'Summarizes health information clearly',
    },
    {
      icon: Sprout,
      iconColor: 'text-emerald-500',
      text: 'Great for prevention, habits, and daily care',
    },
  ];

  const handleSaveToNotes = () => {
    setShowNotesModal(true);
    toast.success('Consultation notes opened! You can review or add notes.');
  };

  const handleAddNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNoteTitle.trim()) return;
    setNotes([
      {
        id: String(Date.now()),
        title: newNoteTitle.trim(),
        date: 'Just now',
        content: newNoteContent.trim() || 'General health consultation notes.',
      },
      ...notes,
    ]);
    setNewNoteTitle('');
    setNewNoteContent('');
    toast.success('Note saved successfully! 📋');
  };

  return (
    <div className="relative flex min-h-screen overflow-x-hidden bg-white font-sans text-slate-800 transition-colors duration-300">
      {/* ── Left Sidebar (Desktop) ── */}
      <aside className="fixed top-0 bottom-0 left-0 z-30 hidden w-[220px] flex-col justify-between border-r border-slate-200 bg-white p-5 shadow-sm select-none lg:flex">
        <div>
          {/* Brand Logo */}
          <div className="mb-8 flex items-center gap-2.5 px-1">
            <div className="flex size-9 items-center justify-center rounded-xl bg-blue-600 text-white font-black text-lg shadow-md shadow-blue-500/20">
              $
            </div>
            <span className="flex items-center gap-1 font-sans text-[18px] font-bold tracking-tight text-blue-600">
              Dr. Martha
              <span className="text-blue-500 font-bold text-sm">+</span>
            </span>
          </div>

          {/* Navigation Menu */}
          <nav className="space-y-1">
            {menuItems.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.label}
                  className={cn(
                    'group flex w-full cursor-pointer items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-all duration-200',
                    item.active
                      ? 'bg-blue-50 font-semibold text-blue-700'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  )}
                >
                  <Icon
                    className={cn(
                      'size-4 transition-colors',
                      item.active
                        ? 'text-blue-600'
                        : item.badgeColor || 'text-slate-400 group-hover:text-slate-600'
                    )}
                  />
                  {item.label}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Bottom PRO Card & Dark Mode */}
        <div className="space-y-4">
          {/* DR. MARTHA PRO card */}
          <div className="relative overflow-hidden rounded-2xl border border-amber-100 bg-gradient-to-b from-amber-50/50 via-blue-50/30 to-white p-4 shadow-sm">
            <div className="mb-1 flex items-center gap-1.5 text-[10px] font-bold tracking-widest text-amber-500 uppercase">
              <Crown className="size-3 text-amber-500" />
              DR. MARTHA PRO
            </div>
            <p className="mb-3 text-[11px] leading-relaxed text-slate-500">
              Unlock unlimited consultations and premium health features.
            </p>
            <button
              onClick={() => toast.info('Dr. Martha Pro includes unlimited AI consultations, Rx database sync, and multi-profile tracking!')}
              className="w-full cursor-pointer rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-95 py-2 text-xs font-bold text-white shadow-md shadow-blue-500/20 transition duration-150"
            >
              Upgrade Now
            </button>
          </div>

          {/* Dark Mode Toggle */}
          <div className="flex items-center justify-between border-t border-slate-100 px-1 pt-3 pb-1">
            <div className="flex items-center gap-2">
              <div className="flex size-5.5 items-center justify-center rounded-full bg-slate-900 text-white text-[10px] font-bold">
                N
              </div>
              <span className="text-xs font-semibold text-slate-600">
                Light Mode
              </span>
            </div>
            <button
              onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
              className={cn(
                'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none',
                resolvedTheme === 'dark' ? 'bg-blue-600' : 'bg-slate-200'
              )}
            >
              <span
                className={cn(
                  'pointer-events-none inline-block size-4.5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out',
                  resolvedTheme === 'dark' ? 'translate-x-5' : 'translate-x-0'
                )}
              />
            </button>
          </div>
        </div>
      </aside>

      {/* ── Mobile Sidebar Drawer ── */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="relative flex h-full w-[240px] flex-col justify-between bg-white dark:bg-[#1e293b] p-5 shadow-xl">
            <div>
              <div className="mb-6 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex size-8 items-center justify-center rounded-lg bg-blue-600 text-white font-extrabold text-sm">
                    $
                  </div>
                  <span className="font-sans text-base font-bold text-blue-600 dark:text-blue-400">
                    Dr. Martha +
                  </span>
                </div>
                <button
                  onClick={() => setMobileMenuOpen(false)}
                  className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                >
                  <X className="size-5" />
                </button>
              </div>
              <nav className="space-y-1">
                {menuItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.label}
                      onClick={() => setMobileMenuOpen(false)}
                      className={cn(
                        'flex w-full cursor-pointer items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-all',
                        item.active
                          ? 'bg-blue-50 dark:bg-blue-950/60 font-semibold text-blue-600 dark:text-blue-400'
                          : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                      )}
                    >
                      <Icon className="size-4" />
                      {item.label}
                    </button>
                  );
                })}
              </nav>
            </div>
            <div className="rounded-2xl border border-blue-100 dark:border-slate-800 bg-blue-50 dark:bg-slate-800 p-4">
              <div className="mb-1 text-[10px] font-bold tracking-widest text-amber-500 uppercase">
                Dr. Martha Pro
              </div>
              <p className="mb-3 text-[11px] text-slate-500 dark:text-slate-400">
                Unlock unlimited consultations.
              </p>
              <button
                onClick={() => onSelectAgent(doctorAgent)}
                className="w-full cursor-pointer rounded-lg bg-blue-600 py-2 text-xs font-bold text-white"
              >
                Talk Now →
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* ── Main Content Area ── */}
      <div className="z-10 flex min-h-screen w-full flex-1 flex-col lg:pl-[220px]">
        {/* Mobile menu trigger for small screens */}
        <div className="flex items-center justify-between p-4 lg:hidden border-b border-slate-200 bg-white">
          <div className="flex items-center gap-2">
            <div className="flex size-7 items-center justify-center rounded-lg bg-blue-600 text-white font-extrabold text-xs">
              $
            </div>
            <span className="font-bold text-sm text-blue-600">Dr. Martha +</span>
          </div>
          <button
            onClick={() => setMobileMenuOpen(true)}
            className="cursor-pointer text-slate-500 hover:text-slate-800"
          >
            <Menu className="size-5" />
          </button>
        </div>

        <main className="mx-auto w-full max-w-6xl flex-1 space-y-6 p-5 sm:p-7 md:p-8">
          {/* Top Subtitle */}
          <div>
            <p className="text-sm font-medium text-slate-400">
              How can Dr. Martha help you today?
            </p>
          </div>

          {/* ── 4 Top Stat Cards ── */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 md:gap-5">
            {/* Card 1 */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition duration-200 hover:shadow-md">
              <div className="text-3xl font-black text-[#5b51d8]">1</div>
              <div className="mt-1.5 text-xs font-medium text-slate-500">
                Active Doctor Agent
              </div>
            </div>

            {/* Card 2 */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition duration-200 hover:shadow-md">
              <div className="text-3xl font-black text-[#059669]">12</div>
              <div className="mt-1.5 text-xs font-medium text-slate-500">
                Sessions Today
              </div>
            </div>

            {/* Card 3 */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition duration-200 hover:shadow-md">
              <div className="text-3xl font-black text-[#ea580c]">89</div>
              <div className="mt-1.5 text-xs font-medium text-slate-500">
                Queries Done
              </div>
            </div>

            {/* Card 4 */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition duration-200 hover:shadow-md">
              <div className="text-3xl font-black text-[#2563eb]">24</div>
              <div className="mt-1.5 text-xs font-medium text-slate-500">
                Saved Notes
              </div>
            </div>
          </div>

          {/* ── Section Title ── */}
          <div className="pt-2">
            <h2 className="text-[22px] font-bold tracking-tight text-slate-900">
              Your AI Doctor
            </h2>
            <p className="mt-0.5 text-xs font-normal text-slate-400">
              Click the button below to start a real-time voice consultation with Dr. Martha
            </p>
          </div>

          {/* ── Main Doctor Card (Dr. Martha) ── */}
          <div className="flex flex-col gap-6 rounded-[26px] border border-slate-200 bg-white p-5 sm:p-6 lg:p-7 shadow-sm lg:flex-row lg:items-stretch lg:gap-8">
            {/* Left: Video / Doctor Photo Container */}
            <div className="relative aspect-[16/10] w-full shrink-0 overflow-hidden rounded-2xl bg-slate-900 shadow-inner sm:aspect-[16/10] lg:w-[440px] xl:w-[480px]">
              {/* LIVE Badge */}
              <div className="absolute top-3.5 right-3.5 z-10 flex items-center gap-1.5 rounded-full bg-white/95 px-3 py-1 text-[11px] font-bold text-slate-800 shadow-sm backdrop-blur-sm">
                <span className="size-2 animate-pulse rounded-full bg-emerald-500" />
                LIVE
              </div>

              {/* Photo */}
              <Image
                src={doctorAgent.avatar}
                alt="Dr. Martha"
                width={480}
                height={300}
                className="h-full w-full object-cover object-top transition-transform duration-500 hover:scale-105"
                priority
              />

              {/* Bottom Translucent Bar */}
              <div className="absolute bottom-3 right-3 left-3 flex items-center gap-2 rounded-xl bg-black/60 px-3.5 py-2.5 backdrop-blur-md text-white text-xs font-medium">
                <Heart className="size-4 text-white fill-white/10 shrink-0" strokeWidth={2} />
                <span>Care guidance. Wellness support.</span>
              </div>
            </div>

            {/* Right: Info & Actions */}
            <div className="flex flex-1 flex-col justify-between">
              <div>
                {/* Header Row: Blue Heart Icon + Name + Subtitle */}
                <div className="flex items-center gap-3.5">
                  <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl border border-blue-100 bg-blue-50/80 text-blue-500">
                    <Heart className="size-5 text-blue-500" strokeWidth={2} />
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold tracking-tight text-slate-900">
                      Dr. Martha
                    </h3>
                    <p className="text-xs font-semibold text-blue-600">
                      Personalized Wellness & Care
                    </p>
                  </div>
                </div>

                {/* Description */}
                <p className="mt-4 text-xs sm:text-[13px] leading-relaxed text-slate-500 font-normal">
                  Get proactive wellness insights, symptom guidance, and preventative health support.
                  Dr. Martha can analyze concerns, summarize medical advice, and help you make informed
                  everyday care decisions.
                </p>

                {/* Feature Bullet Points */}
                <ul className="mt-5 space-y-3">
                  {features.map((f) => {
                    const Icon = f.icon;
                    return (
                      <li
                        key={f.text}
                        className="flex items-center gap-3 text-xs sm:text-[13px] font-normal text-slate-600"
                      >
                        <Icon className={cn('size-4 shrink-0', f.iconColor)} />
                        <span>{f.text}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>

              {/* Action Buttons */}
              <div className="mt-6 flex flex-wrap items-center gap-3 pt-2">
                <button
                  onClick={() => onSelectAgent(doctorAgent)}
                  className="flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-95 px-6 py-2.5 text-sm font-semibold text-white shadow-md shadow-blue-500/25 transition duration-150"
                >
                  <Mic className="size-4" />
                  Talk to Dr. Martha →
                </button>
                <button
                  onClick={handleSaveToNotes}
                  className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 active:scale-95 px-5 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition duration-150"
                >
                  <FileText className="size-4 text-slate-500" />
                  Save to Notes
                </button>
              </div>
            </div>
          </div>
        </main>
      </div>

      {/* ── Save to Notes Modal ── */}
      {showNotesModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="flex size-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                  <FileText className="size-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-slate-900">
                    Medical & Consultation Notes
                  </h3>
                  <p className="text-xs text-slate-400">Manage Dr. Martha session notes</p>
                </div>
              </div>
              <button
                onClick={() => setShowNotesModal(false)}
                className="cursor-pointer text-slate-400 hover:text-slate-600"
              >
                <X className="size-5" />
              </button>
            </div>

            {/* Quick add note form */}
            <form onSubmit={handleAddNote} className="mt-4 space-y-3">
              <input
                type="text"
                placeholder="Note title (e.g. Follow-up on symptoms, Rx details)..."
                value={newNoteTitle}
                onChange={(e) => setNewNoteTitle(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-xs sm:text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              />
              <textarea
                placeholder="Key advice, medication warnings, questions for doctor..."
                rows={2}
                value={newNoteContent}
                onChange={(e) => setNewNoteContent(e.target.value)}
                className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-xs sm:text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowNotesModal(false)}
                  className="px-4 py-1.5 text-xs font-semibold text-slate-500 hover:text-slate-700"
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={!newNoteTitle.trim()}
                  className="rounded-xl bg-blue-600 px-4 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
                >
                  Add Note
                </button>
              </div>
            </form>

            {/* Existing Notes list */}
            <div className="mt-5 max-h-60 space-y-3 overflow-y-auto pr-1">
              {notes.map((note) => (
                <div
                  key={note.id}
                  className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 text-left"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800">
                      {note.title}
                    </span>
                    <span className="text-[10px] font-medium text-slate-400">{note.date}</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-600">{note.content}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
