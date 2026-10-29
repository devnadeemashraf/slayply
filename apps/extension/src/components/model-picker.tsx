import type { Effort } from "@slayply/core";
import type { ProviderId } from "@slayply/providers";
import type { ModelChoice } from "../lib/models-client.js";

export const PROVIDER_LABELS: Record<ProviderId, string> = {
  anthropic: "Claude (Anthropic)",
  openai: "ChatGPT (OpenAI)",
  gemini: "Gemini (Google)",
};

const EFFORTS: readonly Effort[] = ["low", "medium", "high"];

/** The model the request will use: the pick, or the provider's newest (first in the list). */
export function effectiveModel(
  models: readonly ModelChoice[] | null,
  model: string,
): ModelChoice | undefined {
  return models?.find((entry) => entry.id === model) ?? (model === "" ? models?.[0] : undefined);
}

export type ModelPickerProps = {
  provider: ProviderId;
  /** `null` while loading or when the list could not be loaded. */
  models: readonly ModelChoice[] | null;
  loading: boolean;
  note: string | null;
  model: string;
  effort: Effort | "";
  disabled: boolean;
  onProvider: (provider: ProviderId) => void;
  onModel: (model: string) => void;
  onEffort: (effort: Effort | "") => void;
};

export function ModelPicker(props: ModelPickerProps) {
  const { provider, models, model, effort, disabled } = props;
  // A saved model that the list no longer has is shown as "Newest", which is what is sent.
  const shown = models?.some((entry) => entry.id === model) ? model : "";
  const showEffort = effectiveModel(models, shown)?.supportsEffort === true;

  return (
    <fieldset className="picker">
      <legend>Model</legend>
      <label htmlFor="provider">Provider</label>
      <select
        id="provider"
        value={provider}
        disabled={disabled}
        onChange={(event) => props.onProvider(event.target.value as ProviderId)}
      >
        {(Object.keys(PROVIDER_LABELS) as ProviderId[]).map((id) => (
          <option key={id} value={id}>
            {PROVIDER_LABELS[id]}
          </option>
        ))}
      </select>
      <label htmlFor="model">Model</label>
      <select
        id="model"
        value={shown}
        disabled={disabled || props.loading}
        onChange={(event) => props.onModel(event.target.value)}
      >
        <option value="">{props.loading ? "Loading models…" : "Newest available"}</option>
        {models?.map((entry) => (
          <option key={entry.id} value={entry.id}>
            {entry.displayName}
          </option>
        ))}
      </select>
      {showEffort && (
        <>
          <label htmlFor="effort">Effort</label>
          <select
            id="effort"
            value={effort}
            disabled={disabled}
            onChange={(event) => props.onEffort(event.target.value as Effort | "")}
          >
            <option value="">Default</option>
            {EFFORTS.map((level) => (
              <option key={level} value={level}>
                {level}
              </option>
            ))}
          </select>
        </>
      )}
      {props.note && <p className="muted">{props.note}</p>}
    </fieldset>
  );
}
