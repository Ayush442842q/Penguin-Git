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

pub enum ProviderClient {
    Anthropic(AnthropicProvider),
    OpenAi(OpenAiProvider),
}

impl ProviderClient {
    pub async fn complete(
        &self,
        system_prompt: &str,
        user_prompt: &str,
    ) -> Result<String, AiError> {
        match self {
            Self::Anthropic(p) => p.complete(system_prompt, user_prompt).await,
            Self::OpenAi(p) => p.complete(system_prompt, user_prompt).await,
        }
    }
}

pub struct AnthropicProvider {
    pub model: String,
    pub api_key: String,
    pub client: reqwest::Client,
    pub base_url: String,
}

impl AnthropicProvider {
    pub fn new(model: String, api_key: String) -> Self {
        Self {
            model,
            api_key,
            client: reqwest::Client::new(),
            base_url: "https://api.anthropic.com".to_string(),
        }
    }

    pub async fn complete(
        &self,
        system_prompt: &str,
        user_prompt: &str,
    ) -> Result<String, AiError> {
        let payload = AnthropicRequest {
            model: &self.model,
            system: system_prompt,
            messages: vec![AnthropicMessage {
                role: "user".to_string(),
                content: user_prompt.to_string(),
            }],
            max_tokens: 1024,
        };

        let url = format!("{}/v1/messages", self.base_url);
        let response = self
            .client
            .post(&url)
            .header("x-api-key", &self.api_key)
            .header("anthropic-version", "2023-06-01")
            .header("content-type", "application/json")
            .json(&payload)
            .send()
            .await
            .map_err(|e| AiError::Network(e.to_string()))?;

        let status = response.status();
        if !status.is_success() {
            let status_code = status.as_u16();
            let body_text = response.text().await.unwrap_or_default();
            let message = serde_json::from_str::<AnthropicResponse>(&body_text)
                .ok()
                .and_then(|r| r.error)
                .map(|e| e.message)
                .unwrap_or(body_text);
            return Err(AiError::ApiError {
                status: status_code,
                message,
            });
        }

        let body: AnthropicResponse = response
            .json()
            .await
            .map_err(|e| AiError::Network(format!("Failed to parse response: {e}")))?;

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

impl AiProvider for AnthropicProvider {
    fn complete(
        &self,
        system_prompt: &str,
        user_prompt: &str,
    ) -> impl std::future::Future<Output = Result<String, AiError>> + Send {
        self.complete(system_prompt, user_prompt)
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

pub struct OpenAiProvider {
    pub model: String,
    pub api_key: String,
    pub client: reqwest::Client,
    pub base_url: String,
}

impl OpenAiProvider {
    pub fn new(model: String, api_key: String) -> Self {
        Self {
            model,
            api_key,
            client: reqwest::Client::new(),
            base_url: "https://api.openai.com".to_string(),
        }
    }

    pub async fn complete(
        &self,
        system_prompt: &str,
        user_prompt: &str,
    ) -> Result<String, AiError> {
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

        let url = format!("{}/v1/chat/completions", self.base_url);
        let response = self
            .client
            .post(&url)
            .header("authorization", format!("Bearer {}", self.api_key))
            .header("content-type", "application/json")
            .json(&payload)
            .send()
            .await
            .map_err(|e| AiError::Network(e.to_string()))?;

        let status = response.status();
        if !status.is_success() {
            let status_code = status.as_u16();
            let body_text = response.text().await.unwrap_or_default();
            let message = serde_json::from_str::<OpenAiResponse>(&body_text)
                .ok()
                .and_then(|r| r.error)
                .map(|e| e.message)
                .unwrap_or(body_text);
            return Err(AiError::ApiError {
                status: status_code,
                message,
            });
        }

        let body: OpenAiResponse = response
            .json()
            .await
            .map_err(|e| AiError::Network(format!("Failed to parse response: {e}")))?;

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

impl AiProvider for OpenAiProvider {
    fn complete(
        &self,
        system_prompt: &str,
        user_prompt: &str,
    ) -> impl std::future::Future<Output = Result<String, AiError>> + Send {
        self.complete(system_prompt, user_prompt)
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

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_anthropic_non_200_returns_apierror() {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();

        tokio::spawn(async move {
            if let Ok((mut stream, _)) = listener.accept().await {
                use tokio::io::AsyncWriteExt;
                let response = "HTTP/1.1 400 Bad Request\r\nContent-Type: application/json\r\nConnection: close\r\n\r\n{\"error\":{\"message\":\"Invalid API key for Anthropic\"}}";
                let _ = stream.write_all(response.as_bytes()).await;
                let _ = stream.shutdown().await;
            }
        });

        let mut provider = AnthropicProvider::new("claude-3-opus".to_string(), "key".to_string());
        provider.base_url = format!("http://127.0.0.1:{port}");

        let res = provider.complete("sys", "user").await;
        assert!(res.is_err());
        match res.unwrap_err() {
            AiError::ApiError { status, message } => {
                assert_eq!(status, 400);
                assert_eq!(message, "Invalid API key for Anthropic");
            }
            other => panic!("Expected ApiError, got {:?}", other),
        }
    }

    #[tokio::test]
    async fn test_openai_non_200_returns_apierror() {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();

        tokio::spawn(async move {
            if let Ok((mut stream, _)) = listener.accept().await {
                use tokio::io::AsyncWriteExt;
                let response = "HTTP/1.1 401 Unauthorized\r\nContent-Type: application/json\r\nConnection: close\r\n\r\n{\"error\":{\"message\":\"Invalid API key for OpenAI\"}}";
                let _ = stream.write_all(response.as_bytes()).await;
                let _ = stream.shutdown().await;
            }
        });

        let mut provider = OpenAiProvider::new("gpt-4".to_string(), "key".to_string());
        provider.base_url = format!("http://127.0.0.1:{port}");

        let res = provider.complete("sys", "user").await;
        assert!(res.is_err());
        match res.unwrap_err() {
            AiError::ApiError { status, message } => {
                assert_eq!(status, 401);
                assert_eq!(message, "Invalid API key for OpenAI");
            }
            other => panic!("Expected ApiError, got {:?}", other),
        }
    }
}
