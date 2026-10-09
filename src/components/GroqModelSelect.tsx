import { useEffect, useState } from 'react';
import { Select } from './Select';

const MODEL_STORAGE = 'server-operator:groq-model';
export const DEFAULT_GROQ_MODELS = ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'openai/gpt-oss-120b', 'openai/gpt-oss-20b'];

export function loadGroqModel(): string {
  try {
    return localStorage.getItem(MODEL_STORAGE) || DEFAULT_GROQ_MODELS[0];
  } catch {
    return DEFAULT_GROQ_MODELS[0];
  }
}

function saveGroqModel(model: string) {
  try {
    localStorage.setItem(MODEL_STORAGE, model);
  } catch {
    // ignore
  }
}

/** Dropdown of Groq chat models; loads the live list once an API key is set, falls back to a built-in list. */
export function GroqModelSelect({ apiKey, model, onChange }: { apiKey: string; model: string; onChange: (m: string) => void }) {
  const [models, setModels] = useState<string[]>(DEFAULT_GROQ_MODELS);

  useEffect(() => {
    const key = apiKey.trim();
    if (!key) return;
    let cancelled = false;
    fetch('https://api.groq.com/openai/v1/models', { headers: { Authorization: `Bearer ${key}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { data?: Array<{ id: string }> } | null) => {
        // Skip speech/guard models that can't answer chat prompts.
        const ids = (data?.data ?? []).map((m) => m.id).filter((id) => !/whisper|tts|guard|orpheus/i.test(id)).sort();
        if (!cancelled && ids.length) setModels(ids);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [apiKey]);

  const ids = models.includes(model) ? models : [model, ...models];
  return (
    <Select
      size="sm"
      title="Groq model"
      value={model}
      onChange={(m) => { saveGroqModel(m); onChange(m); }}
      options={ids.map((id) => ({ value: id, label: id }))}
    />
  );
}
