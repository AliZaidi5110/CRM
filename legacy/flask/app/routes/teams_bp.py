from flask import Blueprint, request, jsonify
from ..models import db, Team, TeamMember, User
from ..services.rbac_service import require_auth, require_permission, get_current_user
from ..services.auth_service import log_audit_event

teams_bp = Blueprint("teams_bp", __name__)

@teams_bp.route("", methods=["GET"])
@require_auth
def list_teams():
    current_user = get_current_user()
    query = Team.query.filter(Team.deleted_at.is_(None))

    # If team leader, can see all teams if permitted, or at least led teams
    teams = query.order_by(Team.name.asc()).all()
    return jsonify({"teams": [t.to_dict(include_members=True) for t in teams]}), 200

@teams_bp.route("/<team_id>", methods=["GET"])
@require_auth
def get_team(team_id):
    team = Team.query.get_or_404(team_id)
    return jsonify({"team": team.to_dict(include_members=True)}), 200

@teams_bp.route("", methods=["POST"])
@require_auth
@require_permission("teams.create")
def create_team():
    current_user = get_current_user()
    data = request.get_json() or {}
    name = data.get("name", "").strip()
    description = data.get("description", "").strip()
    team_leader_id = data.get("team_leader_id")
    agent_ids = data.get("agent_ids", [])

    if not name:
        return jsonify({"error": "Bad Request", "message": "Team name is required"}), 400

    if Team.query.filter_by(name=name, deleted_at=None).first():
        return jsonify({"error": "Conflict", "message": "Team with this name already exists"}), 409

    team = Team(
        name=name,
        description=description,
        team_leader_id=team_leader_id,
        is_active=True
    )
    db.session.add(team)
    db.session.flush()

    # Add agents
    for uid in agent_ids:
        u = User.query.get(uid)
        if u:
            # Set as primary
            mem = TeamMember(team_id=team.id, user_id=u.id, is_primary=True)
            db.session.add(mem)

    db.session.commit()

    log_audit_event(
        user_id=current_user.id,
        action="TEAM_CREATED",
        entity_type="TEAM",
        entity_id=team.id,
        summary=f"Created team '{team.name}'",
        details={"name": team.name, "team_leader_id": team_leader_id, "members_count": len(agent_ids)},
        ip=request.remote_addr
    )

    return jsonify({"message": "Team created successfully", "team": team.to_dict(include_members=True)}), 201

@teams_bp.route("/<team_id>", methods=["PUT"])
@require_auth
@require_permission("teams.edit")
def update_team(team_id):
    current_user = get_current_user()
    team = Team.query.get_or_404(team_id)
    data = request.get_json() or {}

    if "name" in data and data["name"].strip():
        team.name = data["name"].strip()
    if "description" in data:
        team.description = data["description"].strip()
    if "team_leader_id" in data:
        team.team_leader_id = data["team_leader_id"] or None
    if "is_active" in data:
        team.is_active = bool(data["is_active"])

    db.session.commit()

    log_audit_event(
        user_id=current_user.id,
        action="TEAM_UPDATED",
        entity_type="TEAM",
        entity_id=team.id,
        summary=f"Updated team '{team.name}'",
        details=data,
        ip=request.remote_addr
    )

    return jsonify({"message": "Team updated", "team": team.to_dict(include_members=True)}), 200

@teams_bp.route("/<team_id>/members", methods=["POST"])
@require_auth
@require_permission("teams.edit")
def add_team_member(team_id):
    current_user = get_current_user()
    team = Team.query.get_or_404(team_id)
    data = request.get_json() or {}
    user_id = data.get("user_id")

    user = User.query.get_or_404(user_id)
    existing = TeamMember.query.filter_by(team_id=team.id, user_id=user.id).first()
    if existing:
        return jsonify({"message": "User is already a member of this team"}), 200

    mem = TeamMember(team_id=team.id, user_id=user.id, is_primary=True)
    db.session.add(mem)
    db.session.commit()

    log_audit_event(
        user_id=current_user.id,
        action="TEAM_MEMBER_ADDED",
        entity_type="TEAM",
        entity_id=team.id,
        summary=f"Added {user.full_name} to team '{team.name}'",
        ip=request.remote_addr
    )

    return jsonify({"message": "Member added to team", "team": team.to_dict(include_members=True)}), 200

@teams_bp.route("/<team_id>/members/<user_id>", methods=["DELETE"])
@require_auth
@require_permission("teams.edit")
def remove_team_member(team_id, user_id):
    current_user = get_current_user()
    team = Team.query.get_or_404(team_id)
    mem = TeamMember.query.filter_by(team_id=team.id, user_id=user_id).first()
    if mem:
        db.session.delete(mem)
        db.session.commit()

    log_audit_event(
        user_id=current_user.id,
        action="TEAM_MEMBER_REMOVED",
        entity_type="TEAM",
        entity_id=team.id,
        summary=f"Removed member from team '{team.name}'",
        ip=request.remote_addr
    )

    return jsonify({"message": "Member removed from team", "team": team.to_dict(include_members=True)}), 200
