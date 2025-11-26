"""
Convert conversation-style JSONL to OpenAI chat fine-tune format.
Input: artifacts/concierge_{train,val,test}.jsonl
Output: artifacts/concierge_{train,val,test}_chat.jsonl with `messages` array.
"""
import json
from pathlib import Path

in_files = [
    ('train', Path('artifacts/concierge_train.jsonl')),
    ('val', Path('artifacts/concierge_val.jsonl')),
    ('test', Path('artifacts/concierge_test.jsonl')),
]

for split, in_path in in_files:
    out_path = Path(f'artifacts/concierge_{split}_chat.jsonl')
    with in_path.open() as fin, out_path.open('w', encoding='utf-8') as fout:
        for line in fin:
            rec = json.loads(line)
            messages = []
            for turn in rec['turns']:
                if turn.startswith('U: '):
                    role = 'user'
                    content = turn[3:]
                elif turn.startswith('C: '):
                    role = 'assistant'
                    content = turn[3:]
                else:
                    # Fallback: treat as user
                    role = 'user'
                    content = turn
                messages.append({'role': role, 'content': content})
            out = {
                'id': rec['id'],
                'scenario': rec['scenario'],
                'messages': messages,
            }
            fout.write(json.dumps(out, ensure_ascii=False) + '\n')
    print(f'Wrote {out_path}')
