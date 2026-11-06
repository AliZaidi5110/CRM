from datetime import datetime, timezone, timedelta
from sqlalchemy import and_, or_
from ..models import db, Callback, Customer, Team, User
from .auth_service import log_audit_event

def schedule_new_callback(customer_id: str, user: User, data: dict, client_ip: str = None) -> Callback:
    customer = Customer.query.get(customer_id)
    if not customer:
        raise ValueError("Customer not found")

    scheduled_str = data.get("scheduled_at")
    if not scheduled_str:
        raise ValueError("Scheduled date and time is required")

    scheduled_dt = None
    for fmt in ("%Y-%m-%dT%H:%M", "%Y-%m-%d %H:%M", "%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S"):
        try:
            scheduled_dt = datetime.strptime(scheduled_str.split(".")[0], fmt)
            break
        except ValueError:
            pass

    if not scheduled_dt:
        raise ValueError(f"Invalid date format: {scheduled_str}")

    assign_to_admin = bool(data.get("assign_to_admin")) and user.role and user.role.name == "agent"
    assigned_user = user
    if assign_to_admin:
        assigned_user = User.query.filter(User.is_active.is_(True), User.role.has(name="super_admin")).first()
        if not assigned_user:
            raise ValueError("No active administrator is available for callback assignment")

    callback = Callback(
        customer_id=customer.id,
        agent_id=assigned_user.id,
        created_by_id=user.id,
        team_id=customer.assigned_team_id or (user.primary_team.id if user.primary_team else None),
        scheduled_at=scheduled_dt,
        reason=data.get("reason", "Follow-up callback"),
        priority=data.get("priority", "MEDIUM"),
        reminder_minutes=int(data.get("reminder_minutes", 15)),
        notes=data.get("notes")
    )
    db.session.add(callback)
    customer.next_callback_date = scheduled_dt
    db.session.commit()

    log_audit_event(
        user_id=user.id,
        action="CALLBACK_SCHEDULED",
        entity_type="CALLBACK",
        entity_id=callback.id,
        summary=f"Scheduled callback for '{customer.full_name}' at {scheduled_dt.strftime('%d %b %Y %H:%M')}",
        details={"reason": callback.reason, "priority": callback.priority},
        ip=client_ip
    )

    return callback

def get_callbacks_for_user(user: User, filter_type: str = "all"):
    query = Callback.query.join(Customer, Callback.customer_id == Customer.id).filter(Customer.deleted_at.is_(None))

    if user.role and user.role.name == "super_admin":
        pass
    elif user.role and user.role.name == "team_leader":
        led_teams = Team.query.filter(Team.team_leader_id == user.id, Team.deleted_at.is_(None)).all()
        team_ids = [t.id for t in led_teams]
        if user.primary_team:
            team_ids.append(user.primary_team.id)
        # Use the customer team as a fallback for older callbacks that were
        # saved before callbacks consistently stored their team_id.
        query = query.filter(or_(Callback.team_id.in_(team_ids), Customer.assigned_team_id.in_(team_ids)))
    else: # Agent
        query = query.filter(or_(Callback.agent_id == user.id, Callback.created_by_id == user.id))

    now = datetime.now(timezone.utc)
    start_of_today = datetime(now.year, now.month, now.day, 0, 0, 0)
    end_of_today = datetime(now.year, now.month, now.day, 23, 59, 59)

    all_callbacks = query.order_by(Callback.scheduled_at.asc()).all()

    today_list = []
    overdue_list = []
    upcoming_list = []
    completed_list = []

    for cb in all_callbacks:
        sched = cb.scheduled_at
        if sched.tzinfo is None:
            sched = sched.replace(tzinfo=timezone.utc)

        if cb.status == "COMPLETED":
            completed_list.append(cb.to_dict())
        elif sched < now:
            overdue_list.append(cb.to_dict())
        elif start_of_today <= sched.replace(tzinfo=None) <= end_of_today:
            today_list.append(cb.to_dict())
        else:
            upcoming_list.append(cb.to_dict())

    return {
        "today": today_list,
        "overdue": overdue_list,
        "upcoming": upcoming_list,
        "completed": completed_list,
        "counts": {
            "today": len(today_list),
            "overdue": len(overdue_list),
            "upcoming": len(upcoming_list),
            "completed": len(completed_list),
            "total_pending": len(today_list) + len(overdue_list) + len(upcoming_list)
        }
    }

def complete_callback(callback_id: str, user: User, notes: str = None, client_ip: str = None) -> Callback:
    callback = Callback.query.get(callback_id)
    if not callback:
        raise ValueError("Callback not found")

    callback.status = "COMPLETED"
    callback.completed_at = datetime.now(timezone.utc)
    callback.completed_by_id = user.id
    if notes:
        callback.notes = f"{callback.notes or ''}\nResolution: {notes}".strip()

    # Clear next_callback_date on customer if this was the latest one
    customer = callback.customer
    next_pending = Callback.query.filter(
        Callback.customer_id == customer.id,
        Callback.status == "PENDING",
        Callback.id != callback.id
    ).order_by(Callback.scheduled_at.asc()).first()

    customer.next_callback_date = next_pending.scheduled_at if next_pending else None
    db.session.commit()

    log_audit_event(
        user_id=user.id,
        action="CALLBACK_COMPLETED",
        entity_type="CALLBACK",
        entity_id=callback.id,
        summary=f"Marked callback completed for '{customer.full_name}'",
        details={"notes": notes},
        ip=client_ip
    )

    return callback
