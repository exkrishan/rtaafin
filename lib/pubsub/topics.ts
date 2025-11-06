/**
 * Topic naming conventions and helpers
 */

export interface TopicConfig {
  tenantId?: string;
  interactionId?: string;
  useStreams?: boolean; // Use audio_stream vs audio.{tenant_id}
}

/**
 * Generate topic name for audio frames
 * Format: audio.{tenant_id} or audio_stream (if useStreams=true)
 */
export function audioTopic(config: TopicConfig = {}): string {
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
export function transcriptTopic(interactionId: string): string {
  if (!interactionId) {
    throw new Error('interaction_id is required for transcript topic');
  }
  return `transcript.${interactionId}`;
}

/**
 * Generate topic name for intent updates
 * Format: intent.{interaction_id}
 */
export function intentTopic(interactionId: string): string {
  if (!interactionId) {
    throw new Error('interaction_id is required for intent topic');
  }
  return `intent.${interactionId}`;
}

/**
 * Parse topic name to extract metadata
 */
export function parseTopic(topic: string): {
  type: 'audio' | 'transcript' | 'intent' | 'unknown';
  tenantId?: string;
  interactionId?: string;
} {
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

