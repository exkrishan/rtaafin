# Test Scripts

## test_local_audio.py

Test script to simulate Exotel audio streaming from a single local audio file.

## test_audio_directory.py

Test script to send multiple audio chunks from a directory sequentially. Perfect for testing with real call audio chunks.

### Prerequisites

- Python 3.10+
- `websockets` package (already in requirements.txt)

### Usage

#### Option 1: Test with generated audio (no file needed)
```bash
cd services/pipecat-copilot
python scripts/test_local_audio.py --url wss://pipecat-ndpx.onrender.com/v1/ingest
```

#### Option 2: Test with your own audio file
```bash
python scripts/test_local_audio.py /path/to/your/audio.wav --url wss://pipecat-ndpx.onrender.com/v1/ingest
```

#### Option 3: Custom chunk interval (e.g., 1 second)
```bash
python scripts/test_local_audio.py audio.wav --url wss://pipecat-ndpx.onrender.com/v1/ingest --interval 1.0
```

### Audio File Requirements

- Format: WAV (PCM16)
- Sample Rate: Any (8kHz, 16kHz, 24kHz recommended)
- Channels: Mono or Stereo (will be converted to mono)
- Duration: Any length

### What It Does

1. Connects to the Pipecat service WebSocket endpoint
2. Sends Exotel protocol messages:
   - `connected` event
   - `start` event with call metadata
   - `media` events with audio chunks (every 2 seconds by default)
   - `stop` event when done
3. Displays transcripts as they're received
4. Shows the `call_sid` for viewing in your frontend UI

### Example Output

```
🚀 Starting audio streaming test...
   WebSocket URL: wss://pipecat-ndpx.onrender.com/v1/ingest
   Audio File: /path/to/audio.wav
   Chunk Interval: 2.0 seconds

📁 Loaded audio file: /path/to/audio.wav
   Sample Rate: 16000 Hz
   Duration: 10.50 seconds

✅ WebSocket connected
📤 Sent: connected event
📤 Sent: start event (call_sid: test_call_1234567890)

📤 Sending audio chunks...
------------------------------------------------------------
📤 Sent chunk 1 (64000 bytes, ~2.0s)
📤 Sent chunk 2 (64000 bytes, ~2.0s)
📥 Transcript: {"text": "Hello, this is a test", "is_final": false}
...
------------------------------------------------------------
✅ Sent 5 chunks

⏳ Waiting for final transcripts...
📤 Sent: stop event

✅ Test completed!
   Check your frontend UI for call_sid: test_call_1234567890
```

### Troubleshooting

- **Connection refused**: Check that the service URL is correct and the service is running
- **No transcripts**: Verify that your STT provider API keys are configured correctly
- **Audio file errors**: Ensure the file is a valid WAV file (PCM16 format)

---

## test_audio_directory.py

Test script to send multiple audio chunks from a directory sequentially. Perfect for testing with real call audio chunks.

### Usage

#### Basic usage (send all WAV files in directory)
```bash
cd services/pipecat-copilot
python scripts/test_audio_directory.py /path/to/audio/directory --url wss://pipecat-ndpx.onrender.com/v1/ingest
```

#### Filter files by pattern
```bash
python scripts/test_audio_directory.py /path/to/audio/directory --pattern "96918385294411543c4a833980c119bn" --url wss://pipecat-ndpx.onrender.com/v1/ingest
```

#### Custom interval
```bash
python scripts/test_audio_directory.py /path/to/audio/directory --interval 1.5 --url wss://pipecat-ndpx.onrender.com/v1/ingest
```

### Example: Testing with your audio files

```bash
cd services/pipecat-copilot
python scripts/test_audio_directory.py /Users/kirti.krishnan/Desktop/Projects/RTAA/rtaa_audio_files --url wss://pipecat-ndpx.onrender.com/v1/ingest
```

This will:
1. Find all `.wav` files in the directory
2. Sort them by sequence number (if present in filename)
3. Send each file as a separate chunk every 2 seconds
4. Display transcripts as they arrive

### Features

- **Automatic sorting**: Files are sorted by sequence number if present (e.g., `chunk-000655`, `chunk-000695`)
- **Pattern filtering**: Filter files by pattern in filename
- **Sample rate detection**: Automatically detects sample rate from first file
- **Real-time transcripts**: Shows transcripts as they're received
- **Error handling**: Continues even if individual files fail to load

