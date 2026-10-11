#!/usr/bin/env bash
# Publish the website to the stack's Amplify Hosting app. Run after the stack is deployed:
#   bash backend/deploy-site.sh [stack-name]
set -euo pipefail
STACK=${1:-saans}
export AWS_REGION=${AWS_REGION:-ap-south-1} AWS_PAGER=""
cd "$(dirname "$0")/.."
out() { aws cloudformation describe-stacks --stack-name "$STACK" --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text; }
APP=$(out SiteAppId) URL=$(out SiteUrl)
if [ -z "$APP" ] || [ "$APP" = None ]; then echo "Stack $STACK has no SiteAppId output yet; wait for the deploy to finish." >&2; exit 1; fi

ZIP=$(mktemp -u).zip
trap 'rm -f "$ZIP"' EXIT
zip -q "$ZIP" index.html styles.css health.js trip.js quiz.js app.js frontend-config.js manifest.webmanifest icon.svg sw.js
read -r JOB UPLOAD < <(aws amplify create-deployment --app-id "$APP" --branch-name main --query '[jobId,zipUploadUrl]' --output text)
curl -sSf -H 'Content-Type: application/zip' -T "$ZIP" "$UPLOAD"
aws amplify start-deployment --app-id "$APP" --branch-name main --job-id "$JOB" >/dev/null

while :; do
  STATUS=$(aws amplify get-job --app-id "$APP" --branch-name main --job-id "$JOB" --query 'job.summary.status' --output text)
  case "$STATUS" in SUCCEED) echo "Live at $URL"; exit 0 ;; FAILED|CANCELLED) echo "Deployment $JOB $STATUS" >&2; exit 1 ;; esac
  sleep 3
done
