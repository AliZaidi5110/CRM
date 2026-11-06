import uuid
from datetime import datetime, timezone
from . import db

def generate_uuid():
    return str(uuid.uuid4())

class LeadAssignment(db.Model):
    __tablename__ = "lead_assignments"
    id = db.Column(db.String(36), primary_key=True, default=generate_uuid)
    customer_id = db.Column(db.String(36), db.ForeignKey("customers.id", ondelete="CASCADE"), nullable=False, index=True)
    
    from_user_id = db.Column(db.String(36), db.ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    to_user_id = db.Column(db.String(36), db.ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    from_team_id = db.Column(db.String(36), db.ForeignKey("teams.id", ondelete="SET NULL"), nullable=True)
    to_team_id = db.Column(db.String(36), db.ForeignKey("teams.id", ondelete="SET NULL"), nullable=True)
    assigned_by_id = db.Column(db.String(36), db.ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    
    reason = db.Column(db.String(255), nullable=True)
    priority = db.Column(db.String(20), default="MEDIUM")
    notes = db.Column(db.Text, nullable=True)
    status = db.Column(db.String(30), default="ACCEPTED") # ACCEPTED, PENDING, REJECTED
    
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc), index=True)

    from_user = db.relationship("User", foreign_keys=[from_user_id])
    to_user = db.relationship("User", foreign_keys=[to_user_id])
    assigned_by = db.relationship("User", foreign_keys=[assigned_by_id])
    from_team = db.relationship("Team", foreign_keys=[from_team_id])
    to_team = db.relationship("Team", foreign_keys=[to_team_id])

    def to_dict(self):
        return {
            "id": self.id,
            "customer_id": self.customer_id,
            "from_user_id": self.from_user_id,
            "from_user_name": self.from_user.full_name if self.from_user else "Unassigned",
            "to_user_id": self.to_user_id,
            "to_user_name": self.to_user.full_name if self.to_user else "Unassigned",
            "from_team_id": self.from_team_id,
            "from_team_name": self.from_team.name if self.from_team else None,
            "to_team_id": self.to_team_id,
            "to_team_name": self.to_team.name if self.to_team else None,
            "assigned_by_name": self.assigned_by.full_name if self.assigned_by else "System",
            "reason": self.reason,
            "priority": self.priority,
            "notes": self.notes,
            "status": self.status,
            "created_at": self.created_at.isoformat() if self.created_at else None
        }

class LeadTransfer(db.Model):
    __tablename__ = "lead_transfers"
    id = db.Column(db.String(36), primary_key=True, default=generate_uuid)
    customer_id = db.Column(db.String(36), db.ForeignKey("customers.id", ondelete="CASCADE"), nullable=False, index=True)
    
    from_agent_id = db.Column(db.String(36), db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    target_type = db.Column(db.String(30), nullable=False) # 'team_leader' or 'team'
    target_id = db.Column(db.String(36), nullable=False)   # user_id of team leader or team_id
    
    reason = db.Column(db.String(255), nullable=False)
    notes = db.Column(db.Text, nullable=True)
    status = db.Column(db.String(30), default="PENDING", index=True) # PENDING, ACCEPTED, REJECTED, RETURNED
    
    resolved_by_id = db.Column(db.String(36), db.ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    resolved_at = db.Column(db.DateTime, nullable=True)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc), index=True)

    from_agent = db.relationship("User", foreign_keys=[from_agent_id])
    resolved_by = db.relationship("User", foreign_keys=[resolved_by_id])

    def to_dict(self):
        return {
            "id": self.id,
            "customer_id": self.customer_id,
            "customer_name": self.customer.full_name if self.customer else "Unknown",
            "customer_company": self.customer.company_name if self.customer else None,
            "from_agent_id": self.from_agent_id,
            "from_agent_name": self.from_agent.full_name if self.from_agent else "Unknown",
            "target_type": self.target_type,
            "target_id": self.target_id,
            "reason": self.reason,
            "notes": self.notes,
            "status": self.status,
            "resolved_by_name": self.resolved_by.full_name if self.resolved_by else None,
            "resolved_at": self.resolved_at.isoformat() if self.resolved_at else None,
            "created_at": self.created_at.isoformat() if self.created_at else None
        }
