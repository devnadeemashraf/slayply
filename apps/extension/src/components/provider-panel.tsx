import { useState } from "react";
import { keyFor, type Settings } from "../lib/settings.js";
import { PROVIDER_LABELS } from "./model-picker.js";

const KEY_PLACEHOLDERS = { anthropic: "sk-ant-…", openai: "sk-…", gemini: "AIza…" } as const;

/** The key form for the saved provider; provider, model and effort live in the app bar chip. */
export function ProviderPanel({
  settings,
  onSaveKey,
  onClearKey,
}: {
  settings: Settings;
  /** Resolves to an error message, "" for a storage failure already shown elsewhere, or null on success. */
  onSaveKey: (provider: Settings["provider"], key: string) => Promise<string | null>;
  onClearKey: (provider: Settings["provider"]) => Promise<void>;
}) {
  const { provider } = settings;
  const hasKey = keyFor(settings, provider) !== "";
  const [draft, setDraft] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  return (
    <section>
      <h2>API key</h2>
      <p className="muted">Pick the provider and model from the chip at the top.</p>
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
