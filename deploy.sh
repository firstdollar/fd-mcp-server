#!/bin/bash
#
# Deploy MCP Server to Cloud Run
#
# Usage:
#   ./deploy.sh                    # Deploy to first-dollar-hackathon (default)
#   ./deploy.sh my-project-id      # Deploy to custom project
#
# Prerequisites:
#   - gcloud CLI installed and authenticated
#   - Docker installed (for local builds)
#

set -e

PROJECT_ID="${1:-first-dollar-hackathon}"
REGION="us-central1"
SERVICE_NAME="fd-mcp-server"
IMAGE_NAME="gcr.io/${PROJECT_ID}/${SERVICE_NAME}"

# Partner API URL (change for different environments)
PARTNER_API_URL="${PARTNER_API_URL:-https://api.dev.firstdollar.com}"

echo "=========================================="
echo "Deploying MCP Server to Cloud Run"
echo "=========================================="
echo "Project:      ${PROJECT_ID}"
echo "Region:       ${REGION}"
echo "Service:      ${SERVICE_NAME}"
echo "Partner API:  ${PARTNER_API_URL}"
echo "=========================================="

# Navigate to repo root
cd "$(dirname "$0")"

# Set the project
echo "Setting GCP project..."
gcloud config set project "${PROJECT_ID}"

# Build the Docker image
echo "Building Docker image..."
docker build \
    -t "${IMAGE_NAME}:latest" \
    -f Dockerfile \
    .

# Push to Container Registry
echo "Pushing image to GCR..."
docker push "${IMAGE_NAME}:latest"

# Deploy to Cloud Run
echo "Deploying to Cloud Run..."
gcloud run deploy "${SERVICE_NAME}" \
    --image "${IMAGE_NAME}:latest" \
    --region "${REGION}" \
    --platform managed \
    --allow-unauthenticated \
    --port 8080 \
    --memory 512Mi \
    --cpu 1 \
    --min-instances 0 \
    --max-instances 10 \
    --set-env-vars "NODE_ENV=production,MCP_PORT=8080,MCP_HOST=0.0.0.0,PARTNER_API_URL=${PARTNER_API_URL}"

# Get the service URL
SERVICE_URL=$(gcloud run services describe "${SERVICE_NAME}" --region "${REGION}" --format 'value(status.url)')

echo ""
echo "=========================================="
echo "Deployment complete!"
echo "=========================================="
echo "Service URL: ${SERVICE_URL}"
echo "MCP Endpoint: ${SERVICE_URL}/mcp"
echo "Health Check: ${SERVICE_URL}/health"
echo ""
echo "To connect Claude Desktop/Code, add to your MCP config:"
echo ""
echo '{
  "mcpServers": {
    "fd-partner-api": {
      "url": "'${SERVICE_URL}'/mcp",
      "transport": "streamable-http",
      "headers": {
        "Authorization": "Bearer YOUR_FIREBASE_TOKEN"
      }
    }
  }
}'
