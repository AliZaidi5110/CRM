from flask import Blueprint, request, jsonify
from ..models import db, Call, CallDisposition, Customer
from ..services.rbac_service import require_auth, require_permission, get_current_user, can_access_customer
from ..services.call_service import log_call_record

calls_bp = Blueprint("calls_bp", __name__)

@calls_bp.route("", methods=["GET"])
@require_auth
def list_calls():
    user = get_current_user()
    customer_id = request.args.get("customer_id")
    page = int(request.args.get("page", 1))
    per_page = int(request.args.get("per_page", 20))

    query = Call.query

    if customer_id:
        customer = Customer.query.get_or_404(customer_id)
        if not can_access_customer(user, customer):
            return jsonify({"error": "Forbidden"}), 403
        query = query.filter(Call.customer_id == customer_id)
    else:
        # Scoped by user role
        if user.role and user.role.name == "super_admin":
            pass
        elif user.role and user.role.name == "team_leader":
            led_team_ids = [t.id for t in user.led_teams]
            if user.primary_team:
                led_team_ids.append(user.primary_team.id)
            query = query.filter(Call.team_id.in_(led_team_ids))
        else: # Agent
            query = query.filter(Call.agent_id == user.id)

    total = query.count()
    calls = query.order_by(Call.created_at.desc()).offset((page - 1) * per_page).limit(per_page).all()

    return jsonify({
        "calls": [c.to_dict() for c in calls],
        "total": total,
        "page": page,
        "per_page": per_page
    }), 200

@calls_bp.route("", methods=["POST"])
@require_auth
@require_permission("calls.create")
def log_call():
    user = get_current_user()
    data = request.get_json() or {}
    customer_id = data.get("customer_id")

    if not customer_id:
        return jsonify({"error": "Bad Request", "message": "Customer ID is required"}), 400

    customer = Customer.query.get_or_404(customer_id)
    if not can_access_customer(user, customer):
        return jsonify({"error": "Forbidden", "message": "You cannot log calls for this customer"}), 403

    call, convo = log_call_record(customer_id, user, data, client_ip=request.remote_addr)

    return jsonify({
        "message": "Call recorded successfully",
        "call": call.to_dict(),
        "conversation": convo.to_dict()
    }), 201

@calls_bp.route("/dispositions", methods=["GET"])
@require_auth
def get_dispositions():
    dispositions = CallDisposition.query.order_by(CallDisposition.sort_order.asc()).all()
    return jsonify({"dispositions": [d.to_dict() for d in dispositions]}), 200

@calls_bp.route("/dispositions", methods=["POST"])
@require_auth
@require_permission("settings.manage")
def create_disposition():
    data = request.get_json() or {}
    code = data.get("code", "").strip().upper()
    name = data.get("name", "").strip()

    if not code or not name:
        return jsonify({"error": "Bad Request", "message": "Code and Name are required"}), 400

    disp = CallDisposition(
        code=code,
        name=name,
        category=data.get("category", "General"),
        color=data.get("color", "#64748B"),
        is_conversion=bool(data.get("is_conversion", False)),
        is_callback=bool(data.get("is_callback", False)),
        is_system=False
    )
    db.session.add(disp)
    db.session.commit()

    return jsonify({"message": "Disposition created", "disposition": disp.to_dict()}), 201
