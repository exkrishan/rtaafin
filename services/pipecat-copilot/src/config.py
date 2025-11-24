"""Configuration management for Pipecat Copilot service"""

import os
from typing import Optional
from pydantic_settings import BaseSettings
from pydantic import Field


class Settings(BaseSettings):
    """Application settings loaded from environment variables"""

    # Exotel Configuration
    support_exotel: bool = Field(default=True, description="Enable Exotel protocol support")
    exotel_auth_method: str = Field(default="ip_whitelist", description="Authentication method: ip_whitelist or basic_auth")
    exotel_basic_auth_user: Optional[str] = Field(default=None, description="Basic auth username")
    exotel_basic_auth_pass: Optional[str] = Field(default=None, description="Basic auth password")

    # STT Provider Configuration
    stt_provider: str = Field(default="elevenlabs", description="STT provider: deepgram, elevenlabs, or openai")
    deepgram_api_key: Optional[str] = Field(default=None, description="Deepgram API key")
    elevenlabs_api_key: Optional[str] = Field(default=None, description="ElevenLabs API key")
    elevenlabs_model: str = Field(default="scribe_v2_realtime", description="ElevenLabs model ID (default: scribe_v2_realtime)")
    elevenlabs_language: str = Field(default="en", description="ElevenLabs language code (default: en)")
    openai_api_key: Optional[str] = Field(default=None, description="OpenAI API key")

    # LLM Configuration
    llm_provider: str = Field(default="gemini", description="LLM provider: openai or gemini")
    llm_api_key: Optional[str] = Field(default=None, description="LLM API key (OpenAI or Gemini)")
    gemini_api_key: Optional[str] = Field(default=None, description="Gemini API key (alternative to llm_api_key)")

    # Frontend Integration
    frontend_api_url: str = Field(default="http://localhost:3000", description="Next.js frontend API base URL")
    supabase_url: Optional[str] = Field(default=None, description="Supabase URL")
    supabase_service_role_key: Optional[str] = Field(default=None, description="Supabase service role key")

    # KB Configuration
    kb_adapter_type: str = Field(default="db", description="KB adapter type: db or knowmax")
    knowmax_api_key: Optional[str] = Field(default=None, description="Knowmax API key")
    knowmax_base_url: Optional[str] = Field(default=None, description="Knowmax base URL")

    # Server Configuration
    # Render automatically sets PORT environment variable
    port: int = Field(default=5000, description="Server port (reads from PORT env var)")
    host: str = Field(default="0.0.0.0", description="Server host")
    log_level: str = Field(default="INFO", description="Logging level")

    # Health Check
    health_check_path: str = Field(default="/health", description="Health check endpoint path")
    
    # Error Handling & Retries
    max_retries: int = Field(default=3, description="Maximum number of retries for external API calls")
    retry_delay: float = Field(default=1.0, description="Initial retry delay in seconds (exponential backoff)")
    request_timeout: float = Field(default=30.0, description="Request timeout in seconds for external APIs")

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = False

    def validate(self) -> None:
        """Validate required configuration based on selected providers"""
        errors = []

        # Validate STT provider
        if self.stt_provider == "deepgram" and not self.deepgram_api_key:
            errors.append("DEEPGRAM_API_KEY is required when STT_PROVIDER=deepgram")
        elif self.stt_provider == "elevenlabs":
            if not self.elevenlabs_api_key:
                errors.append("ELEVENLABS_API_KEY is required when STT_PROVIDER=elevenlabs")
            # Validate ElevenLabs model
            if self.elevenlabs_model not in ["scribe_v2_realtime", "scribe_v1"]:
                logger.warning(
                    f"[config] Unusual ElevenLabs model: {self.elevenlabs_model}. "
                    f"Expected: scribe_v2_realtime or scribe_v1"
                )
        elif self.stt_provider == "openai" and not self.openai_api_key:
            errors.append("OPENAI_API_KEY is required when STT_PROVIDER=openai")

        # Validate LLM provider
        if self.llm_provider == "gemini" or self.llm_provider == "google":
            if not self.gemini_api_key and not self.llm_api_key:
                errors.append("GEMINI_API_KEY or LLM_API_KEY is required when LLM_PROVIDER=gemini")
        elif self.llm_provider == "openai":
            if not self.llm_api_key and not self.openai_api_key:
                errors.append("LLM_API_KEY or OPENAI_API_KEY is required when LLM_PROVIDER=openai")

        # Validate KB adapter
        if self.kb_adapter_type == "knowmax":
            if not self.knowmax_api_key:
                errors.append("KNOWMAX_API_KEY is required when KB_ADAPTER_TYPE=knowmax")
            if not self.knowmax_base_url:
                errors.append("KNOWMAX_BASE_URL is required when KB_ADAPTER_TYPE=knowmax")

        if errors:
            raise ValueError("Configuration errors:\n" + "\n".join(f"  - {e}" for e in errors))

    def get_llm_api_key(self) -> Optional[str]:
        """Get the appropriate LLM API key based on provider"""
        if self.llm_provider == "gemini" or self.llm_provider == "google":
            return self.gemini_api_key or self.llm_api_key
        return self.llm_api_key or self.openai_api_key

    def get_stt_api_key(self) -> Optional[str]:
        """Get the appropriate STT API key based on provider"""
        if self.stt_provider == "deepgram":
            return self.deepgram_api_key
        elif self.stt_provider == "elevenlabs":
            return self.elevenlabs_api_key
        elif self.stt_provider == "openai":
            return self.openai_api_key
        return None


# Global settings instance
settings = Settings()

