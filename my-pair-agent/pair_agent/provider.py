"""The provider seam.

One provider path, implemented properly: OpenRouter over its OpenAI-compatible
wire format. Everything above this module works in plain `messages` dicts and
knows nothing about which model is answering.
"""

from __future__ import annotations

import time
from typing import Any

import openai

from .config import Config


class ProviderError(RuntimeError):
    """Raised when the model could not be reached or refused the request."""


class TransientProviderError(ProviderError):
    """A failure that is worth retrying — an overloaded or rate-limited backend."""


MAX_ATTEMPTS = 4
BACKOFF_SECONDS = 1.5


class Provider:
    """A single tool-calling-capable chat model, reached through OpenRouter."""

    def __init__(self, config: Config) -> None:
        self._config = config
        self._client = openai.OpenAI(
            api_key=config.api_key,
            base_url=config.base_url,
            timeout=config.timeout,
        )

    @property
    def model(self) -> str:
        return self._config.model

    def complete(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
    ) -> dict[str, Any]:
        """Send the conversation and return the assistant's turn as a dict.

        The return value is appended to the messages array verbatim, so it has
        to be plain data — not an SDK object.
        """
        request: dict[str, Any] = {
            "model": self._config.model,
            "messages": messages,
            "temperature": self._config.temperature,
        }
        if tools:
            request["tools"] = tools
            request["tool_choice"] = "auto"

        last_error: TransientProviderError | None = None
        for attempt in range(MAX_ATTEMPTS):
            try:
                return _as_message(self._attempt(request))
            except TransientProviderError as exc:
                last_error = exc
                if attempt < MAX_ATTEMPTS - 1:
                    time.sleep(BACKOFF_SECONDS * (attempt + 1))

        assert last_error is not None
        raise ProviderError(
            f"{last_error} (gave up after {MAX_ATTEMPTS} attempts). "
            "Free OpenRouter endpoints are frequently overloaded; try again, "
            "or set OPENROUTER_MODEL to a paid model."
        )

    def _attempt(self, request: dict[str, Any]) -> Any:
        """One request. Raises TransientProviderError if it is worth retrying."""
        try:
            response = self._client.chat.completions.create(**request)
        except openai.AuthenticationError as exc:
            raise ProviderError(
                "OpenRouter rejected the API key. Check OPENROUTER_API_KEY in .env."
            ) from exc
        except openai.RateLimitError as exc:
            raise TransientProviderError("OpenRouter rate-limited the request.") from exc
        except openai.APIStatusError as exc:
            if exc.status_code >= 500 or _is_upstream_fault(exc):
                raise TransientProviderError(
                    f"OpenRouter returned {exc.status_code}: {exc.message}"
                ) from exc
            raise ProviderError(
                f"OpenRouter returned {exc.status_code} for model "
                f"{self._config.model!r}: {exc.message}"
            ) from exc
        except openai.APIConnectionError as exc:
            raise TransientProviderError(
                f"Could not reach OpenRouter at {self._config.base_url}."
            ) from exc

        # OpenRouter reports upstream failures as HTTP 200 with an `error` body
        # and no choices. Without this the harness would report the useless
        # "no choices" instead of what actually went wrong.
        embedded = (response.model_extra or {}).get("error") if hasattr(response, "model_extra") else None
        if embedded:
            message = embedded.get("message", str(embedded))
            code = embedded.get("code")
            if code is None or int(code) >= 500 or int(code) == 429:
                raise TransientProviderError(f"Upstream provider error: {message}")
            raise ProviderError(f"Upstream provider error: {message}")

        if not response.choices:
            raise TransientProviderError("OpenRouter returned no choices and no error.")

        return response.choices[0].message


def _is_upstream_fault(exc: openai.APIStatusError) -> bool:
    """Is this OpenRouter reporting someone else's failure?

    OpenRouter forwards upstream faults with the upstream status code, so a
    routing failure at a free endpoint arrives as a 404 that looks exactly like
    a misspelled model name. The `provider_name` in the metadata is what tells
    the two apart, and only the former is worth retrying.
    """
    body = getattr(exc, "body", None)
    if not isinstance(body, dict):
        return False
    error = body.get("error")
    if not isinstance(error, dict):
        return False
    metadata = error.get("metadata")
    return isinstance(metadata, dict) and bool(metadata.get("provider_name"))


def _as_message(message: Any) -> dict[str, Any]:
    """Normalise an SDK message into the dict shape the messages array holds.

    Reasoning models return their chain of thought in `reasoning` and may leave
    `content` null on a tool-calling turn. We keep `content` as a string so the
    array stays uniform, and drop the reasoning — it is the model's scratch
    space, not conversation state.
    """
    result: dict[str, Any] = {
        "role": "assistant",
        "content": message.content or "",
    }

    tool_calls = getattr(message, "tool_calls", None)
    if tool_calls:
        result["tool_calls"] = [
            {
                "id": call.id,
                "type": "function",
                "function": {
                    "name": call.function.name,
                    "arguments": call.function.arguments,
                },
            }
            for call in tool_calls
        ]

    return result
