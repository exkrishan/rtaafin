#!/usr/bin/env python3
"""
Test script to simulate Exotel audio streaming from local audio file
Sends audio chunks every 2 seconds and displays transcripts in real-time

Usage:
    python scripts/test_local_audio.py [audio_file.wav] [--url wss://pipecat-ndpx.onrender.com/v1/ingest]
"""

import asyncio
import base64
import json
import sys
import wave
import websockets
from pathlib import Path
from typing import Optional


async def test_audio_streaming(
    ws_url: str,
    audio_file: Optional[str] = None,
    chunk_interval: float = 2.0,  # Send chunk every 2 seconds
):
    """Test audio streaming to Pipecat service"""
    
    print(f"🚀 Starting audio streaming test...")
    print(f"   WebSocket URL: {ws_url}")
    print(f"   Audio File: {audio_file or 'Generated test audio'}")
    print(f"   Chunk Interval: {chunk_interval} seconds")
    print()

    # Load or generate audio
    if audio_file:
        audio_data, sample_rate = load_audio_file(audio_file)
        print(f"📁 Loaded audio file: {audio_file}")
        print(f"   Sample Rate: {sample_rate} Hz")
        print(f"   Duration: {len(audio_data) / (sample_rate * 2):.2f} seconds")
    else:
        # Generate 10 seconds of test audio
        sample_rate = 16000
        duration_seconds = 10
        audio_data = generate_test_audio(sample_rate, duration_seconds)
        print(f"🎵 Generated test audio: {duration_seconds}s at {sample_rate}Hz")

    print()

    async with websockets.connect(ws_url) as ws:
        print("✅ WebSocket connected")
        
        # Send 'connected' event
        await ws.send(json.dumps({"event": "connected"}))
        print("📤 Sent: connected event")
        
        await asyncio.sleep(0.1)
        
        # Send 'start' event
        call_sid = f"test_call_{int(asyncio.get_event_loop().time())}"
        stream_sid = f"test_stream_{int(asyncio.get_event_loop().time())}"
        
        start_event = {
            "event": "start",
            "sequence_number": 1,
            "stream_sid": stream_sid,
            "start": {
                "stream_sid": stream_sid,
                "call_sid": call_sid,
                "account_sid": "test_account",
                "from": "+1234567890",
                "to": "+0987654321",
                "media_format": {
                    "encoding": "pcm16",
                    "sample_rate": str(sample_rate),
                },
            },
        }
        await ws.send(json.dumps(start_event))
        print(f"📤 Sent: start event (call_sid: {call_sid})")
        print()

        # Calculate chunk size for specified interval
        bytes_per_sample = 2  # 16-bit PCM
        samples_per_chunk = int(sample_rate * chunk_interval)
        bytes_per_chunk = samples_per_chunk * bytes_per_sample
        
        chunk_number = 0
        offset = 0
        
        # Start receiving messages in background
        async def receive_messages():
            try:
                async for message in ws:
                    try:
                        data = json.loads(message)
                        if "transcript" in str(data).lower() or "text" in str(data).lower():
                            print(f"📥 Transcript: {data}")
                    except:
                        print(f"📥 Received: {message[:100]}")
            except websockets.exceptions.ConnectionClosed:
                print("🔌 WebSocket connection closed")
        
        receiver_task = asyncio.create_task(receive_messages())
        
        # Send audio chunks at specified interval
        print("📤 Sending audio chunks...")
        print("-" * 60)
        
        while offset < len(audio_data):
            chunk = audio_data[offset:offset + bytes_per_chunk]
            if len(chunk) == 0:
                break
            
            # Encode to base64
            chunk_b64 = base64.b64encode(chunk).decode("utf-8")
            
            # Send media event
            chunk_number += 1
            media_event = {
                "event": "media",
                "sequence_number": chunk_number + 1,
                "stream_sid": stream_sid,
                "media": {
                    "chunk": chunk_number,
                    "timestamp": str(int(asyncio.get_event_loop().time() * 1000)),
                    "payload": chunk_b64,
                },
            }
            
            await ws.send(json.dumps(media_event))
            print(f"📤 Sent chunk {chunk_number} ({len(chunk)} bytes, ~{chunk_interval}s)")
            
            offset += bytes_per_chunk
            
            # Wait before next chunk
            if offset < len(audio_data):
                await asyncio.sleep(chunk_interval)
        
        print("-" * 60)
        print(f"✅ Sent {chunk_number} chunks")
        print()
        
        # Wait a bit for final transcripts
        print("⏳ Waiting for final transcripts...")
        await asyncio.sleep(5)
        
        # Send stop event
        stop_event = {
            "event": "stop",
            "sequence_number": chunk_number + 2,
            "stream_sid": stream_sid,
            "stop": {
                "call_sid": call_sid,
                "account_sid": "test_account",
                "reason": "stopped",
            },
        }
        await ws.send(json.dumps(stop_event))
        print("📤 Sent: stop event")
        
        # Wait a bit more
        await asyncio.sleep(2)
        
        # Cancel receiver task
        receiver_task.cancel()
        try:
            await receiver_task
        except asyncio.CancelledError:
            pass
        
        print()
        print("✅ Test completed!")
        print(f"   Check your frontend UI for call_sid: {call_sid}")
        print(f"   WebSocket URL: {ws_url}")


def load_audio_file(file_path: str):
    """Load WAV file and return audio data and sample rate"""
    try:
        with wave.open(file_path, "rb") as wav_file:
            sample_rate = wav_file.getframerate()
            num_channels = wav_file.getnchannels()
            sample_width = wav_file.getsampwidth()
            frames = wav_file.readframes(wav_file.getnframes())
            
            # Convert to mono if stereo
            if num_channels == 2:
                # Simple stereo to mono conversion (average channels)
                import struct
                samples = struct.unpack(f"<{len(frames)//sample_width}h", frames)
                mono_samples = [
                    (samples[i] + samples[i + 1]) // 2
                    for i in range(0, len(samples), 2)
                ]
                frames = struct.pack(f"<{len(mono_samples)}h", *mono_samples)
            
            return frames, sample_rate
    except Exception as e:
        print(f"❌ Error loading audio file: {e}")
        print("   Generating test audio instead...")
        return generate_test_audio(16000, 10), 16000


def generate_test_audio(sample_rate: int, duration_seconds: int):
    """Generate test audio (sine wave)"""
    import struct
    import math
    
    samples = sample_rate * duration_seconds
    audio_data = bytearray()
    
    # Generate 440Hz tone
    for i in range(samples):
        sample = int(16000 * math.sin(2 * math.pi * 440 * i / sample_rate))
        audio_data.extend(struct.pack("<h", sample))
    
    return bytes(audio_data)


if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="Test Pipecat service with local audio file")
    parser.add_argument(
        "audio_file",
        nargs="?",
        help="Path to WAV audio file (optional, generates test audio if not provided)",
    )
    parser.add_argument(
        "--url",
        default="wss://pipecat-ndpx.onrender.com/v1/ingest",
        help="WebSocket URL (default: wss://pipecat-ndpx.onrender.com/v1/ingest)",
    )
    parser.add_argument(
        "--interval",
        type=float,
        default=2.0,
        help="Interval between chunks in seconds (default: 2.0)",
    )
    
    args = parser.parse_args()
    
    try:
        asyncio.run(test_audio_streaming(args.url, args.audio_file, args.interval))
    except KeyboardInterrupt:
        print("\n⚠️  Test interrupted by user")
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

