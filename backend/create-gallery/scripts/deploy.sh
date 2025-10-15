#!/usr/bin/env bash
set -euo pipefail

# ---- Config (edit if names change) ----
FUNCTION_NAME="mylg-v12-create-gallery-dev"
REGION="us-west-2"
LAMBDA_IMAGE="public.ecr.aws/lambda/python:3.12"   # must match your Lambda runtime

# ---- Paths ----
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUILD="$ROOT/.build"
OUTDIR="$ROOT/.serverless"
ZIP="$OUTDIR/createGalleryFunction.zip"
HANDLER="$ROOT/lambda_function.py"
REQ="$ROOT/requirements.txt"

echo "== Deploy $FUNCTION_NAME ($REGION) =="
mkdir -p "$BUILD" "$OUTDIR"
rm -rf "$BUILD"/* "$ZIP"

# Copy code
cp "$HANDLER" "$BUILD/"

# Deps (optional): build inside Lambda's image so wheels match Amazon Linux
if [[ -f "$REQ" ]]; then
  docker run --rm \
    -v "$BUILD":/var/task \
    -v "$ROOT":/opt \
    --entrypoint /bin/bash \
    "$LAMBDA_IMAGE" \
    -lc "python -m pip install --upgrade pip && python -m pip install -r /opt/requirements.txt -t /var/task"
fi

# Zip package
( cd "$BUILD" && zip -rq "$ZIP" . )
echo "Packaged -> $ZIP"

# Update code
aws lambda update-function-code \
  --function-name "$FUNCTION_NAME" \
  --zip-file "fileb://$ZIP" \
  --region "$REGION" >/dev/null

aws lambda wait function-updated --function-name "$FUNCTION_NAME" --region "$REGION"
echo "Lambda code updated."

# Smoke invoke
aws lambda invoke \
  --function-name "$FUNCTION_NAME" \
  --payload '{"smoke":"ping"}' \
  --cli-binary-format raw-in-base64-out \
  --region "$REGION" \
  "$OUTDIR/invoke.json" >/dev/null || true

echo "---- INVOKE OUTPUT ----"
cat "$OUTDIR/invoke.json" || true
echo
echo "---- TAIL LOGS (2m) ----"
aws logs tail "/aws/lambda/$FUNCTION_NAME" --since 2m --region "$REGION" || true

echo "✅ Deploy complete."
