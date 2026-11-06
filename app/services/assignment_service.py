from datetime import datetime, timezone
from ..models import db, Customer, User, Team, LeadAssignment, LeadTransfer, Conversation, Callback
from .auth_service import log_audit_event

def assign_lead_to_team_leader(customer_id: str, agent_user: User, data: dict, client_ip: str = None) -> LeadAssignment:
    customer = Customer.query.get(customer_id)
    if not customer:
        raise ValueError("Customer not found")

    team = customer.assigned_team or agent_user.primary_team
    if not team or not team.team_leader:
        raise ValueError("No Team Leader is configured for this team")

    team_leader = team.team_leader
    reason = data.get("reason", "Requires Team Leader review/attention")
    priority = data.get("priority", customer.priority or "HIGH")
    notes = data.get("notes", "")

    # Create LeadAssignment record
    assignment = LeadAssignment(
        customer_id=customer.id,
        from_user_id=customer.assigned_agent_id or agent_user.id,
        to_user_id=team_leader.id,
        from_team_id=customer.assigned_team_id,
        to_team_id=team.id,
        assigned_by_id=agent_user.id,
        reason=reason,
        priority=priority,
        notes=notes,
        status="PENDING_LEADER_REVIEW"
    )
    db.session.add(assignment)

    # Share the lead with the team leader without changing its agent owner.
    # Team visibility is granted by the shared team assignment, while the
    # original agent keeps the lead in their own workspace.
    previous_agent_name = customer.assigned_agent.full_name if customer.assigned_agent else agent_user.full_name
    customer.assigned_team_id = team.id
    customer.priority = priority
    customer.updated_by_id = agent_user.id

    # Keep existing follow-ups in the owning team's queue, including callbacks
    # created before a team was configured on the customer record.
    Callback.query.filter_by(customer_id=customer.id, status="PENDING").update(
        {Callback.team_id: team.id}, synchronize_session=False
    )

    # Append to conversation timeline
    convo = Conversation(
        customer_id=customer.id,
        agent_id=agent_user.id,
        interaction_type="ASSIGNED_TO_LEADER",
        summary=f"Lead shared with Team Leader {team_leader.full_name} by {previous_agent_name}. Reason: {reason}",
        notes=notes,
        next_action="Awaiting Team Leader review and action"
    )
    db.session.add(convo)
    db.session.commit()

    log_audit_event(
        user_id=agent_user.id,
        action="LEAD_SHARED_WITH_LEADER",
        entity_type="CUSTOMER",
        entity_id=customer.id,
        summary=f"Shared lead '{customer.full_name}' with Team Leader {team_leader.full_name}",
        details={"reason": reason, "team_leader_id": team_leader.id, "priority": priority},
        ip=client_ip
    )

    return assignment

def reassign_lead_to_agent(customer_id: str, assigner_user: User, data: dict, client_ip: str = None) -> LeadAssignment:
    customer = Customer.query.get(customer_id)
    if not customer:
        raise ValueError("Customer not found")

    target_agent_id = data.get("target_agent_id")
    target_team_id = data.get("target_team_id") or customer.assigned_team_id
    reason = data.get("reason", "Lead reassigned")
    notes = data.get("notes", "")

    target_agent = User.query.get(target_agent_id) if target_agent_id else None
    target_team = Team.query.get(target_team_id) if target_team_id else None

    assignment = LeadAssignment(
        customer_id=customer.id,
        from_user_id=customer.assigned_agent_id,
        to_user_id=target_agent.id if target_agent else None,
        from_team_id=customer.assigned_team_id,
        to_team_id=target_team.id if target_team else None,
        assigned_by_id=assigner_user.id,
        reason=reason,
        notes=notes,
        status="ACCEPTED"
    )
    db.session.add(assignment)

    from_agent_name = customer.assigned_agent.full_name if customer.assigned_agent else "Unassigned"
    to_agent_name = target_agent.full_name if target_agent else "Unassigned"

    customer.assigned_agent_id = target_agent.id if target_agent else None
    if target_team:
        customer.assigned_team_id = target_team.id
    customer.updated_by_id = assigner_user.id

    convo = Conversation(
        customer_id=customer.id,
        agent_id=assigner_user.id,
        interaction_type="LEAD_REASSIGNED",
        summary=f"Lead reassigned from {from_agent_name} to {to_agent_name} by {assigner_user.full_name}. Reason: {reason}",
        notes=notes
    )
    db.session.add(convo)
    db.session.commit()

    log_audit_event(
        user_id=assigner_user.id,
        action="LEAD_REASSIGNED",
        entity_type="CUSTOMER",
        entity_id=customer.id,
        summary=f"Reassigned lead '{customer.full_name}' to {to_agent_name}",
        details={"from_agent": from_agent_name, "to_agent": to_agent_name, "reason": reason},
        ip=client_ip
    )

    return assignment

def transfer_lead_to_team(customer_id: str, requesting_user: User, data: dict, client_ip: str = None) -> LeadTransfer:
    customer = Customer.query.get(customer_id)
    if not customer:
        raise ValueError("Customer not found")

    target_team_id = data.get("target_team_id")
    target_team = Team.query.get(target_team_id)
    if not target_team:
        raise ValueError("Target team not found")

    reason = data.get("reason", "Cross-team transfer")
    notes = data.get("notes", "")

    transfer = LeadTransfer(
        customer_id=customer.id,
        from_agent_id=requesting_user.id,
        target_type="team",
        target_id=target_team.id,
        reason=reason,
        notes=notes,
        status="PENDING"
    )
    db.session.add(transfer)
    db.session.commit()

    log_audit_event(
        user_id=requesting_user.id,
        action="LEAD_TRANSFER_REQUESTED",
        entity_type="CUSTOMER",
        entity_id=customer.id,
        summary=f"Transfer requested for '{customer.full_name}' to Team '{target_team.name}'",
        details={"target_team_id": target_team.id, "reason": reason},
        ip=client_ip
    )

    return transfer
