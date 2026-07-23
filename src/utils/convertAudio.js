import ffmpeg from "fluent-ffmpeg";
import ffmpegPath from "ffmpeg-static";
import path from "path";
import os from "os";
import fs from "fs";

ffmpeg.setFfmpegPath(ffmpegPath);

/**
 * Converts any input audio file (mp3, m4a, ogg, etc.) into a mono,
 * 16kHz, LINEAR16 WAV file - the format Google Cloud Speech-to-Text
 * expects for the diarization config used in transcribe.js.
 *
 * @param {string} inputPath - path to the source audio file
 * @returns {Promise<string>} path to the converted WAV file (in a temp dir)
 */
export function convertToWav16k(inputPath) {
  const outputPath = path.join(
    os.tmpdir(),
    `${path.parse(inputPath).name}-${Date.now()}.wav`
  );

  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .audioChannels(1)
      .audioFrequency(16000)
      .audioCodec("pcm_s16le") // LINEAR16
      .format("wav")
      .on("end", () => resolve(outputPath))
      .on("error", (err) => reject(new Error(`Audio conversion failed: ${err.message}`)))
      .save(outputPath);
  });
}

/** Deletes a temp file, ignoring errors if it's already gone. */
export function cleanupTempFile(filePath) {
  fs.unlink(filePath, () => {});
}