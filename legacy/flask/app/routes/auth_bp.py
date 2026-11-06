import uuid
from flask import Blueprint, request, jsonify, g
from ..models import db, User, Device
from ..services.auth_service import authenticate_user, create_token, hash_password, log_audit_event
from ..services.rbac_service import require_auth, get_current_user

auth_bp = Blueprint("auth_bp", __name__)

@auth_bp.route("/login", methods=["POST"])
def login():
    data = request.get_json() or {}
    username = data.get("username", "").strip()
    password = data.get("password", "")
    device_name = data.get("device_name", "Web Browser")
    device_id = data.get("device_id") or str(uuid.uuid4())

    if not username or not password:
        return jsonify({"error": "Bad Request", "message": "Username and password are required"}), 400

    user, error = authenticate_user(username, password)
    if error:
        return jsonify({"error": "Authentication Failed", "message": error}), 401

    # Record or update device
    device = Device.query.filter_by(device_token=device_id).first()
    if not device:
        device = Device(
            user_id=user.id,
            device_name=device_name,
            device_token=device_id,
            ip_address=request.remote_addr,
            user_agent=request.user_agent.string[:255] if request.user_agent else "Unknown"
        )
        db.session.add(device)
    else:
        device.user_id = user.id
        device.last_active_at = db.func.now()
        device.ip_address = request.remote_addr
    db.session.commit()

    token = create_token(user, device_id=device_id)

    log_audit_event(
        user_id=user.id,
        action="LOGIN_SUCCESS",
        entity_type="USER",
        entity_id=user.id,
        summary=f"User {user.username} logged in successfully",
        ip=request.remote_addr,
        user_agent=request.user_agent.string if request.user_agent else None
    )

    return jsonify({
        "message": "Login successful",
        "token": token,
        "device_id": device_id,
        "user": user.to_dict(include_permissions=True)
    }), 200

@auth_bp.route("/me", methods=["GET"])
@require_auth
def get_me():
    user = get_current_user()
    return jsonify({
        "user": user.to_dict(include_permissions=True)
    }), 200

@auth_bp.route("/change-password", methods=["POST"])
@require_auth
def change_password():
    user = get_current_user()
    data = request.get_json() or {}
    current_pw = data.get("current_password", "")
    new_pw = data.get("new_password", "")

    if not new_pw or len(new_pw) < 6:
        return jsonify({"error": "Bad Request", "message": "New password must be at least 6 characters"}), 400

    from ..services.auth_service import verify_password
    if not verify_password(current_pw, user.password_hash):
        return jsonify({"error": "Forbidden", "message": "Current password is incorrect"}), 403

    user.password_hash = hash_password(new_pw)
    db.session.commit()

    log_audit_event(
        user_id=user.id,
        action="PASSWORD_CHANGED",
        entity_type="USER",
        entity_id=user.id,
        summary=f"User {user.username} changed their password",
        ip=request.remote_addr
    )

    return jsonify({"message": "Password updated successfully"}), 200

@auth_bp.route("/logout", methods=["POST"])
@require_auth
def logout():
    user = get_current_user()
    log_audit_event(
        user_id=user.id,
        action="LOGOUT",
        entity_type="USER",
        entity_id=user.id,
        summary=f"User {user.username} logged out",
        ip=request.remote_addr
    )
    return jsonify({"message": "Logged out successfully"}), 200
