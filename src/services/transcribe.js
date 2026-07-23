import speech from "@google-cloud/speech";
import fs from "fs";

const client = new speech.SpeechClient();

/**
 * Transcribes an audio file with speaker diarization and support for
 * mixed English/Hindi calls (via alternativeLanguageCodes).
 *
 * NOTE: audio must be LINEAR16 (WAV, uncompressed) at the given sample
 * rate for this config. If the org's site delivers mp3/other formats,
 * add a conversion step (e.g. ffmpeg) before calling this function.
 * For audio longer than ~1 minute, Google requires the file to be in
 * Google Cloud Storage rather than sent inline - swap `content` for
 * `uri: "gs://your-bucket/file.wav"` once that's wired up.
 *
 * @param {string} audioPath - local path to a LINEAR16 WAV file
 * @returns {Promise<{utterances: {speaker: number, text: string}[], text: string, languageCodes: string[]}>}
 */
export async function transcribeAudio(audioPath) {
  const audioBytes = fs.readFileSync(audioPath).toString("base64");

  const config = {
    encoding: "LINEAR16",
    sampleRateHertz: 16000,
    languageCode: "en-IN", // primary language
    alternativeLanguageCodes: ["hi-IN"], // handles Hindi / code-switching
    enableAutomaticPunctuation: true,
    diarizationConfig: {
      enableSpeakerDiarization: true, // required: separates agent vs. caller
      minSpeakerCount: 2,
      maxSpeakerCount: 2,
    },
    model: "phone_call", // tuned for call center audio
  };

  const request = {
    audio: { content: audioBytes },
    config,
  };

  const [operation] = await client.longRunningRecognize(request);
  const [response] = await operation.promise();

  return buildUtterances(response);
}

/**
 * Google returns word-level speaker tags rather than ready-made
 * utterances, so we group consecutive same-speaker words into turns.
 */
function buildUtterances(response) {
  const results = response.results || [];
  if (results.length === 0) {
    return { utterances: [], text: "", languageCodes: [] };
  }

  const lastResult = results[results.length - 1];
  const words = lastResult.alternatives[0].words || [];

  const utterances = [];
  let current = null;

  for (const w of words) {
    const speaker = w.speakerTag;
    if (!current || current.speaker !== speaker) {
      if (current) utterances.push(current);
      current = { speaker, text: w.word };
    } else {
      current.text += ` ${w.word}`;
    }
  }
  if (current) utterances.push(current);

  const text = results.map((r) => r.alternatives[0].transcript).join(" ");
  const languageCodes = [...new Set(results.map((r) => r.languageCode).filter(Boolean))];

  return { utterances, text, languageCodes };
}
