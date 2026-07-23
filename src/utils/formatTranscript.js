/**
 * Formats speaker-labeled utterances into a readable plain text transcript.
 * @param {{speaker: number, text: string}[]} utterances
 */
export function formatTranscriptText(utterances) {
  if (!utterances || utterances.length === 0) return "";

  return utterances
    .map((u) => `Speaker ${u.speaker}: ${u.text}`)
    .join("\n\n");
}