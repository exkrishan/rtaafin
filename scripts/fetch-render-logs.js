#!/usr/bin/env node
/**
 * Fetch logs from Render services for transcript monitoring
 * 
 * Usage:
 *   node scripts/fetch-render-logs.js [interaction_id]
 *   node scripts/fetch-render-logs.js                    # Finds latest call automatically
 */

const https = require('https');

const RENDER_API_KEY = process.env.RENDER_API_KEY || 'rnd_hc4wCXTA9lq05k60j3Lhn9CZsArw';
const RENDER_API_BASE = 'api.render.com';

// Service names to check (adjust based on your actual service names)
const SERVICE_NAMES = [
  'rtaa-asr-worker',
  'asr-worker',
  'rtaa-ingest',
  'ingest',
  'rtaa-frontend',
  'frontend'
];

/**
 * Make HTTPS request to Render API
 */
function renderApiRequest(path) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: RENDER_API_BASE,
      path: path,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${RENDER_API_KEY}`,
        'Accept': 'application/json'
      },
      // Allow self-signed certificates (for debugging only)
      rejectUnauthorized: false
    };

    const req = https.request(options, (res) => {
      let data = '';

      // Check status code
      if (res.statusCode !== 200) {
        res.on('data', () => {}); // Drain response
        res.on('end', () => {
          reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage || 'Unknown error'}`));
        });
        return;
      }

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          // Check if response is JSON
          if (res.headers['content-type']?.includes('application/json') || data.trim().startsWith('{') || data.trim().startsWith('[')) {
            const json = JSON.parse(data);
            resolve(json);
          } else {
            // Try to parse anyway, but handle errors better
            try {
              const json = JSON.parse(data);
              resolve(json);
            } catch (e) {
              // Log first 200 chars of response for debugging
              const preview = data.substring(0, 200);
              reject(new Error(`Expected JSON but got: ${res.headers['content-type'] || 'unknown'}. Status: ${res.statusCode}. Preview: ${preview}`));
            }
          }
        } catch (e) {
          const preview = data.substring(0, 200);
          reject(new Error(`Failed to parse JSON: ${e.message}. Status: ${res.statusCode}. Response preview: ${preview}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.end();
  });
}

/**
 * Get all services
 */
async function getServices() {
  try {
    const services = await renderApiRequest('/v1/services');
    return Array.isArray(services) ? services : [];
  } catch (error) {
    console.error('❌ Failed to fetch services:', error.message);
    return [];
  }
}

/**
 * Get deployments for a service
 */
async function getServiceDeployments(serviceId) {
  try {
    const deployments = await renderApiRequest(`/v1/services/${serviceId}/deploys?limit=5`);
    return Array.isArray(deployments) ? deployments : [];
  } catch (error) {
    // Deployments endpoint might not be available, that's ok
    return [];
  }
}

/**
 * Get logs for a service
 */
async function getServiceLogs(serviceId, limit = 2000) {
  try {
    // Try the logs endpoint
    const logs = await renderApiRequest(`/v1/services/${serviceId}/logs?limit=${limit}`);
    
    // Handle different response formats
    if (Array.isArray(logs)) {
      return logs;
    } else if (logs.logs && Array.isArray(logs.logs)) {
      return logs.logs;
    } else if (logs.data && Array.isArray(logs.data)) {
      return logs.data;
    }
    
    return [];
  } catch (error) {
    // If logs endpoint fails, try getting logs from latest deployment
    if (error.message.includes('404')) {
      try {
        const deployments = await getServiceDeployments(serviceId);
        if (deployments.length > 0) {
          const latestDeploy = deployments[0];
          const deployId = latestDeploy.deploy?.id || latestDeploy.id;
          if (deployId) {
            const deployLogs = await renderApiRequest(`/v1/deploys/${deployId}/logs?limit=${limit}`);
            if (Array.isArray(deployLogs)) {
              return deployLogs;
            } else if (deployLogs.logs && Array.isArray(deployLogs.logs)) {
              return deployLogs.logs;
            }
          }
        }
      } catch (deployError) {
        // Ignore deployment log errors
      }
    }
    
    console.error(`❌ Failed to fetch logs for service ${serviceId}:`, error.message);
    return [];
  }
}

/**
 * Extract interaction_id from log message
 */
function extractInteractionId(log) {
  const message = log.message || '';
  const match = message.match(/interaction_id[:\s]+['"]([a-f0-9]+)['"]/i) ||
                message.match(/interaction_id[:\s]+([a-f0-9]{32})/i) ||
                message.match(/interactionId[:\s]+['"]([a-f0-9]+)['"]/i);
  return match ? match[1] : null;
}

/**
 * Check if log is transcript-related
 */
function isTranscriptRelated(log) {
  const message = (log.message || '').toLowerCase();
  return message.includes('transcript') ||
         message.includes('deepgram') ||
         message.includes('step 2') ||
         message.includes('published') ||
         message.includes('empty') ||
         message.includes('timeout') ||
         message.includes('socket') ||
         message.includes('ready');
}

/**
 * Format log entry
 */
function formatLog(log) {
  const timestamp = log.timestamp ? new Date(log.timestamp).toISOString() : 'N/A';
  const message = log.message || '';
  return `[${timestamp}] ${message}`;
}

/**
 * Main function
 */
async function main() {
  const interactionIdArg = process.argv[2];

  console.log('🔍 Fetching logs from Render services...\n');

  // Get all services
  const allServices = await getServices();
  
  if (allServices.length === 0) {
    console.error('❌ No services found. Check your API key and service names.');
    process.exit(1);
  }

  // Find relevant services
  const relevantServices = allServices.filter(s => {
    const name = (s.service?.name || '').toLowerCase();
    return SERVICE_NAMES.some(sn => name.includes(sn.toLowerCase()));
  });

  if (relevantServices.length === 0) {
    console.log('⚠️  No matching services found. Available services:');
    allServices.forEach(s => {
      console.log(`   - ${s.service?.name || 'Unknown'}`);
    });
    process.exit(1);
  }

  console.log(`✅ Found ${relevantServices.length} relevant service(s):`);
  relevantServices.forEach(s => {
    console.log(`   - ${s.service?.name} (ID: ${s.service?.id})`);
  });
  console.log('');

  // Fetch logs from all services
  const allLogs = [];
  for (const service of relevantServices) {
    const serviceName = service.service?.name || 'Unknown';
    console.log(`📥 Fetching logs from ${serviceName}...`);
    const logs = await getServiceLogs(service.service.id);
    console.log(`   ✅ Fetched ${logs.length} log entries`);
    allLogs.push(...logs.map(log => ({
      ...log,
      serviceName
    })));
  }

  console.log(`\n📊 Total logs fetched: ${allLogs.length}\n`);

  // Sort by timestamp (newest first)
  allLogs.sort((a, b) => {
    const timeA = new Date(a.timestamp || 0).getTime();
    const timeB = new Date(b.timestamp || 0).getTime();
    return timeB - timeA;
  });

  // Find interaction IDs
  const interactionIds = new Set();
  allLogs.forEach(log => {
    const id = extractInteractionId(log);
    if (id) {
      interactionIds.add(id);
    }
  });

  // Determine which interaction_id to use
  let targetInteractionId = interactionIdArg;
  if (!targetInteractionId) {
    // Find the most recent interaction_id
    const recentIds = Array.from(interactionIds).slice(0, 5);
    if (recentIds.length > 0) {
      targetInteractionId = recentIds[0];
      console.log(`🎯 Found ${interactionIds.size} interaction ID(s). Using most recent: ${targetInteractionId}`);
      if (recentIds.length > 1) {
        console.log(`   Other recent IDs: ${recentIds.slice(1).join(', ')}`);
      }
    } else {
      console.log('⚠️  No interaction_id found in logs. Showing all transcript-related logs...\n');
    }
  } else {
    console.log(`🎯 Filtering for interaction_id: ${targetInteractionId}\n`);
  }

  // Filter logs
  let filteredLogs = allLogs;
  if (targetInteractionId) {
    filteredLogs = allLogs.filter(log => {
      const message = log.message || '';
      return message.includes(targetInteractionId);
    });
  }

  // Further filter for transcript-related logs
  const transcriptLogs = filteredLogs.filter(log => {
    if (!targetInteractionId) {
      return isTranscriptRelated(log);
    }
    return true; // Show all logs for specific interaction_id
  });

  console.log('='.repeat(80));
  console.log(`📨 Transcript-related logs${targetInteractionId ? ` for ${targetInteractionId}` : ''}:`);
  console.log('='.repeat(80));
  console.log('');

  if (transcriptLogs.length === 0) {
    console.log('❌ No transcript-related logs found.');
    if (targetInteractionId) {
      console.log(`   Try without interaction_id to see all logs: node scripts/fetch-render-logs.js`);
    }
    process.exit(1);
  }

  // Group by service and show logs
  const logsByService = {};
  transcriptLogs.forEach(log => {
    const service = log.serviceName || 'Unknown';
    if (!logsByService[service]) {
      logsByService[service] = [];
    }
    logsByService[service].push(log);
  });

  Object.keys(logsByService).forEach(service => {
    console.log(`\n📦 ${service}:`);
    console.log('-'.repeat(80));
    logsByService[service].slice(0, 100).forEach(log => {
      console.log(formatLog(log));
    });
    if (logsByService[service].length > 100) {
      console.log(`\n... and ${logsByService[service].length - 100} more logs`);
    }
  });

  // Summary statistics
  console.log('\n' + '='.repeat(80));
  console.log('📊 Summary:');
  console.log('='.repeat(80));

  const summary = {
    totalLogs: transcriptLogs.length,
    transcriptsPublished: transcriptLogs.filter(l => 
      (l.message || '').includes('Published') && (l.message || '').includes('transcript')
    ).length,
    emptyTranscripts: transcriptLogs.filter(l => 
      (l.message || '').toLowerCase().includes('empty') && 
      (l.message || '').toLowerCase().includes('transcript')
    ).length,
    timeouts: transcriptLogs.filter(l => 
      (l.message || '').includes('TIMEOUT') || (l.message || '').includes('1011')
    ).length,
    deepgramReceived: transcriptLogs.filter(l => 
      (l.message || '').includes('DEEPGRAM TRANSCRIPT RECEIVED')
    ).length,
    socketOpen: transcriptLogs.filter(l => 
      (l.message || '').includes('Socket is OPEN')
    ).length,
    socketConnecting: transcriptLogs.filter(l => 
      (l.message || '').includes('CONNECTING')
    ).length,
  };

  console.log(`Total transcript-related logs: ${summary.totalLogs}`);
  console.log(`✅ Transcripts published: ${summary.transcriptsPublished}`);
  console.log(`📨 Deepgram transcripts received: ${summary.deepgramReceived}`);
  console.log(`🔌 Socket OPEN events: ${summary.socketOpen}`);
  console.log(`⚠️  Socket CONNECTING events: ${summary.socketConnecting}`);
  console.log(`⚠️  Empty transcripts: ${summary.emptyTranscripts}`);
  console.log(`❌ Timeouts: ${summary.timeouts}`);

  // Health assessment
  console.log('\n' + '='.repeat(80));
  console.log('🏥 Health Assessment:');
  console.log('='.repeat(80));

  if (summary.transcriptsPublished > 0 && summary.emptyTranscripts === 0 && summary.timeouts === 0) {
    console.log('✅ HEALTHY: Transcripts are flowing correctly');
  } else if (summary.transcriptsPublished === 0) {
    console.log('❌ CRITICAL: No transcripts published');
    if (summary.deepgramReceived === 0) {
      console.log('   → Deepgram is not sending transcripts');
    }
    if (summary.socketConnecting > summary.socketOpen) {
      console.log('   → Socket is stuck in CONNECTING state');
    }
  } else if (summary.emptyTranscripts > 0) {
    console.log('⚠️  WARNING: Empty transcripts detected');
    console.log(`   → ${summary.emptyTranscripts} empty transcript(s) found`);
  } else if (summary.timeouts > 0) {
    console.log('❌ ERROR: Timeouts detected');
    console.log(`   → ${summary.timeouts} timeout(s) found`);
  }

  console.log('');
}

// Run main function
main().catch(error => {
  console.error('❌ Error:', error.message);
  process.exit(1);
});

