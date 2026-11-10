"""Plumbing tests for run_test.py with a pretend engine (no model, no audio decoding). Run: python -m unittest -v"""

import contextlib
import csv
import io
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import run_test


class FakeEngine:
    """Returns the reference exactly when it is given the glossary prompt, and a damaged copy when it is not."""

    def transcribe(self, audio, language, prompt, beam_size, vad):
        reference = audio.with_suffix(".txt").read_text(encoding="utf-8")
        if prompt:
            return reference, 10.0
        return reference.replace("tech pack", "tech pak").replace("gsm", "gs m"), 10.0


class Plumbing(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.rec = self.root / "recordings"
        self.rec.mkdir()
        for name, text in {
            "a": "send the tech pack and gsm 180 today",
            "b": "मलाई तीन सय पिस चाहियो tech pack",
        }.items():
            (self.rec / f"{name}.ogg").write_bytes(b"not real audio")
            (self.rec / f"{name}.txt").write_text(text, encoding="utf-8")
        (self.rec / "c.ogg").write_bytes(b"no transcript for this one")
        (self.root / "glossary.txt").write_text("tech pack\ngsm\n", encoding="utf-8")
        self.out = self.root / "results"

    def tearDown(self):
        self.tmp.cleanup()

    def go(self, *extra):
        argv = ["--recordings", str(self.rec), "--out", str(self.out), "--device", "cpu", *extra]
        buffer = io.StringIO()
        with mock.patch.object(run_test, "make_engine", lambda *a, **k: FakeEngine()), contextlib.redirect_stdout(buffer):
            code = run_test.main(argv)
        return code, buffer.getvalue()

    def test_compares_settings_and_picks_the_better_one(self):
        code, output = self.go("--glossary", str(self.root / "glossary.txt"), "--models", "m1")
        self.assertEqual(code, 0)
        self.assertIn("skipped (no transcript): c.ogg", output)
        report = (self.out / "report.md").read_text(encoding="utf-8")
        self.assertIn("Best on word error: m1, language ne, prompt glossary", report)
        self.assertIn("No errors at all", report)  # the winning setting made none, so there are no mistakes to list
        self.assertLess(report.index("| m1 | ne | glossary |"), report.index("| m1 | ne | none |"))  # best first

    def test_report_lists_mistakes_and_missed_glossary_terms(self):
        self.go("--glossary", str(self.root / "glossary.txt"), "--prompt-modes", "none")
        report = (self.out / "report.md").read_text(encoding="utf-8")
        self.assertIn("Most common mistakes", report)
        self.assertIn("| pack | pak |", report)
        self.assertIn("Glossary terms the best setting missed", report)
        self.assertIn("- tech pack", report)
        self.assertIn("[pack → pak]", report)  # the worst-recordings view marks the change in place

    def test_one_row_per_setting_and_file(self):
        self.go("--glossary", str(self.root / "glossary.txt"), "--models", "m1,m2")
        with open(self.out / "summary.csv", encoding="utf-8") as handle:
            rows = list(csv.DictReader(handle))
        self.assertEqual(len(rows), 2 * 2 * 2)  # 2 models x 2 prompt modes x 2 recordings with transcripts
        by = {(r["setting"], r["file"]): r for r in rows}
        self.assertEqual(by[("m1__ne__glossary", "a.ogg")]["word_errors"], "0")
        self.assertGreater(int(by[("m1__ne__none", "a.ogg")]["word_errors"]), 0)

    def test_hypotheses_are_saved(self):
        self.go("--models", "m1")
        saved = (self.out / "m1__ne__none" / "a.ogg.txt").read_text(encoding="utf-8")
        self.assertIn("tech pak", saved)

    def test_no_glossary_means_one_prompt_mode(self):
        self.go("--models", "m1")
        with open(self.out / "summary.csv", encoding="utf-8") as handle:
            self.assertEqual({r["setting"] for r in csv.DictReader(handle)}, {"m1__ne__none"})

    def test_asking_for_glossary_mode_without_a_glossary_is_an_error(self):
        code, _ = self.go("--prompt-modes", "glossary")
        self.assertEqual(code, 2)

    def test_limit(self):
        self.go("--models", "m1", "--limit", "1")
        with open(self.out / "summary.csv", encoding="utf-8") as handle:
            self.assertEqual(len(list(csv.DictReader(handle))), 1)

    def test_no_transcripts_at_all_is_a_clear_error(self):
        for f in self.rec.glob("*.txt"):
            f.unlink()
        code, _ = self.go()
        self.assertEqual(code, 2)

    def test_missing_folder(self):
        self.rec.rename(self.root / "elsewhere")
        code, _ = self.go()
        self.assertEqual(code, 2)

    def test_draft_writes_only_missing_transcripts_and_never_overwrites(self):
        before = (self.rec / "a.txt").read_text(encoding="utf-8")
        # the fake engine reads <audio>.txt, so give the undrafted recording a seed the fake can copy
        (self.rec / "c.txt").write_text("", encoding="utf-8")
        with mock.patch.object(run_test, "make_engine", lambda *a, **k: mock.Mock(transcribe=lambda *a, **k: ("a draft", 3.0))):
            with contextlib.redirect_stdout(io.StringIO()):
                code = run_test.main(["--recordings", str(self.rec), "--draft", "--device", "cpu"])
        self.assertEqual(code, 0)
        self.assertEqual((self.rec / "c.txt").read_text(encoding="utf-8").strip(), "a draft")
        self.assertEqual((self.rec / "a.txt").read_text(encoding="utf-8"), before)

    def test_prompt_is_cut_at_a_term_boundary(self):
        terms = [f"term{i:03d}" for i in range(200)]
        prompt, dropped = run_test.build_prompt(terms)
        self.assertLessEqual(len(prompt), run_test.PROMPT_LIMIT)
        self.assertEqual(len(prompt.split(", ")) + dropped, 200)


if __name__ == "__main__":
    unittest.main()
