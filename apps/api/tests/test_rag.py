from app.documents.chunking import chunk_sections
from app.documents.parsing import parse_document
from app.rag.index import Chunk, LexicalIndex, make_snippet
from app.rag.tokenize import tokenize

from .conftest import README


def build_index() -> LexicalIndex:
    index = LexicalIndex()
    index.add(chunk_sections(parse_document(README, "md"), "doc_readme", "README.md"))
    return index


def test_tokenize_drops_stopwords_and_bigrams_cjk() -> None:
    assert tokenize("How does the WebSocket reconnect?") == ["websocket", "reconnect"]
    assert tokenize("Bagaimana cara kerja sinkronisasi") == ["cara", "kerja", "sinkronisasi"]
    assert tokenize("同時更新") == ["同時", "時更", "更新"]
    assert "supabase" in tokenize("Supabaseの設定")


def test_search_finds_the_relevant_section() -> None:
    results = build_index().search(
        ["How do you handle concurrent updates when two people edit the same note?"],
        ["concurrent updates", "optimistic locking", "version column"],
    )
    assert results
    assert results[0].chunk.heading == "Conflict handling"
    assert 0 < results[0].score <= 1
    assert "optimistic locking" in results[0].highlights
    assert "version column" in results[0].highlights


def test_search_bridges_languages_through_keywords() -> None:
    results = build_index().search(
        ["二人が同じノートを同時に編集した場合、同時更新をどう処理していますか？"],
        ["optimistic locking", "concurrent edits", "version"],
    )
    assert results and results[0].chunk.heading == "Conflict handling"


def test_search_returns_nothing_for_unrelated_questions() -> None:
    assert build_index().search(["What is your favourite football team?"], ["football"]) == []
    assert LexicalIndex().search(["anything"], ["anything"]) == []


def test_remove_document() -> None:
    index = build_index()
    other = Chunk(
        id="doc_other:0",
        document_id="doc_other",
        document_name="x.txt",
        index=0,
        content="Kubernetes autoscaling policy",
    )
    index.add([other])
    index.remove_document("doc_readme")
    assert len(index) == 1
    assert index.search(["optimistic locking"], ["optimistic locking"]) == []
    assert index.search(["kubernetes autoscaling"], ["kubernetes"])[0].chunk.id == "doc_other:0"


def test_make_snippet_centres_on_highlight() -> None:
    content = "intro " * 200 + "the optimistic locking rule" + " outro" * 200
    snippet = make_snippet(content, ["optimistic locking"], max_chars=200)
    assert "optimistic locking" in snippet
    assert snippet.startswith("…") and snippet.endswith("…")
    assert make_snippet("short text", ["x"]) == "short text"
