#!/bin/bash
set -e

# Build script for AgentRed Toolbox Docker image

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IMAGE_NAME="${PLATFORM_SANDBOX_IMAGE:-agentred-toolbox}"
IMAGE_TAG="${IMAGE_TAG:-latest}"
FULL_IMAGE="${IMAGE_NAME}:${IMAGE_TAG}"

echo "Building AgentRed Toolbox Docker Image"
echo "========================================"
echo "Image: $FULL_IMAGE"
echo ""

# Build the image
docker build \
  -f "${SCRIPT_DIR}/agentred-toolbox.Dockerfile" \
  -t "$FULL_IMAGE" \
  "${SCRIPT_DIR}"

echo ""
echo "Build complete: $FULL_IMAGE"
echo ""

# Test the image
echo "Testing image..."
docker run --rm "$FULL_IMAGE" echo "AgentRed Toolbox is ready"

# Show installed tools
echo ""
echo "Installed tools:"
docker run --rm "$FULL_IMAGE" sh -c "echo '- nuclei:' && nuclei -version 2>&1 | head -1"
docker run --rm "$FULL_IMAGE" sh -c "echo '- httpx:' && httpx -version 2>&1 | head -1"
docker run --rm "$FULL_IMAGE" sh -c "echo '- ffuf:' && ffuf -V 2>&1 | head -1"
docker run --rm "$FULL_IMAGE" sh -c "echo '- sqlmap:' && sqlmap --version 2>&1 | head -1"
docker run --rm "$FULL_IMAGE" sh -c "echo '- nmap:' && nmap --version 2>&1 | head -1"

echo ""
echo "Image size:"
docker images "$IMAGE_NAME" --format "table {{.Repository}}\t{{.Tag}}\t{{.Size}}"

echo ""
echo "To use this image, set:"
echo "  export PLATFORM_ENABLE_SANDBOX=1"
echo "  export PLATFORM_SANDBOX_IMAGE=$FULL_IMAGE"
