"""Unit tests for scoring.py. Run: python -m unittest -v"""

import os
import random
import tempfile
import unittest

import scoring


class Normalize(unittest.TestCase):
    def test_case_and_punctuation(self):
        self.assertEqual(scoring.normalize("Hello,  World!"), "hello world")

    def test_devanagari_full_stop_and_question_mark(self):
        self.assertEqual(scoring.normalize("नमस्ते। कसरी हुनुहुन्छ?"), "नमस्ते कसरी हुनुहुन्छ")

    def test_devanagari_digits_and_thousands_comma(self):
        self.assertEqual(scoring.normalize("५०० pcs"), "500 pcs")
        self.assertEqual(scoring.normalize("1,500 pcs"), "1500 pcs")

    def test_invisible_joiners_inside_conjuncts_are_ignored(self):
        self.assertEqual(scoring.normalize("क्‍ष"), scoring.normalize("क्ष"))

    def test_apostrophes_are_dropped_not_spaced(self):
        self.assertEqual(scoring.normalize("don't"), "dont")
        self.assertEqual(scoring.normalize("don’t"), "dont")

    def test_empty(self):
        self.assertEqual(scoring.normalize(""), "")
        self.assertEqual(scoring.words(""), [])
        self.assertEqual(scoring.normalize(None), "")


class Rates(unittest.TestCase):
    def test_identical_is_zero(self):
        s = scoring.score("the cat sat", "The cat sat.")
        self.assertEqual((s.word_errors, s.wer, s.cer), (0, 0.0, 0.0))

    def test_substitution_and_deletion(self):
        s = scoring.score("a b c d", "a x c")
        self.assertEqual(s.word_errors, 2)
        self.assertAlmostEqual(s.wer, 0.5)

    def test_insertions_can_exceed_one(self):
        s = scoring.score("a b", "a b c d")
        self.assertEqual(s.word_errors, 2)
        self.assertAlmostEqual(s.wer, 1.0)

    def test_empty_hypothesis_is_all_deletions(self):
        s = scoring.score("a b c", "")
        self.assertEqual(s.word_errors, 3)
        self.assertAlmostEqual(s.wer, 1.0)

    def test_character_rate_counts_the_space(self):
        s = scoring.score("ab cd", "abcd")  # one missing space out of 5 characters
        self.assertEqual(s.char_errors, 1)
        self.assertAlmostEqual(s.cer, 0.2)

    def test_nepali_example(self):
        s = scoring.score("मलाई पाँच सय पिस चाहियो", "मलाई पाँच सय पिस चाहिन्छ")
        self.assertEqual(s.word_errors, 1)
        self.assertAlmostEqual(s.wer, 0.2)

    def test_empty_reference_has_no_rate(self):
        s = scoring.score("", "anything")
        self.assertTrue(s.wer != s.wer)  # NaN

    def test_pure_python_and_rapidfuzz_agree(self):
        rng = random.Random(7)
        vocab = ["tech", "pack", "gsm", "zip", "stock", "dispatch", "cutting", "table", "button"]
        for _ in range(40):
            a = [rng.choice(vocab) for _ in range(rng.randint(0, 30))]
            b = [rng.choice(vocab) for _ in range(rng.randint(0, 30))]
            fast = scoring.edit_distance(a, b)
            saved, scoring._LEV = scoring._LEV, None
            try:
                slow = scoring.edit_distance(a, b)
                slow_chars = scoring.edit_distance("".join(a), "".join(b))
            finally:
                scoring._LEV = saved
            self.assertEqual(fast, slow)
            self.assertEqual(scoring.edit_distance("".join(a), "".join(b)), slow_chars)


class Alignment(unittest.TestCase):
    def test_ops(self):
        ops = scoring.align(["a", "b", "c"], ["a", "x", "c"])
        self.assertEqual([o[0] for o in ops], ["ok", "sub", "ok"])
        self.assertEqual(ops[1], ("sub", "b", "x"))

    def test_deletion_and_insertion(self):
        self.assertEqual([o[0] for o in scoring.align(["a", "b"], ["a"])], ["ok", "del"])
        self.assertEqual([o[0] for o in scoring.align(["a"], ["a", "b"])], ["ok", "ins"])

    def test_ops_count_matches_distance(self):
        ref, hyp = "send the tech pack by friday".split(), "send tech pak by the friday".split()
        ops = scoring.align(ref, hyp)
        self.assertEqual(sum(1 for o in ops if o[0] != "ok"), scoring.edit_distance(ref, hyp))

    def test_too_long_to_align_still_counts_errors(self):
        saved, scoring._ALIGN_LIMIT = scoring._ALIGN_LIMIT, 4
        try:
            s = scoring.score("a b c", "a x c")
        finally:
            scoring._ALIGN_LIMIT = saved
        self.assertIsNone(s.ops)
        self.assertEqual(s.word_errors, 1)

    def test_confusions_count_substitutions_and_deletions(self):
        s1 = scoring.score("send the tech pack", "send the tech pak")
        s2 = scoring.score("check the tech pack", "check tech pak")
        c = scoring.confusions([s1.ops, s2.ops])
        self.assertEqual(c[("pack", "pak")], 2)
        self.assertEqual(c[("the", "")], 1)


class Glossary(unittest.TestCase):
    TERMS = ["tech pack", "GSM", "जिप"]

    def test_counts_occurrences_not_just_presence(self):
        found, total, missed = scoring.glossary_recall(
            "send the tech pack and gsm 180 and the tech pack again",
            "send the tech pak and gsm 180 and the tech pack again",
            self.TERMS,
        )
        self.assertEqual((found, total), (2, 3))
        self.assertEqual(missed, {"tech pack": 1})

    def test_terms_absent_from_the_reference_do_not_count(self):
        found, total, _ = scoring.glossary_recall("nothing relevant here", "nothing relevant here", self.TERMS)
        self.assertEqual((found, total), (0, 0))

    def test_devanagari_term(self):
        found, total, _ = scoring.glossary_recall("जिप चाहियो", "जिप चाहियो", self.TERMS)
        self.assertEqual((found, total), (1, 1))

    def test_no_double_credit_for_one_extra_word(self):
        found, total, _ = scoring.glossary_recall("gsm", "gsm gsm gsm", self.TERMS)
        self.assertEqual((found, total), (1, 1))

    def test_load_glossary(self):
        with tempfile.NamedTemporaryFile("w", suffix=".txt", delete=False, encoding="utf-8") as f:
            f.write("# garment words\n\nTech Pack\ntech pack\nGSM\n  जिप  \n")
            path = f.name
        try:
            self.assertEqual(scoring.load_glossary(path), ["Tech Pack", "GSM", "जिप"])
        finally:
            os.unlink(path)


if __name__ == "__main__":
    unittest.main()
