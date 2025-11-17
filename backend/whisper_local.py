import sys
import whisper

def main():
    if len(sys.argv) < 2:
        print("")
        return

    audio_path = sys.argv[1]

    # "base" is a good balance between speed and accuracy
    model = whisper.load_model("base")
    result = model.transcribe(audio_path)

    text = result.get("text", "").strip()
    print(text)

if __name__ == "__main__":
    main()
