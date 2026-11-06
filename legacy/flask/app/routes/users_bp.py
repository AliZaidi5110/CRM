from datetime import datetime, timezone
from flask import Blueprint, request, jsonify
from ..models import db, User, Role, Team, TeamMember, Permission
from ..services.rbac_service import require_auth, require_permission, get_current_user
from ..services.auth_service import hash_password, log_audit_event

users_bp = Blueprint("users_bp", __name__)

@users_bp.route("", methods=["GET"])
@require_auth
@require_permission("users.view")
def list_users():
    current_user = get_current_user()
    role_filter = request.args.get("role")
    team_filter = request.args.get("team_id")
    search = request.args.get("search")

    query = User.query.filter(User.deleted_at.is_(None))

    if role_filter:
        query = query.join(Role).filter(Role.name == role_filter)
    if team_filter:
        query = query.join(TeamMember).filter(TeamMember.team_id == team_filter)
    if search:
        s = f"%{search.strip()}%"
        query = query.filter(db.or_(User.full_name.ilike(s), User.username.ilike(s), User.email.ilike(s)))

    users = query.order_by(User.full_name.asc()).all()
    return jsonify({"users": [u.to_dict(include_permissions=True) for u in users]}), 200

@users_bp.route("/<user_id>", methods=["GET"])
@require_auth
def get_user_detail(user_id):
    user = User.query.get_or_404(user_id)
    return jsonify({"user": user.to_dict(include_permissions=True)}), 200

@users_bp.route("", methods=["POST"])
@require_auth
@require_permission("users.create")
def create_user():
    current_user = get_current_user()
    data = request.get_json() or {}

    username = data.get("username", "").strip()
    email = data.get("email", "").strip().lower()
    full_name = data.get("full_name", "").strip()
    password = data.get("password", "")
    role_name = data.get("role", "agent")
    team_id = data.get("team_id")

    if not username or not email or not password or not full_name:
        return jsonify({"error": "Bad Request", "message": "Username, email, password, and full name are required"}), 400

    if User.query.filter((User.username == username) | (User.email == email)).first():
        return jsonify({"error": "Conflict", "message": "Username or email already in use"}), 409

    role = Role.query.filter_by(name=role_name).first()
    if not role:
        return jsonify({"error": "Bad Request", "message": f"Invalid role: {role_name}"}), 400

    new_user = User(
        username=username,
        email=email,
        full_name=full_name,
        phone=data.get("phone"),
        password_hash=hash_password(password),
        role_id=role.id,
        is_active=data.get("is_active", True)
    )
    db.session.add(new_user)
    db.session.flush()

    if team_id:
        team = Team.query.get(team_id)
        if team:
            membership = TeamMember(team_id=team.id, user_id=new_user.id, is_primary=True)
            db.session.add(membership)

    db.session.commit()

    log_audit_event(
        user_id=current_user.id,
        action="USER_CREATED",
        entity_type="USER",
        entity_id=new_user.id,
        summary=f"Created user {new_user.username} with role {role.name}",
        details={"username": new_user.username, "role": role.name, "team_id": team_id},
        ip=request.remote_addr
    )

    return jsonify({"message": "User created successfully", "user": new_user.to_dict()}), 201

@users_bp.route("/<user_id>", methods=["PUT"])
@require_auth
@require_permission("users.edit")
def update_user(user_id):
    current_user = get_current_user()
    user = User.query.get_or_404(user_id)
    data = request.get_json() or {}

    if "full_name" in data:
        user.full_name = data["full_name"].strip()
    if "phone" in data:
        user.phone = data["phone"].strip()
    if "email" in data:
        user.email = data["email"].strip().lower()
    if "role" in data:
        role = Role.query.filter_by(name=data["role"]).first()
        if role:
            user.role_id = role.id

    if "team_id" in data:
        new_team_id = data["team_id"]
        # Update primary team membership
        primary_mem = TeamMember.query.filter_by(user_id=user.id, is_primary=True).first()
        if new_team_id:
            if primary_mem:
                primary_mem.team_id = new_team_id
            else:
                db.session.add(TeamMember(team_id=new_team_id, user_id=user.id, is_primary=True))
        else:
            if primary_mem:
                db.session.delete(primary_mem)

    db.session.commit()

    log_audit_event(
        user_id=current_user.id,
        action="USER_UPDATED",
        entity_type="USER",
        entity_id=user.id,
        summary=f"Updated user details for {user.username}",
        details=data,
        ip=request.remote_addr
    )

    return jsonify({"message": "User updated", "user": user.to_dict()}), 200

@users_bp.route("/<user_id>/toggle-status", methods=["POST"])
@require_auth
@require_permission("users.edit")
def toggle_user_status(user_id):
    current_user = get_current_user()
    user = User.query.get_or_404(user_id)
    if user.id == current_user.id:
        return jsonify({"error": "Bad Request", "message": "Cannot deactivate your own account"}), 400

    user.is_active = not user.is_active
    db.session.commit()

    action = "USER_ACTIVATED" if user.is_active else "USER_DEACTIVATED"
    log_audit_event(
        user_id=current_user.id,
        action=action,
        entity_type="USER",
        entity_id=user.id,
        summary=f"User {user.username} {'activated' if user.is_active else 'deactivated'}",
        ip=request.remote_addr
    )

    return jsonify({"message": f"User status set to {'active' if user.is_active else 'inactive'}", "is_active": user.is_active}), 200

@users_bp.route("/<user_id>/reset-password", methods=["POST"])
@require_auth
@require_permission("users.edit")
def admin_reset_password(user_id):
    current_user = get_current_user()
    user = User.query.get_or_404(user_id)
    data = request.get_json() or {}
    new_password = data.get("new_password", "")

    if not new_password or len(new_password) < 6:
        return jsonify({"error": "Bad Request", "message": "New password must be at least 6 characters"}), 400

    user.password_hash = hash_password(new_password)
    user.failed_login_count = 0
    user.locked_until = None
    db.session.commit()

    log_audit_event(
        user_id=current_user.id,
        action="USER_PASSWORD_RESET_BY_ADMIN",
        entity_type="USER",
        entity_id=user.id,
        summary=f"Admin {current_user.username} reset password for {user.username}",
        ip=request.remote_addr
    )

    return jsonify({"message": f"Password reset successfully for {user.username}"}), 200

@users_bp.route("/roles", methods=["GET"])
@require_auth
def list_roles():
    roles = Role.query.all()
    permissions = Permission.query.all()
    return jsonify({
        "roles": [r.to_dict() for r in roles],
        "permissions": [p.to_dict() for p in permissions]
    }), 200
