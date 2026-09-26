"""A fresh Shopify access token for one fetch.

web-apps calls this before every run and writes the result back into its .env
with dotenv.set_key. Here it is held in memory for the length of the call
instead: the grant is client_credentials, so minting one is a single cheap
request, and nothing has to write to a file that a container cannot safely
rewrite. It also removes the question of two projects sharing one cached
token and invalidating each other's.
"""
import json
import urllib.parse
import urllib.request


def access_token(store: str, client_id: str, client_secret: str) -> str:
    if not (store and client_id and client_secret):
        raise ValueError(
            "SHOPIFY_STORE, SHOPIFY_CLIENT_ID and SHOPIFY_CLIENT_SECRET are "
            "all needed to mint an access token")
    url = f"https://{store}/admin/oauth/access_token"
    body = urllib.parse.urlencode({
        "grant_type": "client_credentials",
        "client_id": client_id,
        "client_secret": client_secret,
    }).encode()
    req = urllib.request.Request(
        url, method="POST", data=body,
        headers={"Content-Type": "application/x-www-form-urlencoded"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)["access_token"]
