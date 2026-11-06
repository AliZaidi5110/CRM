import uuid
from datetime import datetime, timezone
from . import db

def generate_uuid():
    return str(uuid.uuid4())

def generate_customer_code():
    import random
    return f"CUST-{random.randint(100000, 999999)}"

class LeadStatus(db.Model):
    __tablename__ = "lead_statuses"
    id = db.Column(db.String(36), primary_key=True, default=generate_uuid)
    code = db.Column(db.String(50), unique=True, nullable=False) # NEW, CONTACTED, INTERESTED, FOLLOW_UP, QUALIFIED, CONVERTED, LOST, etc.
    name = db.Column(db.String(100), nullable=False)
    color = db.Column(db.String(30), default="#6366F1")
    sort_order = db.Column(db.Integer, default=0)
    is_terminal = db.Column(db.Boolean, default=False)
    is_converted = db.Column(db.Boolean, default=False)
    is_system = db.Column(db.Boolean, default=True)

    def to_dict(self):
        return {
            "id": self.id,
            "code": self.code,
            "name": self.name,
            "color": self.color,
            "sort_order": self.sort_order,
            "is_terminal": self.is_terminal,
            "is_converted": self.is_converted
        }

class Tag(db.Model):
    __tablename__ = "tags"
    id = db.Column(db.String(36), primary_key=True, default=generate_uuid)
    name = db.Column(db.String(50), unique=True, nullable=False)
    color = db.Column(db.String(30), default="#3B82F6")

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "color": self.color
        }

class CustomerTag(db.Model):
    __tablename__ = "customer_tags"
    id = db.Column(db.String(36), primary_key=True, default=generate_uuid)
    customer_id = db.Column(db.String(36), db.ForeignKey("customers.id", ondelete="CASCADE"), nullable=False)
    tag_id = db.Column(db.String(36), db.ForeignKey("tags.id", ondelete="CASCADE"), nullable=False)

class Customer(db.Model):
    __tablename__ = "customers"
    id = db.Column(db.String(36), primary_key=True, default=generate_uuid)
    code = db.Column(db.String(50), unique=True, nullable=False, default=generate_customer_code, index=True)
    
    first_name = db.Column(db.String(80), nullable=True)
    last_name = db.Column(db.String(80), nullable=True)
    full_name = db.Column(db.String(160), nullable=False, index=True)
    company_name = db.Column(db.String(160), nullable=True, index=True)
    
    phone = db.Column(db.String(50), nullable=False, index=True)
    secondary_phone = db.Column(db.String(50), nullable=True)
    email = db.Column(db.String(120), nullable=True, index=True)
    
    address = db.Column(db.String(255), nullable=True)
    city = db.Column(db.String(100), nullable=True)
    postcode = db.Column(db.String(30), nullable=True, index=True)
    country = db.Column(db.String(100), default="United Kingdom")
    
    industry = db.Column(db.String(100), nullable=True)
    customer_type = db.Column(db.String(50), default="Lead")  # Lead, Prospect, Customer
    lead_source = db.Column(db.String(100), default="Cold Call")
    previous_provider = db.Column(db.String(100), nullable=True)  # e.g. Worldpay, Barclays
    
    # Ownership & Assignment
    assigned_team_id = db.Column(db.String(36), db.ForeignKey("teams.id", ondelete="SET NULL"), nullable=True, index=True)
    assigned_agent_id = db.Column(db.String(36), db.ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    created_by_id = db.Column(db.String(36), db.ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    updated_by_id = db.Column(db.String(36), db.ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    last_contacted_by_id = db.Column(db.String(36), db.ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    # Status & Pipeline
    lead_status = db.Column(db.String(50), default="NEW", index=True)
    priority = db.Column(db.String(20), default="MEDIUM", index=True) # LOW, MEDIUM, HIGH, URGENT
    
    # Dates
    last_contact_date = db.Column(db.DateTime, nullable=True)
    next_callback_date = db.Column(db.DateTime, nullable=True)
    
    # Custom fields, tags, and initial note
    tags_list = db.Column(db.JSON, default=list)
    custom_fields = db.Column(db.JSON, default=dict)
    notes = db.Column(db.Text, nullable=True)
    
    # Soft deletion & Timestamps
    is_active = db.Column(db.Boolean, default=True)
    deleted_at = db.Column(db.DateTime, nullable=True)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc), index=True)
    updated_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    # Relationships
    assigned_team = db.relationship("Team", foreign_keys=[assigned_team_id], backref="assigned_customers")
    assigned_agent = db.relationship("User", foreign_keys=[assigned_agent_id], backref="assigned_customers")
    created_by = db.relationship("User", foreign_keys=[created_by_id])
    updated_by = db.relationship("User", foreign_keys=[updated_by_id])
    last_contacted_by = db.relationship("User", foreign_keys=[last_contacted_by_id])

    calls = db.relationship("Call", backref="customer", lazy="dynamic", cascade="all, delete-orphan", order_by="desc(Call.created_at)")
    callbacks = db.relationship("Callback", backref="customer", lazy="dynamic", cascade="all, delete-orphan", order_by="asc(Callback.scheduled_at)")
    conversations = db.relationship("Conversation", backref="customer", lazy="dynamic", cascade="all, delete-orphan", order_by="desc(Conversation.created_at)")
    assignments = db.relationship("LeadAssignment", backref="customer", lazy="dynamic", cascade="all, delete-orphan", order_by="desc(LeadAssignment.created_at)")

    def to_dict(self, summary=False):
        data = {
            "id": self.id,
            "code": self.code,
            "first_name": self.first_name,
            "last_name": self.last_name,
            "full_name": self.full_name,
            "company_name": self.company_name,
            "phone": self.phone,
            "secondary_phone": self.secondary_phone,
            "email": self.email,
            "address": self.address,
            "city": self.city,
            "postcode": self.postcode,
            "country": self.country,
            "industry": self.industry,
            "customer_type": self.customer_type,
            "lead_source": self.lead_source,
            "previous_provider": self.previous_provider,
            "assigned_team_id": self.assigned_team_id,
            "assigned_team_name": self.assigned_team.name if self.assigned_team else None,
            "assigned_agent_id": self.assigned_agent_id,
            "assigned_agent_name": self.assigned_agent.full_name if self.assigned_agent else None,
            "team_leader_id": self.assigned_team.team_leader_id if (self.assigned_team and self.assigned_team.team_leader_id) else None,
            "team_leader_name": self.assigned_team.team_leader.full_name if (self.assigned_team and self.assigned_team.team_leader) else None,
            "lead_status": self.lead_status,
            "priority": self.priority,
            "tags": self.tags_list or [],
            "custom_fields": self.custom_fields or {},
            "closing_details": (self.custom_fields or {}).get("closing_details"),
            "last_contact_date": self.last_contact_date.isoformat() if self.last_contact_date else None,
            "next_callback_date": self.next_callback_date.isoformat() if self.next_callback_date else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
            "created_by_name": self.created_by.full_name if self.created_by else None,
        }
        if not summary:
            data["notes"] = self.notes
        return data
