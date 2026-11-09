#!/usr/bin/env bash
# Registers the Google Sign-In redirect scheme (REVERSED_CLIENT_ID) from
# ios/Mushafi/Resources/GoogleService-Info.plist into the app's Info.plist.
# Without that file the app still builds; account sync is simply not offered.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
config="$root/Mushafi/Resources/GoogleService-Info.plist"
info="$root/Mushafi/Info.plist"
if [[ ! -f "$config" ]]; then
  echo "::warning::GoogleService-Info.plist not found — building without Apple/Google sign-in and sync."
  exit 0
fi
reversed="$(/usr/libexec/PlistBuddy -c 'Print :REVERSED_CLIENT_ID' "$config" 2>/dev/null || true)"
if [[ -z "$reversed" ]]; then
  echo "::error::GoogleService-Info.plist has no REVERSED_CLIENT_ID. Enable Google sign-in in Firebase, then download the file again."
  exit 1
fi
count="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleURLTypes' "$info" | grep -c 'CFBundleURLSchemes' || true)"
if ! /usr/libexec/PlistBuddy -c 'Print :CFBundleURLTypes' "$info" | grep -q "$reversed"; then
  /usr/libexec/PlistBuddy -c "Add :CFBundleURLTypes:$count dict" "$info"
  /usr/libexec/PlistBuddy -c "Add :CFBundleURLTypes:$count:CFBundleURLName string google-sign-in" "$info"
  /usr/libexec/PlistBuddy -c "Add :CFBundleURLTypes:$count:CFBundleURLSchemes array" "$info"
  /usr/libexec/PlistBuddy -c "Add :CFBundleURLTypes:$count:CFBundleURLSchemes:0 string $reversed" "$info"
fi
bundle="$(/usr/libexec/PlistBuddy -c 'Print :BUNDLE_ID' "$config" 2>/dev/null || true)"
if [[ -n "$bundle" && "$bundle" != "com.mohammedasif.mushafi" ]]; then
  echo "::error::GoogleService-Info.plist belongs to '$bundle', not com.mohammedasif.mushafi. Download the file of the iOS app com.mohammedasif.mushafi."
  exit 1
fi
echo "Google sign-in URL scheme registered."
