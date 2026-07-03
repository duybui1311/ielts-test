import os

from backend.service import storage


def test_canonical_passthrough_external(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://demo.supabase.co")
    assert storage.canonical_media_url("https://cdn.example.com/a.mp3") == "https://cdn.example.com/a.mp3"
    assert storage.canonical_media_url(None) is None
    assert storage.canonical_media_url("/uploads/x.mp3") == "/uploads/x.mp3"


def test_canonical_converts_signed_to_public(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://demo.supabase.co")
    signed = "https://demo.supabase.co/storage/v1/object/sign/speaking-audio/abc.webm?token=xyz"
    assert storage.canonical_media_url(signed) ==         "https://demo.supabase.co/storage/v1/object/public/speaking-audio/abc.webm"
    public = "https://demo.supabase.co/storage/v1/object/public/writing-charts/x.png"
    assert storage.canonical_media_url(public) == public


def test_sign_falls_back_when_not_configured(monkeypatch):
    # Without Storage credentials, signing must not break content delivery.
    monkeypatch.setenv("SUPABASE_URL", "https://demo.supabase.co")
    monkeypatch.delenv("SUPABASE_SERVICE_KEY", raising=False)
    storage._client.cache_clear()
    url = "https://demo.supabase.co/storage/v1/object/public/speaking-audio/abc.webm"
    assert storage.sign_media_url(url) == url
    assert storage.sign_media_url("https://cdn.example.com/a.mp3") == "https://cdn.example.com/a.mp3"
