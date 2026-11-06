from flask import Blueprint, request, jsonify
from ..services.rbac_service import require_auth, get_current_user
from ..services.ai_service import execute_natural_language_command, summarize_customer_history

ai_bp = Blueprint("ai_bp", __name__)

@ai_bp.route("/query", methods=["POST"])
@require_auth
def handle_ai_query():
    user = get_current_user()
    data = request.get_json() or {}
    query_text = data.get("query", "").strip()

    if not query_text:
        return jsonify({"error": "Bad Request", "message": "Query text required"}), 400

    result = execute_natural_language_command(query_text, user)
    return jsonify(result), 200

@ai_bp.route("/summarize", methods=["POST"])
@require_auth
def handle_ai_summarize():
    user = get_current_user()
    data = request.get_json() or {}
    customer_id = data.get("customer_id")

    if not customer_id:
        return jsonify({"error": "Bad Request", "message": "Customer ID required"}), 400

    try:
        summary = summarize_customer_history(customer_id, user)
        return jsonify(summary), 200
    except PermissionError as pe:
        return jsonify({"error": "Forbidden", "message": str(pe)}), 403
    except ValueError as ve:
        return jsonify({"error": "Not Found", "message": str(ve)}), 404
