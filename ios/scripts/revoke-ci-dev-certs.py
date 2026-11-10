#!/usr/bin/env python3
"""Revokes the throw-away Apple Development certificates that earlier CI runs created.

Every GitHub runner is a fresh Mac, so cloud-managed automatic signing creates a new
development certificate for each archive. Apple caps how many may exist, so builds fail
once the cap is reached. Only certificates Xcode created through the API ("Created via
API") are revoked; distribution certificates and anything made by hand are left alone.
Revoking a development certificate does not affect App Store or TestFlight builds.
"""
import base64, json, os, subprocess, time, urllib.error, urllib.request


def b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def der_to_raw(der: bytes) -> bytes:
    def read_int(buf, i):
        length = buf[i + 1]
        return int.from_bytes(buf[i + 2:i + 2 + length], "big"), i + 2 + length
    i = 2 if der[1] < 0x80 else 2 + (der[1] & 0x7F)
    r, i = read_int(der, i)
    s, _ = read_int(der, i)
    return r.to_bytes(32, "big") + s.to_bytes(32, "big")


def token() -> str:
    header = b64url(json.dumps({"alg": "ES256", "kid": os.environ["ASC_KEY_ID"], "typ": "JWT"}).encode())
    now = int(time.time())
    payload = b64url(json.dumps({"iss": os.environ["ASC_ISSUER_ID"], "iat": now, "exp": now + 600, "aud": "appstoreconnect-v1"}).encode())
    signing_input = f"{header}.{payload}".encode()
    der = subprocess.run(["openssl", "dgst", "-sha256", "-sign", os.environ["ASC_KEY_PATH"]], input=signing_input,
                         capture_output=True, check=True).stdout
    return f"{header}.{payload}.{b64url(der_to_raw(der))}"


def call(method: str, path: str):
    request = urllib.request.Request("https://api.appstoreconnect.apple.com" + path, method=method,
                                     headers={"Authorization": f"Bearer {token()}"})
    with urllib.request.urlopen(request, timeout=30) as response:
        body = response.read()
        return json.loads(body) if body else {}


try:
    certs = call("GET", "/v1/certificates?limit=200&filter[certificateType]=DEVELOPMENT,IOS_DEVELOPMENT"
                        "&fields[certificates]=name,displayName,certificateType,expirationDate").get("data", [])
except urllib.error.HTTPError as error:
    print(f"::warning::Could not list certificates (HTTP {error.code}); continuing.")
    raise SystemExit(0)

for c in certs:
    print("  found:", c["attributes"].get("certificateType"), "|", c["attributes"].get("displayName") or c["attributes"].get("name"), "| expires", (c["attributes"].get("expirationDate") or "")[:10])
ci = [c for c in certs if "Created via API" in (c["attributes"].get("name") or "") + (c["attributes"].get("displayName") or "")]
# This project is built only in CI (no Mac), so if Xcode named them differently, every development
# certificate is a CI leftover: keep none, Xcode creates a fresh one for this run.
if not ci and os.environ.get("MUSHAFI_REVOKE_ALL_DEV_CERTS") == "1":
    ci = certs
revoked = 0
for cert in ci:
    try:
        call("DELETE", f"/v1/certificates/{cert['id']}")
        revoked += 1
    except urllib.error.HTTPError as error:
        print(f"::warning::Could not revoke a CI development certificate (HTTP {error.code}).")
print(f"Development certificates: {len(certs)} total, {len(ci)} created by CI, {revoked} revoked.")
