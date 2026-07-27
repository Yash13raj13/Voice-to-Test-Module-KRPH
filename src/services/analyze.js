import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-3.5-flash" });

/**
 * Scores each utterance's sentiment via Gemini (handles English, Hindi,
 * and mixed-language text natively), then rolls that up into a
 * per-speaker tone summary and a handling score for the agent.
 *
 * Assumption (to revisit): the first speaker to talk is treated as the
 * agent, since that's the common pattern for call center recordings.
 * Swap this out once we know how the org's data tags agent vs. caller.
 *
 * @param {{speaker: number, text: string}[]} utterances
 */
export async function analyzeCall(utterances) {
  if (utterances.length === 0) {
    return {
      agentSpeakerLabel: null,
      perSpeaker: {},
      overallTone: "unknown",
      handlingScore: null,
      endedOnNegative: null,
      note: "No utterances to analyze - check transcription output.",
    };
  }

  const sentiments = await scoreSentiments(utterances);
  utterances.forEach((u, i) => (u.sentiment = sentiments[i]));

  const agentSpeaker = utterances[0].speaker;
  const perSpeaker = {};

  for (const u of utterances) {
    if (!perSpeaker[u.speaker]) {
      perSpeaker[u.speaker] = {
        role: u.speaker === agentSpeaker ? "agent" : "caller",
        utteranceCount: 0,
        sentimentCounts: { POSITIVE: 0, NEUTRAL: 0, NEGATIVE: 0 },
      };
    }
    perSpeaker[u.speaker].utteranceCount += 1;
    perSpeaker[u.speaker].sentimentCounts[u.sentiment] += 1;
  }

  const agentCounts = perSpeaker[agentSpeaker].sentimentCounts;
  const totalAgent = perSpeaker[agentSpeaker].utteranceCount;

  const handlingScore = totalAgent
    ? Math.round(((agentCounts.POSITIVE + agentCounts.NEUTRAL) / totalAgent) * 100)
    : null;

  const overallTone =
    agentCounts.NEGATIVE > agentCounts.POSITIVE
      ? "negative"
      : agentCounts.POSITIVE > agentCounts.NEGATIVE
      ? "positive"
      : "neutral";

  const lastUtterance = utterances[utterances.length - 1];
  const endedOnNegative = lastUtterance.sentiment === "NEGATIVE";

  return {
    agentSpeakerLabel: agentSpeaker,
    perSpeaker,
    overallTone,
    handlingScore,
    endedOnNegative,
  };
}

/**
 * Sends all utterances to Gemini in a single request and gets back a
 * sentiment label per utterance - one API call per call recording.
 */
async function scoreSentiments(utterances) {
  const numbered = utterances
    .map((u, i) => `${i}. [Speaker ${u.speaker}] ${u.text}`)
    .join("\n");

  const prompt = `Classify the sentiment of each numbered utterance below as exactly one of POSITIVE, NEUTRAL, or NEGATIVE. The utterances may be in English, Hindi, or mixed. Respond with ONLY a JSON array of strings (no other text), one sentiment per utterance, in the same order.

${numbered}`;

  const result = await model.generateContent(prompt);
  const raw = result.response.text().trim();
  const cleaned = raw.replace(/^```json\s*|\s*```$/g, "");
  return JSON.parse(cleaned);
}