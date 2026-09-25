import re

from app.rag.index import Chunk

from .parsing import Section

TARGET_CHARS = 900
OVERLAP_CHARS = 150
_SENTENCE_RE = re.compile(r"(?<=[.!?。！？])\s+")


def _pieces(text: str) -> list[str]:
    """Paragraphs, with oversized ones broken at sentence (then hard) boundaries."""
    pieces: list[str] = []
    for paragraph in (p.strip() for p in text.split("\n\n")):
        if not paragraph:
            continue
        if len(paragraph) <= TARGET_CHARS:
            pieces.append(paragraph)
            continue
        for sentence in _SENTENCE_RE.split(paragraph):
            while len(sentence) > TARGET_CHARS:
                pieces.append(sentence[:TARGET_CHARS])
                sentence = sentence[TARGET_CHARS:]
            if sentence.strip():
                pieces.append(sentence.strip())
    return pieces


def _tail(text: str) -> str:
    if len(text) <= OVERLAP_CHARS:
        return text
    tail = text[-OVERLAP_CHARS:]
    space = tail.find(" ")
    return tail[space + 1 :] if 0 <= space < 60 else tail


def chunk_sections(sections: list[Section], document_id: str, document_name: str) -> list[Chunk]:
    """Split sections into ~900-character chunks with a small overlap inside each section."""
    chunks: list[Chunk] = []

    def emit(content: str, section: Section) -> None:
        chunks.append(
            Chunk(
                id=f"{document_id}:{len(chunks)}",
                document_id=document_id,
                document_name=document_name,
                index=len(chunks),
                content=content,
                page=section.page,
                heading=section.heading,
            )
        )

    for section in sections:
        current = ""
        for piece in _pieces(section.text):
            candidate = f"{current}\n\n{piece}" if current else piece
            if len(candidate) <= TARGET_CHARS or not current:
                current = candidate
                continue
            emit(current, section)
            current = f"{_tail(current)}\n\n{piece}"
        if current:
            emit(current, section)
    return chunks
