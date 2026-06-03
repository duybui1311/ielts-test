import os
os.environ["CUDA_VISIBLE_DEVICES"] = ""  # ép không dùng GPU

import faulthandler
faulthandler.enable()

print("Step 1: import whisper OK")

import whisper
print("Step 2: whisper imported")

print("Step 3: loading model on CPU...")
model = whisper.load_model("base", device="cpu")  # QUAN TRỌNG
print("Step 4: model loaded OK")

print("DONE")
