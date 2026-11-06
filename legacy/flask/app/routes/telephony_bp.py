from flask import Blueprint, request, jsonify
from ..models import Customer
from ..services.rbac_service import require_auth, get_current_user, can_access_customer
from ..services.telephony_service import get_telephony_driver

telephony_bp = Blueprint("telephony_bp", __name__)

@telephony_bp.route("/call", methods=["POST"])
@require_auth
def start_call():
    user = get_current_user()
    data = request.get_json() or {}
    customer_id = data.get("customer_id")
    phone = data.get("phone")

    if not customer_id or not phone:
        return jsonify({"error": "Bad Request", "message": "Customer ID and phone number are required"}), 400

    customer = Customer.query.get_or_404(customer_id)
    if not can_access_customer(user, customer):
        return jsonify({"error": "Forbidden", "message": "Access to customer denied"}), 403

    driver = get_telephony_driver()
    result = driver.initiate_call(customer_id=customer.id, phone=phone, agent_id=user.id)
    return jsonify(result), 200

@telephony_bp.route("/hangup", methods=["POST"])
@require_auth
def hangup_call():
    data = request.get_json() or {}
    session_id = data.get("session_id")
    if not session_id:
        return jsonify({"error": "Bad Request", "message": "Session ID required"}), 400

    driver = get_telephony_driver()
    result = driver.end_call(session_id)
    return jsonify(result), 200
