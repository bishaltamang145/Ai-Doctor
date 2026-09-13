'use client';

import { useCallback, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ExternalLink,
  FileText,
  HeartPulse,
  Info,
  Pill,
  Scale,
} from 'lucide-react';
import { useDataChannel } from '@livekit/components-react';

type HealthCardKind = 'drug' | 'condition' | 'symptom' | 'bmi' | 'report';

interface HealthCard {
  kind: HealthCardKind;
  title: string;
  subtitle?: string;
  summary?: string;
  warning?: string;
  details?: string;
  dosage?: string;
  emergency?: boolean;
  url?: string;
  sources?: Array<{ title: string; url: string }>;
}

interface HealthInsightsPanelProps {
  agentId?: string;
}

function textField(payload: Record<string, unknown>, name: string): string {
  const value = payload[name];
  return typeof value === 'string' ? value.trim() : '';
}

function safeUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function readSources(payload: Record<string, unknown>): Array<{ title: string; url: string }> {
  const values = payload.sources;
  if (!Array.isArray(values)) return [];
  return values.flatMap((value) => {
    if (!value || typeof value !== 'object') return [];
    const item = value as Record<string, unknown>;
    const url = safeUrl(textField(item, 'url'));
    const title = textField(item, 'title');
    return url && title ? [{ title, url }] : [];
  });
}

/** Renders the structured health events sent by the health agent in this room. */
export function HealthInsightsPanel({ agentId }: HealthInsightsPanelProps) {
  const [card, setCard] = useState<HealthCard | null>(null);

  const onMessage = useCallback((message: { payload: Uint8Array }) => {
    try {
      const payload = JSON.parse(new TextDecoder().decode(message.payload)) as Record<string, unknown>;
      const type = textField(payload, 'type');

      if (type === 'show_drug_card') {
        setCard({
          kind: 'drug',
          title: textField(payload, 'drug_name') || 'Medicine information',
          subtitle: textField(payload, 'rxcui') ? `RxNorm: ${textField(payload, 'rxcui')}` : 'RxNorm and openFDA',
          summary: textField(payload, 'purpose'),
          dosage: textField(payload, 'dosage'),
          warning: textField(payload, 'warnings'),
          details: textField(payload, 'adverse_reactions'),
        });
      } else if (type === 'show_condition_card') {
        setCard({
          kind: 'condition',
          title: textField(payload, 'condition') || 'Condition information',
          subtitle: textField(payload, 'icd10_code') ? `ICD-10: ${textField(payload, 'icd10_code')}` : 'MedlinePlus',
          summary: textField(payload, 'summary'),
          url: safeUrl(textField(payload, 'url')),
        });
      } else if (type === 'show_symptom_result') {
        const emergency = textField(payload, 'triage') === 'emergency';
        setCard({
          kind: 'symptom',
          title: emergency ? 'Emergency guidance' : 'Symptom guidance',
          subtitle: textField(payload, 'symptoms'),
          summary: textField(payload, 'message') || textField(payload, 'summary'),
          emergency,
          sources: readSources(payload),
        });
      } else if (type === 'show_bmi_card') {
        const bmi = payload.bmi;
        const category = textField(payload, 'category');
        setCard({
          kind: 'bmi',
          title: typeof bmi === 'number' ? `BMI ${bmi.toFixed(1)}` : 'BMI result',
          subtitle: category ? `Category: ${category}` : undefined,
          summary: 'BMI is a screening measure and does not give a complete picture of health.',
        });
      } else if (type === 'show_report_analysis') {
        setCard({
          kind: 'report',
          title: textField(payload, 'title') || 'Report Analysis',
          subtitle: textField(payload, 'source') || 'Gemini AI Vision',
          summary: textField(payload, 'summary'),
          details: textField(payload, 'details'),
        });
      }
    } catch {
      // Ignore messages outside the health-agent UI contract.
    }
  }, []);

  useDataChannel('agent-ui', onMessage);

  const isHealthSession = agentId === 'doctor' || agentId === 'health';
  const Icon = useMemo(() => {
    if (card?.kind === 'drug') return Pill;
    if (card?.kind === 'symptom') return AlertTriangle;
    if (card?.kind === 'bmi') return Scale;
    if (card?.kind === 'report') return FileText;
    return HeartPulse;
  }, [card?.kind]);

  if (!isHealthSession) return null;

  const isEmergency = card?.emergency === true;
  return (
    <section
      className={`overflow-hidden rounded-2xl border p-4 shadow-xs ${
        isEmergency
          ? 'border-red-200 bg-red-50/80 text-red-950'
          : 'border-blue-100 bg-blue-50/50 text-slate-800'
      }`}
      aria-live="polite"
    >
      <div className="flex items-start gap-3">
        <div
          className={`flex size-8 shrink-0 items-center justify-center rounded-xl ${
            isEmergency ? 'bg-red-600 text-white' : 'bg-blue-600 text-white'
          }`}
        >
          <Icon className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold tracking-[0.18em] text-blue-600 uppercase">
            Health insight
          </p>
          <h2 className={`mt-0.5 text-sm font-bold ${isEmergency ? 'text-red-950' : 'text-slate-900'}`}>
            {card?.title ?? 'Health assistant ready'}
          </h2>
          {card?.subtitle && <p className="mt-0.5 text-[11px] text-slate-500">{card.subtitle}</p>}
        </div>
      </div>

      {card ? (
        <div className="mt-3 space-y-2 text-xs leading-relaxed text-slate-700">
          {card.summary && <p>{card.summary}</p>}
          {card.warning && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-2.5 text-amber-900">
              <span className="font-semibold">Important warning: </span>
              {card.warning}
            </div>
          )}
          {card.dosage && (
            <p>
              <span className="font-semibold text-slate-900">Dosage & Usage: </span>
              {card.dosage}
            </p>
          )}
          {card.details && card.kind !== 'report' && (
            <p>
              <span className="font-semibold text-slate-900">Possible side effects: </span>
              {card.details}
            </p>
          )}
          {card.details && card.kind === 'report' && (
            <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-3">
              <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-blue-600">Full Analysis</p>
              <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap font-sans text-[11px] leading-relaxed text-slate-700">
                {card.details}
              </pre>
            </div>
          )}
          {card.url && (
            <a
              className="inline-flex items-center gap-1 font-semibold text-blue-600 hover:text-blue-700 hover:underline"
              href={card.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              Read the reference <ExternalLink className="size-3" />
            </a>
          )}
          {card.sources && card.sources.length > 0 && (
            <div className="space-y-1 border-t border-slate-200/80 pt-2">
              {card.sources.map((source) => (
                <a
                  key={source.url}
                  className="block truncate text-[11px] font-medium text-blue-600 hover:text-blue-700 hover:underline"
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {source.title}
                </a>
              ))}
            </div>
          )}
          <p className="flex items-start gap-1.5 border-t border-slate-200/80 pt-2 text-[10px] text-slate-500">
            <Info className="mt-0.5 size-3 shrink-0 text-blue-600" />
            {card.kind === 'report' ? 'Analyzed by Gemini AI Vision · Dr. Martha' : 'Live data from RxNorm, openFDA & MedlinePlus.'}
          </p>
        </div>
      ) : (
        <p className="mt-3 text-xs leading-relaxed text-slate-500">
          Ask about symptoms, medicines, conditions, BMI, health news, or a 3D body model.
        </p>
      )}
    </section>
  );
}
