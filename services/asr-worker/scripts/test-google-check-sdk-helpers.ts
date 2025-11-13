/**
 * Check what the SDK's helpers.js is actually doing
 */
const helpers = require('@google-cloud/speech/build/src/helpers');

console.log('Helpers module:', Object.keys(helpers));
console.log('Helpers exports:', helpers);

// Try to understand the transformation
const stream = require('stream');
const PassThrough = stream.PassThrough;

// Check if we can see the transform function
console.log('\nChecking transform logic...');
