'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useDataChannel } from '@livekit/components-react';
import { Bell, BellRing, Phone, Pill, Trash2, X } from 'lucide-react';

interface Reminder {
  id: string;
  label: string;
  time: string;       // "18:00"
  displayTime: string; // "6:00 PM"
  recurrence: 'daily' | 'once';
  phone: string;
}

interface ReminderAlert {
  id: string;
  label: string;
  displayTime: string;
  phone: string;
}

const STORAGE_KEY = 'dr_martha_reminders';

function loadReminders(): Reminder[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveReminders(reminders: Reminder[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(reminders));
}

function requestNotifPermission() {
  if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

function fireBrowserNotif(label: string, displayTime: string) {
  if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    new Notification('⏰ Dr. Martha Reminder', {
      body: `${label} — ${displayTime}`,
      icon: '/avatars/health_real.png',
    });
  }
}

interface MedicineReminderPanelProps {
  agentId?: string;
}

export function MedicineReminderPanel({ agentId }: MedicineReminderPanelProps) {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [activeAlert, setActiveAlert] = useState<ReminderAlert | null>(null);
  const alertTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isDoctor = agentId === 'doctor' || agentId === 'health';

  // Load persisted reminders on mount
  useEffect(() => {
    if (!isDoctor) return;
    setReminders(loadReminders());
    requestNotifPermission();
  }, [isDoctor]);

  const dismissAlert = useCallback(() => {
    setActiveAlert(null);
    if (alertTimerRef.current) clearTimeout(alertTimerRef.current);
  }, []);

  // Handle data channel messages from the backend
  const onMessage = useCallback((msg: { payload: Uint8Array }) => {
    try {
      const data = JSON.parse(new TextDecoder().decode(msg.payload));

      if (data.type === 'set_reminder') {
        const r: Reminder = {
          id: data.id,
          label: data.label,
          time: data.time,
          displayTime: data.displayTime,
          recurrence: data.recurrence === 'once' ? 'once' : 'daily',
          phone: data.phone || '',
        };
        setReminders((prev) => {
          const filtered = prev.filter((x) => x.id !== r.id);
          const updated = [r, ...filtered];
          saveReminders(updated);
          return updated;
        });
        requestNotifPermission();
      }

      else if (data.type === 'cancel_reminder') {
        const labelLower = (data.label || '').toLowerCase();
        setReminders((prev) => {
          const updated = prev.filter(
            (r) => !r.id.toLowerCase().includes(labelLower) && !r.label.toLowerCase().includes(labelLower)
          );
          saveReminders(updated);
          return updated;
        });
      }

      else if (data.type === 'show_reminder') {
        // Reminder fired — show in-app alert + browser notification
        const alert: ReminderAlert = {
          id: data.id,
          label: data.label,
          displayTime: data.displayTime,
          phone: data.phone || '',
        };
        setActiveAlert(alert);
        fireBrowserNotif(data.label, data.displayTime);

        // Auto-dismiss after 30s
        if (alertTimerRef.current) clearTimeout(alertTimerRef.current);
        alertTimerRef.current = setTimeout(dismissAlert, 30_000);

        // Remove once-only reminders from the list
        setReminders((prev) => {
          const updated = prev.filter((r) => !(r.id === data.id && r.recurrence === 'once'));
          saveReminders(updated);
          return updated;
        });
      }
    } catch {
      // ignore
    }
  }, [dismissAlert]);

  useDataChannel('agent-ui', onMessage);

  const deleteReminder = (id: string) => {
    setReminders((prev) => {
      const updated = prev.filter((r) => r.id !== id);
      saveReminders(updated);
      return updated;
    });
  };

  if (!isDoctor) return null;

  return (
    <>
      {/* ── Firing reminder alert banner ── */}
      <AnimatePresence>
        {activeAlert && (
          <motion.div
            key="reminder-alert"
            initial={{ opacity: 0, y: -40, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -30, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className="fixed top-4 left-1/2 z-[500] w-full max-w-sm -translate-x-1/2 px-4"
          >
            <div className="overflow-hidden rounded-3xl border border-blue-200 bg-white shadow-2xl shadow-blue-300/40">
              {/* Pulsing top bar */}
              <div className="h-1.5 w-full animate-pulse bg-gradient-to-r from-blue-500 via-indigo-500 to-blue-500" />

              <div className="flex items-start gap-3 p-4">
                {/* Bell icon */}
                <div className="relative flex size-12 shrink-0 items-center justify-center rounded-2xl bg-blue-600 shadow-lg shadow-blue-400/30">
                  <BellRing className="size-6 animate-bounce text-white" />
                </div>

                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-bold tracking-wider text-blue-600 uppercase">
                    Dr. Martha Reminder
                  </p>
                  <p className="mt-0.5 text-base font-bold text-slate-900 leading-tight">
                    {activeAlert.label}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Scheduled for {activeAlert.displayTime}
                    {activeAlert.phone && (
                      <span className="ml-2 inline-flex items-center gap-0.5 font-medium text-blue-600">
                        <Phone className="size-3" /> SMS sent
                      </span>
                    )}
                  </p>
                </div>

                <button
                  onClick={dismissAlert}
                  className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                >
                  <X className="size-4" />
                </button>
              </div>

              <div className="flex items-center justify-between border-t border-slate-100 bg-blue-50/60 px-4 py-2.5">
                <p className="text-[10px] font-semibold text-slate-500">
                  💊 Take your medicine now
                </p>
                <button
                  onClick={dismissAlert}
                  className="rounded-xl bg-blue-600 px-3.5 py-1.5 text-[11px] font-bold text-white shadow-sm transition hover:bg-blue-700 active:scale-95"
                >
                  Got it ✓
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Sidebar reminder list ── */}
      {reminders.length > 0 && (
        <div className="rounded-2xl border border-blue-100 bg-blue-50/50 p-3">
          <div className="mb-2 flex items-center gap-1.5">
            <Bell className="size-3.5 text-blue-500" />
            <p className="text-[11px] font-bold text-blue-700 uppercase tracking-wide">
              Active Reminders
            </p>
          </div>
          <ul className="space-y-1.5">
            {reminders.map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between gap-2 rounded-xl border border-blue-100 bg-white px-3 py-2 shadow-xs"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <Pill className="size-3.5 shrink-0 text-blue-500" />
                  <div className="min-w-0">
                    <p className="truncate text-[11px] font-bold text-slate-800">{r.label}</p>
                    <p className="text-[10px] text-slate-400">
                      {r.displayTime} · {r.recurrence === 'daily' ? 'Daily' : 'Once'}
                      {r.phone && (
                        <span className="ml-1 text-blue-500">
                          <Phone className="inline size-2.5" /> {r.phone.slice(-4)}
                        </span>
                      )}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => deleteReminder(r.id)}
                  className="shrink-0 text-slate-300 transition hover:text-red-400"
                  title="Remove reminder"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[10px] text-slate-400">
            Say "cancel my [medicine] reminder" to remove via voice
          </p>
        </div>
      )}
    </>
  );
}
