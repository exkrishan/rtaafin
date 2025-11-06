/**
 * Integration test for WebSocket ingestion service
 */

import { WebSocket } from 'ws';
import { createServer } from 'http';
import { createPubSubAdapter } from '../src/pubsub-adapter.dev';
import { AudioFrame } from '../src/types';

// Mock pub/sub adapter
const mockPublish = jest.fn().mockResolvedValue(undefined);
jest.mock('../src/pubsub-adapter.dev', () => ({
  createPubSubAdapter: jest.fn(() => ({
    publish: mockPublish,
  })),
}));

// Mock auth to bypass JWT for testing
jest.mock('../src/auth', () => ({
  authenticateConnection: jest.fn(() => ({
    tenant_id: 'test-tenant',
    interaction_id: 'test-interaction',
  })),
}));

describe('Integration Test', () => {
  let server: any;
  let wss: any;
  const PORT = 8444; // Different port for testing

  beforeAll((done) => {
    // Import server after mocks are set up
    const http = require('http');
    const { WebSocketServer } = require('ws');
    
    server = http.createServer();
    wss = new WebSocketServer({
      server,
      path: '/v1/ingest',
      verifyClient: () => true, // Skip auth in tests
    });

    // Simple server implementation for testing
    wss.on('connection', (ws: WebSocket) => {
      let state: any = null;

      ws.on('message', async (data: Buffer, isBinary: boolean) => {
        if (!isBinary) {
          const event = JSON.parse(data.toString());
          if (event.event === 'start') {
            state = {
              interactionId: event.interaction_id,
              tenantId: event.tenant_id,
              sampleRate: event.sample_rate,
              encoding: event.encoding,
              seq: 0,
            };
            ws.send(JSON.stringify({ event: 'started', interaction_id: event.interaction_id }));
          }
        } else if (state) {
          state.seq += 1;
          const frame: AudioFrame = {
            tenant_id: state.tenantId,
            interaction_id: state.interactionId,
            seq: state.seq,
            timestamp_ms: Date.now(),
            sample_rate: state.sampleRate,
            encoding: state.encoding,
            audio: data,
          };
          await mockPublish(frame);

          // Send ACK every 10 frames
          if (state.seq % 10 === 0) {
            ws.send(JSON.stringify({ event: 'ack', seq: state.seq }));
          }
        }
      });
    });

    server.listen(PORT, done);
  });

  afterAll((done) => {
    wss.close(() => {
      server.close(done);
    });
  });

  beforeEach(() => {
    mockPublish.mockClear();
  });

  it('should handle start event and binary frames', (done) => {
    const ws = new WebSocket(`ws://localhost:${PORT}/v1/ingest`);

    ws.on('open', () => {
      // Send start event
      ws.send(JSON.stringify({
        event: 'start',
        interaction_id: 'test-int-123',
        tenant_id: 'test-tenant-abc',
        sample_rate: 24000,
        encoding: 'pcm16',
      }));
    });

    let ackCount = 0;
    ws.on('message', (data: Buffer) => {
      const message = JSON.parse(data.toString());
      
      if (message.event === 'started') {
        // Send 25 binary frames (should get 2 ACKs)
        let frameCount = 0;
        const sendFrame = () => {
          if (frameCount < 25) {
            const audioData = Buffer.alloc(9600); // ~200ms of PCM16 at 24kHz
            audioData.fill(frameCount); // Fill with frame number for testing
            ws.send(audioData, { binary: true });
            frameCount++;
            setTimeout(sendFrame, 10); // Small delay between frames
          } else {
            // Wait a bit for all publishes
            setTimeout(() => {
              expect(mockPublish).toHaveBeenCalledTimes(25);
              
              // Verify first frame
              const firstCall = mockPublish.mock.calls[0][0] as AudioFrame;
              expect(firstCall.tenant_id).toBe('test-tenant-abc');
              expect(firstCall.interaction_id).toBe('test-int-123');
              expect(firstCall.seq).toBe(1);
              expect(firstCall.sample_rate).toBe(24000);
              expect(firstCall.encoding).toBe('pcm16');
              
              // Verify last frame
              const lastCall = mockPublish.mock.calls[24][0] as AudioFrame;
              expect(lastCall.seq).toBe(25);
              
              ws.close();
              done();
            }, 500);
          }
        };
        sendFrame();
      } else if (message.event === 'ack') {
        ackCount++;
        expect(message.seq).toBeGreaterThan(0);
        expect(message.seq % 10).toBe(0);
      }
    });

    ws.on('error', (error) => {
      done(error);
    });
  }, 10000); // 10 second timeout
});

