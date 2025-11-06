# Render Deployment Fix for services/ingest

## Problem
Docker build fails because `lib/pubsub` is outside the build context when building from `services/ingest`.

## Solution Options

### Option 1: Use npm build (Recommended)
**Don't use Docker** - Use npm build instead:

- **Root Directory**: `services/ingest`
- **Build Command**: `npm run build`
- **Start Command**: `npm start`
- **Environment**: `Node`

The `prebuild` script will automatically copy `lib/pubsub` before build.

### Option 2: Use Docker from repo root
If you must use Docker:

- **Root Directory**: `.` (repo root)
- **Dockerfile Path**: `services/ingest/Dockerfile`
- **Environment**: `Docker`

The Dockerfile will copy `lib/pubsub` from the repo root.

## Recommended: Option 1 (npm build)
This is simpler and works with Render's default setup.
