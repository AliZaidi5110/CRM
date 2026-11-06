from flask import Blueprint, request, jsonify
from ..models import db, Callback, Customer, Team
from ..services.rbac_service import require_auth, require_permission, get_current_user, can_access_customer
from ..services.callback_service import schedule_new_callback, get_callbacks_for_user, complete_callback

callbacks_bp = Blueprint("callbacks_bp", __name__)

@callbacks_bp.route("", methods=["GET"])
@require_auth
def list_callbacks():
    user = get_current_user()
    filter_type = request.args.get("filter", "all")
    data = get_callbacks_for_user(user, filter_type=filter_type)
    return jsonify(data), 200

@callbacks_bp.route("", methods=["POST"])
@require_auth
@require_permission("callbacks.create")
def schedule_callback_route():
    user = get_current_user()
    data = request.get_json() or {}
    customer_id = data.get("customer_id")

    if not customer_id:
        return jsonify({"error": "Bad Request", "message": "Customer ID is required"}), 400

    customer = Customer.query.get_or_404(customer_id)
    if not can_access_customer(user, customer):
        return jsonify({"error": "Forbidden", "message": "You cannot schedule callbacks for this customer"}), 403

    try:
        cb = schedule_new_callback(customer_id, user, data, client_ip=request.remote_addr)
        return jsonify({"message": "Callback scheduled successfully", "callback": cb.to_dict()}), 201
    except ValueError as e:
        return jsonify({"error": "Bad Request", "message": str(e)}), 400

@callbacks_bp.route("/<callback_id>/complete", methods=["POST"])
@require_auth
@require_permission("callbacks.edit")
def complete_callback_route(callback_id):
    user = get_current_user()
    data = request.get_json() or {}
    notes = data.get("notes")

    callback = Callback.query.get_or_404(callback_id)
    can_access_team_callback = bool(
        user.role and user.role.name == "team_leader" and callback.team_id and
        Team.query.filter_by(id=callback.team_id, team_leader_id=user.id, deleted_at=None).first()
    )
    is_callback_owner = callback.agent_id == user.id
    if not can_access_customer(user, callback.customer) and not can_access_team_callback and not is_callback_owner:
        return jsonify({"error": "Forbidden", "message": "You cannot complete this team's callback"}), 403

    try:
        cb = complete_callback(callback_id, user, notes=notes, client_ip=request.remote_addr)
        return jsonify({"message": "Callback marked as completed", "callback": cb.to_dict()}), 200
    except ValueError as e:
        return jsonify({"error": "Bad Request", "message": str(e)}), 400
