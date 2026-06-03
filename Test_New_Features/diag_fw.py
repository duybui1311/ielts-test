import traceback

print("1) Importing pynput...")
try:
    from pynput import keyboard as pynput_keyboard
    print("   ✅ pynput imported")
except Exception:
    print("   ❌ pynput import failed")
    print(traceback.format_exc())

print("\n2) Listing sound devices...")
try:
    import sounddevice as sd
    print(sd.query_devices())
    print("   ✅ sounddevice ok")
except Exception:
    print("   ❌ sounddevice failed")
    print(traceback.format_exc())

print("\n3) Opening microphone stream for 1 second...")
try:
    import sounddevice as sd
    import time

    def cb(indata, frames, time_info, status):
        pass

    with sd.InputStream(samplerate=16000, channels=1, callback=cb):
        time.sleep(1.0)

    print("   ✅ microphone stream opened successfully")
except Exception:
    print("   ❌ microphone stream failed")
    print(traceback.format_exc())

print("\n4) Starting a pynput listener for 2 seconds...")
try:
    import time
    from pynput import keyboard as pynput_keyboard

    def on_press(key): pass
    def on_release(key): pass

    listener = pynput_keyboard.Listener(on_press=on_press, on_release=on_release)
    listener.start()
    time.sleep(2.0)
    listener.stop()

    print("   ✅ listener started/stopped successfully")
except Exception:
    print("   ❌ listener failed")
    print(traceback.format_exc())

print("\nDONE")
