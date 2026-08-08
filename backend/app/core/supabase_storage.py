"""
Supabase Storage client — uploads media and returns a public URL.
"""
from supabase import create_client, Client

from app.core.config import settings

_client: Client | None = None


def get_supabase_client() -> Client:
    global _client
    if _client is None:
        _client = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY)
    return _client


def upload_report_file(file_bytes: bytes, storage_path: str, content_type: str) -> str:
    """
    Uploads bytes to the configured Supabase bucket at storage_path
    (e.g. "42/ab12cd34.jpg") and returns the public URL.
    """
    client = get_supabase_client()
    client.storage.from_(settings.SUPABASE_BUCKET).upload(
        storage_path,
        file_bytes,
        {"content-type": content_type},
    )
    return client.storage.from_(settings.SUPABASE_BUCKET).get_public_url(storage_path)