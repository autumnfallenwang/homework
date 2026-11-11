"use client";

// Settings → Grading (ADR 0014). Every Submit of a child-entered item is graded
// by a vision model through llmgw; an email goes out when the score is below the
// alert score or a photo must be retaken. One form, one Save.

import {
  GRADING_DEFAULTS,
  GRADING_LIMITS,
  type GradingModel,
  type GradingSettings,
  type GradingSettingsInput,
} from "@homework/shared";
import { useEffect, useMemo, useState } from "react";
import { SettingsSection } from "@/components/settings/section";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  getGradingModels,
  getGradingSettings,
  getSettingString,
  saveGradingSettings,
} from "@/lib/api";

const FIELD =
  "h-9 w-full rounded-lg border border-input bg-card px-2 text-[0.8125rem] text-foreground shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

interface Draft extends Omit<GradingSettingsInput, "alertBelow"> {
  alertBelow: string;
}

function toDraft(s: GradingSettings): Draft {
  return {
    enabled: s.enabled,
    model: s.model,
    fallbackModel: s.fallbackModel,
    alertBelow: String(s.alertBelow),
    instructions: s.instructions,
    matchModel: s.matchModel,
  };
}

function ModelSelect({
  id,
  value,
  onChange,
  models,
  allowNone = false,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  models: readonly GradingModel[];
  allowNone?: boolean;
}) {
  const known = models.some((m) => m.id === value);
  return (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={FIELD}>
      {allowNone && <option value="">None</option>}
      {value && !known && <option value={value}>{value} (not listed by llmgw)</option>}
      {models.map((m) => (
        <option key={m.id} value={m.id}>
          {m.id} · {m.ownedBy}
        </option>
      ))}
    </select>
  );
}

export function SettingsGrading() {
  const [saved, setSaved] = useState<GradingSettings | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [models, setModels] = useState<GradingModel[]>([]);
  const [modelsUnavailable, setModelsUnavailable] = useState(false);
  const [smtpReady, setSmtpReady] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void getGradingSettings().then((s) => {
      setSaved(s);
      setDraft(toDraft(s));
    });
    void getGradingModels().then((m) => {
      setModels(m.models);
      setModelsUnavailable(m.unavailable);
    });
    void getSettingString("smtp.host", "").then((host) => setSmtpReady(host.trim() !== ""));
  }, []);

  const imageModels = useMemo(() => models.filter((m) => m.readsImages), [models]);
  const alertBelow = Number(draft?.alertBelow);
  const alertValid =
    draft !== null &&
    draft.alertBelow.trim() !== "" &&
    Number.isInteger(alertBelow) &&
    alertBelow >= 0 &&
    alertBelow <= 100;
  const dirty =
    saved !== null && draft !== null && JSON.stringify(toDraft(saved)) !== JSON.stringify(draft);

  if (!draft || !saved) {
    return <p className="px-1 text-[0.8125rem] text-muted-foreground">Loading…</p>;
  }

  const set = (patch: Partial<Draft>) => {
    setDraft({ ...draft, ...patch });
    setNotice(null);
    setError(null);
  };

  const save = async () => {
    if (!alertValid) {
      setError("The alert score is a whole number from 0 to 100.");
      return;
    }
    setSaving(true);
    try {
      const next = await saveGradingSettings({ ...draft, alertBelow });
      setSaved(next);
      setDraft(toDraft(next));
      setNotice("Saved");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <SettingsSection
        title="Homework grading"
        help="Each time a child submits homework, a model reads the photos and her note and grades it 0–100. You get an email when the score is below the alert score, or when photos must be retaken — the child sees only the retake request, never the grade. Every grade is also listed in the daily digest."
      >
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <Switch
              checked={draft.enabled}
              onChange={(next) => set({ enabled: next })}
              aria-label="Grade submitted homework"
            />
            <span className="text-[0.8125rem]">Grade submitted homework</span>
          </div>
          {saved.enabled && saved.enabledAt && (
            <p className="text-[0.75rem] text-muted-foreground">
              On since {new Date(saved.enabledAt).toLocaleString()}. Work submitted before then is
              not graded automatically.
            </p>
          )}
          {!smtpReady && (
            <p className="text-[0.75rem] text-attention">
              Alerts need email: set it up in Notifications. Grades still show in the app.
            </p>
          )}
        </div>
      </SettingsSection>

      <SettingsSection
        title="Models"
        help="Models come from llmgw, the home cluster's model gateway. The grader must read images; if it fails (a usage limit, an outage), the fallback model tries the same submission."
      >
        <div className="space-y-3">
          {modelsUnavailable && (
            <p className="text-[0.75rem] text-attention">
              llmgw can't be reached right now — the saved models are kept.
            </p>
          )}
          <div className="space-y-1">
            <label htmlFor="grading-model" className="text-[0.8125rem] font-medium">
              Grader
            </label>
            <ModelSelect
              id="grading-model"
              value={draft.model}
              onChange={(model) => set({ model })}
              models={imageModels}
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="grading-fallback" className="text-[0.8125rem] font-medium">
              Fallback grader
            </label>
            <ModelSelect
              id="grading-fallback"
              value={draft.fallbackModel}
              onChange={(fallbackModel) => set({ fallbackModel })}
              models={imageModels}
              allowNone
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="grading-match-model" className="text-[0.8125rem] font-medium">
              Teacher-grade matcher
            </label>
            <ModelSelect
              id="grading-match-model"
              value={draft.matchModel}
              onChange={(matchModel) => set({ matchModel })}
              models={models}
            />
            <p className="text-[0.75rem] text-muted-foreground">
              Links her homework to the teacher's assignments in TeacherEase (text only; a small
              model is enough). Default {GRADING_DEFAULTS.matchModel}.
            </p>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection
        title="Alerts"
        help="An email goes out right after a grade below this score. Retake requests always send one. Default 80 — small slips only."
      >
        <div className="flex items-center gap-2">
          <span className="text-[0.8125rem]">Email me below</span>
          <input
            type="number"
            min={0}
            max={100}
            step={1}
            value={draft.alertBelow}
            onChange={(e) => set({ alertBelow: e.target.value })}
            aria-label="Alert score"
            aria-invalid={!alertValid}
            className="h-8 w-20 rounded-md border border-input bg-card px-2 text-[0.8125rem] text-foreground shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive"
          />
          <span className="text-[0.75rem] text-muted-foreground">/ 100</span>
        </div>
      </SettingsSection>

      <SettingsSection
        title="Extra instructions"
        help="Added to every grading request, e.g. her grade and what matters to you."
      >
        <textarea
          value={draft.instructions}
          onChange={(e) => set({ instructions: e.target.value })}
          maxLength={GRADING_LIMITS.instructionsMax}
          rows={3}
          placeholder="8th grade. In math she must show her work."
          aria-label="Extra instructions for the grader"
          className="w-full rounded-lg border border-input bg-card px-2 py-1.5 text-[0.8125rem] text-foreground shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
        />
      </SettingsSection>

      <div className="flex items-center gap-3 px-1">
        <Button type="button" onClick={() => void save()} disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </Button>
        {dirty && !error && (
          <span className="text-[0.75rem] text-muted-foreground">Unsaved changes</span>
        )}
        {notice && !dirty && <span className="text-[0.75rem] text-meeting">{notice}</span>}
        {error && <span className="text-[0.75rem] text-destructive">{error}</span>}
      </div>
    </div>
  );
}
