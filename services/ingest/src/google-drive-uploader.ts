/**
 * Google Drive Uploader
 * 
 * Uploads audio dump files to Google Drive for persistent storage.
 * 
 * Environment Variables:
 * - GOOGLE_DRIVE_ENABLED: Enable Google Drive uploads (default: false)
 * - GOOGLE_DRIVE_FOLDER_ID: Google Drive folder ID to upload to (optional, creates folder if not set)
 * - GOOGLE_APPLICATION_CREDENTIALS: Path to Google service account JSON file
 * - GOOGLE_DRIVE_PARENT_FOLDER_NAME: Name of parent folder in Drive (default: 'Audio Dumps')
 */

import { google } from 'googleapis';
import { readFile } from 'fs/promises';

interface GoogleDriveConfig {
  enabled: boolean;
  folderId?: string;
  parentFolderName: string;
  credentialsPath?: string;
  credentialsJson?: string; // For Render - JSON content as string
}

let config: GoogleDriveConfig | null = null;
let driveClient: any = null;
let rootFolderId: string | null = null;
// Cache for call folder IDs (interaction_id -> folder_id)
const callFolderCache = new Map<string, string>();
// Mutex to prevent concurrent folder creation for the same folder
const folderCreationLocks = new Map<string, Promise<string>>();

/**
 * Initialize Google Drive configuration
 */
function getConfig(): GoogleDriveConfig {
  if (config) return config;

  const enabled = process.env.GOOGLE_DRIVE_ENABLED === 'true';
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  const parentFolderName = process.env.GOOGLE_DRIVE_PARENT_FOLDER_NAME || 'Audio Dumps';
  const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  const credentialsJson = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON; // For Render

  config = {
    enabled,
    folderId,
    parentFolderName,
    credentialsPath,
    credentialsJson,
  };

  if (enabled) {
    if (!credentialsPath && !credentialsJson) {
      console.warn('[google-drive] GOOGLE_APPLICATION_CREDENTIALS or GOOGLE_APPLICATION_CREDENTIALS_JSON not set - Google Drive uploads disabled');
      config.enabled = false;
    } else {
      console.info('[google-drive] Google Drive uploads enabled', {
        parent_folder: parentFolderName,
        folder_id: folderId || 'auto-create',
        auth_method: credentialsJson ? 'JSON string' : 'file path',
      });
    }
  }

  return config;
}

/**
 * Initialize Google Drive client with retry logic
 */
async function initializeDriveClient(): Promise<void> {
  if (driveClient) return;

  const cfg = getConfig();
  if (!cfg.enabled || (!cfg.credentialsPath && !cfg.credentialsJson)) {
    return;
  }

  const maxRetries = 3;
  let lastError: any = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Load service account credentials
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
      
      // Create auth client with timeout
      const auth = new google.auth.GoogleAuth({
        credentials,
        scopes: ['https://www.googleapis.com/auth/drive.file'],
      });

      const authClient: any = await auth.getClient();
      
      // Create drive client with timeout and retry configuration
      driveClient = google.drive({ 
        version: 'v3', 
        auth: authClient as any,
        timeout: 10000, // 10 second timeout
      });

      console.info('[google-drive] ✅ Google Drive client initialized');
      return; // Success
    } catch (error: any) {
      lastError = error;
      const isNetworkError = error.message?.includes('socket') || 
                            error.message?.includes('TLS') ||
                            error.message?.includes('ECONNRESET') ||
                            error.message?.includes('ETIMEDOUT');
      
      if (isNetworkError && attempt < maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000); // Exponential backoff, max 5s
        console.warn(`[google-drive] ⚠️ Network error initializing (attempt ${attempt}/${maxRetries}), retrying in ${delay}ms...`, {
          error: error.message,
        });
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      
      // If not a network error or last attempt, fail
      console.error('[google-drive] ❌ Failed to initialize Google Drive client:', error.message);
      if (attempt === maxRetries) {
        console.error('[google-drive] ❌ Giving up after 3 attempts. Google Drive uploads will be disabled.');
        config!.enabled = false;
      }
      throw error;
    }
  }
}

/**
 * Get or create root folder in Google Drive (with mutex to prevent concurrent creation)
 */
async function getOrCreateRootFolder(): Promise<string> {
  if (rootFolderId) return rootFolderId;

  const cfg = getConfig();
  if (!cfg.enabled || !driveClient) {
    await initializeDriveClient();
    if (!driveClient) throw new Error('Google Drive client not initialized');
  }

  // If folder ID is provided, use it
  if (cfg.folderId) {
    rootFolderId = cfg.folderId;
    return rootFolderId;
  }

  // Use mutex to prevent concurrent folder creation
  const lockKey = 'root_folder';
  if (folderCreationLocks.has(lockKey)) {
    return await folderCreationLocks.get(lockKey)!;
  }

  const creationPromise = (async (): Promise<string> => {
    const maxRetries = 3;
    let lastError: any = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Search for existing folder
        const response = await driveClient.files.list({
          q: `name='${cfg.parentFolderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
          fields: 'files(id, name)',
          spaces: 'drive',
          timeout: 10000, // 10 second timeout
        });

        if (response.data.files && response.data.files.length > 0) {
          rootFolderId = response.data.files[0].id!;
          console.info('[google-drive] ✅ Found existing folder', {
            folder_id: rootFolderId,
            folder_name: cfg.parentFolderName,
          });
          return rootFolderId;
        }

        // Create new folder
        const folderResponse = await driveClient.files.create({
          requestBody: {
            name: cfg.parentFolderName,
            mimeType: 'application/vnd.google-apps.folder',
          },
          fields: 'id, name',
          timeout: 10000, // 10 second timeout
        });

        rootFolderId = folderResponse.data.id!;
        console.info('[google-drive] ✅ Created folder', {
          folder_id: rootFolderId,
          folder_name: cfg.parentFolderName,
        });

        return rootFolderId;
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
          console.warn(`[google-drive] ⚠️ Network error getting/creating root folder (attempt ${attempt}/${maxRetries}), retrying...`, {
            error: error.message,
          });
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        
        // If not a network error or last attempt, throw
        console.error('[google-drive] ❌ Failed to get/create root folder:', error.message);
        if (attempt === maxRetries) {
          throw error;
        }
      }
    }
    
    throw lastError || new Error('Failed to get/create root folder after retries');
  })();

  folderCreationLocks.set(lockKey, creationPromise);
  try {
    const result = await creationPromise;
    return result;
  } finally {
    folderCreationLocks.delete(lockKey);
  }
}

/**
 * Get or create folder for a specific call/interaction with retry logic and caching
 */
async function getOrCreateCallFolder(interactionId: string, parentFolderId: string): Promise<string> {
  // Check cache first
  if (callFolderCache.has(interactionId)) {
    return callFolderCache.get(interactionId)!;
  }

  // Use mutex to prevent concurrent folder creation for the same interaction
  const lockKey = `call_folder_${interactionId}`;
  if (folderCreationLocks.has(lockKey)) {
    return await folderCreationLocks.get(lockKey)!;
  }

  const creationPromise = (async (): Promise<string> => {
    const sanitizedId = interactionId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const folderName = `Call ${sanitizedId}`;

    const maxRetries = 3;
    let lastError: any = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Search for existing folder
        const response = await driveClient.files.list({
          q: `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and '${parentFolderId}' in parents and trashed=false`,
          fields: 'files(id, name)',
          spaces: 'drive',
          timeout: 10000, // 10 second timeout
        });

        if (response.data.files && response.data.files.length > 0) {
          const folderId = response.data.files[0].id!;
          callFolderCache.set(interactionId, folderId);
          return folderId;
        }

        // Create new folder
        const folderResponse = await driveClient.files.create({
          requestBody: {
            name: folderName,
            mimeType: 'application/vnd.google-apps.folder',
            parents: [parentFolderId],
          },
          fields: 'id, name',
          timeout: 10000, // 10 second timeout
        });

        const folderId = folderResponse.data.id!;
        callFolderCache.set(interactionId, folderId);
        return folderId;
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
          console.warn(`[google-drive] ⚠️ Network error getting/creating call folder (attempt ${attempt}/${maxRetries}), retrying...`, {
            interaction_id: interactionId,
            error: error.message,
          });
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        
        // If not a network error or last attempt, throw
        console.error('[google-drive] ❌ Failed to get/create call folder:', error.message);
        throw error;
      }
    }
    
    throw lastError || new Error('Failed to get/create call folder after retries');
  })();

  folderCreationLocks.set(lockKey, creationPromise);
  try {
    const result = await creationPromise;
    return result;
  } finally {
    folderCreationLocks.delete(lockKey);
  }
}

/**
 * Upload file to Google Drive
 */
export async function uploadToGoogleDrive(
  interactionId: string,
  fileName: string,
  filePath: string,
  mimeType: string = 'audio/wav'
): Promise<string | null> {
  const cfg = getConfig();
  if (!cfg.enabled) {
    return null;
  }

  try {
    // Initialize client if needed
    if (!driveClient) {
      await initializeDriveClient();
      if (!driveClient) return null;
    }

    // Get root folder
    const rootFolder = await getOrCreateRootFolder();

    // Get or create call folder
    const callFolderId = await getOrCreateCallFolder(interactionId, rootFolder);

    // Read file
    const fileContent = await readFile(filePath);

    // Upload file with retry logic
    const maxRetries = 3;
    let lastError: any = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await driveClient.files.create({
          requestBody: {
            name: fileName,
            parents: [callFolderId],
          },
          media: {
            mimeType,
            body: fileContent,
          },
          fields: 'id, name, webViewLink',
          timeout: 15000, // 15 second timeout for uploads
        });

        const fileId = response.data.id;
        const webLink = response.data.webViewLink;

        // Log first few uploads and every 100th upload
        const seq = parseInt(fileName.match(/chunk-(\d+)/)?.[1] || '0', 10);
        if (seq <= 3 || seq % 100 === 0) {
          console.info('[google-drive] ✅ Uploaded to Google Drive', {
            interaction_id: interactionId,
            file_name: fileName,
            file_id: fileId,
            web_link: webLink,
          });
        }

        return webLink || null;
      } catch (error: any) {
        lastError = error;
        const isNetworkError = error.message?.includes('socket') || 
                              error.message?.includes('TLS') ||
                              error.message?.includes('ECONNRESET') ||
                              error.message?.includes('ETIMEDOUT') ||
                              error.message?.includes('hang up');
        
        if (isNetworkError && attempt < maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000); // Exponential backoff
          // Only log retries for first few chunks to reduce noise
          const seq = parseInt(fileName.match(/chunk-(\d+)/)?.[1] || '0', 10);
          if (seq <= 3) {
            console.warn(`[google-drive] ⚠️ Network error uploading (attempt ${attempt}/${maxRetries}), retrying...`, {
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
          // Don't throw - Google Drive upload is non-critical
          // Only log errors for first few chunks to reduce noise
          const seq = parseInt(fileName.match(/chunk-(\d+)/)?.[1] || '0', 10);
          if (seq <= 3 || seq % 100 === 0) {
            console.error('[google-drive] ❌ Failed to upload to Google Drive after retries', {
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
    // Don't throw - Google Drive upload is non-critical
    const seq = parseInt(fileName.match(/chunk-(\d+)/)?.[1] || '0', 10);
    if (seq <= 3) {
      console.error('[google-drive] ❌ Failed to upload to Google Drive', {
        interaction_id: interactionId,
        file_name: fileName,
        error: error.message,
      });
    }
    return null;
  }
}

