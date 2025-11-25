# Concierge tooling quickstart

- `python tools/concierge/build_dataset.py` — normalize the restaurant seed into `artifacts/concierge/venues_desc.jsonl` (+ meta). Uses the same corpus logic as the backend so descriptions, price bands, and tags stay consistent.
- `python backend/tools/evaluate_concierge.py --cases tools/concierge/eval_set.json` — run retrieval/ranking accuracy checks (Top-1/Top-3 and constraint pass). Add more labeled queries to `eval_set.json` as you expand coverage.
- `python tools/concierge/concierge_cli.py -q "romantic sea view bayil"` — quick manual smoke test over the local seed.
- `python tools/concierge/generate_synthetic.py --count 800` — emit synthetic conversations split into training (80%) and testing (20%) sets:
  - `artifacts/concierge/train_conversations.jsonl`
  - `artifacts/concierge/test_conversations.jsonl`
  - Use `--test-split 0.1` to change the ratio or `--train-output` / `--test-output` to change filenames.
- `python tools/concierge/export_numbers_questions.py` — extract user questions from the .numbers case study file into `artifacts/concierge/numbers_questions_sample500.jsonl`.
- `python tools/concierge/synthesize_replies.py` — generate synthetic assistant replies for the extracted questions and split into train/val sets:
  - `artifacts/concierge/train_numbers.jsonl` (400 samples)
  - `artifacts/concierge/val_numbers.jsonl` (100 samples)
- `python tools/concierge/prepare_training_data.py` — merges synthetic venue conversations and support conversations into a unified OpenAI-style fine-tuning format:
  - `artifacts/concierge/fine_tune_train.jsonl` (Combined Training Set)
  - `artifacts/concierge/fine_tune_val.jsonl` (Combined Validation Set)
- `python tools/concierge/run_epoxy.py` — validates the prepared datasets and prints the commands to launch the fine-tuning job (simulated execution).
- `python tools/concierge/epoxy_train.py` — simulates the local training loop and produces a model artifact (`artifacts/concierge/fine_tuned_model_card.json`) to unblock downstream tasks without a real GPU or API key.

Environment knobs:
- `CONCIERGE_CANDIDATE_MULTIPLIER` (default 8) controls how many candidates are fetched before re-ranking.
- `CONCIERGE_EMBED_MODEL` and `OPENAI_API_KEY` toggle OpenAI embeddings; otherwise hashing embeddings are used for offline runs.
