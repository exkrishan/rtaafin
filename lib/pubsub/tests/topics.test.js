"use strict";
/**
 * Unit tests for topic naming helpers
 */
Object.defineProperty(exports, "__esModule", { value: true });
const topics_1 = require("../topics");
describe('Topic Helpers', () => {
    describe('audioTopic', () => {
        it('should return audio_stream when useStreams=true', () => {
            expect((0, topics_1.audioTopic)({ useStreams: true })).toBe('audio_stream');
        });
        it('should return audio.{tenant_id} when tenantId provided', () => {
            expect((0, topics_1.audioTopic)({ tenantId: 'tenant-123' })).toBe('audio.tenant-123');
        });
        it('should default to audio_stream', () => {
            expect((0, topics_1.audioTopic)()).toBe('audio_stream');
        });
    });
    describe('transcriptTopic', () => {
        it('should return transcript.{interaction_id}', () => {
            expect((0, topics_1.transcriptTopic)('int-123')).toBe('transcript.int-123');
        });
        it('should throw error if interaction_id is missing', () => {
            expect(() => (0, topics_1.transcriptTopic)('')).toThrow('interaction_id is required');
        });
    });
    describe('intentTopic', () => {
        it('should return intent.{interaction_id}', () => {
            expect((0, topics_1.intentTopic)('int-456')).toBe('intent.int-456');
        });
        it('should throw error if interaction_id is missing', () => {
            expect(() => (0, topics_1.intentTopic)('')).toThrow('interaction_id is required');
        });
    });
    describe('parseTopic', () => {
        it('should parse audio.{tenant_id} topic', () => {
            const parsed = (0, topics_1.parseTopic)('audio.tenant-123');
            expect(parsed.type).toBe('audio');
            expect(parsed.tenantId).toBe('tenant-123');
        });
        it('should parse audio_stream topic', () => {
            const parsed = (0, topics_1.parseTopic)('audio_stream');
            expect(parsed.type).toBe('audio');
        });
        it('should parse transcript topic', () => {
            const parsed = (0, topics_1.parseTopic)('transcript.int-123');
            expect(parsed.type).toBe('transcript');
            expect(parsed.interactionId).toBe('int-123');
        });
        it('should parse intent topic', () => {
            const parsed = (0, topics_1.parseTopic)('intent.int-456');
            expect(parsed.type).toBe('intent');
            expect(parsed.interactionId).toBe('int-456');
        });
        it('should return unknown for unrecognized topics', () => {
            const parsed = (0, topics_1.parseTopic)('unknown-topic');
            expect(parsed.type).toBe('unknown');
        });
    });
});
