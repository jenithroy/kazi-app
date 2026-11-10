"""Scoring for the speech test: word error rate, character error rate and glossary recall.

Both texts are normalised the same way before they are compared, so only real differences in wording count:
not capital letters, punctuation (including the Devanagari full stop), Devanagari versus ordinary digits,
"1,500" versus "1500", or the invisible joiner characters that appear inside Devanagari conjuncts.

Pure Python. If `rapidfuzz` is installed it does the heavy distance sums in C; without it the results are the
same, only slower on long recordings.
"""

from __future__ import annotations

import re
import unicodedata
from collections import Counter
from dataclasses import dataclass, field

try:  # optional speed-up, same answers
    from rapidfuzz.distance import Levenshtein as _LEV
except ImportError:  # pragma: no cover - exercised by the tests through _force_pure_python
    _LEV = None

_DEVANAGARI_DIGITS = {ord(c): str(i) for i, c in enumerate("०१२३४५६७८९")}
_ZERO_WIDTH = {0x200B: None, 0x200C: None, 0x200D: None, 0xFEFF: None}

# Word alignment builds a table of len(reference) x len(hypothesis) cells. Past this size only the error count
# is computed (a ten-minute call is about 1,500 words, which is far below the limit).
_ALIGN_LIMIT = 6_000_000


def normalize(text: str) -> str:
    """Lower-case, strip punctuation and symbols, unify digits, collapse spaces."""
    text = unicodedata.normalize("NFC", text or "")
    text = text.translate(_ZERO_WIDTH).translate(_DEVANAGARI_DIGITS).casefold()
    text = re.sub(r"(?<=\d),(?=\d)", "", text)  # 1,500 -> 1500
    kept = []
    for ch in text:
        if ch in "'’":
            continue  # don't -> dont
        kept.append(" " if unicodedata.category(ch)[0] in "PS" else ch)  # punctuation and symbols
    return re.sub(r"\s+", " ", "".join(kept)).strip()


def words(text: str) -> list[str]:
    normalised = normalize(text)
    return normalised.split(" ") if normalised else []


def edit_distance(a, b) -> int:
    """Levenshtein distance between two strings or two lists of words."""
    if _LEV is not None:
        return _LEV.distance(a, b)
    if len(a) < len(b):
        a, b = b, a
    previous = list(range(len(b) + 1))
    for i, x in enumerate(a, 1):
        current = [i] + [0] * len(b)
        for j, y in enumerate(b, 1):
            current[j] = min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (x != y))
        previous = current
    return previous[-1]


def align(ref: list[str], hyp: list[str]):
    """Word-by-word alignment: a list of (op, reference word, hypothesis word), op in ok / sub / del / ins.

    Returns None when the two texts are too long to tabulate.
    """
    n, m = len(ref), len(hyp)
    if n * m > _ALIGN_LIMIT:
        return None
    d = [[0] * (m + 1) for _ in range(n + 1)]
    for i in range(1, n + 1):
        d[i][0] = i
    for j in range(1, m + 1):
        d[0][j] = j
    for i in range(1, n + 1):
        for j in range(1, m + 1):
            d[i][j] = min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (ref[i - 1] != hyp[j - 1]))
    ops = []
    i, j = n, m
    while i or j:
        if i and j and d[i][j] == d[i - 1][j - 1] + (ref[i - 1] != hyp[j - 1]):
            ops.append(("ok" if ref[i - 1] == hyp[j - 1] else "sub", ref[i - 1], hyp[j - 1]))
            i, j = i - 1, j - 1
        elif i and d[i][j] == d[i - 1][j] + 1:
            ops.append(("del", ref[i - 1], None))
            i -= 1
        else:
            ops.append(("ins", None, hyp[j - 1]))
            j -= 1
    ops.reverse()
    return ops


@dataclass
class Score:
    ref_words: int
    word_errors: int
    ref_chars: int
    char_errors: int
    ops: list | None = field(default=None, repr=False)

    @property
    def wer(self) -> float:
        return self.word_errors / self.ref_words if self.ref_words else float("nan")

    @property
    def cer(self) -> float:
        return self.char_errors / self.ref_chars if self.ref_chars else float("nan")


def score(reference: str, hypothesis: str) -> Score:
    """Compare one transcript with its hand-corrected reference. Characters include the single spaces."""
    ref_words, hyp_words = words(reference), words(hypothesis)
    ops = align(ref_words, hyp_words)
    word_errors = sum(1 for op in ops if op[0] != "ok") if ops is not None else edit_distance(ref_words, hyp_words)
    ref_text, hyp_text = normalize(reference), normalize(hypothesis)
    return Score(len(ref_words), word_errors, len(ref_text), edit_distance(ref_text, hyp_text), ops)


# ---- glossary -------------------------------------------------------------------------------------------------


def load_glossary(path) -> list[str]:
    """One term per line; blank lines and lines starting with # are ignored; duplicates (after normalising) dropped."""
    terms, seen = [], set()
    with open(path, encoding="utf-8-sig") as handle:
        for line in handle:
            term = line.strip()
            if not term or term.startswith("#"):
                continue
            key = normalize(term)
            if key and key not in seen:
                seen.add(key)
                terms.append(term)
    return terms


def _count(tokens: list[str], term: list[str]) -> int:
    if not term:
        return 0
    size, hits, i = len(term), 0, 0
    while i <= len(tokens) - size:
        if tokens[i : i + size] == term:
            hits += 1
            i += size
        else:
            i += 1
    return hits


def glossary_recall(reference: str, hypothesis: str, terms: list[str]):
    """How many of the glossary terms that really occur in the reference also appear in the transcript.

    Returns (found, total, missed) where missed counts each term by how many occurrences were lost.
    """
    ref_tokens, hyp_tokens = words(reference), words(hypothesis)
    found = total = 0
    missed: Counter = Counter()
    for term in terms:
        term_tokens = words(term)
        in_ref = _count(ref_tokens, term_tokens)
        if not in_ref:
            continue
        in_hyp = min(in_ref, _count(hyp_tokens, term_tokens))
        total += in_ref
        found += in_hyp
        if in_hyp < in_ref:
            missed[term] += in_ref - in_hyp
    return found, total, missed


def confusions(ops_list) -> Counter:
    """Across many files: how often each reference word was written as something else (or dropped)."""
    out: Counter = Counter()
    for ops in ops_list:
        for op, ref_word, hyp_word in ops or []:
            if op == "sub":
                out[(ref_word, hyp_word)] += 1
            elif op == "del":
                out[(ref_word, "")] += 1
    return out
