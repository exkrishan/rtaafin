/**
 * Google Cloud Storage Uploader
 * 
 * Uploads audio dump files to Google Cloud Storage buckets for persistent storage.
 * Much simpler than Google Drive - no sharing permissions needed!
 * 
 * Environment Variables:
 * - GCS_ENABLED: Enable GCS uploads (default: false)
 * - GCS_BUCKET_NAME: Name of the GCS bucket (required if enabled)
 * - GOOGLE_APPLICATION_CREDENTIALS: Path to Google service account JSON file
 * - GOOGLE_APPLICATION_CREDENTIALS_JSON: JSON content as string (for Render)
 */

import { Storage } from '@google-cloud/storage';
import { readFile } from 'fs/promises';

interface GCSConfig {
  enabled: boolean;
  bucketName?: string;
  credentialsPath?: string;
  credentialsJson?: string; // For Render - JSON content as string
}

let config: GCSConfig | null = null;
let storageClient: Storage | null = null;

/**
 * Initialize GCS configuration
 */
function getConfig(): GCSConfig {
  if (config) return config;

  const enabled = process.env.GCS_ENABLED === 'true';
  const bucketName = process.env.GCS_BUCKET_NAME;
  const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  const credentialsJson = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON; // For Render

  config = {
    enabled,
    bucketName,
    credentialsPath,
    credentialsJson,
  };

  if (enabled) {
    if (!bucketName) {
      console.warn('[gcs] GCS_BUCKET_NAME not set - GCS uploads disabled');
      config.enabled = false;
    } else if (!credentialsPath && !credentialsJson) {
      console.warn('[gcs] GOOGLE_APPLICATION_CREDENTIALS or GOOGLE_APPLICATION_CREDENTIALS_JSON not set - GCS uploads disabled');
      config.enabled = false;
    } else {
      console.info('[gcs] Google Cloud Storage uploads enabled', {
        bucket: bucketName,
        auth_method: credentialsJson ? 'JSON string' : 'file path',
      });
    }
  }

  return config;
}

/**
 * Initialize GCS client
 */
async function initializeGCSClient(): Promise<void> {
  if (storageClient) return;

  const cfg = getConfig();
  if (!cfg.enabled || (!cfg.credentialsPath && !cfg.credentialsJson)) {
    return;
  }

  try {
    let credentials: any;
    if (cfg.credentialsJson) {
      // For Render - JSON content directly from environment variable
      credentials = JSON.parse(cfg.credentialsJson);
    } else if (cfg.credentialsPath) {
      // For local - read from file
      credentials = JSON.parse(await readFile(cfg.credentialsPath, 'utf8'));
    } else {
      throw new Error('No credentials provided');
    }

    // Create Storage client
    storageClient = new Storage({
      credentials,
      projectId: credentials.project_id,
    });

    console.info('[gcs] ✅ Google Cloud Storage client initialized');
  } catch (error: any) {
    console.error('[gcs] ❌ Failed to initialize GCS client:', error.message);
    config!.enabled = false;
    throw error;
  }
}

/**
 * Upload file to Google Cloud Storage
 */
export async function uploadToGCS(
  interactionId: string,
  fileName: string,
  filePath: string,
  mimeType: string = 'audio/wav'
): Promise<string | null> {
  const cfg = getConfig();
  if (!cfg.enabled || !cfg.bucketName) {
    return null;
  }

  const seq = parseInt(fileName.match(/chunk-(\d+)/)?.[1] || '0', 10);

  try {
    // Initialize client if needed
    if (!storageClient) {
      if (seq <= 3) {
        console.info('[gcs] Initializing GCS client...', { file_name: fileName });
      }
      await initializeGCSClient();
      if (!storageClient) {
        if (seq <= 3) {
          console.error('[gcs] ❌ Failed to initialize client', { file_name: fileName });
        }
        return null;
      }
    }

    // Read file
    if (seq <= 3) {
      console.debug('[gcs] Reading file for upload...', { file_name: fileName, file_path: filePath });
    }
    const fileContent = await readFile(filePath);

    // Build object path: audio-dumps/{interaction_id}/{filename}
    const sanitizedId = interactionId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const objectPath = `audio-dumps/${sanitizedId}/${fileName}`;

    // Get bucket
    const bucket = storageClient.bucket(cfg.bucketName);

    // Upload file with retry logic
    const maxRetries = 3;
    let lastError: any = null;

    if (seq <= 3) {
      console.info('[gcs] Starting upload...', {
        interaction_id: interactionId,
        file_name: fileName,
        file_size: fileContent.length,
        bucket: cfg.bucketName,
        object_path: objectPath,
      });
    }

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        if (seq <= 3 && attempt > 1) {
          console.info(`[gcs] Retry attempt ${attempt}/${maxRetries}...`, { file_name: fileName });
        }

        const file = bucket.file(objectPath);
        await file.save(fileContent, {
          metadata: {
            contentType: mimeType,
            metadata: {
              interactionId,
              sequence: seq.toString(),
            },
          },
        });

        // Make file publicly accessible (optional - remove if you want private)
        // await file.makePublic();

        const publicUrl = `https://storage.googleapis.com/${cfg.bucketName}/${objectPath}`;

        // Log first few uploads and every 100th upload
        if (seq <= 3 || seq % 100 === 0) {
          console.info('[gcs] ✅ Uploaded to Google Cloud Storage', {
            interaction_id: interactionId,
            file_name: fileName,
            bucket: cfg.bucketName,
            object_path: objectPath,
            public_url: publicUrl,
            file_size: fileContent.length,
          });
        }

        return publicUrl;
      } catch (error: any) {
        lastError = error;
        const isNetworkError = error.message?.includes('socket') ||
                              error.message?.includes('TLS') ||
                              error.message?.includes('ECONNRESET') ||
                              error.message?.includes('ETIMEDOUT') ||
                              error.message?.includes('hang up') ||
                              error.message?.includes('timeout');

        if (isNetworkError && attempt < maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000); // Exponential backoff
          if (seq <= 3) {
            console.warn(`[gcs] ⚠️ Network error uploading (attempt ${attempt}/${maxRetries}), retrying...`, {
              interaction_id: interactionId,
              file_name: fileName,
              error: error.message,
            });
          }
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }

        // If not a network error or last attempt, give up
        if (attempt === maxRetries) {
          if (seq <= 3 || seq % 100 === 0) {
            console.error('[gcs] ❌ Failed to upload to GCS after retries', {
              interaction_id: interactionId,
              file_name: fileName,
              error: error.message,
              attempts: maxRetries,
            });
          }
        }
        break;
      }
    }

    // If we get here, all retries failed
    return null;
  } catch (error: any) {
    // Don't throw - GCS upload is non-critical
    if (seq <= 3) {
      console.error('[gcs] ❌ Failed to upload to GCS (outer catch)', {
        interaction_id: interactionId,
        file_name: fileName,
        error: error.message,
        error_stack: error.stack?.substring(0, 200),
      });
    }
    return null;
  }
}

/**
 * List files in GCS bucket for a specific interaction
 */
export async function listGCSFiles(interactionId: string, limit: number = 100): Promise<any[]> {
  const cfg = getConfig();
  if (!cfg.enabled || !cfg.bucketName) {
    throw new Error('GCS is not enabled or bucket name not set');
  }

  try {
    // Initialize client if needed
    if (!storageClient) {
      await initializeGCSClient();
      if (!storageClient) {
        throw new Error('Failed to initialize GCS client');
      }
    }

    const sanitizedId = interactionId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const prefix = `audio-dumps/${sanitizedId}/`;

    const bucket = storageClient.bucket(cfg.bucketName);
    const [files] = await bucket.getFiles({
      prefix,
      maxResults: limit,
    });

    return files.map(file => ({
      name: file.name.split('/').pop(),
      fullPath: file.name,
      size: file.metadata.size,
      created: file.metadata.timeCreated,
      updated: file.metadata.updated,
      publicUrl: `https://storage.googleapis.com/${cfg.bucketName}/${file.name}`,
    }));
  } catch (error: any) {
    console.error('[gcs] ❌ Failed to list files:', error.message);
    throw error;
  }
}

