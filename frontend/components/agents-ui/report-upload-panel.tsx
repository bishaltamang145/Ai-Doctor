'use client';

import React, { useCallback, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useDataChannel } from '@livekit/components-react';
import { CheckCircle2, FileImage, Loader2, ScanLine, Sparkles, Upload, X } from 'lucide-react';

interface ReportUploadPanelProps {
  agentId?: string;
}

type UploadState = 'idle' | 'previewing' | 'uploading' | 'analyzing' | 'done' | 'error';

export function ReportUploadPanel({ agentId }: ReportUploadPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [uploadState, setUploadState] = useState<UploadState>('idle');
  const [preview, setPreview] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  const { send } = useDataChannel('agent-ui', () => {});

  const isDoctor = agentId === 'doctor' || agentId === 'health';
  if (!isDoctor) return null;

  const reset = () => {
    setUploadState('idle');
    setPreview(null);
    setNote('');
    setSelectedFile(null);
    setErrorMsg('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setErrorMsg('File too large. Please upload an image under 10 MB.');
      setUploadState('error');
      return;
    }
    setSelectedFile(file);
    setUploadState('previewing');
    setErrorMsg('');
    const reader = new FileReader();
    reader.onload = (ev) => setPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const compressImage = useCallback(async (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const MAX_PX = 1024;
        let { width, height } = img;
        if (width > MAX_PX || height > MAX_PX) {
          if (width > height) { height = Math.round((height / width) * MAX_PX); width = MAX_PX; }
          else { width = Math.round((width / height) * MAX_PX); height = MAX_PX; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.82).split(',')[1]);
      };
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  }, []);

  const handleSend = useCallback(async () => {
    if (!selectedFile || !preview) return;
    setUploadState('uploading');
    try {
      // Compress image to keep payload under LiveKit data channel limit (~15 KB per packet)
      let base64: string;
      try {
        base64 = await compressImage(selectedFile);
      } catch {
        base64 = preview.split(',')[1]; // fallback to original
      }
      const mimeType = 'image/jpeg';
      setUploadState('analyzing');
      const packet = JSON.stringify({
        type: 'upload_report',
        imageBase64: base64,
        mimeType,
        note: note.trim(),
      });
      const encoded = new TextEncoder().encode(packet);
      console.log('[ReportUpload] Sending packet size:', encoded.length, 'bytes');
      send(encoded, { reliable: true, topic: 'agent-ui' });
      setTimeout(() => {
        setUploadState('done');
        setTimeout(() => { setOpen(false); reset(); }, 2500);
      }, 800);
    } catch (err) {
      console.error('[ReportUpload] Failed to send:', err);
      setErrorMsg('Failed to send the image. Please try again.');
      setUploadState('error');
    }
  }, [selectedFile, preview, note, send, compressImage]);

  return (
    <>
      {/* Floating trigger button */}
      <motion.button
        id="report-upload-btn"
        onClick={() => { setOpen(true); reset(); }}
        whileHover={{ scale: 1.06 }}
        whileTap={{ scale: 0.96 }}
        className="flex size-10 items-center justify-center rounded-full border border-blue-200 bg-white shadow-md transition hover:border-blue-400 hover:bg-blue-50"
        title="Upload Medical Report / Image"
      >
        <ScanLine className="size-4 text-blue-600" />
      </motion.button>

      {/* Overlay + Panel */}
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              key="backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[250] bg-black/30 backdrop-blur-sm"
              onClick={() => { setOpen(false); reset(); }}
            />

            <motion.div
              key="panel"
              initial={{ opacity: 0, scale: 0.94, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: 20 }}
              transition={{ duration: 0.28, ease: 'easeOut' }}
              className="fixed bottom-44 left-1/2 z-[260] w-full max-w-sm -translate-x-1/2 px-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="overflow-hidden rounded-3xl border border-blue-100 bg-white shadow-2xl shadow-blue-200/40">
                {/* Header */}
                <div className="flex items-center justify-between border-b border-slate-100 bg-gradient-to-r from-blue-50 to-indigo-50 px-5 py-4">
                  <div className="flex items-center gap-2.5">
                    <div className="flex size-9 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm shadow-blue-400/30">
                      <FileImage className="size-4" />
                    </div>
                    <div>
                      <p className="text-[11px] font-bold tracking-wider text-blue-600 uppercase">Medical Report</p>
                      <h3 className="text-sm font-bold text-slate-900">Upload for Analysis</h3>
                    </div>
                  </div>
                  <button
                    onClick={() => { setOpen(false); reset(); }}
                    className="flex size-8 cursor-pointer items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                  >
                    <X className="size-4" />
                  </button>
                </div>

                {/* Body */}
                <div className="space-y-4 p-5">
                  <AnimatePresence mode="wait">
                    {uploadState === 'done' && (
                      <motion.div
                        key="done"
                        initial={{ opacity: 0, scale: 0.92 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="flex flex-col items-center gap-3 py-6 text-center"
                      >
                        <div className="flex size-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-500 ring-4 ring-emerald-100">
                          <CheckCircle2 className="size-8" />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-slate-900">Sent to Dr. Martha!</p>
                          <p className="mt-0.5 text-xs text-slate-500">Gemini is analyzing your report now…</p>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Sparkles className="size-3 text-blue-500" />
                          <span className="text-[11px] font-semibold text-blue-600">Result will appear in Health Insights</span>
                        </div>
                      </motion.div>
                    )}

                    {(uploadState === 'analyzing' || uploadState === 'uploading') && (
                      <motion.div
                        key="analyzing"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="flex flex-col items-center gap-3 py-6 text-center"
                      >
                        <div className="relative flex size-14 items-center justify-center">
                          <div className="absolute inset-0 animate-ping rounded-full bg-blue-100" />
                          <div className="relative flex size-14 items-center justify-center rounded-full bg-blue-50">
                            <Loader2 className="size-7 animate-spin text-blue-600" />
                          </div>
                        </div>
                        <div>
                          <p className="text-sm font-bold text-slate-900">
                            {uploadState === 'uploading' ? 'Sending image…' : 'Gemini is analyzing…'}
                          </p>
                          <p className="mt-0.5 text-xs text-slate-500">Dr. Martha will explain the findings shortly</p>
                        </div>
                      </motion.div>
                    )}

                    {uploadState === 'error' && (
                      <motion.div key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                        className="rounded-xl border border-red-100 bg-red-50 p-3 text-center"
                      >
                        <p className="text-xs font-semibold text-red-700">{errorMsg || 'Something went wrong.'}</p>
                        <button onClick={reset} className="mt-2 text-[11px] font-bold text-blue-600 hover:underline">
                          Try again
                        </button>
                      </motion.div>
                    )}

                    {(uploadState === 'idle' || uploadState === 'previewing') && (
                      <motion.div key="form" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
                        {/* Drop zone / preview */}
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="group relative flex w-full cursor-pointer flex-col items-center justify-center gap-2 overflow-hidden rounded-2xl border-2 border-dashed border-blue-200 bg-blue-50/60 px-4 py-6 transition hover:border-blue-400 hover:bg-blue-50"
                        >
                          {preview ? (
                            <img src={preview} alt="Preview" className="max-h-36 max-w-full rounded-xl object-contain shadow-md" />
                          ) : (
                            <>
                              <div className="flex size-11 items-center justify-center rounded-xl bg-blue-100 text-blue-500 transition group-hover:bg-blue-200">
                                <Upload className="size-5" />
                              </div>
                              <div className="text-center">
                                <p className="text-sm font-semibold text-slate-700">Click to upload image</p>
                                <p className="mt-0.5 text-[11px] text-slate-400">X-ray, blood test, prescription, scan · Max 10 MB</p>
                              </div>
                            </>
                          )}
                          <input ref={fileInputRef} type="file" accept="image/*" className="sr-only" onChange={handleFileChange} />
                        </button>

                        {preview && (
                          <button
                            type="button"
                            onClick={() => { setPreview(null); setSelectedFile(null); setUploadState('idle'); }}
                            className="flex items-center gap-1 text-[11px] font-semibold text-slate-400 transition hover:text-red-500"
                          >
                            <X className="size-3" /> Remove image
                          </button>
                        )}

                        {/* Optional note */}
                        <div>
                          <label className="mb-1.5 block text-[11px] font-bold tracking-wide text-slate-500 uppercase">
                            Optional note for Dr. Martha
                          </label>
                          <input
                            type="text"
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            placeholder="e.g. blood test from yesterday, chest X-ray…"
                            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs text-slate-800 placeholder:text-slate-300 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
                          />
                        </div>

                        {/* Send button */}
                        <button
                          id="report-send-btn"
                          onClick={handleSend}
                          disabled={!selectedFile}
                          className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-blue-600 py-3 text-sm font-bold text-white shadow-md shadow-blue-400/25 transition hover:bg-blue-700 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <Sparkles className="size-4" />
                          Analyze with Gemini AI
                        </button>

                        <p className="flex items-center justify-center gap-1.5 text-[10px] text-slate-400">
                          <FileImage className="size-3" />
                          Analyzed privately by Gemini AI · Dr. Martha will explain results
                        </p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
