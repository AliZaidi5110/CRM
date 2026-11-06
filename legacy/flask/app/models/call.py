import uuid
from datetime import datetime, timezone
from . import db

def generate_uuid():
    return str(uuid.uuid4())

def generate_call_code():
    import random
    return f"CALL-{random.randint(100000, 999999)}"

class CallDisposition(db.Model):
    __tablename__ = "call_dispositions"
    id = db.Column(db.String(36), primary_key=True, default=generate_uuid)
    code = db.Column(db.String(50), unique=True, nullable=False)
    name = db.Column(db.String(100), nullable=False)
    category = db.Column(db.String(50), default="General") # Positive, Neutral, Negative
    color = db.Column(db.String(30), default="#64748B")
    is_conversion = db.Column(db.Boolean, default=False)
    is_callback = db.Column(db.Boolean, default=False)
    is_system = db.Column(db.Boolean, default=True)
    sort_order = db.Column(db.Integer, default=0)

    def to_dict(self):
        return {
            "id": self.id,
            "code": self.code,
            "name": self.name,
            "category": self.category,
            "color": self.color,
            "is_conversion": self.is_conversion,
            "is_callback": self.is_callback
        }

class Call(db.Model):
    __tablename__ = "calls"
    id = db.Column(db.String(36), primary_key=True, default=generate_uuid)
    call_code = db.Column(db.String(50), unique=True, nullable=False, default=generate_call_code, index=True)
    
    customer_id = db.Column(db.String(36), db.ForeignKey("customers.id", ondelete="CASCADE"), nullable=False, index=True)
    agent_id = db.Column(db.String(36), db.ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    team_id = db.Column(db.String(36), db.ForeignKey("teams.id", ondelete="SET NULL"), nullable=True, index=True)
    
    call_type = db.Column(db.String(30), default="Outbound")  # Outbound, Inbound
    duration_seconds = db.Column(db.Integer, default=0)
    outcome = db.Column(db.String(80), nullable=False)        # Disposition e.g. Interested, Callback Requested
    
    notes = db.Column(db.Text, nullable=True)
    next_action = db.Column(db.String(255), nullable=True)
    
    callback_date = db.Column(db.String(30), nullable=True)
    callback_time = db.Column(db.String(30), nullable=True)
    
    telephony_session_id = db.Column(db.String(100), nullable=True)
    recording_url = db.Column(db.String(255), nullable=True)
    
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc), index=True)

    agent = db.relationship("User", foreign_keys=[agent_id])
    team = db.relationship("Team", foreign_keys=[team_id])

    def to_dict(self):
        mins = self.duration_seconds // 60
        secs = self.duration_seconds % 60
        duration_formatted = f"{mins:02d}:{secs:02d}"

        return {
            "id": self.id,
            "call_code": self.call_code,
            "customer_id": self.customer_id,
            "customer_name": self.customer.full_name if self.customer else "Unknown",
            "customer_company": self.customer.company_name if self.customer else None,
            "agent_id": self.agent_id,
            "agent_name": self.agent.full_name if self.agent else "Unknown",
            "team_id": self.team_id,
            "team_name": self.team.name if self.team else None,
            "call_type": self.call_type,
            "duration_seconds": self.duration_seconds,
            "duration_formatted": duration_formatted,
            "outcome": self.outcome,
            "notes": self.notes,
            "next_action": self.next_action,
            "callback_date": self.callback_date,
            "callback_time": self.callback_time,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "recording_url": self.recording_url
        }
