"""
Generate synthetic concierge training conversations (JSONL) for Baku Reserve.
- 540 conversations (486 train, 27 val, 27 test)
- Each record: {id, split, scenario, turns: ["U: ...", "C: ...", ...]}
"""
import json
import random
from pathlib import Path

random.seed(42)

TOTAL = 540
TRAIN_PCT = 0.90
VAL_PCT = 0.05

N_TRAIN = int(TOTAL * TRAIN_PCT)
N_VAL = int(TOTAL * VAL_PCT)
N_TEST = TOTAL - N_TRAIN - N_VAL

names = [
    "Alex", "Jordan", "Sam", "Priya", "Miguel", "Casey", "Taylor", "Morgan",
    "Devon", "Jamie", "Riley", "Cameron", "Lee", "Avery", "Noah", "Lena",
    "Ivy", "Aria", "Diego", "Sasha", "Evan", "Nina", "Omar", "Kara",
]

week_refs = [
    "tonight", "tomorrow", "Friday", "Saturday", "Sunday", "next Monday",
    "next Tuesday", "next Wednesday", "next Thursday", "this weekend",
]

times = [
    "5:30pm", "6:00pm", "6:15pm", "6:30pm", "7:00pm", "7:15pm", "7:30pm",
    "8:00pm", "8:15pm", "8:30pm", "12:00pm", "12:15pm", "12:30pm", "1:00pm",
]

seatings = ["patio", "window", "booth", "bar", "garden room", "chef's counter"]

allergies = ["gluten", "nuts", "dairy", "shellfish", "soy", "egg"]

dishes = [
    "salmon salad", "steak frites", "mushroom risotto", "veggie pasta",
    "grilled branzino", "caesar wrap", "tofu bowl", "short rib", "chicken shawarma"
]

desserts = ["birthday cake", "candle", "dessert platter", "no-sugar sorbet"]

languages = ["Spanish", "French", "Mandarin", "Arabic"]

parking_opts = [
    "street parking on 3rd Ave after 6pm is free",
    "garage at 221 Pine St offers $8 evening rate",
    "valet after 5pm is $12",
]

outdoor_notes = [
    "We keep heaters on and blankets available.",
    "If it rains, we move you indoors at the same time slot.",
    "Wind can pick up; we can hold a backup booth.",
]

wine_notes = [
    "We have a focused natural wine list with 8 by-the-glass options",
    "Our sommelier can pair a bottle to your mains on arrival",
    "Happy hour pours run until 6:30pm",
]

policies = [
    "We hold tables for 15 minutes past the reservation",
    "Same-day cancellations inside 2 hours are $15 per guest",
    "Parties of 8+ have 20% gratuity added",
    "We need a card hold for groups of 8 or more",
]

quick_items = ["grilled chicken bowl", "veggie pasta", "caesar wrap", "tofu bowl"]


def phone_num(idx: int) -> str:
    return f"415-555-{idx:04d}"


def pick(seq):
    return random.choice(seq)


def guests_small():
    return random.randint(1, 4)


def guests_large():
    return random.randint(8, 16)


def with_prob(p):
    return random.random() < p


def scenario_simple(idx):
    g = guests_small()
    day = pick(week_refs)
    t = pick(times)
    name = pick(names)
    seat = pick(seatings)
    allergy = pick(allergies)
    want_allergy = with_prob(0.25)
    turns = [
        f"U: Hi, can I book a table for {g} {day} at {t}?",
        "C: Yes, we have availability. May I have your name?",
        f"U: {name}.",
        "C: Thanks. What’s the best contact number?",
        f"U: {phone_num(idx)}.",
        "C: Any allergies or seating preferences?",
    ]
    if want_allergy:
        turns.append(f"U: Please note a {allergy} allergy and prefer a {seat} table.")
    else:
        turns.append(f"U: No allergies; {seat} would be great.")
    turns.append(
        f"C: Booked: {g} guests {day} at {t} under {name}, {seat} requested"
        + (f", {allergy} allergy noted." if want_allergy else ".")
    )
    scenario = "simple reservation"
    return scenario, turns


def scenario_waitlist(idx):
    g = guests_small() + 1  # 2-5
    requested_time = "7:00pm"
    alt1, alt2 = "5:45pm", "8:15pm"
    name = pick(names)
    turns = [
        f"U: Do you have anything for {g} at {requested_time} tonight?",
        f"C: {requested_time} is fully booked. I can waitlist you or book {alt1} or {alt2}.",
        f"U: Please waitlist {requested_time} and hold {alt2} as backup.",
        f"C: Got it. Name and mobile to text updates?",
        f"U: {name}, {phone_num(idx)}.",
        f"C: Added to waitlist: {g} at {requested_time}, backup {alt2} held. We'll text if the earlier slot opens."
    ]
    return "waitlist plus backup", turns


def scenario_allergy(idx):
    g = guests_small()
    al = pick(allergies)
    day = pick(week_refs)
    t = pick(times)
    name = pick(names)
    turns = [
        f"U: Any safe options for a {al} allergy?",
        "C: Yes, we can avoid cross-contact and have clear labels. Want me to note it on a reservation?",
        f"U: Yes, for {g} {day} at {t}.",
        "C: Name and contact?",
        f"U: {name}, {phone_num(idx)}.",
        f"C: Booked. We'll flag {al} allergy; grilled fish and salads can be prepared safely. Anything else to avoid?",
        "U: That covers it.",
        "C: Noted—see you soon."
    ]
    return "allergy-safe booking", turns


def scenario_takeout(idx):
    time_pickup = pick(["12:15pm", "12:30pm", "7:10pm"])
    item = pick(dishes)
    turns = [
        "U: Can I place a pickup order?",
        "C: Yes—pickup or curbside?",
        "U: Pickup.",
        f"C: What time? We can do {time_pickup}.",
        f"U: {time_pickup} works.",
        f"C: What would you like?",
        f"U: One {item}.",
        f"C: Ordered: {item}, pickup {time_pickup}. Pay at counter or Apple Pay. Need utensils?",
        "U: No, thanks.",
        "C: Ready then."
    ]
    return "takeout order", turns


def scenario_large_party(idx):
    g = guests_large()
    day = pick(["next Friday", "next Saturday", "two weeks from now Saturday"])
    t = pick(["6:00pm", "7:30pm", "8:00pm"])
    name = pick(names)
    turns = [
        f"U: I need dinner for {g} {day} at {t}.",
        f"C: We can seat {g} in our garden room at {t}. We require a card hold; cancellations inside 24h are $20/guest. OK to proceed?",
        "U: That’s fine.",
        "C: Any occasion or AV needs?",
        "U: Company meetup, no AV.",
        "C: Do you prefer even split or by seat checks?",
        "U: Even split.",
        f"C: Booked: {g} guests {day} {t}, garden room, even split, company meetup. Name and email?",
        f"U: {name}, {name.lower()}@example.com",
        "C: Confirmation sent with the policy."
    ]
    return "large party with deposit", turns


def scenario_accessibility(idx):
    g = guests_small() + 1
    day = pick(["Sunday", "Saturday", "Wednesday"])
    t = pick(["11:30am", "12:15pm", "6:00pm"])
    name = pick(names)
    turns = [
        f"U: Need a wheelchair-accessible table for {g} on {day} at {t}.",
        "C: We have step-free entry and accessible restroom. I’ll mark an accessible table near the aisle. Name and phone?",
        f"U: {name}, {phone_num(idx)}.",
        "C: Any dietary notes?",
        "U: None.",
        f"C: Booked: {g} guests {day} {t}, accessible table noted. We'll hold for 15 minutes."
    ]
    return "accessibility request", turns


def scenario_kids(idx):
    g = 4
    t = pick(["5:30pm", "6:00pm", "6:15pm"])
    day = pick(["tonight", "tomorrow", "Friday"])
    name = pick(names)
    turns = [
        "U: We’re coming with two toddlers, need a high chair.",
        f"C: High chairs are available. Quieter times are before 6:30pm—can I book {t} {day}?",
        "U: Yes.",
        "C: Name and contact?",
        f"U: {name}, {phone_num(idx)}.",
        "C: Want kids’ meals ready quickly and bread on arrival?",
        "U: Yes, please.",
        f"C: Booked: 4 guests {day} {t}, high chair, kids’ meals expedited, bread on arrival."
    ]
    return "family with toddlers", turns


def scenario_policy(idx):
    t = pick(["7:45pm", "8:00pm", "6:30pm"])
    day = pick(["tomorrow", "Friday", "Saturday"])
    name = pick(names)
    turns = [
        "U: What’s your cancellation policy?",
        "C: Same-day cancellations inside 2 hours are $15 per guest; we hold tables 15 minutes.",
        "U: Can you hold a table while I decide?",
        f"C: I can hold a 2-top at {t} {day} for 24 hours without a card. Want that?",
        "U: Yes, hold it.",
        f"C: Holding: 2 guests {day} {t} under {name}. It auto-releases 24 hours before.",
        "U: Thanks.",
        "C: I’ll also set a reminder text 3 hours prior. Best number?",
        f"U: {phone_num(idx)}.",
        "C: Reminder set."
    ]
    return "policy with hold", turns


def scenario_change(idx):
    old_t = "7:00pm"
    new_t = pick(["7:30pm", "8:00pm", "6:30pm"])
    name = pick(names)
    g = guests_small()
    turns = [
        f"U: I have a {old_t} booking under {name}. Can I move to {new_t}?",
        f"C: Checking... {new_t} is free. Same party size ({g})?",
        "U: Yes, same.",
        f"C: Updated: {g} guests at {new_t}. Want a text confirmation?",
        f"U: {phone_num(idx)} please.",
        "C: Sent. Anything else to adjust?",
        "U: No, that’s all.",
        "C: Done."
    ]
    return "modify existing reservation", turns


def scenario_preorder(idx):
    g = 3
    t = pick(["12:05pm", "12:15pm", "12:30pm"])
    items = random.sample(quick_items, 2)
    name = pick(names)
    turns = [
        "U: We only have 45 minutes for lunch. Can we preorder?",
        "C: Yes. If you choose now, we’ll fire as you’re seated. What time and party size?",
        f"U: {g} people at {t}.",
        "C: Great. Popular quick picks: grilled chicken bowl, veggie pasta, caesar wrap, tofu bowl. What should I log?",
        f"U: {items[0]} and {items[1]}, plus one steak frites medium.",
        f"C: Logged. Name and contact?",
        f"U: {name}, {phone_num(idx)}.",
        f"C: Booked: {g} at {t}, preorder noted. We’ll aim for 45-minute turn."
    ]
    return "preorder to shorten visit", turns


def scenario_outdoor(idx):
    g = guests_small()
    t = pick(["6:00pm", "7:30pm", "8:00pm"])
    day = pick(["Friday", "Saturday", "Sunday"])
    note = pick(outdoor_notes)
    name = pick(names)
    turns = [
        "U: Can we sit outside?",
        f"C: Yes, patio is open. {note} What time {day}?",
        f"U: {t} works for {g}.",
        "C: If weather turns, do you want a backup indoor table?",
        "U: Yes, please.",
        f"C: Booked: {g} guests {day} {t}, patio with indoor backup. Name and contact?",
        f"U: {name}, {phone_num(idx)}.",
        "C: Set."
    ]
    return "outdoor with weather backup", turns


def scenario_parking(idx):
    g = guests_small()
    t = pick(["6:15pm", "7:00pm", "8:15pm"])
    detail = pick(parking_opts)
    name = pick(names)
    turns = [
        "U: How’s parking near you?",
        f"C: {detail} Want me to book a table for you as well?",
        f"U: Yes, {g} at {t} tonight.",
        "C: Name and number?",
        f"U: {name}, {phone_num(idx)}.",
        f"C: Booked: {g} at {t}. I’ll text parking tips."
    ]
    return "parking guidance + booking", turns


def scenario_birthday(idx):
    g = guests_small()
    t = pick(["7:30pm", "8:00pm", "8:15pm"])
    dessert = pick(desserts)
    name = pick(names)
    turns = [
        "U: It’s a birthday—can you do something special?",
        f"C: We can add a candle and print a birthday note. Want to book a time?",
        f"U: Yes, {g} people at {t} Saturday.",
        "C: Name and contact?",
        f"U: {name}, {phone_num(idx)}.",
        f"C: Noted {dessert} with candle, {g} at {t} Saturday under {name}. Any allergies?",
        "U: No.",
        "C: All set!"
    ]
    return "birthday request", turns


def scenario_walkin(idx):
    g = 2
    turns = [
        "U: If I walk in at 6pm, how long is the wait?",
        "C: Around 15–20 minutes for 2, 25–35 for 3–4. Want a 6:30pm reservation to skip waiting?",
        "U: Sure, hold 6:30pm for 2.",
        f"C: Holding 6:30pm for {g} under your name. Can I get a number to confirm?",
        f"U: {phone_num(idx)}.",
        "C: Held; we’ll release after 10 minutes if you’re not here."
    ]
    return "walk-in vs hold", turns


def scenario_split_check(idx):
    g = guests_small() + 2  # 3-6
    t = pick(["7:00pm", "7:30pm", "8:00pm"])
    day = pick(["Friday", "Saturday", "Thursday"])
    name = pick(names)
    turns = [
        "U: Can you split checks?",
        "C: Yes—by seat or evenly. What do you prefer?",
        "U: By seat.",
        f"C: Great. Want me to book a table?",
        f"U: Yes, {g} people {day} at {t}.",
        f"C: Name and contact?",
        f"U: {name}, {phone_num(idx)}.",
        f"C: Booked: {g} {day} at {t}, split checks by seat noted."
    ]
    return "split checks preference", turns


def scenario_pet(idx):
    g = guests_small()
    name = pick(names)
    t = pick(["5:45pm", "6:00pm", "6:30pm"])
    turns = [
        "U: Can I bring my dog?",
        "C: Dogs are welcome on the patio. Want me to reserve an outdoor table?",
        f"U: Yes, {g} people at {t} tomorrow.",
        "C: Name and number?",
        f"U: {name}, {phone_num(idx)}.",
        "C: Done—patio table, water bowl provided. If weather shifts, indoor seating isn’t pet-friendly; ok?",
        "U: Understood.",
        "C: Noted."
    ]
    return "pet-friendly patio", turns


def scenario_language(idx):
    lang = pick(languages)
    g = guests_small()
    t = pick(["7:00pm", "8:00pm", "6:30pm"])
    name = pick(names)
    turns = [
        f"U: Do you have staff who speak {lang}?",
        f"C: We have a server fluent in {lang} on evenings. I can assign them if you book. Time and date?",
        f"U: {g} people at {t} Friday.",
        "C: Name and contact?",
        f"U: {name}, {phone_num(idx)}.",
        f"C: Booked: {g} Friday {t} with a {lang}-speaking server requested. Anything else?",
        "U: That’s all.",
        "C: Great."
    ]
    return "language accommodation", turns


def scenario_double_booking(idx):
    g = guests_small()
    t1 = pick(["6:00pm", "6:30pm"])
    t2 = pick(["8:00pm", "8:30pm"])
    name = pick(names)
    turns = [
        "U: I booked twice by mistake—6pm and 8pm under my name.",
        "C: No problem. Which time should we keep?",
        f"U: Keep {t2} for {g} and cancel the earlier one.",
        f"C: Done. {t1} canceled; {g} at {t2} confirmed. Want a text confirmation?",
        f"U: {phone_num(idx)}.",
        "C: Sent."
    ]
    return "resolve double booking", turns


def scenario_payment_link(idx):
    g = guests_large()
    t = pick(["7:00pm", "7:30pm", "8:00pm"])
    day = pick(["Thursday", "Friday", "Saturday"])
    name = pick(names)
    turns = [
        "U: Can I prepay or leave a card on file?",
        "C: For large parties we send a secure payment link for the hold. Want me to send it?",
        f"U: Yes, booking for {g} on {day} at {t}.",
        "C: Great—email or SMS for the link?",
        f"U: Text to {phone_num(idx)} and email {name.lower()}@example.com.",
        f"C: Link sent. Once authorized, your booking is confirmed: {g} guests {day} {t}, 20% gratuity applies.",
        "U: Done, approved.",
        "C: Payment hold confirmed."
    ]
    return "payment link for hold", turns


scenario_builders = [
    scenario_simple,
    scenario_waitlist,
    scenario_allergy,
    scenario_takeout,
    scenario_large_party,
    scenario_accessibility,
    scenario_kids,
    scenario_policy,
    scenario_change,
    scenario_preorder,
    scenario_outdoor,
    scenario_parking,
    scenario_birthday,
    scenario_walkin,
    scenario_split_check,
    scenario_pet,
    scenario_language,
    scenario_double_booking,
    scenario_payment_link,
]


def build_example(idx):
    builder = pick(scenario_builders)
    scenario, turns = builder(idx)
    return scenario, turns


out_dir = Path("artifacts")
out_dir.mkdir(parents=True, exist_ok=True)

all_records = []
for i in range(TOTAL):
    scenario, turns = build_example(i)
    if i < N_TRAIN:
        split = "train"
        id_ = f"train_{i:04d}"
    elif i < N_TRAIN + N_VAL:
        split = "val"
        id_ = f"val_{i - N_TRAIN:04d}"
    else:
        split = "test"
        id_ = f"test_{i - N_TRAIN - N_VAL:04d}"
    all_records.append({
        "id": id_,
        "split": split,
        "scenario": scenario,
        "turns": turns,
    })

main_path = out_dir / "concierge_conversations.jsonl"
train_path = out_dir / "concierge_train.jsonl"
val_path = out_dir / "concierge_val.jsonl"
test_path = out_dir / "concierge_test.jsonl"

with main_path.open("w", encoding="utf-8") as f_main, \
     train_path.open("w", encoding="utf-8") as f_train, \
     val_path.open("w", encoding="utf-8") as f_val, \
     test_path.open("w", encoding="utf-8") as f_test:
    for rec in all_records:
        line = json.dumps(rec, ensure_ascii=True)
        f_main.write(line + "\n")
        if rec["split"] == "train":
            f_train.write(line + "\n")
        elif rec["split"] == "val":
            f_val.write(line + "\n")
        else:
            f_test.write(line + "\n")

summary = {
    "total": len(all_records),
    "train": sum(1 for r in all_records if r["split"] == "train"),
    "val": sum(1 for r in all_records if r["split"] == "val"),
    "test": sum(1 for r in all_records if r["split"] == "test"),
    "scenarios_used": {s:0 for s in set(r["scenario"] for r in all_records)}
}
for r in all_records:
    summary["scenarios_used"][r["scenario"]] += 1

print(json.dumps(summary, indent=2))
