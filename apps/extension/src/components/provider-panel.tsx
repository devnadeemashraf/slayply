import { useEffect, useState } from "react";
import { RELAY_URL } from "../lib/config.js";
import { fetchModels, type ModelChoice } from "../lib/models-client.js";
import { keyFor, type Settings } from "../lib/settings.js";
import { ModelPicker, PROVIDER_LABELS } from "./model-picker.js";

const KEY_PLACEHOLDERS = { anthropic: "sk-ant-…", openai: "sk-…", gemini: "AIza…" } as const;

export const DIRECT_NOTE =
  "Direct Mode calls Claude with the newest model. Turn it off to pick a model or another provider.";

type Choice = Pick<Settings, "provider" | "model" | "effort">;

export function ProviderPanel({
  settings,
  onChoice,
  onSaveKey,
  onClearKey,
}: {
  settings: Settings;
  onChoice: (choice: Choice) => void;
  /** Resolves to an error message, "" for a storage failure already shown elsewhere, or null on success. */
  onSaveKey: (provider: Settings["provider"], key: string) => Promise<string | null>;
  onClearKey: (provider: Settings["provider"]) => Promise<void>;
}) {
  const { provider, model, effort, directMode } = settings;
  const apiKey = keyFor(settings, provider);
  const [models, setModels] = useState<ModelChoice[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  // The list comes from the relay with the user's key, so it is fetched only when a key exists.
  useEffect(() => {
    setModels(null);
    setNote(directMode ? DIRECT_NOTE : null);
    if (directMode || apiKey === "") return;
    const controller = new AbortController();
    setLoading(true);
    void fetchModels({
      baseUrl: RELAY_URL,
      provider,
      apiKey,
      fetchFn: (url, init) => fetch(url, init),
      signal: controller.signal,
    }).then((result) => {
      if (controller.signal.aborted) return;
      setLoading(false);
      if (result.ok) setModels(result.models);
      else setNote(result.message);
    });
    return () => controller.abort();
  }, [provider, apiKey, directMode]);

  const hasKey = apiKey !== "";
  return (
    <section>
      <h2>Provider</h2>
      <ModelPicker
        provider={provider}
        models={models}
        loading={loading}
        note={note}
        model={model}
        effort={effort}
        disabled={false}
        onProvider={(next) => onChoice({ provider: next, model: "", effort: "" })}
        onModel={(next) => onChoice({ provider, model: next, effort })}
        onEffort={(next) => onChoice({ provider, model, effort: next })}
      />
      <p className="muted">
        {hasKey
          ? `A ${PROVIDER_LABELS[provider]} key is saved in this browser.`
          : `No ${PROVIDER_LABELS[provider]} key saved yet.`}
      </p>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          const error = await onSaveKey(provider, draft);
          setMessage(error === "" ? null : error);
          if (error === null) setDraft("");
        }}
      >
        <label htmlFor="api-key">{PROVIDER_LABELS[provider]} API key</label>
        <input
          id="api-key"
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={KEY_PLACEHOLDERS[provider]}
        />
        <div className="row">
          <button type="submit">Save key</button>
          {hasKey && (
            <button type="button" className="secondary" onClick={() => void onClearKey(provider)}>
              Remove key
            </button>
          )}
        </div>
        {message && (
          <p className="error" role="alert">
            {message}
          </p>
        )}
      </form>
    </section>
  );
}
