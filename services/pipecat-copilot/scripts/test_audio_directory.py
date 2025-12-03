#!/usr/bin/env python3
"""
Test script to send multiple audio chunks from a directory sequentially
Simulates real Exotel streaming by sending chunks every 2 seconds

Usage:
    python scripts/test_audio_directory.py /path/to/audio/directory [--url wss://pipecat-ndpx.onrender.com/v1/ingest]
"""

import asyncio
import base64
import json
import sys
import wave
import websockets
from pathlib import Path
from typing import List, Optional
import re


async def test_audio_directory(
    ws_url: str,
    audio_directory: str,
    chunk_interval: float = 2.0,
    pattern: Optional[str] = None,
):
    """Test audio streaming with multiple files from a directory"""
    
    audio_dir = Path(audio_directory)
    if not audio_dir.exists():
        print(f"❌ Directory not found: {audio_directory}")
        sys.exit(1)
    
    # Find all WAV files
    wav_files = sorted(audio_dir.glob("*.wav"))
    
    if not wav_files:
        print(f"❌ No WAV files found in: {audio_directory}")
        sys.exit(1)
    
    # Filter by pattern if provided
    if pattern:
        wav_files = [f for f in wav_files if pattern in f.name]
    
    # Sort files by sequence number if they have one (e.g., chunk-000655)
    def extract_sequence(filename):
        match = re.search(r'chunk-(\d+)', filename.name)
        return int(match.group(1)) if match else 0
    
    try:
        wav_files = sorted(wav_files, key=extract_sequence)
    except:
        # If sorting fails, use natural sort
        wav_files = sorted(wav_files)
    
    print(f"🚀 Starting audio streaming test...")
    print(f"   WebSocket URL: {ws_url}")
    print(f"   Audio Directory: {audio_directory}")
    print(f"   Found {len(wav_files)} WAV files")
    print(f"   Chunk Interval: {chunk_interval} seconds")
    print()
    
    # Load first file to get sample rate
    first_file = wav_files[0]
    _, sample_rate = load_audio_file(str(first_file))
    print(f"📁 Sample Rate: {sample_rate} Hz (detected from first file)")
    print(f"📁 Files to send:")
    for i, f in enumerate(wav_files[:10], 1):
        print(f"   {i}. {f.name}")
    if len(wav_files) > 10:
        print(f"   ... and {len(wav_files) - 10} more files")
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

        # Start receiving messages in background
        transcripts_received = []
        
        async def receive_messages():
            try:
                async for message in ws:
                    try:
                        data = json.loads(message)
                        if "transcript" in str(data).lower() or "text" in str(data).lower():
                            transcripts_received.append(data)
                            print(f"📥 Transcript: {data}")
                    except:
                        if len(message) < 200:
                            print(f"📥 Received: {message}")
            except websockets.exceptions.ConnectionClosed:
                print("🔌 WebSocket connection closed")
        
        receiver_task = asyncio.create_task(receive_messages())
        
        # Send audio files sequentially
        print("📤 Sending audio chunks...")
        print("-" * 60)
        
        chunk_number = 0
        
        for i, audio_file in enumerate(wav_files, 1):
            try:
                audio_data, file_sample_rate = load_audio_file(str(audio_file))
                
                # Warn if sample rate differs
                if file_sample_rate != sample_rate:
                    print(f"⚠️  Warning: {audio_file.name} has sample rate {file_sample_rate}Hz (expected {sample_rate}Hz)")
                
                # Encode to base64
                chunk_b64 = base64.b64encode(audio_data).decode("utf-8")
                
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
                print(f"📤 Sent chunk {chunk_number}/{len(wav_files)}: {audio_file.name} ({len(audio_data)} bytes)")
                
                # Wait before next chunk (except for last one)
                if i < len(wav_files):
                    await asyncio.sleep(chunk_interval)
                    
            except Exception as e:
                print(f"❌ Error processing {audio_file.name}: {e}")
                continue
        
        print("-" * 60)
        print(f"✅ Sent {chunk_number} chunks from {len(wav_files)} files")
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
        print(f"   Total transcripts received: {len(transcripts_received)}")
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
                import struct
                samples = struct.unpack(f"<{len(frames)//sample_width}h", frames)
                mono_samples = [
                    (samples[i] + samples[i + 1]) // 2
                    for i in range(0, len(samples), 2)
                ]
                frames = struct.pack(f"<{len(mono_samples)}h", *mono_samples)
            
            return frames, sample_rate
    except Exception as e:
        raise Exception(f"Error loading audio file {file_path}: {e}")


if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="Test Pipecat service with audio files from directory")
    parser.add_argument(
        "audio_directory",
        help="Path to directory containing WAV audio files",
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
    parser.add_argument(
        "--pattern",
        help="Filter files by pattern (e.g., '96918385294411543c4a833980c119bn')",
    )
    
    args = parser.parse_args()
    
    try:
        asyncio.run(test_audio_directory(args.url, args.audio_directory, args.interval, args.pattern))
    except KeyboardInterrupt:
        print("\n⚠️  Test interrupted by user")
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

