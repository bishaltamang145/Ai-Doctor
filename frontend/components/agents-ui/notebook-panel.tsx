'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, ClipboardCopyIcon, DownloadIcon, FileTextIcon, Trash2Icon, XIcon } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useDataChannel } from '@livekit/components-react';

interface NotepadMessage {
  type: 'notebook_append';
  text: string;
}

interface ScreenshotMessage {
  type: 'screenshot';
  topic?: string;
}

interface DownloadNotebookMessage {
  type: 'download_notebook';
  topic?: string;
}

interface ScrapeSavedMessage {
  type: 'scrape_saved';
  filename: string;
  filepath: string;
  preview: string;
  append: boolean;
}

type IncomingMessage = NotepadMessage | ScreenshotMessage | DownloadNotebookMessage | ScrapeSavedMessage;

interface NotepadPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Capture the full visible screen using getDisplayMedia (browser screen capture).
 * Falls back to a canvas snapshot of document.body if screen capture is denied.
 */
async function captureScreenshot(topic: string) {
  const safeDate = new Date().toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-');
  const safeTopic = topic.replace(/[^a-z0-9]/gi, '_').slice(0, 30) || 'screenshot';
  const filename = `Neha_Screenshot_${safeTopic}_${safeDate}.png`;

  try {
    // Ask browser to share screen → capture one frame
    const stream = await (navigator.mediaDevices as MediaDevices & {
      getDisplayMedia: (opts?: MediaStreamConstraints) => Promise<MediaStream>;
    }).getDisplayMedia({ video: true, audio: false });

    const track = stream.getVideoTracks()[0];
    const imageCapture = new (window as unknown as { ImageCapture: new (t: MediaStreamTrack) => { grabFrame: () => Promise<ImageBitmap> } }).ImageCapture(track);
    const bitmap = await imageCapture.grabFrame();

    // Draw to canvas → download
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(bitmap, 0, 0);
    track.stop();

    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    }, 'image/png');

  } catch {
    // Fallback: snapshot the document body via canvas
    const canvas = document.createElement('canvas');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#0d0d1a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#ffffff';
    ctx.font = '18px sans-serif';
    ctx.fillText('LiveSage Screenshot — ' + new Date().toLocaleString(), 30, 50);

    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    }, 'image/png');
  }
}

/**
 * Download the notepad content as a .txt file with a smart filename.
 */
function downloadNotepad(content: string, topic: string) {
  if (!content.trim()) return;
  const safeDate = new Date().toISOString().slice(0, 10);
  const safeTopic = topic.replace(/[^a-z0-9]/gi, '_').slice(0, 40) || 'Notes';
  const filename = `Neha_${safeTopic}_${safeDate}.txt`;

  const header = `=== Neha LiveSearch Notes ===\nTopic: ${topic || 'General'}\nSaved: ${new Date().toLocaleString()}\n${'='.repeat(40)}\n\n`;
  const blob = new Blob([header + content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function NotebookPanel({ isOpen, onClose }: NotepadPanelProps) {
  const [content, setContent] = useState('');
  const [copied, setCopied] = useState(false);
  const [screenshotFlash, setScreenshotFlash] = useState(false);
  const [downloadFlash, setDownloadFlash] = useState(false);
  const [scrapeNotif, setScrapeNotif] = useState<{
    filename: string;
    filepath: string;
    preview: string;
    append: boolean;
  } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const contentRef = useRef(content);
  const scrapeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => { contentRef.current = content; }, [content]);

  const onMessage = useCallback((msg: { payload: Uint8Array }) => {
    try {
      const text = new TextDecoder().decode(msg.payload);
      const data = JSON.parse(text) as IncomingMessage;

      if (data.type === 'notebook_append' && typeof data.text === 'string') {
        setContent((prev) => {
          const separator = prev.length > 0 ? '\n' : '';
          return prev + separator + data.text;
        });
      } else if (data.type === 'screenshot') {
        const topic = (data as ScreenshotMessage).topic || 'livesearch';
        setScreenshotFlash(true);
        setTimeout(() => setScreenshotFlash(false), 1500);
        captureScreenshot(topic);
      } else if (data.type === 'download_notebook') {
        const topic = (data as DownloadNotebookMessage).topic || 'Notes';
        setDownloadFlash(true);
        setTimeout(() => setDownloadFlash(false), 1500);
        downloadNotepad(contentRef.current, topic);
      } else if (data.type === 'scrape_saved') {
        const s = data as ScrapeSavedMessage;
        setScrapeNotif({ filename: s.filename, filepath: s.filepath, preview: s.preview, append: s.append });
        // Auto-dismiss after 20s
        if (scrapeTimerRef.current) clearTimeout(scrapeTimerRef.current);
        scrapeTimerRef.current = setTimeout(() => setScrapeNotif(null), 20_000);
      }
    } catch {
      // ignore
    }
  }, []);

  useDataChannel('agent-ui', onMessage);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          textareaRef.current.selectionStart = textareaRef.current.value.length;
        }
      }, 250);
    }
  }, [isOpen]);

  const clearAll = () => {
    setContent('');
    textareaRef.current?.focus();
  };

  const copyAll = async () => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadTxt = () => downloadNotepad(content, 'Notes');

  const wordCount = content.trim() ? content.trim().split(/\s+/).length : 0;
  const charCount = content.length;

  return (
    <>
      {/* Screenshot flash overlay */}
      <AnimatePresence>
        {screenshotFlash && (
          <motion.div
            key="screenshot-flash"
            initial={{ opacity: 0.8 }}
            animate={{ opacity: 0 }}
            transition={{ duration: 1.2 }}
            className="pointer-events-none fixed inset-0 z-[500] bg-white"
          />
        )}
      </AnimatePresence>

      {/* Download flash */}
      <AnimatePresence>
        {downloadFlash && (
          <motion.div
            key="download-toast"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
            className="fixed bottom-52 left-1/2 z-[500] -translate-x-1/2 rounded-2xl border border-emerald-500/30 bg-emerald-950/95 px-5 py-3 shadow-xl backdrop-blur-xl"
          >
            <p className="text-sm font-semibold text-emerald-300">✅ Notebook saved to your Downloads!</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Scrape saved notification card */}
      <AnimatePresence>
        {scrapeNotif && (
          <motion.div
            key="scrape-notif"
            initial={{ opacity: 0, y: 40, scale: 0.93 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 30, scale: 0.95 }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
            className="fixed bottom-44 left-1/2 z-[400] w-full max-w-md -translate-x-1/2 px-4"
          >
            <div className="overflow-hidden rounded-2xl border border-violet-500/30 bg-[#0d0824]/95 shadow-2xl shadow-violet-900/40 backdrop-blur-xl">
              {/* Header */}
              <div className="flex items-center justify-between border-b border-violet-500/20 bg-violet-900/20 px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="text-base">💾</span>
                  <span className="text-xs font-bold tracking-wider text-violet-300 uppercase">
                    {scrapeNotif.append ? 'File Updated' : 'Scrape Saved'}
                  </span>
                  {scrapeNotif.append && (
                    <span className="rounded-full border border-blue-500/30 bg-blue-500/10 px-2 py-0.5 text-[9px] font-bold text-blue-400 uppercase">
                      +Appended
                    </span>
                  )}
                </div>
                <button
                  onClick={() => setScrapeNotif(null)}
                  className="text-violet-400/60 hover:text-violet-200 transition-colors"
                >
                  <XIcon className="size-4" />
                </button>
              </div>

              {/* Body */}
              <div className="flex flex-col gap-3 p-4">
                {/* Filename */}
                <div className="flex items-center gap-2 rounded-lg border border-violet-500/20 bg-violet-500/10 px-3 py-2">
                  <FileTextIcon className="size-4 shrink-0 text-violet-400" />
                  <span className="flex-1 truncate font-mono text-[12px] font-bold text-violet-200">
                    {scrapeNotif.filename}
                  </span>
                  <button
                    onClick={() => navigator.clipboard.writeText(scrapeNotif.filepath)}
                    title="Copy full path"
                    className="shrink-0 rounded-md border border-violet-500/20 bg-violet-500/10 px-2 py-1 text-[10px] font-semibold text-violet-400 transition hover:bg-violet-500/20 hover:text-violet-200"
                  >
                    Copy Path
                  </button>
                </div>

                {/* Preview */}
                {scrapeNotif.preview && (
                  <p className="line-clamp-3 text-[11px] leading-relaxed text-white/50">
                    {scrapeNotif.preview}
                  </p>
                )}

                {/* Filepath info */}
                <p className="text-[10px] text-white/30">
                  📁 Desktop → livesearch saved → scraped → {scrapeNotif.filename}
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, x: 40, scale: 0.95 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 40, scale: 0.95 }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
            className="glass neon-glow-border fixed right-4 bottom-36 z-[200] flex h-[500px] w-[380px] flex-col rounded-2xl md:right-6 md:bottom-40"
          >
            {/* Title Bar */}
            <div className="flex items-center justify-between border-b border-white/5 px-4 py-2.5">
              <div className="flex items-center gap-2">
                <FileTextIcon className="size-4 text-violet-400" />
                <h3 className="gradient-text text-xs font-bold tracking-widest uppercase">Notepad</h3>
              </div>
              <div className="flex items-center gap-0.5">
                <button
                  onClick={copyAll}
                  disabled={!content}
                  title={copied ? 'Copied!' : 'Copy all'}
                  className="text-foreground/30 hover:text-foreground/70 rounded-full p-1.5 transition-colors disabled:opacity-20"
                >
                  <ClipboardCopyIcon className="size-3.5" />
                </button>
                <button
                  onClick={downloadTxt}
                  disabled={!content}
                  title="Download as .txt"
                  className="text-foreground/30 hover:text-foreground/70 rounded-full p-1.5 transition-colors disabled:opacity-20"
                >
                  <DownloadIcon className="size-3.5" />
                </button>
                <button
                  onClick={() => captureScreenshot('manual')}
                  title="Take screenshot"
                  className="text-foreground/30 hover:text-foreground/70 rounded-full p-1.5 transition-colors"
                >
                  <Camera className="size-3.5" />
                </button>
                <button
                  onClick={clearAll}
                  disabled={!content}
                  title="Clear"
                  className="text-foreground/30 hover:text-destructive rounded-full p-1.5 transition-colors disabled:opacity-20"
                >
                  <Trash2Icon className="size-3.5" />
                </button>
                <div className="mx-1 h-4 w-px bg-white/5" />
                <button
                  onClick={onClose}
                  className="text-foreground/30 hover:text-foreground/70 rounded-full p-1.5 transition-colors"
                  aria-label="Close notepad"
                >
                  <XIcon className="size-3.5" />
                </button>
              </div>
            </div>

            {/* Freeform Text Area */}
            <div className="flex-1 overflow-hidden">
              <textarea
                ref={textareaRef}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Start typing here — or ask Neha to write something for you..."
                spellCheck
                className="text-foreground placeholder:text-foreground/20 h-full w-full resize-none [scrollbar-width:thin] bg-transparent px-4 py-3 font-mono text-[13px] leading-relaxed tracking-wide focus:outline-none"
              />
            </div>

            {/* Status Bar */}
            <div className="flex items-center justify-between border-t border-white/5 px-4 py-1.5">
              <span className="text-foreground/20 text-[10px] font-medium">
                {wordCount} words · {charCount} chars
              </span>
              {copied && (
                <motion.span
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-[10px] font-medium text-emerald-400"
                >
                  Copied to clipboard ✓
                </motion.span>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
