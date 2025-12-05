#!/bin/bash
#
# Deploy MCP Web UI to Cloud Run
#
# Usage:
#   ./deploy-web.sh                    # Deploy to first-dollar-hackathon (default)
#   ./deploy-web.sh my-project-id      # Deploy to custom project
#

set -e

PROJECT_ID="${1:-first-dollar-hackathon}"
REGION="us-central1"
SERVICE_NAME="fd-mcp-web"
IMAGE_NAME="${REGION}-docker.pkg.dev/${PROJECT_ID}/cloud-run-source-deploy/${SERVICE_NAME}:latest"

# Manager API URL for web UI chat
MANAGER_API_URL="${MANAGER_API_URL:-https://manager.dev.firstdollar.com}"

echo "=========================================="
echo "Deploying MCP Web UI to Cloud Run"
echo "=========================================="
echo "Project:      ${PROJECT_ID}"
echo "Region:       ${REGION}"
echo "Service:      ${SERVICE_NAME}"
echo "Manager API:  ${MANAGER_API_URL}"
echo "=========================================="

# Navigate to repo root
cd "$(dirname "$0")"

# Set the project
echo "Setting GCP project..."
gcloud config set project "${PROJECT_ID}"

# Build using Cloud Build with Dockerfile.web
echo "Building image via Cloud Build..."
gcloud builds submit \
    --config cloudbuild-web.yaml \
    --substitutions="_IMAGE_NAME=${IMAGE_NAME}" \
    --timeout=600s \
    .

# Deploy to Cloud Run
echo "Deploying to Cloud Run..."
gcloud run deploy "${SERVICE_NAME}" \
    --image "${IMAGE_NAME}" \
    --region "${REGION}" \
    --platform managed \
    --allow-unauthenticated \
    --port 3000 \
    --memory 512Mi \
    --cpu 1 \
    --min-instances 0 \
    --max-instances 10 \
    --set-env-vars "NODE_ENV=production,MANAGER_API_URL=${MANAGER_API_URL}"

# Get the service URL
SERVICE_URL=$(gcloud run services describe "${SERVICE_NAME}" --region "${REGION}" --format 'value(status.url)')

echo ""
echo "=========================================="
echo "Deployment complete!"
echo "=========================================="
echo "Web UI URL: ${SERVICE_URL}"
echo ""
