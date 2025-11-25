#!/usr/bin/env python3
"""
Synthesize assistant replies for the Numbers case-study dataset.

Reads a JSONL file (produced by export_numbers_questions.py),
generates a synthetic assistant response based on the 'team' and 'user_text',
converts to standard conversation format, and splits into train/val sets.

Usage:
  python tools/concierge/synthesize_replies.py \
      --input artifacts/concierge/numbers_questions_sample500.jsonl \
      --train-output artifacts/concierge/train_numbers.jsonl \
      --val-output artifacts/concierge/val_numbers.jsonl
"""

from __future__ import annotations

import argparse
import json
import random
import re
import uuid
from pathlib import Path
from typing import Any

# --- Configuration & Templates ---

TEAMS = {
    "Sales Team": {
        "tone": "enthusiastic",
        "openers": [
            "Hi there! I'd be happy to help you with that.",
            "Hello! Great question regarding your booking.",
            "Greetings! I can definitely assist you with this.",
            "Hi! Let's see what we can do for you.",
        ],
        "closers": [
            "Does that help?",
            "Let me know if you'd like to proceed!",
            "Is there anything else I can book for you?",
            "Ready to finalize this?",
        ],
        "fallback": "I can check the availability for you right away. Could you confirm your travel dates?"
    },
    "Mobile Service Team": {
        "tone": "efficient",
        "openers": [
            "Hello.",
            "Hi. I can help with your mobile query.",
            "Thanks for reaching out.",
            "I see your question.",
        ],
        "closers": [
            "Let me know if you need further assistance.",
            "Hope that clarifies things.",
            "Reply if you have more questions.",
            "Is there anything else?",
        ],
        "fallback": "Could you please provide your account number so I can look into this issue?"
    },
    "Fixed Service Team": {
        "tone": "supportive",
        "openers": [
            "Hello. I understand your concern.",
            "Hi, let's get this sorted out for you.",
            "Thank you for contacting support.",
            "I'm here to help with your service.",
        ],
        "closers": [
            "Please let us know if the issue persists.",
            "We are here if you need more help.",
            "Did this solve the problem?",
            "Let me know if you need a technician.",
        ],
        "fallback": "I might need to run a diagnostic on your line. are you near the device now?"
    },
    "default": {
        "tone": "polite",
        "openers": ["Hello!", "Hi there.", "Greetings.", "How can I help?"],
        "closers": ["Let me know if you need anything else.", "Hope this helps!", "Any other questions?"],
        "fallback": "I can certainly help with that. Could you provide a few more details?"
    }
}

# Simple keyword-based response templates to make it look less generic
KEYWORDS = [
    (r"hotel|room|stay|accommodation", [
        "I can recommend several options that match your criteria.",
        "We have some great partner hotels in that area.",
        "I can check room availability for those dates.",
    ]),
    (r"flight|ticket|airline|fly|airport", [
        "I can check the flight schedules for you.",
        "Let me look up the fare rules for that ticket.",
        "We can certainly assist with flight changes or upgrades.",
    ]),
    (r"upgrade|business class|first class", [
        "Upgrades depend on availability and fare class. Let me check.",
        "I can review the upgrade options for your booking.",
    ]),
    (r"cost|price|expensive|cheap|budget", [
        "I can find options that fit within your budget.",
        "Let me compare the prices for you.",
        "We can look for the best value deals available.",
    ]),
    (r"cancel|refund|change", [
        "I can review the cancellation policy for your booking.",
        "Let me check if your ticket is refundable or changeable.",
        "I'll need to look at the terms and conditions of your purchase.",
    ]),
    (r"internet|wifi|connection|speed", [
        "Let's troubleshoot your connection issue.",
        "I can check the signal status in your area.",
        "Have you tried restarting your router?",
    ]),
    (r"roaming|data|abroad", [
        "I can check your roaming rates and packages.",
        "We have several data add-ons for travel.",
    ]),
]

def get_team_config(team_name: str) -> dict:
    # Normalize team name key
    for key in TEAMS:
        if key in str(team_name):
            return TEAMS[key]
    return TEAMS["default"]

def generate_response(user_text: str, team: str | None) -> str:
    config = get_team_config(team)
    
    opener = random.choice(config["openers"])
    closer = random.choice(config["closers"])
    
    # Find a relevant body based on keywords
    body = config["fallback"]
    
    # random shuffle keywords to vary matching priority if multiple match
    matched = False
    for pattern, options in KEYWORDS:
        if re.search(pattern, user_text, re.IGNORECASE):
            body = random.choice(options)
            matched = True
            break
    
    # If no keyword matched, maybe just use the fallback
    if not matched and random.random() < 0.3:
        body = "I've received your request and I'm looking into it now."

    return f"{opener} {body} {closer}"

def process_file(input_path: Path, train_path: Path, val_path: Path, split_ratio: float = 0.2) -> None:
    if not input_path.exists():
        raise FileNotFoundError(f"Input file not found: {input_path}")
    
    train_path.parent.mkdir(parents=True, exist_ok=True)
    val_path.parent.mkdir(parents=True, exist_ok=True)
    
    rows = []
    with input_path.open("r", encoding="utf-8") as fin:
        for line in fin:
            line = line.strip()
            if not line:
                continue
            
            raw_row = json.loads(line)
            user_text = raw_row.get("user_text", "")
            team = raw_row.get("team")
            
            # Generate response
            response = generate_response(user_text, team)
            
            # Convert to standard training format
            convo_id = str(uuid.uuid4())
            new_row = {
                "conversation_id": convo_id,
                "turns": [
                    {"role": "user", "content": user_text},
                    {"role": "assistant", "content": response},
                ],
                "metadata": {
                    "source": "numbers_case_study",
                    "original_team": team,
                    "original_rating": raw_row.get("rating")
                }
            }
            rows.append(new_row)
            
    # Shuffle and split
    random.shuffle(rows)
    split_idx = int(len(rows) * (1 - split_ratio))
    train_rows = rows[:split_idx]
    val_rows = rows[split_idx:]
    
    with train_path.open("w", encoding="utf-8") as f:
        for r in train_rows:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
            
    with val_path.open("w", encoding="utf-8") as f:
        for r in val_rows:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
            
    print(f"Processed {len(rows)} records.")
    print(f"  Train: {len(train_rows)} -> {train_path}")
    print(f"  Val:   {len(val_rows)} -> {val_path}")

def main():
    parser = argparse.ArgumentParser(description="Synthesize assistant replies")
    parser.add_argument("--input", type=Path, required=True, help="Input JSONL file")
    parser.add_argument("--train-output", type=Path, required=True, help="Output Train JSONL file")
    parser.add_argument("--val-output", type=Path, required=True, help="Output Val JSONL file")
    parser.add_argument("--split", type=float, default=0.2, help="Validation split ratio (default 0.2)")
    
    args = parser.parse_args()
    process_file(args.input, args.train_output, args.val_output, args.split)

if __name__ == "__main__":
    main()
