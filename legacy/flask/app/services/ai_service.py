import re
from datetime import datetime, timezone
from ..models import db, Customer, Call, Callback, Conversation, Team, User
from .rbac_service import can_access_customer, apply_customer_scope
from .callback_service import get_callbacks_for_user

def summarize_customer_history(customer_id: str, user: User) -> dict:
    customer = Customer.query.get(customer_id)
    if not customer:
        raise ValueError("Customer not found")

    if not can_access_customer(user, customer):
        raise PermissionError("Access denied: You do not have permission to access this customer record")

    # Gather chronological records
    conversations = Conversation.query.filter_by(customer_id=customer.id).order_by(Conversation.created_at.asc()).all()
    calls = Call.query.filter_by(customer_id=customer.id).order_by(Call.created_at.asc()).all()

    interaction_texts = [f"[{c.created_at.strftime('%Y-%m-%d %H:%M')}] ({c.interaction_type}) {c.summary}" for c in conversations]
    notes_texts = [f"Call ({c.outcome}): {c.notes}" for c in calls if c.notes]

    all_notes = " | ".join(interaction_texts + notes_texts)

    # Heuristic AI extraction for high accuracy
    provider = customer.previous_provider
    if not provider:
        for p in ["Worldpay", "Barclays", "Stripe", "Zettle", "Square", "Clover", "Tyl", "Elavon"]:
            if p.lower() in all_notes.lower():
                provider = p
                break

    # Detect objections / pricing
    pricing_objection = "rates" in all_notes.lower() or "price" in all_notes.lower() or "monthly" in all_notes.lower() or "£" in all_notes

    # Intent detection
    status = customer.lead_status
    if status == "CONVERTED":
        intent = "Converted Customer (Active Account)"
    elif status == "INTERESTED":
        intent = "High Intent - Exploring Better Rates & Terms"
    elif status == "NOT_INTERESTED":
        intent = "Low Intent - Satisfied with Current Solution"
    else:
        intent = "Prospect - Exploration Phase"

    recommended_action = "Schedule a follow-up consultation with custom comparison pricing sheet."
    if status == "INTERESTED":
        recommended_action = "Present detailed tariff savings against current card machine provider."
    elif status == "NEW":
        recommended_action = "Conduct initial discovery call to identify current contract expiry date."

    summary = (
        f"{customer.full_name} ({customer.company_name or 'Independent Merchant'}) "
        f"currently categorized as '{status}'. "
        f"{'Current terminal provider identified as ' + provider + '. ' if provider else ''}"
        f"Total calls logged: {len(calls)}. Total interactions: {len(conversations)}."
    )

    return {
        "customer_id": customer.id,
        "customer_name": customer.full_name,
        "company": customer.company_name,
        "status": customer.lead_status,
        "provider_detected": provider or "Unknown",
        "intent": intent,
        "pricing_sensitive": pricing_objection,
        "ai_summary": summary,
        "recommended_next_action": recommended_action,
        "total_calls": len(calls),
        "total_interactions": len(conversations)
    }

def execute_natural_language_command(query_text: str, user: User) -> dict:
    q = query_text.strip().lower()

    # Rule 1: Security check for cross-team snooping
    match_team = re.search(r"team\s+([a-z0-9\-_]+)", q)
    if match_team:
        team_name_requested = match_team.group(1).upper()
        # Find target team
        target_team = Team.query.filter(Team.name.ilike(f"%Team {team_name_requested}%") | Team.name.ilike(f"%{team_name_requested}%")).first()
        if target_team:
            # Check if user has permission
            is_admin = user.role and user.role.name == "super_admin"
            is_leader = user.role and user.role.name == "team_leader" and target_team.team_leader_id == user.id
            is_member = user.primary_team and user.primary_team.id == target_team.id

            if not (is_admin or is_leader or is_member):
                return {
                    "success": False,
                    "error": "Permission Denied",
                    "response": f"AI Safety Policy: You do not have permission to access private records belonging to {target_team.name}."
                }

    # Rule 2: "Show my callbacks for today" or "callbacks today"
    if "callback" in q and ("today" in q or "due" in q):
        cb_data = get_callbacks_for_user(user)
        items = cb_data["today"]
        return {
            "success": True,
            "intent": "QUERY_CALLBACKS_TODAY",
            "response": f"You have {len(items)} callback(s) scheduled for today.",
            "data": items
        }

    # Rule 3: Overdue callbacks
    if "overdue callback" in q or "callbacks overdue" in q:
        cb_data = get_callbacks_for_user(user)
        items = cb_data["overdue"]
        return {
            "success": True,
            "intent": "QUERY_OVERDUE_CALLBACKS",
            "response": f"Found {len(items)} overdue callback(s) requiring immediate attention.",
            "data": items
        }

    # Rule 4: "Show my interested leads" or "interested"
    if "interested" in q:
        query = Customer.query.filter(Customer.lead_status == "INTERESTED")
        query = apply_customer_scope(query, user)
        leads = query.limit(20).all()
        return {
            "success": True,
            "intent": "QUERY_INTERESTED_LEADS",
            "response": f"Found {len(leads)} interested lead(s) within your authorized scope.",
            "data": [l.to_dict(summary=True) for l in leads]
        }

    # Rule 5: "Summarize {name}"
    match_sum = re.search(r"summarize\s+(.+)", q)
    if match_sum:
        target_name = match_sum.group(1).strip()
        cust_q = Customer.query.filter(
            db.or_(Customer.full_name.ilike(f"%{target_name}%"), Customer.company_name.ilike(f"%{target_name}%")),
            Customer.deleted_at.is_(None)
        )
        cust_q = apply_customer_scope(cust_q, user)
        cust = cust_q.first()
        if not cust:
            return {
                "success": False,
                "response": f"Could not find accessible customer matching '{target_name}'."
            }
        summary_result = summarize_customer_history(cust.id, user)
        return {
            "success": True,
            "intent": "SUMMARIZE_CUSTOMER",
            "response": summary_result["ai_summary"],
            "data": summary_result
        }

    # Rule 6: "Show all leads assigned to me" or "my leads"
    if "my lead" in q or "assigned to me" in q:
        query = Customer.query.filter(Customer.assigned_agent_id == user.id, Customer.deleted_at.is_(None))
        leads = query.order_by(Customer.updated_at.desc()).limit(20).all()
        return {
            "success": True,
            "intent": "QUERY_MY_LEADS",
            "response": f"Found {len(leads)} leads currently assigned to you.",
            "data": [l.to_dict(summary=True) for l in leads]
        }

    # Fallback search
    query = Customer.query
    query = apply_customer_scope(query, user)
    results = query.filter(
        db.or_(Customer.full_name.ilike(f"%{query_text}%"), Customer.company_name.ilike(f"%{query_text}%"), Customer.phone.ilike(f"%{query_text}%"))
    ).limit(10).all()

    return {
        "success": True,
        "intent": "GENERAL_SEARCH",
        "response": f"Found {len(results)} matching records for '{query_text}'.",
        "data": [r.to_dict(summary=True) for r in results]
    }
