import "dotenv/config";
import express from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import http from "http";
import { WebSocketServer, WebSocket } from "ws";
import { processCall } from "./index.js";
import { saveReport, listReports, getReport } from "./utils/store.js";

const app = express();

app.get("/", (req, res) => {
  res.sendFile(path.resolve("public/landing.html"));
});

app.use(express.static("public"));

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || ".mp3";
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  },
});

const upload = multer({ storage });

app.post("/calls", upload.single("audio"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No audio file provided (field name: 'audio')" });
  }

  const ticketDescription = req.body.ticketDescription || "";

  try {
    const { transcriptText, statusReport } = await processCall(req.file.path, ticketDescription);

    const id = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
    const record = {
      id,
      fileName: req.file.originalname,
      createdAt: new Date().toISOString(),
      transcriptText,
      ...statusReport,
    };
    saveReport(record);

    res.json({ id, transcriptText, statusReport });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  } finally {
    fs.unlink(req.file.path, () => {});
  }
});

app.get("/api/reports", (req, res) => {
  res.json(listReports());
});

app.get("/api/reports/:id", (req, res) => {
  const record = getReport(req.params.id);
  if (!record) return res.status(404).json({ error: "Report not found" });
  res.json(record);
});

// --- Live voice chat: proxies browser audio to Gemini Live API ---
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/voice-chat" });

const GEMINI_LIVE_URL = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${process.env.GEMINI_API_KEY}`;

const LIVE_MODEL = "models/gemini-3.1-flash-live-preview";

// Pinned so the assistant's vocal identity stays consistent across
// sessions/reconnects - this does NOT restrict which language it speaks,
// only which voice character speaks it. Native audio models still switch
// languages naturally per the systemInstruction below. Try a different
// name from Google's 30-voice list if this one doesn't fit - all of them
// work across all supported languages: https://ai.google.dev/gemini-api/docs/live-guide
const VOICE_NAME = "Charon";

wss.on("connection", (clientWs) => {
  console.log("[voice-chat] Browser client connected.");
  const geminiWs = new WebSocket(GEMINI_LIVE_URL);

  geminiWs.on("open", () => {
    console.log("[voice-chat] Connected to Gemini Live API, sending setup...");
    geminiWs.send(JSON.stringify({
      setup: {
        model: LIVE_MODEL,
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: VOICE_NAME },
            },
          },
        },
        systemInstruction: {
          parts: [{
            text: "You are the voice assistant for KrishiKalyan, an insurance helpline serving farmers with crop and corporate insurance. Speak naturally in whichever language the caller uses - Hindi, English, or a mix. Keep responses short, warm, and clear, like a helpful call center agent. Help with questions about crop insurance, claims, and policies.",
          }],
        },
        inputAudioTranscription: {},
        outputAudioTranscription: {},
      },
    }));
  });

  geminiWs.on("message", (data) => {
    // Relay raw Gemini messages straight to the browser.
    if (clientWs.readyState === clientWs.OPEN) {
      clientWs.send(data.toString());
    }
  });

  geminiWs.on("error", (err) => {
    console.error("[voice-chat] Gemini WebSocket error:", err.message);
    clientWs.send(JSON.stringify({ error: `Gemini connection error: ${err.message}` }));
  });

  geminiWs.on("close", (code, reason) => {
    console.log("[voice-chat] Gemini WebSocket closed:", code, reason.toString());
    clientWs.close();
  });

  clientWs.on("message", (data) => {
    // Browser sends { type: "audio", data: base64Pcm16 }
    if (geminiWs.readyState !== geminiWs.OPEN) return;
    try {
      const msg = JSON.parse(data.toString());
      if (msg.type === "audio") {
        geminiWs.send(JSON.stringify({
          realtimeInput: {
            audio: { data: msg.data, mimeType: "audio/pcm;rate=16000" },
          },
        }));
      }
    } catch (err) {
      console.error("[voice-chat] Failed to relay client message:", err.message);
    }
  });

  clientWs.on("close", () => {
    console.log("[voice-chat] Browser client disconnected.");
    geminiWs.close();
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Voice analysis API listening on port ${PORT}`));