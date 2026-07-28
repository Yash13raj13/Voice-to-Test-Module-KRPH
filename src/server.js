import "dotenv/config";
import express from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import { processCall } from "./index.js";
import { saveReport, listReports, getReport } from "./utils/store.js";

const app = express();
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Voice analysis API listening on port ${PORT}`));