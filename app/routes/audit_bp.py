from flask import Blueprint, request, jsonify
from ..models import db, AuditLog, User
from ..services.rbac_service import require_auth, require_permission, get_current_user

audit_bp = Blueprint("audit_bp", __name__)

@audit_bp.route("", methods=["GET"])
@require_auth
@require_permission("audit.view")
def list_audit_logs():
    page = int(request.args.get("page", 1))
    per_page = int(request.args.get("per_page", 25))
    action = request.args.get("action")
    entity_type = request.args.get("entity_type")
    user_id = request.args.get("user_id")
    search = request.args.get("search")

    query = AuditLog.query

    if action:
        query = query.filter(AuditLog.action == action)
    if entity_type:
        query = query.filter(AuditLog.entity_type == entity_type)
    if user_id:
        query = query.filter(AuditLog.user_id == user_id)
    if search:
        s = f"%{search.strip()}%"
        query = query.filter(db.or_(AuditLog.summary.ilike(s), AuditLog.action.ilike(s)))

    total = query.count()
    logs = query.order_by(AuditLog.created_at.desc()).offset((page - 1) * per_page).limit(per_page).all()

    return jsonify({
        "logs": [l.to_dict() for l in logs],
        "total": total,
        "page": page,
        "per_page": per_page,
        "pages": (total + per_page - 1) // per_page
    }), 200
