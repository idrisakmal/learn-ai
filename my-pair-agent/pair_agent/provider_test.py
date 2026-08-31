"""The retry path matters more than usual here: the free OpenRouter endpoints
report upstream failures as HTTP 200 with an error body, so a naive client
reports 'no choices' and hides the real cause."""

from types import SimpleNamespace

import openai
import pytest

# The openai SDK vendors its own HTTP client; which one depends on the version
# installed, and the test needs whatever Response class it will accept.
try:  # openai >= 3
    import httpx2 as httpx
except ImportError:  # openai 1.x / 2.x
    import httpx

from .provider import Provider, ProviderError, TransientProviderError, _as_message


class Cfg:
    api_key = "sk-test"
    base_url = "https://example.invalid/v1"
    model = "test/model"
    timeout = 5.0
    temperature = 0.2


def make_provider(monkeypatch, responses):
    monkeypatch.setattr("pair_agent.provider.time.sleep", lambda _: None)
    provider = Provider(Cfg())
    calls = iter(responses)

    def fake_create(**_kwargs):
        result = next(calls)
        if isinstance(result, Exception):
            raise result
        return result

    monkeypatch.setattr(provider._client.chat.completions, "create", fake_create)
    return provider


def ok(content="hello"):
    message = SimpleNamespace(content=content, tool_calls=None)
    return SimpleNamespace(
        choices=[SimpleNamespace(message=message)], model_extra={}
    )


def upstream_error(code=502, message="Service temporarily overloaded"):
    return SimpleNamespace(
        choices=[], model_extra={"error": {"message": message, "code": code}}
    )


def test_embedded_upstream_error_is_reported_not_swallowed(monkeypatch):
    provider = make_provider(monkeypatch, [upstream_error()] * 4)
    with pytest.raises(ProviderError, match="Service temporarily overloaded"):
        provider.complete([{"role": "user", "content": "hi"}])


def test_transient_upstream_error_is_retried_then_succeeds(monkeypatch):
    provider = make_provider(monkeypatch, [upstream_error(), ok("recovered")])
    assert provider.complete([])["content"] == "recovered"


def test_client_side_upstream_error_is_not_retried(monkeypatch):
    provider = make_provider(monkeypatch, [upstream_error(code=400, message="bad model")])
    with pytest.raises(ProviderError, match="bad model"):
        provider.complete([])


def test_tool_calls_are_flattened_into_plain_data():
    message = SimpleNamespace(
        content=None,
        tool_calls=[
            SimpleNamespace(
                id="call-1",
                function=SimpleNamespace(name="list_skills", arguments="{}"),
            )
        ],
    )
    result = _as_message(message)
    assert result["content"] == ""
    assert result["tool_calls"][0]["function"]["name"] == "list_skills"


def test_reasoning_is_not_kept_in_conversation_state():
    message = SimpleNamespace(content="answer", tool_calls=None, reasoning="thinking...")
    assert "reasoning" not in _as_message(message)


def status_error(code, message, provider_name=None):
    body = {"error": {"message": message, "code": code}}
    if provider_name:
        body["error"]["metadata"] = {"provider_name": provider_name}
    return openai.APIStatusError(
        message,
        response=httpx.Response(
            code, request=httpx.Request("POST", "https://example.invalid/v1")
        ),
        body=body,
    )


def test_upstream_404_is_retried_because_it_is_not_our_fault(monkeypatch):
    """OpenRouter forwards an upstream routing failure as a 404 that is
    indistinguishable from a bad model name except by provider_name."""
    provider = make_provider(
        monkeypatch,
        [status_error(404, "Provider returned error", provider_name="Nvidia"), ok("recovered")],
    )
    assert provider.complete([])["content"] == "recovered"


def test_a_genuine_404_is_not_retried(monkeypatch):
    provider = make_provider(monkeypatch, [status_error(404, "No such model")])
    with pytest.raises(ProviderError, match="No such model"):
        provider.complete([])
