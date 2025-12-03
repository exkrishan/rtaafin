/**
 * List files in Google Drive "Audio Dumps" folder
 * 
 * Usage:
 *   GOOGLE_APPLICATION_CREDENTIALS=path/to/credentials.json ts-node scripts/list-google-drive-files.ts
 * 
 * Or with JSON string:
 *   GOOGLE_APPLICATION_CREDENTIALS_JSON='{"type":"service_account",...}' ts-node scripts/list-google-drive-files.ts
 */

import { google } from 'googleapis';
import { readFile } from 'fs/promises';

async function listDriveFiles() {
  try {
    // Load credentials
    let credentials: any;
    const credentialsJson = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
    const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;

    if (credentialsJson) {
      credentials = JSON.parse(credentialsJson);
    } else if (credentialsPath) {
      credentials = JSON.parse(await readFile(credentialsPath, 'utf8'));
    } else {
      console.error('❌ GOOGLE_APPLICATION_CREDENTIALS or GOOGLE_APPLICATION_CREDENTIALS_JSON must be set');
      process.exit(1);
    }

    // Create auth client
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/drive.readonly'],
    });

    const authClient: any = await auth.getClient();
    const drive = google.drive({ version: 'v3', auth: authClient as any });

    console.log('🔍 Searching for "Audio Dumps" folder...\n');

    // Find "Audio Dumps" folder
    const folderResponse = await drive.files.list({
      q: `name='Audio Dumps' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: 'files(id, name)',
      spaces: 'drive',
    });

    if (!folderResponse.data.files || folderResponse.data.files.length === 0) {
      console.log('❌ "Audio Dumps" folder not found');
      console.log('   Make sure files have been uploaded at least once.');
      process.exit(1);
    }

    const folderId = folderResponse.data.files[0].id!;
    const folderName = folderResponse.data.files[0].name!;

    console.log(`✅ Found folder: "${folderName}" (ID: ${folderId})\n`);
    console.log(`📁 Listing call folders...\n`);

    // List all call folders
    const callFoldersResponse = await drive.files.list({
      q: `'${folderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: 'files(id, name, createdTime)',
      spaces: 'drive',
      orderBy: 'createdTime desc',
      pageSize: 50,
    });

    if (!callFoldersResponse.data.files || callFoldersResponse.data.files.length === 0) {
      console.log('   No call folders found yet.');
      console.log('   Make a test call to create folders and upload files.');
      process.exit(0);
    }

    console.log(`   Found ${callFoldersResponse.data.files.length} call folder(s):\n`);

    for (const folder of callFoldersResponse.data.files) {
      console.log(`   📂 ${folder.name}`);
      console.log(`      ID: ${folder.id}`);
      console.log(`      Created: ${folder.createdTime}`);
      
      // List files in this call folder
      const filesResponse = await drive.files.list({
        q: `'${folder.id}' in parents and trashed=false`,
        fields: 'files(id, name, size, createdTime, webViewLink)',
        spaces: 'drive',
        orderBy: 'name',
        pageSize: 100,
      });

      if (filesResponse.data.files && filesResponse.data.files.length > 0) {
        console.log(`      Files: ${filesResponse.data.files.length}`);
        console.log(`      First file: ${filesResponse.data.files[0].name}`);
        if (filesResponse.data.files[0].webViewLink) {
          console.log(`      Link: ${filesResponse.data.files[0].webViewLink}`);
        }
      } else {
        console.log(`      Files: 0`);
      }
      console.log('');
    }

    // Summary
    let totalFiles = 0;
    for (const folder of callFoldersResponse.data.files) {
      const filesResponse = await drive.files.list({
        q: `'${folder.id}' in parents and trashed=false`,
        fields: 'files(id)',
        spaces: 'drive',
      });
      totalFiles += filesResponse.data.files?.length || 0;
    }

    console.log(`\n📊 Summary:`);
    console.log(`   Total call folders: ${callFoldersResponse.data.files.length}`);
    console.log(`   Total audio files: ${totalFiles}`);
    console.log(`\n🔗 Folder link: https://drive.google.com/drive/folders/${folderId}`);

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

listDriveFiles();

