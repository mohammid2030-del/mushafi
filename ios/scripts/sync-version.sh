#!/usr/bin/env bash
# One version for both stores: copy versionName/versionCode from android/build.gradle
# into ios/project.yml (MARKETING_VERSION / CURRENT_PROJECT_VERSION).
set -euo pipefail
root="$(cd "$(dirname "$0")/../.." && pwd)"
gradle="$root/android/build.gradle"
project="$root/ios/project.yml"

name="$(perl -ne "print \$1 if /versionName\s+'([^']+)'/" "$gradle")"
code="$(perl -ne 'print $1 if /versionCode\s+(\d+)/' "$gradle")"
if [[ -z "$name" || -z "$code" ]]; then
  echo "Could not read versionName/versionCode from $gradle" >&2
  exit 1
fi

perl -pi -e "s/MARKETING_VERSION: \"[^\"]*\"/MARKETING_VERSION: \"$name\"/; s/CURRENT_PROJECT_VERSION: \"[^\"]*\"/CURRENT_PROJECT_VERSION: \"$code\"/" "$project"
echo "iOS version set to $name ($code)"
echo "MUSHAFI_VERSION_NAME=$name" >> "${GITHUB_ENV:-/dev/null}"
echo "MUSHAFI_VERSION_CODE=$code" >> "${GITHUB_ENV:-/dev/null}"
