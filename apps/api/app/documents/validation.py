"""Upload checks. The client-provided MIME type is never trusted (guide §31)."""

import io
import re
import unicodedata
import zipfile
from pathlib import PurePath

from app.models.session import DocumentKind

ALLOWED_EXTENSIONS: dict[str, DocumentKind] = {
    ".pdf": "pdf",
    ".docx": "docx",
    ".md": "md",
    ".markdown": "md",
    ".txt": "txt",
}

# DOCX is a ZIP container; cap what it may expand to (zip-bomb guard).
MAX_DOCX_UNCOMPRESSED_BYTES = 64 * 1024 * 1024
MAX_DOCX_ENTRIES = 2000


class UploadRejected(Exception):
    """The upload can't be accepted at all (wrong type, empty, too large)."""

    def __init__(self, message: str, status_code: int = 400):
        super().__init__(message)
        self.message = message
        self.status_code = status_code


def sanitize_filename(name: str | None) -> str:
    """Keep a readable display name without path parts or control characters."""
    base = PurePath((name or "").replace("\\", "/")).name
    base = unicodedata.normalize("NFKC", base)
    base = "".join(ch for ch in base if unicodedata.category(ch)[0] != "C")
    base = re.sub(r"[^\w .()\-\[\]]+", "_", base).strip(" .")
    if len(base) > 120:
        stem, dot, ext = base.rpartition(".")
        base = f"{stem[: 110 - len(ext)]}{dot}{ext}" if dot else base[:120]
    return base or "document"


def detect_kind(filename: str) -> DocumentKind:
    suffix = PurePath(filename).suffix.lower()
    kind = ALLOWED_EXTENSIONS.get(suffix)
    if kind is None:
        raise UploadRejected("Only PDF, DOCX, Markdown, and TXT files are supported.", 415)
    return kind


def content_problem(data: bytes, kind: DocumentKind) -> str | None:
    """Return a user-facing problem when the bytes don't match the declared kind."""
    if kind == "pdf":
        if not data.startswith(b"%PDF-"):
            return "This file doesn't look like a valid PDF."
        return None

    if kind == "docx":
        if not data.startswith(b"PK\x03\x04"):
            return "This file doesn't look like a valid DOCX document."
        try:
            with zipfile.ZipFile(io.BytesIO(data)) as archive:
                entries = archive.infolist()
                if "word/document.xml" not in archive.namelist():
                    return "This file doesn't look like a valid DOCX document."
                if len(entries) > MAX_DOCX_ENTRIES:
                    return "This DOCX file has too many parts to process."
                if sum(entry.file_size for entry in entries) > MAX_DOCX_UNCOMPRESSED_BYTES:
                    return "This DOCX file expands to more than 64 MB and can't be processed."
        except zipfile.BadZipFile:
            return "This file doesn't look like a valid DOCX document."
        return None

    # Markdown and plain text must actually be text.
    if b"\x00" in data[:8192]:
        return "This file contains binary data, not text."
    return None
