import { useState, useEffect } from "react";
import { getAiConfig, saveAiConfig, testAiConnection } from "../../services/tauriBridge";
import "./AiPanel.css";

const MODEL_PRESETS = {
  anthropic: [
    { id: "claude-3-5-sonnet-20241022", label: "Claude 3.5 Sonnet (Recommended)" },
    { id: "claude-3-5-haiku-20241022", label: "Claude 3.5 Haiku (Fast)" },
    { id: "claude-3-opus-20240229", label: "Claude 3 Opus" },
  ],
  openai: [
    { id: "gpt-4o", label: "GPT-4o (Recommended)" },
    { id: "gpt-4o-mini", label: "GPT-4o Mini (Fast)" },
    { id: "o1-preview", label: "o1-preview" },
  ],
};

export default function AiPanel() {
  const [provider, setProvider] = useState("anthropic");
  const [model, setModel] = useState("claude-3-5-sonnet-20241022");
  const [customModel, setCustomModel] = useState("");
  const [isCustomModel, setIsCustomModel] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [hasKey, setHasKey] = useState(false);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState(null);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    setLoading(true);
    try {
      const cfg = await getAiConfig();
      if (cfg) {
        setProvider(cfg.provider || "anthropic");
        setHasKey(!!cfg.has_key);

        const presets = MODEL_PRESETS[cfg.provider] || [];
        const found = presets.some((m) => m.id === cfg.model);
        if (found) {
          setModel(cfg.model);
          setIsCustomModel(false);
        } else {
          setIsCustomModel(true);
          setCustomModel(cfg.model || "");
        }
      }
    } catch (err) {
      console.error("Failed to load AI config:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleProviderChange = (newProvider) => {
    setProvider(newProvider);
    const presets = MODEL_PRESETS[newProvider] || [];
    if (presets.length > 0) {
      setModel(presets[0].id);
      setIsCustomModel(false);
    }
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setStatusMessage(null);
    try {
      const activeModel = isCustomModel ? customModel : model;
      await testAiConnection(provider, activeModel, apiKey || undefined);
      setStatusMessage({ type: "success", text: "✓ Connection successful! API key is valid." });
    } catch (err) {
      setStatusMessage({
        type: "error",
        text: `Connection failed: ${err.message || String(err)}`,
      });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async (e) => {
    e?.preventDefault();
    setSaving(true);
    setStatusMessage(null);
    try {
      const activeModel = isCustomModel ? customModel : model;
      const res = await saveAiConfig(provider, activeModel, apiKey || undefined);
      setHasKey(!!res?.has_key);
      setApiKey("");
      setStatusMessage({ type: "success", text: "✓ Settings saved successfully!" });
    } catch (err) {
      setStatusMessage({
        type: "error",
        text: `Failed to save: ${err.message || String(err)}`,
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="ai-panel">Loading AI configuration…</div>;
  }

  const activePresets = MODEL_PRESETS[provider] || [];

  return (
    <form className="ai-panel" onSubmit={handleSave}>
      <div className="ai-panel-header">
        <h3>AI Assistant Settings</h3>
        <p>
          Configure bring-your-own API key for Compose Commits, Explain Commit/Branch, and PR
          Description generation.
        </p>
      </div>

      {statusMessage && (
        <div className={`ai-status-msg ${statusMessage.type}`}>{statusMessage.text}</div>
      )}

      <div className="ai-form-group">
        <label htmlFor="ai-provider-select">Provider</label>
        <select
          id="ai-provider-select"
          className="ai-select"
          value={provider}
          onChange={(e) => handleProviderChange(e.target.value)}
        >
          <option value="anthropic">Anthropic (Claude)</option>
          <option value="openai">OpenAI (ChatGPT)</option>
        </select>
      </div>

      <div className="ai-form-group">
        <label htmlFor="ai-model-select">Model</label>
        <select
          id="ai-model-select"
          className="ai-select"
          value={isCustomModel ? "custom" : model}
          onChange={(e) => {
            if (e.target.value === "custom") {
              setIsCustomModel(true);
            } else {
              setIsCustomModel(false);
              setModel(e.target.value);
            }
          }}
        >
          {activePresets.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
          <option value="custom">Custom Model…</option>
        </select>
        {isCustomModel && (
          <input
            type="text"
            className="ai-input"
            placeholder="Enter custom model identifier (e.g. claude-3-haiku-20240307)"
            value={customModel}
            onChange={(e) => setCustomModel(e.target.value)}
          />
        )}
      </div>

      <div className="ai-form-group">
        <label htmlFor="ai-api-key-input">API Key</label>
        <input
          id="ai-api-key-input"
          type="password"
          className="ai-input"
          placeholder={hasKey ? "•••••••••••••••• (Key saved in Keychain)" : "Enter API Key"}
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          autoComplete="off"
        />
        <div className="ai-key-status">
          <span>Status:</span>
          {hasKey ? (
            <span className="key-badge saved">✓ Saved in Keychain</span>
          ) : (
            <span className="key-badge missing">No Key Saved</span>
          )}
        </div>
      </div>

      <div className="ai-actions">
        <button
          type="button"
          className="btn-secondary"
          disabled={testing || saving || (!hasKey && !apiKey)}
          onClick={handleTestConnection}
        >
          {testing ? "Testing…" : "Test Connection"}
        </button>
        <button type="submit" className="btn-primary" disabled={saving || testing}>
          {saving ? "Saving…" : "Save Configuration"}
        </button>
      </div>
    </form>
  );
}
