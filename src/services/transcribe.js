import { SarvamAIClient } from "sarvamai";
import fs from "fs";
import os from "os";
import path from "path";

const client = new SarvamAIClient({ apiSubscriptionKey: process.env.SARVAM_API_KEY });

/**
 * Transcribes an audio file with speaker diarization via Sarvam AI's
 * Batch Speech-to-Text API - chosen because Google's diarization proved
 * unreliable for Hindi/mixed audio across both STT API versions.
 *
 * Sarvam handles file upload to its own storage internally, and
 * auto-detects MP3/WAV formats, so no ffmpeg conversion or GCS upload
 * is needed here anymore.
 *
 * @param {string} audioPath - local path to the source audio file
 * @returns {Promise<{utterances: {speaker: string, text: string}[], text: string, languageCodes: string[]}>}
 */
export async function transcribeAudio(audioPath) {
  console.log("Original file:", audioPath);

  const job = await client.speechToTextJob.createJob({
    model: "saaras:v3",
    mode: "transcribe",
    languageCode: "hi-IN", // TEMPORARY: Hindi only, to confirm diarization works before adding English/mixed back
    withDiarization: true,
    numSpeakers: 2,
  });
  console.log("Job created. Available job methods:", Object.getOwnPropertyNames(Object.getPrototypeOf(job)));

  await job.uploadFiles([audioPath]);
  console.log("File uploaded to Sarvam.");

  await job.start();
  console.log("Job started, waiting for completion...");

  await job.waitUntilComplete();
  console.log("Job complete.");

  const fileResults = await job.getFileResults();
  console.log("Successful files:", fileResults.successful?.length, "Failed files:", fileResults.failed?.length);
  console.log("Raw fileResults object:", JSON.stringify(fileResults, null, 2));

  if (!fileResults.successful || fileResults.successful.length === 0) {
    const reason = fileResults.failed?.[0]?.errorMessage || fileResults.failed?.[0]?.error_message || "Unknown error";
    throw new Error(`Sarvam transcription failed: ${reason}`);
  }

  const outputDir = path.join(os.tmpdir(), `sarvam-${Date.now()}`);
  await job.downloadOutputs(outputDir);
  console.log("Outputs downloaded to:", outputDir);

  const jsonFiles = fs.readdirSync(outputDir).filter((f) => f.endsWith(".json"));
  console.log("Downloaded JSON files:", jsonFiles);

  const resultData = JSON.parse(fs.readFileSync(path.join(outputDir, jsonFiles[0]), "utf-8"));
  console.log("Raw Sarvam result keys:", Object.keys(resultData));

  return buildUtterances(resultData);
}

/**
 * Sarvam's diarized_transcript.entries already comes pre-split by
 * speaker (unlike Google's word-level tags), so no grouping logic needed.
 */
function buildUtterances(resultData) {
  const entries = resultData.diarized_transcript?.entries || [];
  console.log("Diarized entries found:", entries.length);
  console.log("Unique speaker ids:", [...new Set(entries.map((e) => e.speaker_id))]);

  // Map Sarvam's raw speaker ids (e.g. "0", "1") to friendly 1-indexed
  // labels, in the order each speaker first talks.
  const speakerMap = new Map();
  let nextSpeakerNum = 1;

  const utterances = entries.map((e) => {
    if (!speakerMap.has(e.speaker_id)) {
      speakerMap.set(e.speaker_id, nextSpeakerNum++);
    }
    return {
      speaker: speakerMap.get(e.speaker_id),
      text: e.transcript,
    };
  });

  return {
    utterances,
    text: resultData.transcript || "",
    languageCodes: resultData.language_code ? [resultData.language_code] : [],
  };
}