import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

/**
 * Scores each utterance's sentiment via Claude (handles English, Hindi,
 * and mixed-language text natively, unlike Google's Natural Language API
 * which doesn't support Hindi for sentiment analysis), then rolls that
 * up into a per-speaker tone summary and a handling score for the agent.
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
 * Sends all utterances to Claude in a single request and gets back a
 * sentiment label per utterance - one API call per call recording,
 * not one per utterance.
 */
async function scoreSentiments(utterances) {
  const numbered = utterances
    .map((u, i) => `${i}. [Speaker ${u.speaker}] ${u.text}`)
    .join("\n");

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2000,
    messages: [
      {
        role: "user",
        content: `Classify the sentiment of each numbered utterance below as exactly one of POSITIVE, NEUTRAL, or NEGATIVE. The utterances may be in English, Hindi, or mixed. Respond with ONLY a JSON array of strings (no other text), one sentiment per utterance, in the same order.

${numbered}`,
      },
    ],
  });

  const raw = message.content[0].text.trim();
  const cleaned = raw.replace(/^```json\s*|\s*```$/g, "");
  return JSON.parse(cleaned);
}