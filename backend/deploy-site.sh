#!/usr/bin/env bash
# Upload the website to the stack's S3 bucket and refresh CloudFront. Run after the stack is deployed:
#   bash backend/deploy-site.sh [stack-name]
set -euo pipefail
STACK=${1:-saans}
export AWS_REGION=${AWS_REGION:-ap-south-1} AWS_PAGER=""
cd "$(dirname "$0")/.."
out() { aws cloudformation describe-stacks --stack-name "$STACK" --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text; }
BUCKET=$(out SiteBucketName) DIST=$(out SiteDistributionId) URL=$(out SiteUrl)

type_of() { case "$1" in
  *.html) echo 'text/html; charset=utf-8' ;; *.js) echo 'text/javascript; charset=utf-8' ;; *.css) echo 'text/css; charset=utf-8' ;;
  *.svg) echo 'image/svg+xml' ;; *.webmanifest) echo 'application/manifest+json' ;; esac; }
put() { aws s3 cp "$1" "s3://$BUCKET/$1" --only-show-errors --content-type "$(type_of "$1")" --cache-control "$2"; echo "  $1"; }

# Entry points revalidate on every visit; the rest is cached 5 minutes (CloudFront ignores the ?v= query strings).
for f in index.html sw.js frontend-config.js manifest.webmanifest; do put "$f" 'no-cache'; done
for f in app.js health.js trip.js quiz.js styles.css icon.svg; do put "$f" 'public, max-age=300'; done
aws cloudfront create-invalidation --distribution-id "$DIST" --paths '/*' --query 'Invalidation.Id' --output text >/dev/null
echo "Live at $URL (CloudFront refresh takes about a minute)"
