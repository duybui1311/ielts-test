from __future__ import annotations
import os
os.environ.setdefault("KMP_DUPLICATE_LIB_OK", "TRUE")
os.environ.setdefault("OMP_NUM_THREADS", "1")
import logging
import tempfile
import threading
from typing import Optional, Dict, Any
import httpx
from fastapi import APIRouter, UploadFile, File, Header, HTTPException, Form, Request
from starlette.concurrency import run_in_threadpool

logger = logging.getLogger("stt")
if not logger.handlers:
    logging.basicConfig(
        level=os.getenv("APP_LOG_LEVEL", "INFO"),
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )

router = APIRouter(prefix="/api/stt", tags=["stt"])

# Config
STT_LANGUAGE = os.getenv("STT_LANGUAGE", "en")
STT_MODEL_SIZE = os.getenv("STT_MODEL_SIZE", "base")
STT_DEVICE = os.getenv("STT_DEVICE", "cpu")
STT_COMPUTE_TYPE = os.getenv("STT_COMPUTE_TYPE", "int8")
STT_MAX_MB = int(os.getenv("STT_MAX_MB", "25"))
CHAT_TIMEOUT_S = float(os.getenv("CHAT_TIMEOUT_S", "60"))

# Whisper decode settings
STT_BEAM_SIZE = int(os.getenv("STT_BEAM_SIZE", "5"))
STT_TEMPERATURE = float(os.getenv("STT_TEMPERATURE", "0.0"))
STT_VAD_FILTER = os.getenv("STT_VAD_FILTER", "true").lower() in {"1", "true", "yes", "on"}

try:
    from faster_whisper import WhisperModel  # type: ignore
except Exception:
    WhisperModel = None

_model: Optional["WhisperModel"] = None
_model_lock = threading.Lock()


# =========================================================
# Helpers
# =========================================================
def _require_user(x_user_id: Optional[str]) -> int:
    if not x_user_id:
        raise HTTPException(status_code=401, detail="Missing X-User-Id header")
    try:
        return int(x_user_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid X-User-Id header")


def _get_model() -> "WhisperModel":
    global _model
    if WhisperModel is None:
        raise HTTPException(
            status_code=500,
            detail="STT backend not available (faster-whisper not installed)",
        )

    if _model is None:
        print(f"Loading faster-whisper model: {STT_MODEL_SIZE} ({STT_DEVICE}, {STT_COMPUTE_TYPE})")
        _model = WhisperModel(
            STT_MODEL_SIZE,
            device=STT_DEVICE,
            compute_type=STT_COMPUTE_TYPE,
        )
        print("Model loaded.\n")

    return _model


def _best_suffix(file: UploadFile) -> str:
    # Prefer original extension when present
    if file.filename and "." in file.filename:
        ext = "." + file.filename.rsplit(".", 1)[-1].lower()
        if ext in {".webm", ".wav", ".mp3", ".ogg", ".m4a", ".mp4", ".mpeg", ".aac", ".flac"}:
            return ext

    # Fall back to content type
    ct = (file.content_type or "").lower()

    if "webm" in ct:
        return ".webm"
    if "wav" in ct:
        return ".wav"
    if "ogg" in ct:
        return ".ogg"
    if "mpeg" in ct or "mp3" in ct:
        return ".mp3"
    if "m4a" in ct:
        return ".m4a"
    if "mp4" in ct:
        return ".mp4"
    if "aac" in ct:
        return ".aac"
    if "flac" in ct:
        return ".flac"

    # Browser recorder uploads often end up here
    return ".webm"


def _write_temp_audio(raw: bytes, suffix: str) -> str:
    """
    Windows-safe temp file creation.
    We create a path, close the OS handle immediately, write bytes,
    and let faster-whisper / PyAV reopen it cleanly.
    """
    fd, temp_path = tempfile.mkstemp(suffix=suffix)
    os.close(fd)

    with open(temp_path, "wb") as f:
        f.write(raw)
        f.flush()

    return temp_path


def _transcribe_bytes(raw: bytes, suffix: str) -> str:
    """
    Write uploaded bytes to a temp audio file, transcribe with faster-whisper,
    and always clean up afterwards.
    """
    model = _get_model()
    temp_path = _write_temp_audio(raw, suffix)

    try:
        with _model_lock:
            segments, _info = model.transcribe(
                temp_path,
                language=STT_LANGUAGE,
                task="transcribe",
                vad_filter=STT_VAD_FILTER,
                beam_size=STT_BEAM_SIZE,
                temperature=STT_TEMPERATURE,
            )

            text = "".join(seg.text for seg in segments).strip()
            return text

    finally:
        try:
            if os.path.exists(temp_path):
                os.remove(temp_path)
        except Exception as cleanup_err:
            logger.warning("Could not remove temp audio file %s: %s", temp_path, cleanup_err)


def _validate_audio(raw: bytes) -> None:
    if not raw:
        raise HTTPException(status_code=400, detail="Empty audio upload")
    if len(raw) > STT_MAX_MB * 1024 * 1024:
        raise HTTPException(status_code=413, detail=f"Audio too large (>{STT_MAX_MB}MB)")


def _extract_llm_text(data: Any) -> str:
    """
    attempts.py may return message in slightly different shapes.
    We normalize it here.
    """
    if not isinstance(data, dict):
        return str(data or "")

    msg = data.get("message", "")
    if isinstance(msg, dict):
        return str(msg.get("text", "") or "")
    if isinstance(msg, str):
        return msg

    # Extra fallback in case future code changes
    return str(data.get("text", "") or "")


# =========================================================
# Endpoints
# =========================================================
@router.post("/transcribe")
async def transcribe_audio(
    file: UploadFile = File(...),
    station_attempt_id: Optional[int] = None,
    x_user_id: Optional[str] = Header(default=None, alias="X-User-Id"),
) -> Dict[str, Any]:
    _ = _require_user(x_user_id)

    raw = await file.read()
    _validate_audio(raw)
    suffix = _best_suffix(file)

    try:
        print("Transcribing...")
        text_out = await run_in_threadpool(_transcribe_bytes, raw, suffix)

        print("Transcript:")
        print(text_out if text_out else "(empty)")
        print("\nReady to talk.\n")

        return {
            "text": text_out,
            "language": STT_LANGUAGE,
            "station_attempt_id": station_attempt_id,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("STT transcribe failed: %s", e)
        raise HTTPException(status_code=500, detail=f"Transcription failed: {e}")


@router.post("/transcribe_and_chat")
async def transcribe_and_chat(
    request: Request,
    file: UploadFile = File(...),
    station_attempt_id: int = Form(...),
    x_user_id: Optional[str] = Header(default=None, alias="X-User-Id"),
) -> Dict[str, Any]:
    """
    One-call voice chat:
      frontend -> this endpoint
        - transcribe audio to text
        - forward transcript into attempts chat endpoint
        - return BOTH transcript + LLM reply to frontend
    """
    user_id = _require_user(x_user_id)

    raw = await file.read()
    _validate_audio(raw)
    suffix = _best_suffix(file)

    try:
        print("Transcribing...")
        transcript = await run_in_threadpool(_transcribe_bytes, raw, suffix)

        print("Transcript:")
        print(transcript if transcript else "(empty)")
        print("")

        if not transcript.strip():
            print("No transcript -> skip LLM.\nReady to talk.\n")
            return {
                "text": "",
                "llm_text": "",
                "ready": True,
                "station_attempt_id": station_attempt_id,
            }

        base = str(request.base_url).rstrip("/")
        chat_url = f"{base}/api/attempts/station/{station_attempt_id}/chat"

        timeout = httpx.Timeout(
            timeout=CHAT_TIMEOUT_S,
            connect=min(CHAT_TIMEOUT_S, 10.0),
        )

        async with httpx.AsyncClient(timeout=timeout) as client:
            r = await client.post(
                chat_url,
                headers={
                    "X-User-Id": str(user_id),
                    "Content-Type": "application/json",
                },
                json={"text": transcript},
            )

        if r.status_code >= 400:
            detail_text = r.text
            try:
                err_json = r.json()
                if isinstance(err_json, dict) and "detail" in err_json:
                    detail_text = str(err_json["detail"])
            except Exception:
                pass

            raise HTTPException(status_code=r.status_code, detail=detail_text)

        data = r.json()
        llm_text = _extract_llm_text(data)

        print("LLM response:")
        print(llm_text if llm_text else "(empty)")
        print("\nReady to talk.\n")

        return {
            "text": transcript,
            "llm_text": llm_text,
            "ready": True,
            "station_attempt_id": station_attempt_id,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("STT+CHAT failed: %s", e)
        raise HTTPException(status_code=500, detail=f"STT+CHAT failed: {e}")