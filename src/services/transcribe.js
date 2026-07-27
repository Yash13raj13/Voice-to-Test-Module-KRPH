import speech from "@google-cloud/speech";
import { convertToWav16k, cleanupTempFile } from "../utils/convertAudio.js";
import { uploadToGCS, deleteFromGCS } from "../utils/gcsUpload.js";

const client = new speech.SpeechClient();

/**
 * Transcribes an audio file with speaker diarization and support for
 * mixed English/Hindi calls (via alternativeLanguageCodes).
 *
 * Handles any input format (mp3, m4a, etc.) by converting to LINEAR16
 * WAV first, and any length by uploading to Google Cloud Storage before
 * running long-running recognition.
 *
 * @param {string} audioPath - local path to the source audio file
 * @returns {Promise<{utterances: {speaker: number, text: string}[], text: string, languageCodes: string[]}>}
 */
export async function transcribeAudio(audioPath) {
  console.log("Original file:", audioPath);

  const wavPath = await convertToWav16k(audioPath);
  console.log("Converted file path:", wavPath);

  let gcsUri;

  try {
    gcsUri = await uploadToGCS(wavPath);
    console.log("Uploaded to GCS:", gcsUri);

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
      model: "default", // phone_call model doesn't support alternativeLanguageCodes
    };

    const request = {
      audio: { uri: gcsUri },
      config,
    };

    const [operation] = await client.longRunningRecognize(request);
    const [response] = await operation.promise();

    const result = buildUtterances(response);
    console.log("Unique speaker tags found:", [...new Set(result.utterances.map((u) => u.speaker))]);
    console.log("Utterance count:", result.utterances.length);

    return result;
  } finally {
    cleanupTempFile(wavPath);
    if (gcsUri) await deleteFromGCS(gcsUri);
  }
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