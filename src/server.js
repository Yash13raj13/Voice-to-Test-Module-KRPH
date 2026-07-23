import "dotenv/config";
import express from "express";
import multer from "multer";
import fs from "fs";
import { processCall } from "./index.js";

const app = express();
app.use(express.static("public"));

const upload = multer({ dest: "uploads/" });

app.post("/calls", upload.single("audio"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No audio file provided (field name: 'audio')" });
  }

  try {
    const { transcriptText, statusReport } = await processCall(req.file.path);
    res.json({ transcriptText, statusReport });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  } finally {
    fs.unlink(req.file.path, () => {});
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Voice analysis API listening on port ${PORT}`));