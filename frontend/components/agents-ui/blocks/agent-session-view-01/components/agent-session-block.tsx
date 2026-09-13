'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  FileTextIcon,
  NewspaperIcon,
  X,
} from 'lucide-react';
import { AnimatePresence, type MotionProps, motion } from 'motion/react';
import {
  type AgentState,
  type ReceivedMessage,
  useAgent,
  useDataChannel,
  useSessionContext,
  useSessionMessages,
} from '@livekit/components-react';
import { AgentChatTranscript } from '@/components/agents-ui/agent-chat-transcript';
import {
  AgentControlBar,
  type AgentControlBarControls,
} from '@/components/agents-ui/agent-control-bar';
import { NewsOverlay } from '@/components/agents-ui/news-overlay';
import { NewsPanel } from '@/components/agents-ui/news-panel';
import { NotebookPanel } from '@/components/agents-ui/notebook-panel';
import { OrganViewer } from '@/components/agents-ui/organ-viewer';
import { HealthInsightsPanel } from '@/components/agents-ui/health-insights-panel';
import { ReportUploadPanel } from '@/components/agents-ui/report-upload-panel';
import { MedicineReminderPanel } from '@/components/agents-ui/medicine-reminder-panel';
import { Shimmer } from '@/components/ai-elements/shimmer';
import { cn } from '@/lib/shadcn/utils';
import { TileLayout } from './tile-view';

const MotionMessage = motion.create(Shimmer);

const BOTTOM_VIEW_MOTION_PROPS: MotionProps = {
  variants: {
    visible: { opacity: 1, translateY: '0%' },
    hidden: { opacity: 0, translateY: '100%' },
  },
  initial: 'hidden',
  animate: 'visible',
  exit: 'hidden',
  transition: { duration: 0.3, delay: 0.5, ease: 'easeOut' },
};

const SHIMMER_MOTION_PROPS: MotionProps = {
  variants: {
    visible: { opacity: 1, transition: { ease: 'easeIn', duration: 0.5, delay: 0.8 } },
    hidden: { opacity: 0, transition: { ease: 'easeIn', duration: 0.5, delay: 0 } },
  },
  initial: 'hidden',
  animate: 'visible',
  exit: 'hidden',
};

export function Fade({
  top = false,
  bottom = false,
  className,
}: {
  top?: boolean;
  bottom?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'from-background pointer-events-none h-4 bg-linear-to-b to-transparent',
        top && 'bg-linear-to-b',
        bottom && 'bg-linear-to-t',
        className
      )}
    />
  );
}

export interface AgentSessionView_01Props {
  preConnectMessage?: string;
  supportsChatInput?: boolean;
  supportsVideoInput?: boolean;
  supportsScreenShare?: boolean;
  isPreConnectBufferEnabled?: boolean;
  audioVisualizerType?: 'bar' | 'wave' | 'grid' | 'radial' | 'aura';
  audioVisualizerColor?: `#${string}`;
  audioVisualizerColorShift?: number;
  audioVisualizerBarCount?: number;
  audioVisualizerGridRowCount?: number;
  audioVisualizerGridColumnCount?: number;
  audioVisualizerRadialBarCount?: number;
  audioVisualizerRadialRadius?: number;
  audioVisualizerWaveLineWidth?: number;
  avatarUrl?: string;
  agentId?: string;
  className?: string;
}

// ── Main AgentSessionView_01 (Dr. Martha Doctor UI) ────────────────────────────
export function AgentSessionView_01({
  preConnectMessage = 'Dr. Martha is listening, ask any health or medical question',
  supportsChatInput = true,
  supportsVideoInput = true,
  supportsScreenShare = true,
  isPreConnectBufferEnabled = true,
  audioVisualizerType,
  audioVisualizerColor,
  audioVisualizerColorShift,
  audioVisualizerBarCount,
  audioVisualizerGridRowCount,
  audioVisualizerGridColumnCount,
  audioVisualizerRadialBarCount,
  audioVisualizerRadialRadius,
  audioVisualizerWaveLineWidth,
  avatarUrl,
  agentId = 'doctor',
  ref,
  className,
  ...props
}: React.ComponentProps<'section'> & AgentSessionView_01Props) {
  const session = useSessionContext();
  const { messages } = useSessionMessages(session);
  const [chatOpen, setChatOpen] = useState(false);
  const [notebookOpen, setNotebookOpen] = useState(false);
  const [newsOverlayKey, setNewsOverlayKey] = useState(0);
  const { state: agentState } = useAgent();

  // 3D Body Model Modal state
  const [bodyModelData, setBodyModelData] = useState<{
    organ: string;
    label: string;
    embedUrl: string;
    description: string;
  } | null>(null);
  const [resolvedEmbedUrl, setResolvedEmbedUrl] = useState<string | null>(null);
  const [_iframeLoaded, setIframeLoaded] = useState(false);

  // When bodyModelData changes, try to fetch a verified Sketchfab model
  useEffect(() => {
    if (!bodyModelData) {
      setResolvedEmbedUrl(null);
      setIframeLoaded(false);
      return;
    }
    setIframeLoaded(false);
    setResolvedEmbedUrl(bodyModelData.embedUrl);
    fetch(`/api/organ-model?organ=${encodeURIComponent(bodyModelData.organ)}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.embedUrl) {
          setResolvedEmbedUrl(d.embedUrl);
        }
      })
      .catch(() => {
        /* keep pre-configured URL on error */
      });
  }, [bodyModelData]);

  useDataChannel('agent-ui', (msg) => {
    try {
      const data = JSON.parse(new TextDecoder().decode(msg.payload));
      if (data.type === 'show_body_model') {
        setBodyModelData({
          organ: data.organ || 'heart',
          label: data.label || 'Human Organ 3D Model',
          embedUrl: data.embedUrl,
          description: data.description || '',
        });
      }
    } catch {
      /* ignore */
    }
  });

  const scrollAreaRef = useRef<HTMLDivElement>(null);

  const controls: AgentControlBarControls = {
    leave: true,
    microphone: true,
    chat: supportsChatInput,
    camera: supportsVideoInput,
    screenShare: supportsScreenShare,
  };

  useEffect(() => {
    const lastMessage = messages.at(-1);
    const lastMessageIsLocal = lastMessage?.from?.isLocal === true;
    if (scrollAreaRef.current && lastMessageIsLocal) {
      scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
    }
  }, [messages]);

  return (
    <section
      ref={ref}
      className={cn('bg-white text-slate-900 relative z-10 h-full w-full overflow-hidden', className)}
      {...props}
    >
      <div className="absolute inset-0 flex">
        {/* Left: Live Transcript */}
        <div className="hidden w-[300px] shrink-0 flex-col border-r border-slate-200 bg-slate-50/70 lg:flex">
          <div className="flex items-center gap-2 border-b border-slate-200 bg-white/60 px-4 py-3">
            <span className="relative flex size-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-75" />
              <span className="relative inline-flex size-2 rounded-full bg-cyan-500" />
            </span>
            <h3 className="text-xs font-bold tracking-wider text-slate-700 uppercase">
              Live Transcript
            </h3>
          </div>
          <div className="relative flex-1 overflow-hidden">
            <Fade top className="absolute inset-x-0 top-0 z-10 h-8" />
            <AgentChatTranscript
              agentState={agentState}
              messages={messages}
              className="h-full [&_.is-user>div]:rounded-[18px] [&>div>div]:px-3 [&>div>div]:pt-10"
            />
          </div>
        </div>

        {/* Center: Stage with Doctor Avatar / Audio Visualizer and Controls */}
        <div className="relative flex flex-1 flex-col bg-white">
          <Fade top className="absolute inset-x-4 top-0 z-10 h-40" />
          <div className="absolute top-0 bottom-[135px] flex w-full flex-col md:bottom-[170px] lg:hidden">
            <AnimatePresence>
              {chatOpen && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3 }}
                  className="flex h-full w-full flex-col gap-4 space-y-3"
                >
                  <AgentChatTranscript
                    agentState={agentState}
                    messages={messages}
                    className="mx-auto w-full max-w-2xl [&_.is-user>div]:rounded-[22px] [&>div>div]:px-4 [&>div>div]:pt-40 md:[&>div>div]:px-6"
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <TileLayout
            chatOpen={chatOpen}
            avatarUrl={avatarUrl}
            audioVisualizerType={audioVisualizerType}
            audioVisualizerColor={audioVisualizerColor}
            audioVisualizerColorShift={audioVisualizerColorShift}
            audioVisualizerBarCount={audioVisualizerBarCount}
            audioVisualizerRadialBarCount={audioVisualizerRadialBarCount}
            audioVisualizerRadialRadius={audioVisualizerRadialRadius}
            audioVisualizerGridRowCount={audioVisualizerGridRowCount}
            audioVisualizerGridColumnCount={audioVisualizerGridColumnCount}
            audioVisualizerWaveLineWidth={audioVisualizerWaveLineWidth}
          />
          <motion.div
            {...BOTTOM_VIEW_MOTION_PROPS}
            className="absolute inset-x-3 bottom-0 z-50 md:inset-x-12"
          >
            {isPreConnectBufferEnabled && (
              <AnimatePresence>
                {messages.length === 0 && (
                  <MotionMessage
                    key="pre-connect-message"
                    duration={2}
                    aria-hidden={messages.length > 0}
                    {...SHIMMER_MOTION_PROPS}
                    className="pointer-events-none mx-auto block w-full max-w-2xl pb-4 text-center text-sm font-semibold"
                  >
                    {preConnectMessage}
                  </MotionMessage>
                )}
              </AnimatePresence>
            )}
            <div className="relative mx-auto max-w-2xl rounded-2xl border border-slate-200 bg-white/95 pb-3 shadow-lg backdrop-blur-sm md:pb-12">
              <Fade bottom className="absolute inset-x-0 top-0 h-4 -translate-y-full" />
              <AgentControlBar
                variant="livekit"
                controls={controls}
                isChatOpen={chatOpen}
                isConnected={session.isConnected}
                onDisconnect={session.end}
                onIsChatOpenChange={setChatOpen}
              />
            </div>
          </motion.div>
        </div>

        {/* Right: Medical Tools & Panels (Upload Report, Medicine Reminders, Health Insights, News) */}
        <div className="hidden w-[300px] shrink-0 flex-col gap-3 border-l border-slate-200 bg-slate-50/70 p-3 lg:flex">
          <HealthInsightsPanel agentId={agentId} />
          {/* Report upload button */}
          <div className="flex items-center gap-2 rounded-2xl border border-blue-100 bg-blue-50/50 px-3 py-2.5">
            <ReportUploadPanel agentId={agentId} />
            <div className="min-w-0">
              <p className="text-[11px] font-bold text-blue-700">Upload Report</p>
              <p className="text-[10px] text-slate-500 leading-tight">X-ray, blood test, prescription…</p>
            </div>
          </div>
          {/* Medicine reminders */}
          <MedicineReminderPanel agentId={agentId} />
          <div className="flex-1 overflow-hidden">
            <NewsPanel agentId={agentId} />
          </div>
        </div>
      </div>

      <NotebookPanel isOpen={notebookOpen} onClose={() => setNotebookOpen(false)} />
      <NewsOverlay key={newsOverlayKey} />

      {/* 3D Body Visualization Modal */}
      <AnimatePresence>
        {bodyModelData && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="fixed inset-0 z-[300] flex items-center justify-center bg-black/90 p-4 backdrop-blur-xl md:p-6"
            onClick={() => setBodyModelData(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.93, y: 24 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.93, y: 24 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
              className="relative flex h-[90vh] w-full max-w-[1100px] flex-col overflow-hidden rounded-3xl border border-white/10 bg-[#080818] shadow-[0_0_120px_rgba(139,92,246,0.4)]"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div
                className="flex h-16 shrink-0 items-center justify-between px-6"
                style={{
                  background: 'linear-gradient(135deg,#1a0a3a 0%,#2d1060 50%,#1e1050 100%)',
                }}
              >
                <div className="flex items-center gap-3">
                  <div
                    className="flex size-10 items-center justify-center rounded-xl text-sm font-black text-white shadow-lg"
                    style={{ background: 'linear-gradient(135deg,#7c3aed,#4f46e5)' }}
                  >
                    🫀
                  </div>
                  <div>
                    <h3 className="text-base font-extrabold tracking-tight text-white">
                      {bodyModelData.label}
                    </h3>
                    <p className="text-[11px] text-violet-300/80">
                      Interactive Anatomical Visualization
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-[11px] font-bold text-emerald-400">
                    <span className="size-1.5 animate-pulse rounded-full bg-emerald-400" />
                    Live
                  </span>
                  <button
                    onClick={() => setBodyModelData(null)}
                    className="flex size-9 cursor-pointer items-center justify-center rounded-xl bg-white/10 text-slate-300 transition hover:bg-red-500/30 hover:text-red-300"
                  >
                    <X className="size-5" />
                  </button>
                </div>
              </div>
              <div
                className="h-0.5 w-full shrink-0"
                style={{ background: 'linear-gradient(90deg,#7c3aed,#4f46e5,#06b6d4)' }}
              />

              {/* Body: Viewer + Transcript */}
              <div className="flex flex-1 overflow-hidden">
                {/* Organ Viewer left panel */}
                <div className="relative flex-[3] overflow-auto bg-[#080818]">
                  <OrganViewer
                    organ={bodyModelData.organ}
                    label={bodyModelData.label}
                    description={bodyModelData.description}
                    embedUrl={resolvedEmbedUrl || bodyModelData.embedUrl}
                  />
                </div>

                <div className="w-px shrink-0 bg-white/[0.07]" />

                {/* Info + Transcript right 40% */}
                <div className="flex flex-[2] flex-col bg-[#0a0a1a]">
                  <div className="shrink-0 border-b border-white/[0.07] p-5">
                    <div
                      className="rounded-2xl p-4"
                      style={{ background: 'linear-gradient(135deg,#1a0838,#0e0828)' }}
                    >
                      <div className="mb-2 flex items-center gap-2">
                        <span className="size-2 rounded-full bg-violet-400" />
                        <span className="text-[11px] font-extrabold tracking-widest text-violet-400 uppercase">
                          About This Organ
                        </span>
                      </div>
                      <p className="text-sm leading-relaxed text-slate-300">
                        {bodyModelData.description}
                      </p>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-2 border-b border-white/[0.07] px-5 py-3">
                    <span className="relative flex size-2">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-75" />
                      <span className="relative inline-flex size-2 rounded-full bg-cyan-500" />
                    </span>
                    <span className="text-[10px] font-extrabold tracking-widest text-white uppercase">
                      Live Health Conversation
                    </span>
                  </div>
                  <div className="flex-1 overflow-hidden">
                    <AgentChatTranscript
                      agentState={agentState}
                      messages={messages}
                      className="h-full text-[12px] leading-relaxed [&_.is-user>div]:rounded-xl [&_.is-user>div]:bg-violet-900/40 [&_.is-user>div]:px-3 [&_.is-user>div]:py-2 [&>div>div]:px-4 [&>div>div]:pt-3"
                    />
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="flex h-10 shrink-0 items-center justify-between border-t border-white/[0.07] bg-[#0c0c1e] px-6 text-[11px] font-semibold text-slate-500">
                <span>Powered by Sketchfab · LiveSage Health AI</span>
                <button
                  onClick={() => setBodyModelData(null)}
                  className="cursor-pointer text-slate-400 transition hover:text-white"
                >
                  Close Viewer
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="fixed right-3 bottom-36 z-[100] flex flex-col gap-2 xl:hidden">
        <button
          onClick={() => setNewsOverlayKey((k) => k + 1)}
          className="glass flex size-10 items-center justify-center rounded-full"
          title="Show news"
        >
          <NewspaperIcon className="size-4 text-cyan-400" />
        </button>
        <button
          onClick={() => setNotebookOpen(!notebookOpen)}
          className="glass animate-pulse-neon flex size-10 items-center justify-center rounded-full"
          title="Notepad"
        >
          <FileTextIcon className="size-4 text-violet-400" />
        </button>
        <ReportUploadPanel agentId={agentId} />
      </div>
    </section>
  );
}
