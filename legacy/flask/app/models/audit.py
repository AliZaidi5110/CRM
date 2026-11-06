import uuid
from datetime import datetime, timezone
from . import db

def generate_uuid():
    return str(uuid.uuid4())

class AuditLog(db.Model):
    __tablename__ = "audit_logs"
    id = db.Column(db.String(36), primary_key=True, default=generate_uuid)
    user_id = db.Column(db.String(36), db.ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    
    action = db.Column(db.String(80), nullable=False, index=True) # e.g. "LEAD_CREATED", "LEAD_TRANSFERRED", "STATUS_CHANGED", "LOGIN"
    entity_type = db.Column(db.String(50), nullable=True, index=True) # e.g. "CUSTOMER", "CALL", "TEAM", "USER"
    entity_id = db.Column(db.String(50), nullable=True, index=True)
    
    summary = db.Column(db.String(255), nullable=False)
    details = db.Column(db.JSON, default=dict) # diff, extra params
    
    ip_address = db.Column(db.String(60), nullable=True)
    user_agent = db.Column(db.String(255), nullable=True)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc), index=True)

    user = db.relationship("User", foreign_keys=[user_id])

    def to_dict(self):
        return {
            "id": self.id,
            "user_id": self.user_id,
            "user_name": self.user.full_name if self.user else "System",
            "username": self.user.username if self.user else None,
            "action": self.action,
            "entity_type": self.entity_type,
            "entity_id": self.entity_id,
            "summary": self.summary,
            "details": self.details or {},
            "ip_address": self.ip_address,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "created_formatted": self.created_at.strftime("%d %b %Y, %H:%M:%S")
        }
