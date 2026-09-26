"""One call per channel, returning rows the importer can store."""
from ..settings import settings
from .salesforce import Salesforce
from .season import season_to_code
from .shopify import Shopify
from .token import access_token


def fetch_sales(season: str, start_date: str, end_date: str) -> dict:
    """{'WHS_000': [...], 'SY': [...]} — Salesforce and Shopify for one window.

    season_to_code raises on a season it does not recognise rather than
    passing it through, so a typo fails loudly instead of quietly fetching
    nothing.
    """
    code = season_to_code(season)

    salesforce = Salesforce(
        username=settings.salesforce_username,
        password=settings.salesforce_password,
        security_token=settings.salesforce_security_token,
        start=start_date, end=end_date, season=season,
    )
    # Minted per fetch: the token in the environment is short-lived and the
    # 401 it gives when stale looks like a credentials problem, not an expiry.
    token = access_token(settings.shopify_store,
                         settings.shopify_client_id,
                         settings.shopify_client_secret)
    shopify = Shopify(
        store=settings.shopify_store,
        token=token,
        api_version=settings.shopify_api_version,
        start=start_date, end=end_date, code=code,
    )
    return {"WHS_000": salesforce.rows(), "SY": shopify.rows()}
