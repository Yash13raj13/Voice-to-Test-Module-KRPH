# Voice analysis module

Converts agent call audio into text (with speaker diarization) and produces
a tone/handling status report. Built for calls that may be in English,
Hindi, or mixed. Uses Google Cloud Speech-to-Text for transcription and
Google Cloud Natural Language for sentiment scoring.

## Setup

1. Enable the **Cloud Speech-to-Text API** and **Cloud Natural Language API**
   on your Google Cloud project.
2. Create a service account with the "Cloud Speech Client" and "Cloud
   Natural Language API User" roles, and download its JSON key.
3. Install dependencies and configure:

```bash
npm install
cp .env.example .env
# point GOOGLE_APPLICATION_CREDENTIALS in .env to your downloaded key file
```

## Usage

```bash
npm run process -- path/to/call.wav
```

Audio must be **LINEAR16 (uncompressed WAV)** at 16kHz for the current
config - if the org's site delivers mp3/other formats, add a conversion
step (e.g. ffmpeg) before transcription. Files longer than ~1 minute need
to be uploaded to Google Cloud Storage first (see note in `transcribe.js`).

This will:
1. Upload the audio and transcribe it with speaker diarization and
   English/Hindi language detection
2. Score each utterance's sentiment and roll it into a per-speaker tone
   summary and a handling score for the agent
3. Write `output/<filename>.txt` (speaker-labeled transcript)
4. Write `output/<filename>.status.json` (tone + handling summary)

## Project structure

```
src/
  index.js                  # entry point - wires everything together
  services/
    transcribe.js           # Google Cloud Speech-to-Text + diarization
    analyze.js               # tone & handling scoring via Cloud Natural Language
  utils/
    formatTranscript.js      # formats transcript as readable text
```

## Next steps

- Add an audio conversion step (ffmpeg) if incoming files aren't WAV/LINEAR16
- Add Google Cloud Storage upload for calls longer than ~1 minute
- Wrap `processCall()` in an Express route so the org's site can POST
  an audio file/URL and get the transcript + status back
- Replace the "first speaker = agent" assumption in `analyze.js` with a
  real agent/caller mapping once that's available from the org's data
- Add batch processing (e.g. a queue) if calls need to be processed in bulk
