import "dotenv/config";
import fs from "fs";
import path from "path";
import { transcribeAudio } from "./services/transcribe.js";
import { analyzeCall } from "./services/analyze.js";
import { formatTranscriptText } from "./utils/formatTranscript.js";

const OUTPUT_DIR = "./output";

async function processCall(audioPath) {
  console.log(`Transcribing: ${audioPath}`);
  const { utterances, languageCodes } = await transcribeAudio(audioPath);

  console.log("Analyzing tone & handling...");
  const analysis = await analyzeCall(utterances);

  const baseName = path.parse(audioPath).name;
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const transcriptText = formatTranscriptText(utterances);
  fs.writeFileSync(path.join(OUTPUT_DIR, `${baseName}.txt`), transcriptText);

  const statusReport = {
    audioFile: audioPath,
    detectedLanguages: languageCodes,
    ...analysis,
  };
  fs.writeFileSync(
    path.join(OUTPUT_DIR, `${baseName}.status.json`),
    JSON.stringify(statusReport, null, 2)
  );

  console.log(`Done. See output/${baseName}.txt and output/${baseName}.status.json`);
  return { transcriptText, statusReport };
}

// Run directly: node src/index.js <path-to-audio-file>
const audioArg = process.argv[2];
if (audioArg) {
  processCall(audioArg).catch((err) => {
    console.error("Failed to process call:", err.message);
    process.exit(1);
  });
}

export { processCall };