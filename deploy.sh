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
#

set -e

PROJECT_ID="${1:-first-dollar-hackathon}"
REGION="us-central1"
SERVICE_NAME="fd-mcp-server"

# API URLs (change for different environments)
PARTNER_API_URL="${PARTNER_API_URL:-https://api.dev.firstdollar.com}"
FD_BACKEND_API_URL="${FD_BACKEND_API_URL:-https://api.dev.firstdollar.com}"

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

# Deploy to Cloud Run (builds and deploys in one step)
echo "Building and deploying to Cloud Run..."
gcloud run deploy "${SERVICE_NAME}" \
    --source . \
    --region "${REGION}" \
    --platform managed \
    --allow-unauthenticated \
    --port 8080 \
    --memory 512Mi \
    --cpu 1 \
    --min-instances 0 \
    --max-instances 10 \
    --set-env-vars "NODE_ENV=production,MCP_PORT=8080,MCP_HOST=0.0.0.0,PARTNER_API_URL=${PARTNER_API_URL},FD_BACKEND_API_URL=${FD_BACKEND_API_URL}"

# Get the service URL
SERVICE_URL=$(gcloud run services describe "${SERVICE_NAME}" --region "${REGION}" --format 'value(status.url)')

echo ""
echo "=========================================="
echo "Deployment complete!"
echo "=========================================="
echo "Service URL: ${SERVICE_URL}"
echo "MCP Endpoint: ${SERVICE_URL}/mcp/partner"
echo "Health Check: ${SERVICE_URL}/health"
echo ""
echo "To connect Claude Desktop/Code, add to your MCP config:"
echo ""
echo '{
  "mcpServers": {
    "fd-partner-api": {
      "url": "'${SERVICE_URL}'/mcp/partner",
      "transport": "streamable-http",
      "headers": {
        "X-API-Key": "your-client-id@partner.firstdollar.com:your-client-secret"
      }
    }
  }
}'
