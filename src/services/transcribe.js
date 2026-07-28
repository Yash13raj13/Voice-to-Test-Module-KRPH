import { SarvamAIClient } from "sarvamai";
import fs from "fs/promises";
import path from "path";

const client = new SarvamAIClient({
  apiSubscriptionKey: process.env.SARVAM_API_KEY,
});

/**
 * Transcribes an audio file with speaker diarization via Sarvam AI's
 * Batch Speech-to-Text API (model: saaras:v3), which is built for
 * Indian-language call audio and Hindi/English code-mixing.
 *
 * Replaces the previous Google Cloud Speech-to-Text V2 implementation,
 * which could not reliably separate speakers on Hindi audio (confirmed
 * in output/1785223976691-91280119.status.json - the whole call
 * collapsed into a single speaker).
 *
 * NOTE ON JS SDK METHOD NAMES: Sarvam's docs show the batch job workflow
 * (create_job / upload_files / start / wait_until_complete /
 * get_file_results / download_outputs) using their Python SDK. The npm
 * package "sarvamai" is generated from the same spec via Fern and should
 * mirror this in camelCase, but I could not fully confirm the JS names
 * from their docs site. After `npm install`, check node_modules/sarvamai's
 * TypeScript types (or your editor's autocomplete on
 * `client.speechToTextJob`) and adjust the calls below if they differ.
 *
 * @param {string} audioPath - local path to the source audio file
 * @returns {Promise<{utterances: {speaker: string, text: string}[], text: string, languageCodes: string[]}>}
 */
export async function transcribeAudio(audioPath) {
  console.log("Original file:", audioPath);

  const job = await client.speechToTextJob.createJob({
    model: "saaras:v3",
    mode: "transcribe",
    // languageCode intentionally omitted to let Sarvam auto-detect - useful
    // for mixed Hindi/English calls. Pass e.g. languageCode: "hi-IN" if you
    // want to force a single language instead - worth A/B testing both
    // against real sample calls before deciding.
    withDiarization: true,
    numSpeakers: 2, // agent + one caller; bump for multi-party/escalation calls
  });

  await job.uploadFiles({ filePaths: [audioPath] });
  await job.start();
  await job.waitUntilComplete();

  const fileResults = await job.getFileResults();
  if (fileResults.failed?.length) {
    const failure = fileResults.failed[0];
    throw new Error(`Sarvam job failed for ${audioPath}: ${failure.errorMessage}`);
  }

  const outputDir = "./output/raw";
  await fs.mkdir(outputDir, { recursive: true });
  await job.downloadOutputs({ outputDir });

  // Downloaded JSON shape (per Sarvam docs):
  // { request_id, transcript, timestamps: {...}, diarized_transcript: { entries: [...] }, language_code }
  const outputFileName = fileResults.successful[0].fileName; // e.g. "0.json"
  const raw = JSON.parse(await fs.readFile(path.join(outputDir, outputFileName), "utf-8"));

  const entries = raw.diarized_transcript?.entries ?? [];
  console.log("Speaker turns found:", entries.length);
  console.log("Unique speaker IDs:", [...new Set(entries.map((e) => e.speaker_id))]);

  const utterances = entries.map((e) => ({
    speaker: e.speaker_id, // e.g. "0", "1" - matches the {speaker, text} shape analyze.js/formatTranscript.js already expect
    text: e.transcript,
  }));

  return {
    utterances,
    text: raw.transcript || "",
    languageCodes: raw.language_code ? [raw.language_code] : [],
  };
}