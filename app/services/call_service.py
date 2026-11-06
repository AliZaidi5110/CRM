from datetime import datetime, timezone
from ..models import db, Customer, Call, Conversation, Callback
from .auth_service import log_audit_event

def log_call_record(customer_id: str, user, data: dict, client_ip: str = None) -> tuple[Call, Conversation]:
    customer = Customer.query.get(customer_id)
    if not customer:
        raise ValueError("Customer not found")

    now = datetime.now(timezone.utc)
    duration_seconds = int(data.get("duration_seconds", 0))
    outcome = data.get("outcome", "No Answer")
    notes = data.get("notes", "").strip()
    next_action = data.get("next_action", "").strip() if data.get("next_action") else None
    callback_date = data.get("callback_date")
    callback_time = data.get("callback_time")

    call = Call(
        customer_id=customer.id,
        agent_id=user.id,
        team_id=user.primary_team.id if user.primary_team else customer.assigned_team_id,
        call_type=data.get("call_type", "Outbound"),
        duration_seconds=duration_seconds,
        outcome=outcome,
        notes=notes,
        next_action=next_action,
        callback_date=callback_date,
        callback_time=callback_time
    )
    db.session.add(call)
    db.session.flush()

    # Update Customer contact metadata
    customer.last_contact_date = now
    customer.last_contacted_by_id = user.id
    customer.updated_by_id = user.id

    # Pipeline outcome handling
    outcome_upper = outcome.upper()
    if "CONVERT" in outcome_upper:
        customer.lead_status = "CONVERTED"
        customer.customer_type = "Customer"
    elif "INTEREST" in outcome_upper:
        customer.lead_status = "INTERESTED"
    elif "NOT INTEREST" in outcome_upper:
        customer.lead_status = "NOT_INTERESTED"
    elif "WRONG NUMBER" in outcome_upper:
        customer.lead_status = "WRONG_NUMBER"
    elif "BUSY" in outcome_upper or "NO ANSWER" in outcome_upper:
        customer.lead_status = "CONTACTED"
    elif "DO NOT CALL" in outcome_upper:
        customer.lead_status = "DO_NOT_CONTACT"

    # Auto schedule callback if requested
    scheduled_callback_obj = None
    callback_info_str = None
    if callback_date and callback_time:
        callback_info_str = f"{callback_date} at {callback_time}"
        try:
            # Parse datetime
            combined_str = f"{callback_date} {callback_time}"
            # Try multiple common formats
            scheduled_dt = None
            for fmt in ("%Y-%m-%d %H:%M", "%Y-%m-%d %I:%M %p", "%d/%m/%Y %H:%M", "%d-%m-%Y %H:%M"):
                try:
                    scheduled_dt = datetime.strptime(combined_str, fmt)
                    break
                except ValueError:
                    pass
            if not scheduled_dt:
                scheduled_dt = now

            scheduled_callback_obj = Callback(
                customer_id=customer.id,
                agent_id=user.id,
                team_id=(customer.assigned_team_id or (user.primary_team.id if user.primary_team else None)),
                scheduled_at=scheduled_dt,
                reason=data.get("callback_reason") or f"Follow-up after call ({outcome})",
                notes=notes,
                priority=customer.priority or "MEDIUM"
            )
            db.session.add(scheduled_callback_obj)
            customer.next_callback_date = scheduled_dt
        except Exception as ex:
            pass

    # Create immutable Conversation timeline entry
    mins = duration_seconds // 60
    secs = duration_seconds % 60
    duration_str = f"{mins:02d}:{secs:02d}"

    conversation_summary = notes if notes else f"Call completed. Outcome: {outcome} (Duration: {duration_str})"

    convo = Conversation(
        customer_id=customer.id,
        agent_id=user.id,
        call_id=call.id,
        interaction_type="CALL",
        outcome=outcome,
        summary=conversation_summary,
        next_action=next_action,
        callback_info=callback_info_str
    )
    db.session.add(convo)
    db.session.commit()

    log_audit_event(
        user_id=user.id,
        action="CALL_LOGGED",
        entity_type="CALL",
        entity_id=call.id,
        summary=f"Logged {call.call_type} call for '{customer.full_name}' - Outcome: {outcome}",
        details={
            "duration_seconds": duration_seconds,
            "outcome": outcome,
            "customer_id": customer.id,
            "lead_status": customer.lead_status
        },
        ip=client_ip
    )

    return call, convo
