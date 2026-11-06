import uuid
from datetime import datetime, timezone
from . import db

def generate_uuid():
    return str(uuid.uuid4())

class Conversation(db.Model):
    __tablename__ = "conversations"
    id = db.Column(db.String(36), primary_key=True, default=generate_uuid)
    customer_id = db.Column(db.String(36), db.ForeignKey("customers.id", ondelete="CASCADE"), nullable=False, index=True)
    agent_id = db.Column(db.String(36), db.ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    call_id = db.Column(db.String(36), db.ForeignKey("calls.id", ondelete="SET NULL"), nullable=True)
    
    interaction_type = db.Column(db.String(50), default="CALL") # CALL, NOTE, STATUS_CHANGE, TRANSFER, CALLBACK_SCHEDULED
    outcome = db.Column(db.String(80), nullable=True)
    summary = db.Column(db.Text, nullable=False)
    next_action = db.Column(db.String(255), nullable=True)
    callback_info = db.Column(db.String(255), nullable=True)
    notes = db.Column(db.Text, nullable=True)
    
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc), index=True)

    agent = db.relationship("User", foreign_keys=[agent_id])
    call = db.relationship("Call", foreign_keys=[call_id])

    def to_dict(self):
        return {
            "id": self.id,
            "customer_id": self.customer_id,
            "agent_id": self.agent_id,
            "agent_name": self.agent.full_name if self.agent else "System",
            "call_id": self.call_id,
            "interaction_type": self.interaction_type,
            "outcome": self.outcome,
            "summary": self.summary,
            "notes": self.notes,
            "next_action": self.next_action,
            "callback_info": self.callback_info,
            "created_at": self.created_at.isoformat() if self.created_at else None
        }
