"use strict";
/**
 * Topic naming conventions and helpers
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.audioTopic = audioTopic;
exports.transcriptTopic = transcriptTopic;
exports.intentTopic = intentTopic;
exports.parseTopic = parseTopic;
/**
 * Generate topic name for audio frames
 * Format: audio.{tenant_id} or audio_stream (if useStreams=true)
 */
function audioTopic(config = {}) {
    if (config.useStreams) {
        return 'audio_stream';
    }
    if (config.tenantId) {
        return `audio.${config.tenantId}`;
    }
    return 'audio_stream'; // Default fallback
}
/**
 * Generate topic name for transcript updates
 * Format: transcript.{interaction_id}
 */
function transcriptTopic(interactionId) {
    if (!interactionId) {
        throw new Error('interaction_id is required for transcript topic');
    }
    return `transcript.${interactionId}`;
}
/**
 * Generate topic name for intent updates
 * Format: intent.{interaction_id}
 */
function intentTopic(interactionId) {
    if (!interactionId) {
        throw new Error('interaction_id is required for intent topic');
    }
    return `intent.${interactionId}`;
}
/**
 * Parse topic name to extract metadata
 */
function parseTopic(topic) {
    if (topic.startsWith('audio.')) {
        const tenantId = topic.replace('audio.', '');
        return { type: 'audio', tenantId };
    }
    if (topic === 'audio_stream') {
        return { type: 'audio' };
    }
    if (topic.startsWith('transcript.')) {
        const interactionId = topic.replace('transcript.', '');
        return { type: 'transcript', interactionId };
    }
    if (topic.startsWith('intent.')) {
        const interactionId = topic.replace('intent.', '');
        return { type: 'intent', interactionId };
    }
    return { type: 'unknown' };
}
