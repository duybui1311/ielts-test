"""Tests for backend.service.storage — public-URL construction and config gating.

These are pure/env-driven (no network): they verify the absolute-URL building
that fixed the malformed "https//host" links, plus the configuration guards.
"""
import pytest

from backend.service import storage


def test_public_url_strips_trailing_slash(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://abc.supabase.co/")
    url = storage._public_url("writing-charts", "file.png")
    assert url == "https://abc.supabase.co/storage/v1/object/public/writing-charts/file.png"


def test_public_url_adds_missing_scheme(monkeypatch):
    # A bare host (no scheme) must become a valid absolute https URL.
    monkeypatch.setenv("SUPABASE_URL", "abc.supabase.co")
    url = storage._public_url("speaking-audio", "clip.webm")
    assert url == "https://abc.supabase.co/storage/v1/object/public/speaking-audio/clip.webm"


def test_public_url_keeps_existing_http_scheme(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "http://localhost:54321")
    url = storage._public_url("writing-charts", "x.png")
    assert url == "http://localhost:54321/storage/v1/object/public/writing-charts/x.png"


def test_public_url_with_unset_base(monkeypatch):
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    url = storage._public_url("writing-charts", "x.png")
    assert url == "/storage/v1/object/public/writing-charts/x.png"


def test_is_configured_true_when_both_present(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://abc.supabase.co")
    monkeypatch.setenv("SUPABASE_SERVICE_KEY", "service-key")
    assert storage.is_configured() is True


def test_is_configured_false_when_key_missing(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://abc.supabase.co")
    monkeypatch.delenv("SUPABASE_SERVICE_KEY", raising=False)
    assert storage.is_configured() is False


def test_client_without_config_raises(monkeypatch):
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.delenv("SUPABASE_SERVICE_KEY", raising=False)
    storage._client.cache_clear()  # don't reuse a cached client
    with pytest.raises(storage.StorageNotConfigured):
        storage._client()
    storage._client.cache_clear()
