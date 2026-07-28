import fs from "fs";
import path from "path";

const STORE_PATH = path.join("data", "reports.json");

function ensureStore() {
  if (!fs.existsSync("data")) fs.mkdirSync("data");
  if (!fs.existsSync(STORE_PATH)) fs.writeFileSync(STORE_PATH, "[]");
}

/** Saves a full call record (including transcript) to the JSON store. */
export function saveReport(record) {
  ensureStore();
  const all = JSON.parse(fs.readFileSync(STORE_PATH, "utf-8"));
  all.unshift(record);
  fs.writeFileSync(STORE_PATH, JSON.stringify(all, null, 2));
}

/** Returns all reports with the transcript text stripped, for list views. */
export function listReports() {
  ensureStore();
  const all = JSON.parse(fs.readFileSync(STORE_PATH, "utf-8"));
  return all.map(({ transcriptText, ...meta }) => meta);
}

/** Returns one full report (including transcript) by id. */
export function getReport(id) {
  ensureStore();
  const all = JSON.parse(fs.readFileSync(STORE_PATH, "utf-8"));
  return all.find((r) => r.id === id) || null;
}