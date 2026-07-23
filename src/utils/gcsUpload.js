import { Storage } from "@google-cloud/storage";
import path from "path";

const storage = new Storage();

/**
 * Uploads a local file to the configured GCS bucket and returns its
 * gs:// URI, which Speech-to-Text needs for audio longer than ~1 minute.
 *
 * @param {string} localPath - path to the file to upload
 * @returns {Promise<string>} the gs:// URI of the uploaded file
 */
export async function uploadToGCS(localPath) {
  const bucketName = process.env.GCS_BUCKET_NAME;
  if (!bucketName) {
    throw new Error("GCS_BUCKET_NAME is not set in .env");
  }

  const destination = `call-audio/${Date.now()}-${path.basename(localPath)}`;
  await storage.bucket(bucketName).upload(localPath, { destination });

  return `gs://${bucketName}/${destination}`;
}

/** Deletes an uploaded object from GCS, ignoring errors if it's already gone. */
export async function deleteFromGCS(gcsUri) {
  const bucketName = process.env.GCS_BUCKET_NAME;
  const objectPath = gcsUri.replace(`gs://${bucketName}/`, "");
  try {
    await storage.bucket(bucketName).file(objectPath).delete();
  } catch {
    // best effort cleanup - ignore
  }
}