import "dotenv/config";
import fs from "fs";
import path from "path";
import { transcribeAudio } from "./services/transcribe.js";
import { analyzeCall } from "./services/analyze.js";
import { auditAgainstTicket } from "./services/auditMatch.js";
import { formatTranscriptText } from "./utils/formatTranscript.js";

const OUTPUT_DIR = "./output";

/**
 * @param {string} audioPath
 * @param {string} [ticketDescription] - optional complaint/ticket text to audit the call against
 */
async function processCall(audioPath, ticketDescription = "") {
  console.log(`Transcribing: ${audioPath}`);
  const { utterances, languageCodes } = await transcribeAudio(audioPath);

  console.log("Analyzing tone & handling...");
  const analysis = await analyzeCall(utterances);

  const transcriptText = formatTranscriptText(utterances);

  console.log("Auditing against ticket description...");
  const auditResult = await auditAgainstTicket(transcriptText, ticketDescription);

  const baseName = path.parse(audioPath).name;
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  fs.writeFileSync(path.join(OUTPUT_DIR, `${baseName}.txt`), transcriptText);

  const statusReport = {
    audioFile: audioPath,
    detectedLanguages: languageCodes,
    ...analysis,
    ticketDescription,
    audit: auditResult,
  };
  fs.writeFileSync(
    path.join(OUTPUT_DIR, `${baseName}.status.json`),
    JSON.stringify(statusReport, null, 2)
  );

  console.log(`Done. See output/${baseName}.txt and output/${baseName}.status.json`);
  return { transcriptText, statusReport };
}

// Run directly: node src/index.js <path-to-audio-file> ["ticket description"]
const audioArg = process.argv[2];
const ticketArg = process.argv[3] || "";
if (audioArg) {
  processCall(audioArg, ticketArg).catch((err) => {
    console.error("Failed to process call:", err.message);
    process.exit(1);
  });
}

export { processCall };