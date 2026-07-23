import language from "@google-cloud/language";

const languageClient = new language.LanguageServiceClient();

/**
 * Scores each utterance's sentiment via Google Cloud Natural Language,
 * then rolls that up into a per-speaker tone summary and a simple
 * call-handling score for the agent.
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

  const agentSpeaker = utterances[0].speaker;
  const perSpeaker = {};

  for (const u of utterances) {
    const [result] = await languageClient.analyzeSentiment({
      document: { content: u.text, type: "PLAIN_TEXT" },
    });

    const score = result.documentSentiment.score; // -1.0 to 1.0
    const sentiment = score > 0.25 ? "POSITIVE" : score < -0.25 ? "NEGATIVE" : "NEUTRAL";
    u.sentiment = sentiment;

    if (!perSpeaker[u.speaker]) {
      perSpeaker[u.speaker] = {
        role: u.speaker === agentSpeaker ? "agent" : "caller",
        utteranceCount: 0,
        sentimentCounts: { POSITIVE: 0, NEUTRAL: 0, NEGATIVE: 0 },
      };
    }
    perSpeaker[u.speaker].utteranceCount += 1;
    perSpeaker[u.speaker].sentimentCounts[sentiment] += 1;
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
