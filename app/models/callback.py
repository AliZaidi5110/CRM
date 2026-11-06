import uuid
from datetime import datetime, timezone
from . import db

def generate_uuid():
    return str(uuid.uuid4())

class Callback(db.Model):
    __tablename__ = "callbacks"
    id = db.Column(db.String(36), primary_key=True, default=generate_uuid)
    customer_id = db.Column(db.String(36), db.ForeignKey("customers.id", ondelete="CASCADE"), nullable=False, index=True)
    agent_id = db.Column(db.String(36), db.ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    created_by_id = db.Column(db.String(36), db.ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    team_id = db.Column(db.String(36), db.ForeignKey("teams.id", ondelete="SET NULL"), nullable=True, index=True)
    
    scheduled_at = db.Column(db.DateTime, nullable=False, index=True)
    reason = db.Column(db.String(255), nullable=False)
    priority = db.Column(db.String(20), default="MEDIUM") # LOW, MEDIUM, HIGH, URGENT
    reminder_minutes = db.Column(db.Integer, default=15)
    
    status = db.Column(db.String(30), default="PENDING", index=True) # PENDING, COMPLETED, MISSED, CANCELLED
    notes = db.Column(db.Text, nullable=True)
    completed_at = db.Column(db.DateTime, nullable=True)
    completed_by_id = db.Column(db.String(36), db.ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc), index=True)
    updated_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    agent = db.relationship("User", foreign_keys=[agent_id])
    created_by = db.relationship("User", foreign_keys=[created_by_id])
    team = db.relationship("Team", foreign_keys=[team_id])
    completed_by = db.relationship("User", foreign_keys=[completed_by_id])

    @property
    def is_overdue(self):
        if self.status != "PENDING":
            return False
        now = datetime.now(timezone.utc)
        sched = self.scheduled_at
        if sched.tzinfo is None:
            sched = sched.replace(tzinfo=timezone.utc)
        return sched < now

    def to_dict(self):
        now = datetime.now(timezone.utc)
        sched = self.scheduled_at
        if sched.tzinfo is None:
            sched = sched.replace(tzinfo=timezone.utc)
        
        is_today = (sched.date() == now.date())
        is_overdue = (self.status == "PENDING" and sched < now)

        return {
            "id": self.id,
            "customer_id": self.customer_id,
            "customer_name": self.customer.full_name if self.customer else "Unknown",
            "customer_company": self.customer.company_name if self.customer else None,
            "customer_phone": self.customer.phone if self.customer else None,
            "agent_id": self.agent_id,
            "agent_name": self.agent.full_name if self.agent else "Unassigned",
            "created_by_id": self.created_by_id,
            "created_by_name": self.created_by.full_name if self.created_by else (self.agent.full_name if self.agent else "Unassigned"),
            "team_id": self.team_id or (self.customer.assigned_team_id if self.customer else None),
            "team_name": self.team.name if self.team else (self.customer.assigned_team.name if self.customer and self.customer.assigned_team else None),
            "scheduled_at": self.scheduled_at.isoformat(),
            "scheduled_formatted": self.scheduled_at.strftime("%d %b %Y, %H:%M"),
            "reason": self.reason,
            "priority": self.priority,
            "reminder_minutes": self.reminder_minutes,
            "status": self.status,
            "is_today": is_today,
            "is_overdue": is_overdue,
            "notes": self.notes,
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
            "created_at": self.created_at.isoformat() if self.created_at else None
        }
