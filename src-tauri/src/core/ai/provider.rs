use serde::{Deserialize, Serialize};
use thiserror::Error;

#[derive(Debug, Error, Serialize, Deserialize)]
pub enum AiError {
    #[error("Network error: {0}")]
    Network(String),
    #[error("API error ({status}): {message}")]
    ApiError { status: u16, message: String },
    #[error("Keyring error: {0}")]
    KeyringError(String),
    #[error("Invalid configuration: {0}")]
    InvalidConfig(String),
    #[error("Provider error: {0}")]
    ProviderError(String),
}

pub trait AiProvider: Send + Sync {
    fn complete(
        &self,
        system_prompt: &str,
        user_prompt: &str,
    ) -> impl std::future::Future<Output = Result<String, AiError>> + Send;
}

pub struct AnthropicProvider {
    pub model: String,
    pub api_key: String,
    pub client: reqwest::Client,
}

impl AnthropicProvider {
    pub fn new(model: String, api_key: String) -> Self {
        Self {
            model,
            api_key,
            client: reqwest::Client::new(),
        }
    }
}

#[derive(Serialize)]
struct AnthropicMessage {
    role: String,
    content: String,
}

#[derive(Serialize)]
struct AnthropicRequest<'a> {
    model: &'a str,
    system: &'a str,
    messages: Vec<AnthropicMessage>,
    max_tokens: u32,
}

#[derive(Deserialize)]
struct AnthropicContentBlock {
    #[serde(rename = "type")]
    kind: String,
    text: Option<String>,
}

#[derive(Deserialize)]
struct AnthropicResponse {
    content: Option<Vec<AnthropicContentBlock>>,
    error: Option<AnthropicErrorDetail>,
}

#[derive(Deserialize)]
struct AnthropicErrorDetail {
    message: String,
}

impl AiProvider for AnthropicProvider {
    async fn complete(&self, system_prompt: &str, user_prompt: &str) -> Result<String, AiError> {
        let payload = AnthropicRequest {
            model: &self.model,
            system: system_prompt,
            messages: vec![AnthropicMessage {
                role: "user".to_string(),
                content: user_prompt.to_string(),
            }],
            max_tokens: 1024,
        };

        let response = self
            .client
            .post("https://api.anthropic.com/v1/messages")
            .header("x-api-key", &self.api_key)
            .header("anthropic-version", "2023-06-01")
            .header("content-type", "application/json")
            .json(&payload)
            .send()
            .await
            .map_err(|e| AiError::Network(e.to_string()))?;

        let status = response.status().as_u16();
        let body: AnthropicResponse = response
            .json()
            .await
            .map_err(|e| AiError::Network(format!("Failed to parse response: {e}")))?;

        if status != 200 {
            let msg = body
                .error
                .map(|e| e.message)
                .unwrap_or_else(|| format!("HTTP status {status}"));
            return Err(AiError::ApiError {
                status,
                message: msg,
            });
        }

        let content_blocks = body
            .content
            .ok_or_else(|| AiError::ProviderError("Empty content in Anthropic response".into()))?;

        for block in content_blocks {
            if block.kind == "text" {
                if let Some(text) = block.text {
                    return Ok(text);
                }
            }
        }

        Err(AiError::ProviderError(
            "No text block found in Anthropic response".into(),
        ))
    }
}

pub struct OpenAiProvider {
    pub model: String,
    pub api_key: String,
    pub client: reqwest::Client,
}

impl OpenAiProvider {
    pub fn new(model: String, api_key: String) -> Self {
        Self {
            model,
            api_key,
            client: reqwest::Client::new(),
        }
    }
}

#[derive(Serialize)]
struct OpenAiMessage<'a> {
    role: &'a str,
    content: &'a str,
}

#[derive(Serialize)]
struct OpenAiRequest<'a> {
    model: &'a str,
    messages: Vec<OpenAiMessage<'a>>,
    max_tokens: u32,
}

#[derive(Deserialize)]
struct OpenAiChoiceMessage {
    content: Option<String>,
}

#[derive(Deserialize)]
struct OpenAiChoice {
    message: Option<OpenAiChoiceMessage>,
}

#[derive(Deserialize)]
struct OpenAiErrorDetail {
    message: String,
}

#[derive(Deserialize)]
struct OpenAiResponse {
    choices: Option<Vec<OpenAiChoice>>,
    error: Option<OpenAiErrorDetail>,
}

impl AiProvider for OpenAiProvider {
    async fn complete(&self, system_prompt: &str, user_prompt: &str) -> Result<String, AiError> {
        let payload = OpenAiRequest {
            model: &self.model,
            messages: vec![
                OpenAiMessage {
                    role: "system",
                    content: system_prompt,
                },
                OpenAiMessage {
                    role: "user",
                    content: user_prompt,
                },
            ],
            max_tokens: 1024,
        };

        let response = self
            .client
            .post("https://api.openai.com/v1/chat/completions")
            .header("authorization", format!("Bearer {}", self.api_key))
            .header("content-type", "application/json")
            .json(&payload)
            .send()
            .await
            .map_err(|e| AiError::Network(e.to_string()))?;

        let status = response.status().as_u16();
        let body: OpenAiResponse = response
            .json()
            .await
            .map_err(|e| AiError::Network(format!("Failed to parse response: {e}")))?;

        if status != 200 {
            let msg = body
                .error
                .map(|e| e.message)
                .unwrap_or_else(|| format!("HTTP status {status}"));
            return Err(AiError::ApiError {
                status,
                message: msg,
            });
        }

        if let Some(choices) = body.choices {
            if let Some(choice) = choices.first() {
                if let Some(ref msg) = choice.message {
                    if let Some(ref text) = msg.content {
                        return Ok(text.clone());
                    }
                }
            }
        }

        Err(AiError::ProviderError(
            "No completion text returned in OpenAI response".into(),
        ))
    }
}
