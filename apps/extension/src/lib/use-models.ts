import { useEffect, useState } from "react";
import { RELAY_URL } from "./config.js";
import { fetchModels, type ModelChoice } from "./models-client.js";
import { keyFor, type Settings } from "./settings.js";

export const DIRECT_NOTE =
  "Direct Mode calls Claude with the newest model. Turn it off to pick a model or another provider.";

/**
 * The model list for the saved provider, fetched through the relay with the user's key (so only
 * when a key exists and Direct Mode is off).
 */
export function useModels(settings: Settings | null): {
  models: ModelChoice[] | null;
  loading: boolean;
  note: string | null;
} {
  const directMode = settings?.directMode ?? false;
  const provider = settings?.provider ?? "anthropic";
  const apiKey = settings ? keyFor(settings, provider) : "";
  const [models, setModels] = useState<ModelChoice[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    setModels(null);
    setLoading(false);
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

  return { models, loading, note };
}
