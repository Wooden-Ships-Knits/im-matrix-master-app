"""Who is allowed to change things.

Two roles, and only one password:

  operator  entered the password; may read and write
  guest     asked for no password; may read, and nothing else

The password is compared on the server and never sent to the browser. What the
browser holds is a token that says which role it has and when that expires —
signed with the password itself, so a token cannot be forged without knowing
it, and changing the password invalidates every token in circulation.

This is deliberately not a user system. There are no accounts, so there is
nothing to say who an operator was — `done_by` on the checklist is typed in,
not authenticated. It keeps people out; it does not tell them apart.
"""
import hashlib
import hmac
import time
from base64 import urlsafe_b64decode, urlsafe_b64encode

from fastapi import Header, HTTPException

from .settings import settings

OPERATOR = "operator"
GUEST = "guest"

# The methods that change something. A guest may do none of them.
WRITE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}


def _sign(payload: str) -> str:
    return hmac.new(settings.app_password.encode(), payload.encode(),
                    hashlib.sha256).hexdigest()


def issue(role: str) -> dict:
    """A token for this role, good until it expires."""
    expires = int(time.time()) + settings.session_hours * 3600
    payload = f"{role}:{expires}"
    token = urlsafe_b64encode(f"{payload}:{_sign(payload)}".encode()).decode()
    return {"role": role, "token": token, "expires": expires}


def read(token: str | None) -> str | None:
    """The role a token carries, or None if it is missing, bad or expired.

    Compared with compare_digest rather than ==, so a wrong signature takes
    the same time to reject however much of it was right.
    """
    if not token:
        return None
    try:
        role, expires, signature = urlsafe_b64decode(token.encode()).decode().split(":")
    except Exception:
        return None
    if not hmac.compare_digest(signature, _sign(f"{role}:{expires}")):
        return None
    if int(expires) < time.time():
        return None
    return role if role in (OPERATOR, GUEST) else None


def require_operator(authorization: str | None = Header(default=None)) -> str:
    """A dependency for routes that change something."""
    role = read((authorization or "").removeprefix("Bearer ").strip() or None)
    if role is None:
        raise HTTPException(401, "Sign in to make changes")
    if role != OPERATOR:
        raise HTTPException(403, "Guests can look, but not change anything")
    return role
