import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-3.5-flash" });

/**
 * Compares the call transcript against a ticket/complaint description
 * (currently entered manually - later this can be fetched automatically
 * from the org's site once that integration exists) and judges whether
 * the call actually addressed that issue.
 *
 * @param {string} transcriptText - the full speaker-labeled transcript
 * @param {string} ticketDescription - the complaint/ticket text to check against
 * @returns {Promise<{verdict: string, confidence: number, explanation: string}>}
 */
export async function auditAgainstTicket(transcriptText, ticketDescription) {
  if (!ticketDescription || !ticketDescription.trim()) {
    return {
      verdict: "not_checked",
      confidence: null,
      explanation: "No ticket description was provided for this call.",
    };
  }

  if (!transcriptText || !transcriptText.trim()) {
    return {
      verdict: "not_checked",
      confidence: null,
      explanation: "No transcript was available to check against the ticket.",
    };
  }

  const prompt = `You are auditing a customer service call for an insurance organization that serves farmers.

Below is a TICKET DESCRIPTION (the issue the customer originally reported) and a CALL TRANSCRIPT (what was actually said on a follow-up or support call). The transcript may be in English, Hindi, or mixed.

Judge whether the call transcript actually addressed the issue described in the ticket.

Respond with ONLY a JSON object (no other text, no markdown fences) in this exact shape:
{"verdict": "addressed" | "partially_addressed" | "not_addressed", "confidence": <number 0-100>, "explanation": "<one or two sentences explaining your judgment>"}

TICKET DESCRIPTION:
${ticketDescription}

CALL TRANSCRIPT:
${transcriptText}`;

  const result = await model.generateContent(prompt);
  const raw = result.response.text().trim();
  const cleaned = raw.replace(/^```json\s*|\s*```$/g, "");

  try {
    return JSON.parse(cleaned);
  } catch {
    return {
      verdict: "not_checked",
      confidence: null,
      explanation: "Could not parse the audit result - try again.",
    };
  }
}