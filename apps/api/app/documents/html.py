"""Readable text from a web page, written as Markdown so the Markdown parser finds its
sections. Only text is kept: scripts never run, and navigation and footers are dropped."""

import re
from html.parser import HTMLParser

_SKIP = {
    "script",
    "style",
    "noscript",
    "svg",
    "nav",
    "footer",
    "aside",
    "form",
    "iframe",
    "template",
    "button",
    "select",
    "canvas",
    "object",
    "head",
}
_BLOCK = {
    "p",
    "div",
    "section",
    "article",
    "main",
    "header",
    "ul",
    "ol",
    "table",
    "tr",
    "blockquote",
    "figure",
    "figcaption",
    "dl",
    "dt",
    "dd",
}
_HEADINGS = {"h1": 1, "h2": 2, "h3": 3, "h4": 4, "h5": 5, "h6": 6}
# <main> or <article> is the page's content when it holds at least this much text.
_MIN_MAIN_CHARS = 200


class _Extractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.all: list[str] = []
        self.main: list[str] = []
        self.title = ""
        self.first_h1 = ""
        self._skip = 0
        self._main = 0
        self._pre = 0
        self._in_title = False
        self._heading: str | None = None
        self._heading_text: list[str] = []

    def _emit(self, text: str) -> None:
        self.all.append(text)
        if self._main:
            self.main.append(text)

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag == "title":
            self._in_title = True
            return
        if tag in _SKIP:
            self._skip += 1  # a skipped region, possibly nested in another one
            return
        if self._skip:
            return
        if tag in ("main", "article"):
            self._main += 1
        if tag in _HEADINGS:
            self._heading = tag
            self._heading_text = []
        elif tag == "li":
            self._emit("\n- ")
        elif tag == "pre":
            self._pre += 1
            self._emit("\n\n```\n")
        elif tag in ("br", "tr"):
            self._emit("\n")
        elif tag in ("td", "th"):
            self._emit(" | ")
        elif tag == "hr":
            self._emit("\n\n")
        elif tag in _BLOCK:
            self._emit("\n\n")

    def handle_endtag(self, tag: str) -> None:
        if tag == "title":
            self._in_title = False
            return
        if tag in _SKIP:
            self._skip = max(0, self._skip - 1)
            return
        if self._skip:
            return
        if tag in ("main", "article") and self._main:
            self._main -= 1
        if tag == self._heading:
            text = " ".join("".join(self._heading_text).split())
            if text:
                if tag == "h1" and not self.first_h1:
                    self.first_h1 = text
                self._emit(f"\n\n{'#' * _HEADINGS[tag]} {text}\n\n")
            self._heading = None
        elif tag == "pre" and self._pre:
            self._pre -= 1
            self._emit("\n```\n\n")
        elif tag in _BLOCK or tag == "li":
            self._emit("\n")

    def handle_data(self, data: str) -> None:
        if self._in_title:
            self.title += data
            return
        if self._skip:
            return
        if self._heading:
            self._heading_text.append(data)
            return
        self._emit(data if self._pre else re.sub(r"\s+", " ", data))


def html_to_markdown(html: str) -> tuple[str, str]:
    """(title, Markdown text) of a page. The title falls back to the first <h1>."""
    extractor = _Extractor()
    extractor.feed(html)
    extractor.close()
    main = "".join(extractor.main)
    body = main if len(main.strip()) >= _MIN_MAIN_CHARS else "".join(extractor.all)
    lines = [line.rstrip() for line in body.splitlines()]
    text = re.sub(r"\n{3,}", "\n\n", "\n".join(lines)).strip()
    title = " ".join(extractor.title.split()) or extractor.first_h1
    return title, text
