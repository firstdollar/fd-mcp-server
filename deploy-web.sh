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
REPO_NAME="cloud-run-source-deploy"
IMAGE_NAME="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}/${SERVICE_NAME}"

# Partner API URL for tool execution
PARTNER_API_URL="${PARTNER_API_URL:-https://api.dev.firstdollar.com}"

echo "=========================================="
echo "Deploying MCP Web UI to Cloud Run"
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

# Build and push using Cloud Build
echo "Building and pushing image via Cloud Build..."
gcloud builds submit \
    --tag "${IMAGE_NAME}:latest" \
    --config cloudbuild-web.yaml \
    --timeout=600s \
    .

# Deploy to Cloud Run
echo "Deploying to Cloud Run..."
gcloud run deploy "${SERVICE_NAME}" \
    --image "${IMAGE_NAME}:latest" \
    --region "${REGION}" \
    --platform managed \
    --allow-unauthenticated \
    --port 3000 \
    --memory 512Mi \
    --cpu 1 \
    --min-instances 0 \
    --max-instances 10 \
    --set-env-vars "NODE_ENV=production,API_URL=${PARTNER_API_URL},NEXT_PUBLIC_API_URL=${PARTNER_API_URL}"

# Get the service URL
SERVICE_URL=$(gcloud run services describe "${SERVICE_NAME}" --region "${REGION}" --format 'value(status.url)')

echo ""
echo "=========================================="
echo "Deployment complete!"
echo "=========================================="
echo "Web UI URL: ${SERVICE_URL}"
echo ""
