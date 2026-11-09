#!/usr/bin/env bash
# Writes the App Store Connect API key from the ASC_KEY_P8_BASE64 secret to disk.
# Accepts the .p8 as base64 (with or without a "data:...;base64," prefix, line breaks or
# spaces) or the raw "-----BEGIN PRIVATE KEY-----" text pasted directly.
set -euo pipefail
: "${ASC_KEY_ID:?}" "${ASC_KEY_P8_BASE64:?}" "${RUNNER_TEMP:?}"
key="$RUNNER_TEMP/AuthKey_${ASC_KEY_ID}.p8"
raw="$ASC_KEY_P8_BASE64"

if printf '%s' "$raw" | grep -q "BEGIN PRIVATE KEY"; then
  printf '%s\n' "$raw" | sed 's/\r$//' > "$key"
else
  cleaned="$(printf '%s' "$raw" | sed -E 's#^data:[^,]*,##' | tr -d ' \r\n\t')"
  printf '%s' "$cleaned" | base64 --decode > "$key" 2>/dev/null || {
    echo "::error::ASC_KEY_P8_BASE64 is not valid base64. Paste the base64 of the App Store Connect .p8 file, or the file's text itself."
    exit 1
  }
fi

if ! head -1 "$key" | grep -q "BEGIN PRIVATE KEY"; then
  echo "::error::ASC_KEY_P8_BASE64 does not contain an App Store Connect private key (expected -----BEGIN PRIVATE KEY-----, got $(wc -c < "$key") bytes starting with '$(head -c 12 "$key" | tr -cd '[:print:]')')."
  exit 1
fi
if ! openssl pkey -in "$key" -noout 2>/dev/null; then
  echo "::error::The App Store Connect private key could not be read. Make sure the secret holds the complete .p8 file."
  exit 1
fi
if [[ ! "$ASC_KEY_ID" =~ ^[A-Z0-9]{10}$ ]]; then
  echo "::error::ASC_KEY_ID should be the 10-character Key ID (letters/digits) shown next to the key in App Store Connect."
  exit 1
fi
if [[ ! "${ASC_ISSUER_ID:-}" =~ ^[0-9a-f-]{36}$ ]]; then
  echo "::error::ASC_ISSUER_ID should be the Issuer ID (36 characters with dashes) shown above the keys table."
  exit 1
fi
echo "ASC_KEY_PATH=$key" >> "$GITHUB_ENV"
echo "App Store Connect key installed ($(wc -l < "$key") lines)."
