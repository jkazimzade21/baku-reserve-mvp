#!/usr/bin/env python3
"""
Prepare Concierge Training Data for Fine-tuning.

This script merges:
1. Synthetic Venue Recommendations (train_conversations.jsonl)
2. Synthetic Support Replies (train_numbers.jsonl)

It converts them into the standard Chat Completion format:
{"messages": [
    {"role": "system", "content": "SYSTEM_PROMPT"},
    {"role": "user", "content": "USER_QUERY"},
    {"role": "assistant", "content": "ASSISTANT_REPLY"}
]}

Usage:
    python tools/concierge/prepare_training_data.py \
        --system-prompt tools/concierge/system_prompt.txt \
        --venue-train artifacts/concierge/train_conversations.jsonl \
        --venue-val artifacts/concierge/test_conversations.jsonl \
        --support-train artifacts/concierge/train_numbers.jsonl \
        --support-val artifacts/concierge/val_numbers.jsonl \
        --output-train artifacts/concierge/fine_tune_train.jsonl \
        --output-val artifacts/concierge/fine_tune_val.jsonl
"""

import argparse
import json
import random
from pathlib import Path

def load_jsonl(path: Path) -> list[dict]:
    if not path.exists():
        print(f"Warning: {path} not found. Skipping.")
        return []
    with path.open("r", encoding="utf-8") as f:
        return [json.loads(line) for line in f if line.strip()]

def convert_to_messages(data: list[dict], system_prompt: str) -> list[dict]:
    output = []
    for item in data:
        turns = item.get("turns", [])
        if not turns:
            continue
        
        # Basic assumption: Turn 0 is User, Turn 1 is Assistant
        # If there are multi-turn conversations, we might want to handle them differently,
        # but for now we take the first pair or iterate through pairs.
        
        # Flatten history for simple fine-tuning (usually 1 pair per sample is safest for basic alignment)
        # OR keep full history if the model supports it. 
        # Let's assume we just want to train on the final response given the history.
        
        # For this dataset, it seems we mostly have 1-turn exchanges (User -> Assistant).
        
        messages = [{"role": "system", "content": system_prompt}]
        valid_pair = False
        
        for turn in turns:
            role = turn["role"]
            content = turn["content"]
            if role not in ("user", "assistant"):
                continue
            messages.append({"role": role, "content": content})
            if role == "assistant":
                valid_pair = True
        
        if valid_pair:
             output.append({"messages": messages})
             
    return output

def main():
    parser = argparse.ArgumentParser(description="Prepare fine-tuning data")
    parser.add_argument("--system-prompt", type=Path, required=True)
    parser.add_argument("--venue-train", type=Path, required=True)
    parser.add_argument("--venue-val", type=Path, required=True)
    parser.add_argument("--support-train", type=Path, required=True)
    parser.add_argument("--support-val", type=Path, required=True)
    parser.add_argument("--output-train", type=Path, required=True)
    parser.add_argument("--output-val", type=Path, required=True)
    
    args = parser.parse_args()
    
    print("Loading system prompt...")
    system_prompt_text = args.system_prompt.read_text(encoding="utf-8").strip()
    
    print("Loading datasets...")
    venue_train = load_jsonl(args.venue_train)
    venue_val = load_jsonl(args.venue_val)
    support_train = load_jsonl(args.support_train)
    support_val = load_jsonl(args.support_val)
    
    print(f"Loaded: Venue Train={len(venue_train)}, Venue Val={len(venue_val)}")
    print(f"Loaded: Support Train={len(support_train)}, Support Val={len(support_val)}")
    
    # Convert
    combined_train = convert_to_messages(venue_train + support_train, system_prompt_text)
    combined_val = convert_to_messages(venue_val + support_val, system_prompt_text)
    
    # Shuffle
    random.shuffle(combined_train)
    random.shuffle(combined_val)
    
    # Save
    args.output_train.parent.mkdir(parents=True, exist_ok=True)
    with args.output_train.open("w", encoding="utf-8") as f:
        for item in combined_train:
            f.write(json.dumps(item, ensure_ascii=False) + "\n")
            
    args.output_val.parent.mkdir(parents=True, exist_ok=True)
    with args.output_val.open("w", encoding="utf-8") as f:
        for item in combined_val:
            f.write(json.dumps(item, ensure_ascii=False) + "\n")
            
    print(f"\nSuccess! Prepared {len(combined_train)} training samples and {len(combined_val)} validation samples.")
    print(f"Train: {args.output_train}")
    print(f"Val:   {args.output_val}")

if __name__ == "__main__":
    main()
