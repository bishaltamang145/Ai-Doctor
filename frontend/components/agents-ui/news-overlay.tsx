'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { XIcon, ExternalLinkIcon, Globe } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useDataChannel } from '@livekit/components-react';

interface NewsArticle {
  title: string;
  summary: string;
  url: string;
  source: string;
}

interface NewsMessage {
  type: 'show_news';
  articles: NewsArticle[];
}

interface SearchingMessage {
  type: 'searching';
  message: string;
}

type IncomingMessage = NewsMessage | SearchingMessage;

export function NewsOverlay() {
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [visible, setVisible] = useState(false);
  const [searchingMsg, setSearchingMsg] = useState<string | null>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onMessage = useCallback((msg: { payload: Uint8Array }) => {
    try {
      const text = new TextDecoder().decode(msg.payload);
      const data = JSON.parse(text) as IncomingMessage;

      if (data.type === 'searching') {
        setSearchingMsg(data.message);
        if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
        searchTimerRef.current = setTimeout(() => setSearchingMsg(null), 10_000);
      } else if (data.type === 'show_news' && Array.isArray(data.articles)) {
        setSearchingMsg(null);
        if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
        setArticles(data.articles);
        setVisible(true);
      }
    } catch {
      // ignore malformed messages
    }
  }, []);

  useDataChannel('agent-ui', onMessage);

  // Auto-dismiss articles after 40 seconds
  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(() => setVisible(false), 40_000);
    return () => clearTimeout(timer);
  }, [visible, articles]);

  return (
    <>
      {/* ── Searching / "Ma search gardai xu" toast ── */}
      <AnimatePresence>
        {searchingMsg && (
          <motion.div
            key="searching-toast"
            initial={{ opacity: 0, y: 30, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            className="fixed bottom-52 left-1/2 z-[150] -translate-x-1/2"
          >
            <div className="flex items-center gap-3 rounded-2xl border border-indigo-400/30 bg-indigo-950/95 px-5 py-3 shadow-2xl shadow-indigo-900/60 backdrop-blur-xl">
              <div className="flex items-center gap-1">
                <span className="size-2 animate-bounce rounded-full bg-indigo-400 [animation-delay:0ms]" />
                <span className="size-2 animate-bounce rounded-full bg-violet-400 [animation-delay:150ms]" />
                <span className="size-2 animate-bounce rounded-full bg-blue-400 [animation-delay:300ms]" />
              </div>
              <Globe className="size-4 shrink-0 animate-pulse text-indigo-300" />
              <p className="max-w-xs text-[13px] font-semibold text-indigo-100">{searchingMsg}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Search results overlay ── */}
      <AnimatePresence>
        {visible && (
          <motion.div
            key="news-overlay"
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
            className="fixed bottom-44 left-1/2 z-[100] w-full max-w-2xl -translate-x-1/2 px-4"
          >
            {/* Header */}
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-foreground text-sm font-bold tracking-widest uppercase opacity-60">
                🔍 Search Results
              </h2>
              <button
                onClick={() => setVisible(false)}
                className="text-foreground/40 hover:text-foreground/80 transition-colors"
                aria-label="Close results"
              >
                <XIcon className="size-4" />
              </button>
            </div>

            {/* Cards */}
            <div className="flex flex-col gap-2">
              {articles.map((article, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.07, duration: 0.3, ease: 'easeOut' }}
                  className="bg-background/85 border-border flex flex-col gap-2 rounded-xl border p-3 backdrop-blur-md"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-foreground text-sm leading-snug font-semibold">{article.title}</p>
                    {article.source && (
                      <span className="text-foreground/40 shrink-0 text-xs">{article.source}</span>
                    )}
                  </div>
                  {article.summary && (
                    <p className="text-foreground/60 line-clamp-2 text-xs leading-relaxed">{article.summary}</p>
                  )}
                  {/* Open Link button */}
                  {article.url && (
                    <a
                      href={article.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="mt-1 flex w-fit items-center gap-1.5 rounded-lg border border-indigo-500/40 bg-indigo-500/10 px-3 py-1.5 text-[11px] font-bold text-indigo-300 transition-all hover:border-indigo-400/60 hover:bg-indigo-500/20 hover:text-indigo-200 active:scale-95"
                    >
                      <ExternalLinkIcon className="size-3" />
                      Open Link
                    </a>
                  )}
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
