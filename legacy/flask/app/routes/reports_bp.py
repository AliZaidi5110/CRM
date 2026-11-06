from flask import Blueprint, request, jsonify, Response
from ..models import User, Team
from ..services.rbac_service import require_auth, require_permission, get_current_user
from ..services.report_service import get_agent_dashboard_metrics, get_team_leader_dashboard_metrics, get_admin_dashboard_metrics
from ..services.import_export_service import export_customers_csv

reports_bp = Blueprint("reports_bp", __name__)

@reports_bp.route("/dashboard", methods=["GET"])
@require_auth
def get_dashboard_metrics():
    user = get_current_user()
    date_range = request.args.get("range", "today")

    if user.role and user.role.name == "super_admin":
        data = get_admin_dashboard_metrics(date_range=date_range)
    elif user.role and user.role.name == "team_leader":
        data = get_team_leader_dashboard_metrics(user, date_range=date_range)
    else:
        data = get_agent_dashboard_metrics(user, date_range=date_range)

    return jsonify(data), 200

@reports_bp.route("/admin", methods=["GET"])
@require_auth
@require_permission("reports.view")
def get_admin_report():
    date_range = request.args.get("range", "today")
    data = get_admin_dashboard_metrics(date_range=date_range)
    return jsonify(data), 200

@reports_bp.route("/team/<team_id>", methods=["GET"])
@require_auth
@require_permission("reports.view")
def get_team_report(team_id):
    user = get_current_user()
    team = Team.query.get_or_404(team_id)

    # If team leader, check if they manage this team
    if user.role and user.role.name == "team_leader" and team.team_leader_id != user.id:
        return jsonify({"error": "Forbidden", "message": "Cannot view other team reports"}), 403

    date_range = request.args.get("range", "today")
    leader_dummy = team.team_leader or user
    data = get_team_leader_dashboard_metrics(leader_dummy, date_range=date_range)
    return jsonify(data), 200

@reports_bp.route("/agent/<agent_id>", methods=["GET"])
@require_auth
@require_permission("reports.view")
def get_agent_report(agent_id):
    user = get_current_user()
    agent = User.query.get_or_404(agent_id)

    if user.role and user.role.name == "agent" and user.id != agent.id:
        return jsonify({"error": "Forbidden", "message": "Cannot view other agent reports"}), 403

    date_range = request.args.get("range", "today")
    data = get_agent_dashboard_metrics(agent, date_range=date_range)
    return jsonify(data), 200

@reports_bp.route("/export", methods=["POST"])
@require_auth
@require_permission("reports.export")
def export_report_csv():
    user = get_current_user()
    data = request.get_json() or {}
    csv_str = export_customers_csv(user, filters=data.get("filters"))

    return Response(
        csv_str,
        mimetype="text/csv",
        headers={"Content-Disposition": "attachment; filename=crm_export.csv"}
    )
