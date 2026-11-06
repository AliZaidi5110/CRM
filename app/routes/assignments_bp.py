from flask import Blueprint, request, jsonify
from ..models import db, Customer, LeadAssignment, LeadTransfer, Team
from ..services.rbac_service import require_auth, require_permission, get_current_user, can_access_customer
from ..services.assignment_service import assign_lead_to_team_leader, reassign_lead_to_agent, transfer_lead_to_team

assignments_bp = Blueprint("assignments_bp", __name__)

@assignments_bp.route("/assign-to-leader", methods=["POST"])
@require_auth
@require_permission("leads.assign")
def assign_to_leader():
    user = get_current_user()
    data = request.get_json() or {}
    customer_id = data.get("customer_id")

    if not customer_id:
        return jsonify({"error": "Bad Request", "message": "Customer ID is required"}), 400

    customer = Customer.query.get_or_404(customer_id)
    if not can_access_customer(user, customer):
        return jsonify({"error": "Forbidden", "message": "You cannot share this lead"}), 403

    try:
        assignment = assign_lead_to_team_leader(customer_id, user, data, client_ip=request.remote_addr)
        return jsonify({
            "message": "Lead shared with Team Leader",
            "assignment": assignment.to_dict()
        }), 200
    except ValueError as ex:
        return jsonify({"error": "Bad Request", "message": str(ex)}), 400

@assignments_bp.route("/reassign", methods=["POST"])
@require_auth
@require_permission("leads.assign")
def reassign_lead():
    user = get_current_user()
    data = request.get_json() or {}
    customer_id = data.get("customer_id")

    if not customer_id:
        return jsonify({"error": "Bad Request", "message": "Customer ID is required"}), 400

    customer = Customer.query.get_or_404(customer_id)
    if not can_access_customer(user, customer):
        return jsonify({"error": "Forbidden", "message": "You cannot reassign this lead"}), 403

    try:
        assignment = reassign_lead_to_agent(customer_id, user, data, client_ip=request.remote_addr)
        return jsonify({
            "message": "Lead successfully reassigned",
            "assignment": assignment.to_dict()
        }), 200
    except ValueError as ex:
        return jsonify({"error": "Bad Request", "message": str(ex)}), 400

@assignments_bp.route("/transfer", methods=["POST"])
@require_auth
@require_permission("leads.transfer")
def transfer_lead():
    user = get_current_user()
    data = request.get_json() or {}
    customer_id = data.get("customer_id")

    if not customer_id:
        return jsonify({"error": "Bad Request", "message": "Customer ID is required"}), 400

    customer = Customer.query.get_or_404(customer_id)
    if not can_access_customer(user, customer):
        return jsonify({"error": "Forbidden", "message": "You cannot transfer this lead"}), 403

    try:
        transfer = transfer_lead_to_team(customer_id, user, data, client_ip=request.remote_addr)
        return jsonify({
            "message": "Lead transfer request submitted",
            "transfer": transfer.to_dict()
        }), 200
    except ValueError as ex:
        return jsonify({"error": "Bad Request", "message": str(ex)}), 400

@assignments_bp.route("/pending", methods=["GET"])
@require_auth
def list_pending_assignments():
    user = get_current_user()
    query = LeadAssignment.query.filter_by(status="PENDING_LEADER_REVIEW")

    if user.role and user.role.name == "super_admin":
        pass
    elif user.role and user.role.name == "team_leader":
        query = query.filter_by(to_user_id=user.id)
    else:
        return jsonify({"pending": []}), 200

    assignments = query.order_by(LeadAssignment.created_at.desc()).all()
    customer_ids = {assignment.customer_id for assignment in assignments}
    customers = Customer.query.filter(Customer.id.in_(customer_ids)).all() if customer_ids else []
    customers_by_id = {customer.id: customer for customer in customers}
    pending = []
    for assignment in assignments:
        record = assignment.to_dict()
        customer = customers_by_id.get(assignment.customer_id)
        record["customer_name"] = customer.full_name if customer else "Customer record unavailable"
        record["customer_company"] = customer.company_name if customer else None
        pending.append(record)
    return jsonify({"pending": pending}), 200
