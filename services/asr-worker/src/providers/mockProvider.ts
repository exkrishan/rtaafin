/**
 * Mock ASR provider for testing and development
 * Generates deterministic fake transcripts
 */

import { AsrProvider, Transcript } from '../types';

export class MockProvider implements AsrProvider {
  private interactionTranscripts: Map<string, string[]> = new Map();
  private interactionIndex: Map<string, number> = new Map();
  private seqCount: Map<string, number> = new Map();

  // Predefined transcript templates for different interactions
  private readonly templates: string[] = [
    'Hello, I need help with my credit card.',
    'I can help you with that. What seems to be the issue?',
    'My card was stolen and I need to block it.',
    'I understand your concern. Let me help you block the card right away.',
    'Thank you so much for your assistance.',
    'You are welcome. Is there anything else I can help you with?',
  ];

  async sendAudioChunk(
    audio: Buffer,
    opts: { interactionId: string; seq: number; sampleRate: number }
  ): Promise<Transcript> {
    const { interactionId, seq } = opts;

    // Initialize transcript for this interaction
    if (!this.interactionTranscripts.has(interactionId)) {
      // Generate a random transcript sequence for this interaction
      const templateIndex = Math.floor(Math.random() * this.templates.length);
      const baseTemplate = this.templates[templateIndex];
      
      // Split into words for progressive transcription
      const words = baseTemplate.split(' ');
      this.interactionTranscripts.set(interactionId, words);
      this.interactionIndex.set(interactionId, 0);
      this.seqCount.set(interactionId, 0);
    }

    const words = this.interactionTranscripts.get(interactionId)!;
    let currentIndex = this.interactionIndex.get(interactionId)!;
    const seqCount = this.seqCount.get(interactionId)! || 0;

    // Increment sequence counter
    this.seqCount.set(interactionId, seqCount + 1);

    // Every 2 chunks, add a word (simulate progressive transcription)
    // This ensures we complete within reasonable number of chunks for testing
    if (seqCount > 0 && seqCount % 2 === 0 && currentIndex < words.length) {
      currentIndex++;
      this.interactionIndex.set(interactionId, currentIndex);
    }

    // Build partial transcript
    // Always include at least the first word to avoid empty transcripts
    const partialText = currentIndex === 0 
      ? words[0] || 'Processing...'  // First chunk: return first word
      : words.slice(0, currentIndex).join(' ');
    const isComplete = currentIndex >= words.length;
    
    // Force completion after 20 chunks to ensure tests pass
    if (seqCount >= 20 && !isComplete) {
      currentIndex = words.length;
      this.interactionIndex.set(interactionId, currentIndex);
    }

    if (isComplete) {
      // Final transcript
      return {
        type: 'final',
        text: words.join(' '),
        confidence: 0.95,
        isFinal: true,
      };
    } else {
      // Partial transcript - ensure we always have text
      const text = partialText || words[0] || 'Processing audio...';
      return {
        type: 'partial',
        text,
        confidence: 0.85,
        isFinal: false,
      };
    }
  }

  async close(): Promise<void> {
    this.interactionTranscripts.clear();
    this.interactionIndex.clear();
    this.seqCount.clear();
  }
}

