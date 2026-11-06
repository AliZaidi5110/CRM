from flask import Blueprint, request, jsonify
from ..models import db, Customer, Team, User, CallDisposition, LeadStatus, Tag
from ..services.rbac_service import require_auth, get_current_user, apply_customer_scope
from ..services.sync_service import process_sync_batch
from ..services.import_export_service import preview_csv_data, execute_csv_import

sync_bp = Blueprint("sync_bp", __name__)

@sync_bp.route("", methods=["POST"])
@require_auth
def sync_offline_queue():
    user = get_current_user()
    data = request.get_json() or {}
    device_id = data.get("device_id") or request.headers.get("X-Device-ID")
    items = data.get("items", [])

    if not isinstance(items, list):
        return jsonify({"error": "Bad Request", "message": "Items must be a list"}), 400

    results = process_sync_batch(user, device_id, items, client_ip=request.remote_addr)
    return jsonify({
        "message": "Sync processing complete",
        "results": results
    }), 200

@sync_bp.route("/bootstrap", methods=["GET"])
@require_auth
def get_offline_bootstrap():
    """
    Downloads authorized dataset into client's IndexedDB for offline operation
    """
    user = get_current_user()

    # Get authorized customers
    q_cust = Customer.query
    q_cust = apply_customer_scope(q_cust, user)
    customers = [c.to_dict() for c in q_cust.limit(500).all()]

    # Metadata
    statuses = [s.to_dict() for s in LeadStatus.query.order_by(LeadStatus.sort_order.asc()).all()]
    dispositions = [d.to_dict() for d in CallDisposition.query.order_by(CallDisposition.sort_order.asc()).all()]
    tags = [t.to_dict() for t in Tag.query.all()]
    teams = [t.to_dict() for t in Team.query.filter_by(deleted_at=None).all()]

    return jsonify({
        "customers": customers,
        "statuses": statuses,
        "dispositions": dispositions,
        "tags": tags,
        "teams": teams,
        "user": user.to_dict(include_permissions=True)
    }), 200

@sync_bp.route("/import/preview", methods=["POST"])
@require_auth
def preview_import():
    if "file" not in request.files:
        return jsonify({"error": "Bad Request", "message": "No file uploaded"}), 400
    file = request.files["file"]
    content = file.read().decode("utf-8", errors="ignore")
    preview = preview_csv_data(content)
    return jsonify(preview), 200

@sync_bp.route("/import/execute", methods=["POST"])
@require_auth
def run_import():
    user = get_current_user()
    if "file" not in request.files:
        return jsonify({"error": "Bad Request", "message": "No file uploaded"}), 400

    file = request.files["file"]
    content = file.read().decode("utf-8", errors="ignore")

    import json
    column_mapping = json.loads(request.form.get("column_mapping", "{}"))
    team_id = request.form.get("team_id")
    agent_id = request.form.get("agent_id")
    duplicate_strategy = request.form.get("duplicate_strategy", "skip")

    result = execute_csv_import(
        file_content=content,
        column_mapping=column_mapping,
        user=user,
        team_id=team_id,
        agent_id=agent_id,
        duplicate_strategy=duplicate_strategy,
        client_ip=request.remote_addr
    )
    return jsonify(result), 200
