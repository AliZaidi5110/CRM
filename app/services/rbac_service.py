from functools import wraps
from flask import request, jsonify, g
from ..models import User, Customer, Team
from .auth_service import decode_token

def get_current_user() -> User | None:
    if hasattr(g, "current_user") and g.current_user:
        return g.current_user

    auth_header = request.headers.get("Authorization", "")
    token = None
    if auth_header.startswith("Bearer "):
        token = auth_header.split(" ", 1)[1].strip()
    elif request.cookies.get("access_token"):
        token = request.cookies.get("access_token")

    if not token:
        return None

    payload = decode_token(token)
    if not payload:
        return None

    user = User.query.get(payload["sub"])
    if not user or not user.is_active or user.deleted_at is not None:
        return None

    g.current_user = user
    g.token_payload = payload
    return user

def require_auth(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        user = get_current_user()
        if not user:
            return jsonify({"error": "Unauthorized", "message": "Valid authentication token required"}), 401
        return f(*args, **kwargs)
    return decorated

def require_permission(perm_code: str):
    def decorator(f):
        @wraps(f)
        def decorated(*args, **kwargs):
            user = get_current_user()
            if not user:
                return jsonify({"error": "Unauthorized", "message": "Valid authentication token required"}), 401
            
            # Super Admin bypasses all checks
            if user.role and user.role.name == "super_admin":
                return f(*args, **kwargs)

            if not user.has_permission(perm_code):
                return jsonify({
                    "error": "Forbidden",
                    "message": f"Permission '{perm_code}' required to perform this action"
                }), 403

            return f(*args, **kwargs)
        return decorated
    return decorator

def apply_customer_scope(query, user: User):
    """
    Enforces server-side data visibility boundaries:
    - Super Admin: all non-deleted customers
    - Team Leader: customers assigned to their led team(s) or assigned to agents in their team
    - Agent: customers assigned to them or their primary team
    """
    if not user:
        return query.filter(Customer.id == None)

    if user.role and user.role.name == "super_admin":
        return query.filter(Customer.deleted_at.is_(None))

    if user.role and user.role.name == "team_leader":
        # Get all teams led by this user or where they are primary
        led_teams = Team.query.filter(
            Team.team_leader_id == user.id,
            Team.deleted_at.is_(None)
        ).all()
        led_team_ids = [t.id for t in led_teams]
        if user.primary_team and user.primary_team.id not in led_team_ids:
            led_team_ids.append(user.primary_team.id)

        return query.filter(
            Customer.deleted_at.is_(None),
            Customer.assigned_team_id.in_(led_team_ids)
        )

    # Standard Agent: only owned leads and genuinely unassigned leads in the
    # agent's team appear in their workspace.
    primary_team_id = user.primary_team.id if user.primary_team else None
    agent_scope = Customer.assigned_agent_id == user.id
    if primary_team_id:
        agent_scope = agent_scope | (
            (Customer.assigned_team_id == primary_team_id) & Customer.assigned_agent_id.is_(None)
        )
    return query.filter(
        Customer.deleted_at.is_(None),
        agent_scope
    )

def can_access_customer(user: User, customer: Customer) -> bool:
    if not user or not customer:
        return False
    if customer.deleted_at is not None:
        return user.role and user.role.name == "super_admin"
    if user.role and user.role.name == "super_admin":
        return True
    if user.role and user.role.name == "team_leader":
        led_teams = Team.query.filter(Team.team_leader_id == user.id, Team.deleted_at.is_(None)).all()
        led_ids = {t.id for t in led_teams}
        if user.primary_team:
            led_ids.add(user.primary_team.id)
        return customer.assigned_team_id in led_ids
    # Agent: a shared team assignment alone does not grant access to a lead
    # owned by another agent.
    if customer.assigned_agent_id == user.id:
        return True
    if customer.assigned_agent_id is None and user.primary_team and customer.assigned_team_id == user.primary_team.id:
        return True
    return False
