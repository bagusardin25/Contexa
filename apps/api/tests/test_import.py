import io
import zipfile

import httpx
import pytest
from fastapi.testclient import TestClient

from app.documents.importing import github_target

from .conftest import FakeLLM, FakeTokens, build_client, make_pdf

PAGE = b"""<!doctype html><html><head><title>Notewave | Architecture</title>
<script>window.track()</script></head><body>
<nav><a href="/">Home</a><a href="/pricing">Pricing</a></nav>
<main><h1>Notewave architecture</h1>
<p>Notewave is a realtime notes app built on Supabase Realtime.</p>
<h2>Conflict handling</h2>
<p>Each note row carries a version column. Writes use optimistic locking: the client sends
the version it last read, and the update is rejected when the stored version changed.</p>
<h2>Sync</h2><p>Changes are broadcast over one channel per note in about 150 ms.</p>
</main><footer>Copyright Notewave</footer></body></html>"""

PUBLIC = "93.184.216.34"


async def public_dns(host: str, port: int) -> list[str]:
    return {"internal.example": ["10.0.0.7"], "mixed.example": [PUBLIC, "127.0.0.1"]}.get(
        host, [PUBLIC]
    )


def repo_zip(files: dict[str, bytes], root: str = "acme-notewave-3f2a1c9") -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr(f"{root}/", b"")
        for path, content in files.items():
            archive.writestr(f"{root}/{path}", content)
    return buffer.getvalue()


REPO = repo_zip(
    {
        "README.md": b"# Notewave\n\nRealtime collaborative notes for students.\n",
        "docs/architecture.md": (
            b"# Architecture\n\n## Conflict handling\n\nWrites use optimistic locking on a "
            b"version column.\n"
        ),
        "docs/pricing.txt": b"Pricing will be evaluated after the Q4 pilot.",
        "node_modules/lib/README.md": b"# Some dependency\n\nNot ours.",
        ".github/ISSUE_TEMPLATE.md": b"# Issue\n\nDescribe the bug.",
        "LICENSE.md": b"MIT License",
        "CHANGELOG.md": b"# 1.0.0\n\nFirst release.",
        "src/app.py": b"print('hello')",
        "docs/huge.md": b"# Huge\n\n" + b"x" * 300_000,
    }
)


class FakeWeb:
    def __init__(self) -> None:
        self.requests: list[httpx.Request] = []
        self.routes: dict[str, httpx.Response] = {}

    def handler(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        url = str(request.url)
        if url in self.routes:
            return self.routes[url]
        return httpx.Response(404, text="not found")


@pytest.fixture
def web() -> FakeWeb:
    fake = FakeWeb()
    fake.routes.update(
        {
            "https://docs.example.com/architecture": httpx.Response(
                200, content=PAGE, headers={"content-type": "text/html; charset=utf-8"}
            ),
            "https://docs.example.com/moved": httpx.Response(
                301, headers={"location": "/architecture"}
            ),
            "https://docs.example.com/to-internal": httpx.Response(
                302, headers={"location": "http://internal.example/admin"}
            ),
            "https://docs.example.com/spec.pdf": httpx.Response(
                200,
                content=make_pdf(["Spec: optimistic locking with a version column."]),
                headers={"content-type": "application/pdf"},
            ),
            "https://docs.example.com/notes.md": httpx.Response(
                200,
                content=b"# Notes\n\n## Deploy\n\nWe deploy on Fly.io.",
                headers={"content-type": "text/plain"},
            ),
            "https://docs.example.com/logo.png": httpx.Response(
                200, content=b"\x89PNG\r\n\x1a\n\x00\x00", headers={"content-type": "image/png"}
            ),
            "https://docs.example.com/app": httpx.Response(
                200,
                content=b"<html><body><div id=root></div><script>boot()</script></body></html>",
                headers={"content-type": "text/html"},
            ),
            "https://docs.example.com/big": httpx.Response(
                200, content=b"a" * 2048, headers={"content-type": "text/plain"}
            ),
            "https://api.github.com/repos/acme/notewave/zipball": httpx.Response(
                302,
                headers={
                    "location": "https://codeload.github.com/acme/notewave/legacy.zip/refs/heads/main"
                },
            ),
            "https://codeload.github.com/acme/notewave/legacy.zip/refs/heads/main": httpx.Response(
                200, content=REPO, headers={"content-type": "application/zip"}
            ),
            "https://api.github.com/repos/acme/notewave/zipball/main": httpx.Response(
                200, content=REPO, headers={"content-type": "application/zip"}
            ),
            "https://api.github.com/repos/acme/limited/zipball": httpx.Response(
                403, json={"message": "API rate limit exceeded"}
            ),
            "https://raw.githubusercontent.com/acme/notewave/main/docs/architecture.md": (
                httpx.Response(
                    200,
                    content=b"# Architecture\n\nOptimistic locking.",
                    headers={"content-type": "text/plain; charset=utf-8"},
                )
            ),
        }
    )
    return fake


@pytest.fixture
def importing(fake_llm: FakeLLM, fake_tokens: FakeTokens, web: FakeWeb):
    with build_client(
        fake_llm, fake_tokens, web=web.handler, resolver=public_dns, max_import_bytes=1024 * 1024
    ) as client:
        yield client


def new_session(client: TestClient) -> str:
    return client.post("/api/sessions", json={}).json()["id"]


def import_url(client: TestClient, session_id: str, url: str, **extra):
    return client.post(f"/api/sessions/{session_id}/documents/import", json={"url": url, **extra})


def test_web_page_becomes_a_document_with_sections(importing: TestClient, web: FakeWeb) -> None:
    session_id = new_session(importing)
    response = import_url(importing, session_id, "https://docs.example.com/moved", documentId="d1")
    assert response.status_code == 201, response.text
    doc = response.json()
    assert doc["id"] == "d1" and doc["kind"] == "web" and doc["status"] == "ready"
    assert doc["name"] == "Notewave | Architecture"
    assert doc["sourceUrl"] == "https://docs.example.com/moved"
    assert doc["chunkCount"] >= 2 and "Notewave" in doc["keyterms"]
    assert web.requests[0].headers["user-agent"].startswith("Contexa/")
    session = importing.get(f"/api/sessions/{session_id}").json()
    assert [d["id"] for d in session["documents"]] == ["d1"]
    # It can be removed like an upload.
    assert importing.delete(f"/api/sessions/{session_id}/documents/d1").status_code == 204


def test_pdf_markdown_and_other_types(importing: TestClient) -> None:
    session_id = new_session(importing)
    # A pasted link without a scheme is taken as https.
    bare = import_url(importing, session_id, "docs.example.com/notes.md")
    assert (
        bare.status_code == 201 and bare.json()["sourceUrl"] == "https://docs.example.com/notes.md"
    )
    assert (
        importing.delete(f"/api/sessions/{session_id}/documents/{bare.json()['id']}").status_code
        == 204
    )
    pdf = import_url(importing, session_id, "https://docs.example.com/spec.pdf").json()
    assert pdf["kind"] == "pdf" and pdf["name"] == "spec.pdf" and pdf["status"] == "ready"
    md = import_url(importing, session_id, "https://docs.example.com/notes.md").json()
    assert md["kind"] == "md" and md["chunkCount"] == 1
    png = import_url(importing, session_id, "https://docs.example.com/logo.png")
    assert png.status_code == 415
    app = import_url(importing, session_id, "https://docs.example.com/app")
    assert app.status_code == 422 and "JavaScript" in app.json()["detail"]
    missing = import_url(importing, session_id, "https://docs.example.com/nope")
    assert missing.status_code == 502 and "HTTP 404" in missing.json()["detail"]


@pytest.mark.parametrize(
    ("url", "reason"),
    [
        ("http://127.0.0.1:8000/health", "standard web ports"),
        ("http://127.0.0.1/admin", "private or local network"),
        ("http://[::ffff:127.0.0.1]/admin", "private or local network"),
        ("http://169.254.169.254/latest/meta-data", "private or local network"),
        ("http://internal.example/", "private or local network"),
        ("http://mixed.example/", "private or local network"),
        ("https://docs.example.com/to-internal", "private or local network"),
        ("ftp://docs.example.com/file.txt", "Only http:// and https://"),
        ("https://user:secret@docs.example.com/", "user name or password"),
        ("notaurl", "doesn't look like a web address"),
    ],
)
def test_private_networks_and_odd_links_are_refused(
    importing: TestClient, web: FakeWeb, url: str, reason: str
) -> None:
    session_id = new_session(importing)
    response = import_url(importing, session_id, url)
    assert response.status_code == 422, response.text
    assert reason in response.json()["detail"]
    # Nothing private was ever requested.
    assert all(r.url.host == "docs.example.com" for r in web.requests)


def test_size_limit(fake_llm: FakeLLM, fake_tokens: FakeTokens, web: FakeWeb) -> None:
    with build_client(
        fake_llm, fake_tokens, web=web.handler, resolver=public_dns, max_import_bytes=1000
    ) as client:
        response = import_url(client, new_session(client), "https://docs.example.com/big")
    assert response.status_code == 413 and "larger than" in response.json()["detail"]


def test_github_repository_readme_and_docs(importing: TestClient, fake_llm: FakeLLM) -> None:
    session_id = new_session(importing)
    response = import_url(importing, session_id, "https://github.com/acme/notewave")
    assert response.status_code == 201, response.text
    doc = response.json()
    assert doc["kind"] == "repo" and doc["name"] == "acme/notewave"
    assert doc["sourceUrl"] == "https://github.com/acme/notewave"
    # README, docs/architecture.md, docs/pricing.txt; no dependencies, CI, licence, or code.
    chunks = importing.get(f"/api/sessions/{session_id}").json()["documents"][0]["chunkCount"]
    assert chunks == 3

    # Evidence points at the file and section.
    import json

    from .conftest import ORIGIN

    with importing.websocket_connect(
        f"/ws/sessions/{session_id}", headers={"origin": ORIGIN}
    ) as ws:
        ws.send_json(
            {
                "type": "turn_final",
                "turn": {
                    "id": "t1",
                    "speaker": "B",
                    "text": "How do you handle concurrent updates?",
                    "detectedLanguage": "en",
                    "startedAtMs": 0,
                    "endedAtMs": 1000,
                },
            }
        )
        events = []
        while not events or events[-1]["type"] != "suggestion_ready":
            events.append(ws.receive_json())
    evidence = next(e for e in events if e["type"] == "suggestion_evidence")["evidence"]
    assert evidence[0]["location"] == "docs/architecture.md · Conflict handling"
    prompt = json.dumps(fake_llm.calls("grounded_answer")[0]["messages"], ensure_ascii=False)
    assert "acme/notewave · docs/architecture.md" in prompt


def test_github_folder_single_file_and_errors(importing: TestClient, web: FakeWeb) -> None:
    session_id = new_session(importing)
    docs = import_url(importing, session_id, "https://github.com/acme/notewave/tree/main/docs")
    assert docs.status_code == 201, docs.text
    assert docs.json()["name"] == "acme/notewave/docs"
    assert docs.json()["chunkCount"] == 2  # architecture + pricing, not the README

    single = import_url(
        importing,
        session_id,
        "https://github.com/acme/notewave/blob/main/docs/architecture.md",
    )
    assert single.status_code == 201 and single.json()["kind"] == "md"

    missing = import_url(importing, session_id, "https://github.com/acme/ghost")
    assert missing.status_code == 422 and "GITHUB_TOKEN" in missing.json()["detail"]
    limited = import_url(importing, session_id, "https://github.com/acme/limited")
    assert limited.status_code == 429 and "rate limit" in limited.json()["detail"]
    empty = import_url(importing, session_id, "https://github.com/acme/notewave/tree/main/src")
    assert empty.status_code == 422 and "No README or docs" in empty.json()["detail"]
    assert "authorization" not in web.requests[0].headers


def test_github_token_and_limits(fake_llm: FakeLLM, fake_tokens: FakeTokens, web: FakeWeb) -> None:
    with build_client(
        fake_llm,
        fake_tokens,
        web=web.handler,
        resolver=public_dns,
        github_token="ghp_secret",
        max_documents_per_session=1,
    ) as client:
        session_id = new_session(client)
        first = import_url(client, session_id, "https://github.com/acme/notewave", documentId="r")
        assert first.status_code == 201
        assert web.requests[0].headers["authorization"] == "Bearer ghp_secret"
        again = import_url(client, session_id, "https://github.com/acme/notewave", documentId="r")
        assert again.status_code == 409
        over = import_url(client, session_id, "https://docs.example.com/notes.md")
        assert over.status_code == 409 and "up to 1 documents" in over.json()["detail"]


@pytest.mark.parametrize(
    ("url", "expected"),
    [
        ("https://github.com/acme/notewave", ("acme", "notewave", None, None, None)),
        ("https://github.com/acme/notewave.git", ("acme", "notewave", None, None, None)),
        (
            "https://www.github.com/acme/site.github.io/",
            ("acme", "site.github.io", None, None, None),
        ),
        (
            "https://github.com/acme/notewave/tree/dev/docs/api",
            ("acme", "notewave", "tree", "dev", "docs/api"),
        ),
        (
            "https://github.com/acme/notewave/blob/main/README.md",
            ("acme", "notewave", "blob", "main", "README.md"),
        ),
    ],
)
def test_github_links(url: str, expected: tuple) -> None:
    target = github_target(url)
    assert target is not None
    assert (target.owner, target.repo, target.mode, target.ref, target.path) == expected
    assert github_target("https://github.com/acme") is None
    assert github_target("https://gitlab.com/acme/notewave") is None
