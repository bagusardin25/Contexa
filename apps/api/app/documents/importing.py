"""Documents from links: a web page, a PDF or Markdown file on the web, a single GitHub
file, or a whole GitHub repository (its README and docs).

A repository becomes one document whose sections are its files, so a session's
document limit still holds and evidence reads "docs/architecture.md · Conflict handling".
"""

import io
import re
import zipfile
from dataclasses import dataclass
from pathlib import PurePosixPath
from urllib.parse import quote, unquote, urlsplit

from app.models.session import DocumentKind

from .fetch import Fetched, GitHubClient, ImportFailed, SafeFetcher
from .html import html_to_markdown
from .parsing import DocumentParseError, Section, parse_document

_GITHUB_PATH = re.compile(
    r"^/(?P<owner>[A-Za-z0-9](?:[A-Za-z0-9-]{0,38}))/(?P<repo>[A-Za-z0-9._-]{1,100}?)(?:\.git)?"
    r"(?:/(?P<mode>tree|blob)/(?P<ref>[^/]+)(?:/(?P<path>.+?))?)?/?$"
)
_MARKDOWN_SUFFIXES = {".md", ".markdown", ".mdx"}
_TEXT_SUFFIXES = {".txt", ".rst"}
_SKIP_DIRS = {
    "node_modules",
    "vendor",
    "dist",
    "build",
    "out",
    "target",
    ".git",
    ".github",
    "__pycache__",
    "site-packages",
    "third_party",
    "fixtures",
    "testdata",
}
_NOISE = re.compile(r"^(license|licence|changelog|changes|history|code_of_conduct|security)", re.I)
MAX_REPO_FILES = 40
MAX_REPO_FILE_BYTES = 200_000
MAX_REPO_TEXT_BYTES = 1_500_000
MAX_ZIP_ENTRIES = 20_000


@dataclass(frozen=True)
class Imported:
    name: str
    kind: DocumentKind
    source_url: str
    size_bytes: int
    sections: list[Section]


@dataclass(frozen=True)
class GitHubTarget:
    owner: str
    repo: str
    mode: str | None
    ref: str | None
    path: str | None


def normalize_url(url: str) -> str:
    """People paste "github.com/owner/repo" or "docs.example.com/page": assume https."""
    url = url.strip()
    if "://" not in url:
        host = url.split("/", 1)[0]
        if "." not in host or " " in url:
            raise ImportFailed("That doesn't look like a web address.", 422)
        url = f"https://{url}"
    return url


def github_target(url: str) -> GitHubTarget | None:
    parts = urlsplit(url)
    if parts.hostname not in ("github.com", "www.github.com"):
        return None
    match = _GITHUB_PATH.match(unquote(parts.path))
    if not match:
        return None
    return GitHubTarget(
        owner=match["owner"],
        repo=match["repo"],
        mode=match["mode"],
        ref=match["ref"],
        path=(match["path"] or "").strip("/") or None,
    )


def _title(text: str, limit: int = 120) -> str:
    text = " ".join(text.split())
    return text if len(text) <= limit else f"{text[: limit - 1].rstrip()}…"


def _parse(data: bytes, kind: DocumentKind) -> list[Section]:
    try:
        return parse_document(data, kind)
    except DocumentParseError as exc:
        raise ImportFailed(str(exc), 422) from exc


def page_document(fetched: Fetched, source_url: str) -> Imported:
    """Blocking parse of a fetched web resource."""
    path = PurePosixPath(unquote(urlsplit(fetched.url).path))
    suffix = path.suffix.lower()
    fallback_name = _title(f"{urlsplit(fetched.url).hostname}{path}".rstrip("/"))
    media = fetched.media_type
    data = fetched.data

    if media == "application/pdf" or data.startswith(b"%PDF-"):
        return Imported(
            name=_title(path.name or fallback_name),
            kind="pdf",
            source_url=source_url,
            size_bytes=len(data),
            sections=_parse(data, "pdf"),
        )
    if b"\x00" in data[:8192]:
        raise ImportFailed("That link isn't a web page, Markdown, text, or PDF.", 415)
    if suffix in _MARKDOWN_SUFFIXES or media in ("text/markdown", "text/x-markdown"):
        return Imported(
            name=_title(path.name or fallback_name),
            kind="md",
            source_url=source_url,
            size_bytes=len(data),
            sections=_parse(data, "md"),
        )
    if media in ("text/html", "application/xhtml+xml") or (
        not media and data.lstrip()[:15].lower().startswith((b"<!doctype html", b"<html"))
    ):
        html = data.decode(fetched.charset or "utf-8", errors="replace")
        title, markdown = html_to_markdown(html)
        if len(markdown) < 40:
            raise ImportFailed(
                "That page has almost no text; it may need JavaScript to show its content.", 422
            )
        return Imported(
            name=_title(title or fallback_name),
            kind="web",
            source_url=source_url,
            size_bytes=len(markdown.encode()),
            sections=_parse(markdown.encode(), "md"),
        )
    if media.startswith("text/") or suffix in _TEXT_SUFFIXES:
        return Imported(
            name=_title(path.name or fallback_name),
            kind="txt",
            source_url=source_url,
            size_bytes=len(data),
            sections=_parse(data, "txt"),
        )
    raise ImportFailed("That link isn't a web page, Markdown, text, or PDF.", 415)


def _priority(path: str) -> tuple[int, int, str]:
    parts = path.split("/")
    name = parts[-1].lower()
    if len(parts) == 1 and name.startswith("readme"):
        return (0, 0, path)
    if parts[0].lower() in ("docs", "doc", "documentation"):
        return (1, len(parts), path)
    if len(parts) == 1:
        return (2, 0, path)
    return (3, len(parts), path)


def repository_document(data: bytes, target: GitHubTarget) -> Imported:
    """Blocking: the README, docs, and other Markdown/text files of a zipball, as one document."""
    try:
        archive = zipfile.ZipFile(io.BytesIO(data))
    except zipfile.BadZipFile as exc:
        raise ImportFailed("GitHub sent a download that isn't a valid archive.", 502) from exc
    with archive:
        entries = archive.infolist()
        if len(entries) > MAX_ZIP_ENTRIES:
            raise ImportFailed("This repository has too many files to import.", 413)
        scope = (target.path or "").strip("/")
        candidates: list[tuple[tuple[int, int, str], str, zipfile.ZipInfo]] = []
        for entry in entries:
            if entry.is_dir() or "/" not in entry.filename:
                continue
            path = entry.filename.split("/", 1)[1]  # drop the "owner-repo-sha/" folder
            if scope and not (path == scope or path.startswith(f"{scope}/")):
                continue
            parts = path.split("/")
            if any(part.lower() in _SKIP_DIRS or part.startswith(".") for part in parts[:-1]):
                continue
            suffix = PurePosixPath(parts[-1]).suffix.lower()
            if suffix not in _MARKDOWN_SUFFIXES | _TEXT_SUFFIXES or _NOISE.match(parts[-1]):
                continue
            if entry.file_size == 0 or entry.file_size > MAX_REPO_FILE_BYTES:
                continue
            candidates.append((_priority(path), path, entry))

        sections: list[Section] = []
        total = 0
        for _, path, entry in sorted(candidates)[:MAX_REPO_FILES]:
            if total + entry.file_size > MAX_REPO_TEXT_BYTES:
                break
            content = archive.read(entry)
            if b"\x00" in content[:8192]:
                continue
            kind: DocumentKind = (
                "md" if PurePosixPath(path).suffix.lower() in _MARKDOWN_SUFFIXES else "txt"
            )
            try:
                file_sections = parse_document(content, kind)
            except DocumentParseError:
                continue
            total += len(content)
            for section in file_sections:
                heading = f"{path} · {section.heading}" if section.heading else path
                sections.append(Section(text=section.text, heading=heading))

    if not sections:
        where = f" in {scope}" if scope else ""
        raise ImportFailed(
            f"No README or docs (Markdown or text files) were found{where} in this repository.",
            422,
        )
    name = f"{target.owner}/{target.repo}" + (f"/{scope}" if scope else "")
    source = f"https://github.com/{target.owner}/{target.repo}"
    if target.ref:
        source += f"/tree/{quote(target.ref)}" + (f"/{quote(scope)}" if scope else "")
    return Imported(name=name, kind="repo", source_url=source, size_bytes=total, sections=sections)


class Importer:
    def __init__(self, fetcher: SafeFetcher, github: GitHubClient) -> None:
        self.fetcher = fetcher
        self.github = github

    async def fetch(self, url: str) -> tuple[str, bytes | Fetched, GitHubTarget | None]:
        """Network part of an import; parsing happens in a worker thread afterwards."""
        url = normalize_url(url)
        target = github_target(url)
        if target is not None and target.mode == "blob" and target.ref and target.path:
            # A single file: its raw content, fetched like any other link.
            raw = (
                f"https://raw.githubusercontent.com/{target.owner}/{target.repo}/"
                f"{quote(target.ref)}/{quote(target.path)}"
            )
            return url, await self.fetcher.fetch(raw), None
        if target is not None:
            return url, await self.github.zipball(target.owner, target.repo, target.ref), target
        return url, await self.fetcher.fetch(url), None

    async def aclose(self) -> None:
        await self.fetcher.aclose()
        await self.github.aclose()


def build_document(url: str, payload: bytes | Fetched, target: GitHubTarget | None) -> Imported:
    """Blocking; run it in a worker thread."""
    if target is not None:
        assert isinstance(payload, bytes)
        return repository_document(payload, target)
    assert isinstance(payload, Fetched)
    return page_document(payload, url)
