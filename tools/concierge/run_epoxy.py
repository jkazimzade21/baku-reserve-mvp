#!/usr/bin/env python3
"""
Simulated Epoxy Runner for Fine-Tuning.

This script simulates the submission of the prepared dataset to a fine-tuning service
(e.g., OpenAI, Google Vertex AI, or a local LLM trainer).

Since the actual API keys and billing are not configured in this environment,
this script validates the file format and prints the command you WOULD run.

Usage:
    python tools/concierge/run_epoxy.py \
        --train-file artifacts/concierge/fine_tune_train.jsonl \
        --val-file artifacts/concierge/fine_tune_val.jsonl \
        --model gpt-3.5-turbo-0125
"""

import argparse
import json
import sys
from pathlib import Path

def validate_jsonl(path: Path):
    if not path.exists():
        print(f"Error: File {path} does not exist.")
        sys.exit(1)
        
    print(f"Validating {path}...")
    count = 0
    with path.open("r", encoding="utf-8") as f:
        for i, line in enumerate(f):
            try:
                data = json.loads(line)
                if "messages" not in data:
                    print(f"Error line {i+1}: Missing 'messages' key.")
                    sys.exit(1)
                if not isinstance(data["messages"], list):
                    print(f"Error line {i+1}: 'messages' must be a list.")
                    sys.exit(1)
                count += 1
            except json.JSONDecodeError:
                print(f"Error line {i+1}: Invalid JSON.")
                sys.exit(1)
    print(f"  OK: {count} valid samples found.")

def main():
    parser = argparse.ArgumentParser(description="Epoxy Fine-Tuning Simulator")
    parser.add_argument("--train-file", type=Path, required=True)
    parser.add_argument("--val-file", type=Path, required=True)
    parser.add_argument("--model", type=str, default="gpt-3.5-turbo-0125")
    parser.add_argument("--epochs", type=int, default=3)
    
    args = parser.parse_args()
    
    print("--- Epoxy Fine-Tuning Tool v1.0 ---\n")
    
    validate_jsonl(args.train_file)
    validate_jsonl(args.val_file)
    
    print("\nValidation Successful.")
    print(f"Preparing to fine-tune base model: {args.model}")
    print(f"Training epochs: {args.epochs}")
    
    print("\nTo execute the actual training run, use the following command (requires API key):")
    print("\n----------------------------------------------------------------")
    print(f"openai api fine_tunes.create -t {args.train_file} -v {args.val_file} -m {args.model} --n_epochs {args.epochs}")
    print("----------------------------------------------------------------\n")
    
    print("Or if using Google Gemini (Vertex AI):")
    print("\n----------------------------------------------------------------")
    print(f"gcloud ai custom-jobs create --region=us-central1 --display-name=concierge-ft --worker-pool-spec=... --args='--train={args.train_file}'")
    print("----------------------------------------------------------------\n")
    
    print("Epoxy process 'simulated' completion: Files are ready for upload.")

if __name__ == "__main__":
    main()
