use std::fs;
use std::path::PathBuf;

use keyring::Entry;
use serde::{Deserialize, Serialize};

use super::provider::{AiError, AnthropicProvider, OpenAiProvider, ProviderClient};

const KEYRING_SERVICE: &str = "penguingit";
const KEYRING_USER: &str = "ai_api_key";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiConfig {
    pub provider: String,
    pub model: String,
}

impl Default for AiConfig {
    fn default() -> Self {
        Self {
            provider: "anthropic".to_string(),
            model: "claude-3-5-sonnet-20241022".to_string(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct AiConfigResponse {
    pub provider: String,
    pub model: String,
    pub has_key: bool,
}

fn config_file_path() -> PathBuf {
    let base = std::env::var("XDG_CONFIG_HOME")
        .map(PathBuf::from)
        .or_else(|_| std::env::var("HOME").map(|h| PathBuf::from(h).join(".config")))
        .unwrap_or_else(|_| PathBuf::from("."));
    let path = base.join("penguingit");
    let _ = fs::create_dir_all(&path);
    path.join("ai_config.json")
}

fn keyring_entry() -> Result<Entry, AiError> {
    Entry::new(KEYRING_SERVICE, KEYRING_USER)
        .map_err(|e| AiError::KeyringError(format!("Keyring initialization failed: {e}")))
}

pub fn get_api_key() -> Result<String, AiError> {
    let entry = keyring_entry()?;
    match entry.get_password() {
        Ok(key) if !key.trim().is_empty() => Ok(key),
        _ => Err(AiError::InvalidConfig(
            "API key not set in keychain".to_string(),
        )),
    }
}

pub fn save_api_key(api_key: &str) -> Result<(), AiError> {
    let entry = keyring_entry()?;
    entry
        .set_password(api_key.trim())
        .map_err(|e| AiError::KeyringError(format!("Failed to save API key to keychain: {e}")))?;
    Ok(())
}

pub fn has_api_key() -> bool {
    get_api_key().is_ok()
}

pub fn load_saved_config() -> AiConfig {
    let path = config_file_path();
    if path.exists() {
        if let Ok(content) = fs::read_to_string(path) {
            if let Ok(config) = serde_json::from_str::<AiConfig>(&content) {
                return config;
            }
        }
    }
    AiConfig::default()
}

pub fn save_config_file(config: &AiConfig) -> Result<(), AiError> {
    let path = config_file_path();
    let content = serde_json::to_string_pretty(config)
        .map_err(|e| AiError::InvalidConfig(format!("Serialization error: {e}")))?;
    fs::write(path, content)
        .map_err(|e| AiError::InvalidConfig(format!("Failed to write config file: {e}")))?;
    Ok(())
}

pub fn get_ai_config() -> Result<AiConfigResponse, AiError> {
    let config = load_saved_config();
    Ok(AiConfigResponse {
        provider: config.provider,
        model: config.model,
        has_key: has_api_key(),
    })
}

pub fn save_ai_config(
    provider: String,
    model: String,
    api_key: Option<String>,
) -> Result<AiConfigResponse, AiError> {
    if let Some(key) = api_key {
        let trimmed = key.trim();
        if !trimmed.is_empty() {
            save_api_key(trimmed)?;
        }
    }

    let config = AiConfig { provider, model };
    save_config_file(&config)?;

    get_ai_config()
}

pub async fn test_ai_connection(
    provider: Option<String>,
    model: Option<String>,
    api_key: Option<String>,
) -> Result<bool, AiError> {
    let saved_config = load_saved_config();
    let target_provider = provider.unwrap_or(saved_config.provider);
    let target_model = model.unwrap_or(saved_config.model);

    let key = match api_key {
        Some(k) if !k.trim().is_empty() => k.trim().to_string(),
        _ => get_api_key()?,
    };

    let system_prompt = "You are an API connection tester. Reply with 'OK' and nothing else.";
    let user_prompt = "Test connection";

    let client = match target_provider.as_str() {
        "anthropic" => ProviderClient::Anthropic(AnthropicProvider::new(target_model, key)),
        "openai" => ProviderClient::OpenAi(OpenAiProvider::new(target_model, key)),
        other => {
            return Err(AiError::InvalidConfig(format!(
                "Unsupported AI provider '{other}'"
            )))
        }
    };

    let response_text = client.complete(system_prompt, user_prompt).await?;

    if !response_text.trim().is_empty() {
        Ok(true)
    } else {
        Err(AiError::ProviderError(
            "Received empty test response".into(),
        ))
    }
}
