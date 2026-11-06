from flask import Blueprint, request, jsonify
from ..services.rbac_service import require_auth, get_current_user

rebuttals_bp = Blueprint("rebuttals_bp", __name__)

REBUTTALS_DATA = [
    {
        "id": "happy_with_provider",
        "tag": "happy",
        "customer_says": "I’m happy with my current provider.",
        "agent_response": "Absolutely, Sir. I’m not asking you to change today—just let me check if I can save you money. What rate are you currently on?",
        "context": "Acknowledge satisfaction, pivot immediately to rate comparison without pushing a commitment."
    },
    {
        "id": "not_interested",
        "tag": "objection",
        "customer_says": "Not interested.",
        "agent_response": "Fair enough. Just one thing—if I could reduce your processing cost, would you at least compare the figures?",
        "context": "Low friction challenge: ask for comparison only, not an immediate switch."
    },
    {
        "id": "in_contract",
        "tag": "contract",
        "customer_says": "I’m in contract.",
        "agent_response": "No problem. When does it expire? I can simply check back closer to the renewal.",
        "context": "Collect contract expiry date to schedule a warm callback before automatic rollover."
    },
    {
        "id": "use_worldpay",
        "tag": "competitor",
        "customer_says": "I use Worldpay.",
        "agent_response": "Got you. What are they charging you overall—rate plus any terminal rental? Because with us, there's no contract, no rental—just 1.25% per transaction.",
        "context": "Worldpay frequently charges separate terminal rental (£15-£30/mo) and PCI compliance fees."
    },
    {
        "id": "use_sumup",
        "tag": "competitor",
        "customer_says": "I use SumUp.",
        "agent_response": "Sure. Roughly how much are you processing monthly? I’ll tell you straight away if switching would make sense.",
        "context": "SumUp charges a flat 1.69% - 1.75%. Any merchant doing >£1,500/mo saves substantially on Shift4 (1.25% or 0.70%)."
    },
    {
        "id": "rate_too_high",
        "tag": "price",
        "customer_says": "Your rate is too high.",
        "agent_response": "I understand. What rate are you currently getting?",
        "context": "Direct inquiry: often the customer doesn't know their blended rate or includes hidden fees."
    },
    {
        "id": "send_email",
        "tag": "brush_off",
        "customer_says": "Send me an email.",
        "agent_response": "Of course. Just so I send something relevant—roughly what’s your monthly card turnover?",
        "context": "Qualify before emailing so you can send exact savings calculations instead of generic spam."
    },
    {
        "id": "speak_to_partner",
        "tag": "decision_maker",
        "customer_says": "I need to speak to my partner.",
        "agent_response": "Absolutely. Before you do, what would they need to know to make the decision?",
        "context": "Arm the advocate with key figures (annual savings, zero rental, no contract)."
    },
    {
        "id": "dont_want_change_machines",
        "tag": "hardware",
        "customer_says": "I don’t want to change machines.",
        "agent_response": "That’s fine. The machine is the easy part—the main point is what you’re paying to process each transaction.",
        "context": "Shift the focus from the physical hardware swap to recurring cashflow savings."
    },
    {
        "id": "dont_pay_rental",
        "tag": "rental",
        "customer_says": "I don’t pay rental.",
        "agent_response": "Perfect. Then let’s focus purely on your transaction rate—what percentage are you currently paying?",
        "context": "If they have purchased hardware (e.g. Zettle/SumUp/Square), their transaction rate is usually high (1.75%+)."
    },
    {
        "id": "how_much_cost",
        "tag": "price",
        "customer_says": "How much does it cost?",
        "agent_response": "It depends on your turnover, Sir. What are you roughly doing in card payments each month?",
        "context": "Anchor pricing to their turnover tier: 1.25% under £5k, 0.70% over £5k."
    },
    {
        "id": "barely_take_cards",
        "tag": "turnover",
        "customer_says": "We barely take card payments.",
        "agent_response": "Even better—what’s the rough monthly amount? If the saving is tiny, I’ll tell you honestly.",
        "context": "Disarms skepticism through transparency; with £0 rental, low turnover merchants avoid terminal bleed."
    },
    {
        "id": "too_busy",
        "tag": "brush_off",
        "customer_says": "I’m too busy.",
        "agent_response": "I’ll take 20 seconds, Sir—who are you currently processing with?",
        "context": "Ask for only 20 seconds and a single piece of factual data."
    },
    {
        "id": "call_me_later",
        "tag": "callback",
        "customer_says": "Call me later.",
        "agent_response": "Absolutely. What time suits you better—later today or tomorrow?",
        "context": "Give binary choice (today or tomorrow) to lock in an explicit callback time."
    },
    {
        "id": "not_decision_maker",
        "tag": "decision_maker",
        "customer_says": "I’m not the decision maker.",
        "agent_response": "No problem. Who normally handles your card payments?",
        "context": "Identify the financial controller, owner, or director by name and best contact time."
    }
]

CALL_FLOWS = {
    "opening": {
        "title": "Attention Grabbing Opening",
        "script": "Hi Sir, good afternoon! {agent_name} here, Key Accounts Manager. I’ll keep it brief—we’re helping UK businesses cut their card-machine costs, so I just wanted to check who you’re currently using?"
    },
    "branches": [
        {
            "trigger": "If Worldpay",
            "script": "Got you. And are you paying a monthly rental on that? Because with us, there’s no contract, no rental—just 1.25% per transaction. Just so I can see if it’s actually worth your time, Sir—roughly what’s your monthly card turnover?"
        },
        {
            "trigger": "If Not Interested",
            "script": "Fair enough, Sir. Just give me 20 seconds—if I can’t show you a saving, I’ll get out of your way."
        },
        {
            "trigger": "If They Ask For Email",
            "script": "Absolutely. Just one figure so I don’t waste your time—what’s your approximate monthly card turnover?"
        },
        {
            "trigger": "If Happy With Current Provider",
            "script": "That’s good to hear. I’m not here to fix something that isn’t broken—I just want to see if we can make the same setup cheaper."
        }
    ],
    "closer_rules": [
        "Ask questions instead of giving a long explanation.",
        "Find out the current provider, rate/fees and approximate monthly card turnover.",
        "Use the customer’s answer to continue the conversation rather than jumping into a full pitch.",
        "Keep the first response short—aim to earn another 10–20 seconds.",
        "Never claim a competitor charges a specific fee unless you have confirmed it applies to that customer’s agreement."
    ]
}

PRICING_PLANS = {
    "shift4": {
        "name": "Shift4 Card Machine Plan",
        "features": ["No Rental", "No Contract", "No Monthly Fee"],
        "rates": {
            "tier_under_5k": 1.25,
            "tier_over_5k": 0.70,
            "amex": 1.90,
            "cnp": 1.99
        },
        "description": "If the turnover is less than £5,000 we offer 1.25%, else we reduce to 0.70% for debit & credit both. Amex is 1.90%, CNP is 1.99%."
    },
    "mypos": {
        "name": "myPOS Card Machine Plan",
        "features": ["Low Transaction Rates", "Quick Settlement"],
        "rates": {
            "debit": 0.32,
            "credit": 0.66,
            "auth_fee_pence": 3,
            "monthly_rental": 25.00,
            "contract_months": 18
        },
        "description": "Debit 0.32%, Credit 0.66%, Auth 3p, Rental £25, Contract Terms 18 months."
    }
}

@rebuttals_bp.route("", methods=["GET"])
@require_auth
def get_rebuttals_suite():
    user = get_current_user()
    agent_name = user.full_name.split()[0] if (user and user.full_name) else (user.username if user else "Agent")
    opening_script = CALL_FLOWS["opening"]["script"].replace("{agent_name}", agent_name)
    
    return jsonify({
        "rebuttals": REBUTTALS_DATA,
        "call_flows": {
            "opening": {
                "title": CALL_FLOWS["opening"]["title"],
                "script": opening_script,
                "raw_template": CALL_FLOWS["opening"]["script"]
            },
            "branches": CALL_FLOWS["branches"],
            "closer_rules": CALL_FLOWS["closer_rules"]
        },
        "pricing_plans": PRICING_PLANS
    }), 200

@rebuttals_bp.route("/calculate", methods=["POST"])
@require_auth
def calculate_quote():
    data = request.get_json() or {}
    try:
        turnover = float(data.get("turnover", 0))
    except (ValueError, TypeError):
        turnover = 0.0

    current_provider = data.get("current_provider", "Competitor")
    try:
        current_rate = float(data.get("current_rate", 1.75))
    except (ValueError, TypeError):
        current_rate = 1.75

    try:
        current_rental = float(data.get("current_rental", 25.0))
    except (ValueError, TypeError):
        current_rental = 25.0

    try:
        transactions_count = int(data.get("transactions_count", int(turnover / 25) if turnover > 0 else 100))
    except (ValueError, TypeError):
        transactions_count = 100

    # 1. Current Cost
    current_processing = (turnover * current_rate) / 100.0
    current_total_monthly = current_processing + current_rental
    current_annual = current_total_monthly * 12.0

    # 2. Shift4 Cost
    # If turnover < 5000: 1.25%, else 0.70%
    shift4_rate = 1.25 if turnover < 5000 else 0.70
    shift4_processing = (turnover * shift4_rate) / 100.0
    shift4_total_monthly = shift4_processing # No rental, no monthly fee
    shift4_annual = shift4_total_monthly * 12.0
    shift4_annual_savings = max(0.0, current_annual - shift4_annual)
    shift4_monthly_savings = max(0.0, current_total_monthly - shift4_total_monthly)

    # 3. myPOS Cost
    # Assuming 70% debit (0.32%) and 30% credit (0.66%) + 3p auth + £25 rental
    debit_turnover = turnover * 0.70
    credit_turnover = turnover * 0.30
    mypos_debit_cost = (debit_turnover * 0.32) / 100.0
    mypos_credit_cost = (credit_turnover * 0.66) / 100.0
    mypos_auth_cost = transactions_count * 0.03
    mypos_total_monthly = mypos_debit_cost + mypos_credit_cost + mypos_auth_cost + 25.0
    mypos_annual = mypos_total_monthly * 12.0
    mypos_annual_savings = max(0.0, current_annual - mypos_annual)

    return jsonify({
        "inputs": {
            "turnover": turnover,
            "current_provider": current_provider,
            "current_rate": current_rate,
            "current_rental": current_rental,
            "transactions_count": transactions_count
        },
        "current_provider": {
            "provider_name": current_provider,
            "rate_percent": current_rate,
            "monthly_rental": current_rental,
            "monthly_cost": round(current_total_monthly, 2),
            "annual_cost": round(current_annual, 2)
        },
        "shift4": {
            "plan_name": "Shift4",
            "applied_rate": shift4_rate,
            "tier_description": "1.25% Standard (<£5k)" if turnover < 5000 else "0.70% Volume Tier (≥£5k)",
            "monthly_rental": 0.0,
            "monthly_cost": round(shift4_total_monthly, 2),
            "annual_cost": round(shift4_annual, 2),
            "monthly_savings": round(shift4_monthly_savings, 2),
            "annual_savings": round(shift4_annual_savings, 2),
            "pitch_script": f"With Shift4, on your £{turnover:,.0f} monthly turnover, your rate drops to {shift4_rate}% with ZERO terminal rental and NO contract. You save approximately £{shift4_annual_savings:,.0f} a year!"
        },
        "mypos": {
            "plan_name": "myPOS",
            "debit_rate": 0.32,
            "credit_rate": 0.66,
            "auth_pence": 3,
            "monthly_rental": 25.0,
            "contract_months": 18,
            "monthly_cost": round(mypos_total_monthly, 2),
            "annual_cost": round(mypos_annual, 2),
            "annual_savings": round(mypos_annual_savings, 2)
        }
    }), 200
