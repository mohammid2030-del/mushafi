#!/usr/bin/env python3
"""Verifies the App Store Connect API key before the long build, with a clear message.

Signs an ES256 JWT with openssl (no extra packages) and calls GET /v1/apps.
"""
import base64, json, os, subprocess, sys, time, urllib.error, urllib.request


def b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def der_to_raw(der: bytes) -> bytes:
    # ECDSA-Sig-Value ::= SEQUENCE { r INTEGER, s INTEGER } → 64-byte r||s
    def read_int(buf, i):
        assert buf[i] == 0x02
        length = buf[i + 1]
        value = buf[i + 2:i + 2 + length]
        return int.from_bytes(value, "big"), i + 2 + length
    i = 2 if der[1] < 0x80 else 2 + (der[1] & 0x7F)
    r, i = read_int(der, i)
    s, _ = read_int(der, i)
    return r.to_bytes(32, "big") + s.to_bytes(32, "big")


key_id, issuer, path = os.environ["ASC_KEY_ID"], os.environ["ASC_ISSUER_ID"], os.environ["ASC_KEY_PATH"]
header = b64url(json.dumps({"alg": "ES256", "kid": key_id, "typ": "JWT"}).encode())
now = int(time.time())
payload = b64url(json.dumps({"iss": issuer, "iat": now, "exp": now + 600, "aud": "appstoreconnect-v1"}).encode())
signing_input = f"{header}.{payload}".encode()
der = subprocess.run(["openssl", "dgst", "-sha256", "-sign", path], input=signing_input, capture_output=True, check=True).stdout
token = f"{header}.{payload}.{b64url(der_to_raw(der))}"

request = urllib.request.Request("https://api.appstoreconnect.apple.com/v1/apps?limit=200&fields[apps]=bundleId,name",
                                 headers={"Authorization": f"Bearer {token}"})
try:
    with urllib.request.urlopen(request, timeout=30) as response:
        apps = json.load(response).get("data", [])
except urllib.error.HTTPError as error:
    detail = error.read().decode(errors="replace")[:300]
    if error.code == 401:
        print("::error::App Store Connect rejected the API key (401). The three secrets do not belong together: "
              "ASC_KEY_ID must be the Key ID of the SAME key whose .p8 is in ASC_KEY_P8_BASE64, created under "
              "Users and Access → Integrations → App Store Connect API → Team Keys, and ASC_ISSUER_ID is the Issuer ID "
              "shown above that table. (A Sign in with Apple key from developer.apple.com will not work here.)")
    elif error.code == 403:
        print("::error::The API key works but lacks permission (403). Create the Team Key with the Admin role.")
    else:
        print(f"::error::App Store Connect API returned HTTP {error.code}: {detail}")
    sys.exit(1)

bundle = os.environ.get("APP_BUNDLE_ID", "")
names = {a["attributes"].get("bundleId"): a["attributes"].get("name") for a in apps}
print(f"App Store Connect key OK — {len(apps)} app(s) visible.")
if bundle and bundle not in names:
    print(f"::warning::No App Store Connect app uses {bundle} yet. Create it (Apps → + → New App) before uploading.")
