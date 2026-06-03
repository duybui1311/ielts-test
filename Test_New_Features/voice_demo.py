import os
os.environ["KMP_DUPLICATE_LIB_OK"] = "TRUE"

import sys
import time
import queue
import tempfile
import traceback
import threading
import faulthandler

import numpy as np
import sounddevice as sd
import scipy.io.wavfile as wav
import pyttsx3
from pynput import keyboard as pynput_keyboard
from faster_whisper import WhisperModel


def install_better_tracebacks():
    faulthandler.enable(all_threads=True)

    def _excepthook(exctype, value, tb):
        traceback.print_exception(exctype, value, tb)

    sys.excepthook = _excepthook

    def _thread_excepthook(args):
        traceback.print_exception(args.exc_type, args.exc_value, args.exc_traceback)

    try:
        threading.excepthook = _thread_excepthook
    except Exception:
        pass


install_better_tracebacks()


FS = 16000
CHANNELS = 1
MIN_SECONDS = 0.35

MODEL_SIZE = "base"
DEVICE = "cpu"
COMPUTE_TYPE = "int8"
LANGUAGE = "en"

PREFERRED_INPUT_DEVICE = None


def pick_input_device(preferred=None):
    devs = sd.query_devices()

    if preferred is not None:
        try:
            idx = int(preferred)
            d = devs[idx]
            if d.get("max_input_channels", 0) >= 1:
                return idx
        except Exception:
            pass

    try:
        default_in = sd.default.device[0]
        if default_in is not None and int(default_in) >= 0:
            d = devs[int(default_in)]
            if d.get("max_input_channels", 0) >= 1:
                return int(default_in)
    except Exception:
        pass

    for i, d in enumerate(devs):
        if d.get("max_input_channels", 0) >= 1:
            return i

    return None


def print_audio_devices(chosen_idx):
    devs = sd.query_devices()
    print("Audio devices:")
    for i, d in enumerate(devs):
        mi = d.get("max_input_channels", 0)
        mo = d.get("max_output_channels", 0)
        if mi > 0 or mo > 0:
            mark = " (selected)" if (chosen_idx is not None and i == chosen_idx) else ""
            print(f"  [{i}] in={mi} out={mo} name={d['name']}{mark}")
    print("")


print(f"Loading faster-whisper model: {MODEL_SIZE} ({DEVICE}, {COMPUTE_TYPE})")
model = WhisperModel(MODEL_SIZE, device=DEVICE, compute_type=COMPUTE_TYPE)
print("Model loaded")
print("")

tts = pyttsx3.init()

print("PRESS SPACE TO START TALKING")
print("PRESS SPACE AGAIN TO STOP AND TRANSCRIBE")
print("CTRL+C TO EXIT")

recording = threading.Event()
audio_q = queue.Queue()
_space_down = False

def on_press(key):
    global _space_down
    try:
        if key == pynput_keyboard.Key.space and not _space_down:
            _space_down = True
            if recording.is_set():
                recording.clear()
            else:
                recording.set()
    except Exception:
        pass


def on_release(key):
    global _space_down
    try:
        if key == pynput_keyboard.Key.space:
            _space_down = False
    except Exception:
        pass


def audio_callback(indata, frames, time_info, status):
    if recording.is_set():
        audio_q.put(indata.copy())


def flush_queue():
    while not audio_q.empty():
        try:
            audio_q.get_nowait()
        except queue.Empty:
            break


def collect_audio_toggle():
    flush_queue()

    print("Ready. Press SPACE to start recording.")
    while not recording.is_set():
        time.sleep(0.01)

    print("Recording. Press SPACE again to stop.")
    while recording.is_set():
        time.sleep(0.01)

    time.sleep(0.08)

    chunks = []
    while not audio_q.empty():
        chunks.append(audio_q.get())

    if not chunks:
        print("No audio captured")
        print("")
        return None

    audio = np.concatenate(chunks, axis=0).reshape(-1).astype(np.float32)
    dur = len(audio) / FS
    print(f"Stopped. Duration: {dur:.2f}s")

    if dur < MIN_SECONDS:
        print("Too short. Try again")
        print("")
        return None

    maxv = float(np.max(np.abs(audio)) + 1e-9)
    audio = audio / maxv
    return audio


def stt_faster_whisper(audio_np):
    audio_i16 = np.clip(audio_np * 32767.0, -32768, 32767).astype(np.int16)

    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
        wav.write(f.name, FS, audio_i16)
        segments, info = model.transcribe(
            f.name,
            language=LANGUAGE,
            vad_filter=True,
            beam_size=5
        )

    parts = []
    for seg in segments:
        parts.append(seg.text)

    return ("".join(parts)).strip()


def speak(text):
    tts.say(text)
    tts.runAndWait()


def main():
    print("Step 1: selecting input device")
    chosen_in = pick_input_device(PREFERRED_INPUT_DEVICE)
    print_audio_devices(chosen_in)

    print("Step 2: starting keyboard listener")
    listener = pynput_keyboard.Listener(on_press=on_press, on_release=on_release)
    listener.start()
    print("Keyboard listener started")
    print("")

    print("Step 3: opening microphone stream")
    with sd.InputStream(
        samplerate=FS,
        channels=CHANNELS,
        device=chosen_in,
        dtype="float32",
        callback=audio_callback,
        blocksize=0,
    ):
        print("Microphone stream opened")
        print("")

        while True:
            audio = collect_audio_toggle()
            if audio is None:
                continue

            print("Transcribing...")
            text = stt_faster_whisper(audio)

            print("Transcript:")
            print(text if text else "(empty)")
            print("")

            hardcoded = "Ok, I got it. Thank you."
            print("Hardcoded response:")
            print(hardcoded)
            print("")

            print("Speaking hardcoded response...")
            speak(hardcoded)
            print("")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("Exit")
    except Exception:
        print("Fatal error:")
        traceback.print_exc()
