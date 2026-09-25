import re
import unicodedata

# Hiragana, Katakana, CJK ideographs: no spaces between words, so index bigrams.
_CJK = r"぀-ヿ㐀-䶿一-鿿豈-﫿"
_CJK_RUN = re.compile(f"[{_CJK}]+")
_WORD = re.compile(r"\w+")

STOPWORDS = frozenset(
    """
    a an and are as at be been but by can could did do does for from had has have how i if in
    into is it its just me my of on or our so than that the their them then there these they
    this to us was we were what when where which who why will with would you your yours about
    also any all more most other some such only very much many one two

    ada adalah agar akan anda apa apakah atau bagaimana bahwa bisa dan dari dengan di dia ini
    itu jadi juga kalau kami kamu karena ke kita lagi mereka pada saja saya sudah tapi tidak
    untuk yang sebuah para oleh bila jika hal
    """.split()
)


def tokenize(text: str) -> list[str]:
    """Lower-cased word tokens without stopwords; CJK runs become character bigrams."""
    normalized = unicodedata.normalize("NFKC", text).lower()
    tokens: list[str] = []
    for word in _WORD.findall(normalized):
        runs = _CJK_RUN.findall(word)
        if runs:
            for run in runs:
                if len(run) == 1:
                    tokens.append(run)
                else:
                    tokens.extend(run[i : i + 2] for i in range(len(run) - 1))
            latin = _CJK_RUN.sub(" ", word).split()
        else:
            latin = [word]
        for token in latin:
            if (
                token.replace("_", "")
                and token not in STOPWORDS
                and (len(token) > 1 or token.isdigit())
            ):
                tokens.append(token)
    return tokens
