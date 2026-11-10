# Speech test kit

Answers one question before we build anything on top of it: **how well does speech recognition understand our own recordings** (Nepali, English and the mix, on phone and factory-floor audio), and which model and settings are best?

You give it about 30 real recordings with a correct transcript for each. It runs each model and setting on every recording, compares the result with your transcript, and writes a report saying which wins and where it goes wrong. Everything runs on this computer; no audio leaves it.

This is step 3 of `COMMS_AI_PLAN.md`. Run it on the office PC with the graphics card.

## 1. Install (once)

You need Python 3.10 or newer.

```
cd scripts/transcription-test
python -m venv venv
venv\Scripts\activate          # Windows;  on Linux or Mac:  source venv/bin/activate
pip install -r requirements.txt
```

The first run downloads each model (the large ones are about 1.5 to 3 GB).

**Using the graphics card.** The speech library (faster-whisper, run by CTranslate2) needs NVIDIA's CUDA 12 libraries (cuBLAS and cuDNN 9); see faster-whisper's own README for the install steps on your system. The RTX 50 series needs CTranslate2 4.6.3 or newer (its release notes add CUDA 12.8 support and switch 8-bit mode off on that card), which `requirements.txt` already asks for. The kit uses `float16` on a card. If it says it is using `cpu` when you expected the card, or stops with an error naming a missing library, that is the cause; it still works on a CPU, only much slower.

## 2. Prepare the recordings

Make a folder called `recordings` and put in about 30 audio files, each with a text file of the **same name** holding the correct transcript:

```
recordings/
  call01.ogg
  call01.txt        what was really said, corrected by a Nepali speaker
  voice-note02.m4a
  voice-note02.txt
  ...
```

- Any common format works (wav, mp3, m4a, ogg, opus, flac, amr and more). WhatsApp voice notes can go in as they are.
- Choose a mix that looks like real life: different speakers, quiet and noisy rooms, phone calls and voice notes, Nepali, English and both mixed, and plenty of garment words.
- Pick **one way to write** and keep to it: for example Nepali words in Devanagari and English words in English letters. The score only means something if every transcript is written the same way.
- Typing 30 transcripts from nothing is slow. `python run_test.py --draft` writes a first-pass transcript next to every recording that has none (it never overwrites). Correct each one while listening. A draft left unchecked makes the model that wrote it look too good, so check every line.
- These are private business recordings. The folder is git-ignored; do not copy it anywhere public.

**Glossary (optional, recommended).** A text file called `glossary.txt` with one term per line: garment words, product names, customer and staff names, Nepali terms. See `glossary.example.txt`. The kit then compares each model with and without the glossary given to it as a prompt, and reports how many glossary terms were written correctly.

## 3. Run it

A first check on three recordings:

```
python run_test.py --recordings recordings --glossary glossary.txt --limit 3
```

The real comparison:

```
python run_test.py --recordings recordings --glossary glossary.txt --models large-v3-turbo,large-v3 --languages ne,auto --vad
```

Each model, language and prompt combination is run on every recording. `--languages ne,auto` compares forcing Nepali with letting the model decide, which matters for mixed speech. `--vad` skips long silences and often helps phone recordings. A model can also be a folder or a Hugging Face name, so tuned Nepali versions can be added to `--models` (they must be in CTranslate2 format).

## 4. Read the report

`results/report.md` lists every setting best first, with word error, character error, glossary terms found and speed, then the worst recordings for the best setting with the changes marked in place (`[heard → written]`), the most common mistakes, and the glossary terms it missed. `results/summary.csv` has the numbers per recording, and `results/<setting>/` keeps every transcript the models wrote.

- **Word error** is the share of words in your transcript that came out wrong. **Character error** counts letters, which is fairer when Nepali words run together or split differently.
- Text is compared after ignoring capital letters, punctuation, the Devanagari full stop, Devanagari versus ordinary digits and `1,500` versus `1500`.
- There is no pass mark. Read the worst recordings and ask whether the transcripts would be good enough for the assistant to use.
- Repeated mistakes are the best source of glossary terms; add them and run again.

Not covered here: IndicWav2Vec and other non-Whisper models need a different engine, which can be added if the Whisper family falls short.

## Tests

```
python -m unittest -v
```

The scoring maths and the runner's plumbing are tested without any model or audio.

## What has been checked, and what has not

Checked (10 Nov 2026): the 35 tests above, and a real run on a CPU under Python 3.14 using the small `tiny.en` model on a public English clip, which produced a correct report. That run is why `requirements.txt` holds the audio library (`av`) below version 19: faster-whisper 1.2.1 crashes on the newest one.

Not checked yet: the graphics card (an RTX 5070 was not available), the large models, and any Nepali or mixed-language audio. The first run on the office PC is the real test, so start with `--limit 3`.
