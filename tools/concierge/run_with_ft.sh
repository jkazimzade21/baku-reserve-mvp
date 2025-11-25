#!/bin/bash
# Run the Concierge CLI using the latest fine-tuned model.

# 1. Locate the model card
MODEL_CARD="artifacts/concierge/fine_tuned_model_card.json"

if [ ! -f "$MODEL_CARD" ]; then
  echo "Error: Model card not found at $MODEL_CARD"
  echo "Please run 'tools/concierge/epoxy_train.py' first."
  exit 1
fi

# 2. Extract the model ID (using simple grep/sed to avoid heavy deps, or python one-liner)
MODEL_ID=$(grep -o '"model_id": "[^"]*"' "$MODEL_CARD" | cut -d'"' -f4)

if [ -z "$MODEL_ID" ]; then
  echo "Error: Could not parse model_id from $MODEL_CARD"
  exit 1
fi

echo "Using Fine-Tuned Model: $MODEL_ID"
echo "---------------------------------------------------"

# 3. Run the CLI with the environment variable set
export CONCIERGE_GPT_MODEL="$MODEL_ID"

# Use python3 to run the backend CLI
# We need to set PYTHONPATH to include the root directory
export PYTHONPATH=$(pwd)

python3 backend/app/concierge_cli.py "$@"
