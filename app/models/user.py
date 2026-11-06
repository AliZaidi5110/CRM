import uuid
from datetime import datetime, timezone
from . import db

def generate_uuid():
    return str(uuid.uuid4())

class RolePermission(db.Model):
    __tablename__ = "role_permissions"
    id = db.Column(db.String(36), primary_key=True, default=generate_uuid)
    role_id = db.Column(db.String(36), db.ForeignKey("roles.id", ondelete="CASCADE"), nullable=False)
    permission_id = db.Column(db.String(36), db.ForeignKey("permissions.id", ondelete="CASCADE"), nullable=False)

class Role(db.Model):
    __tablename__ = "roles"
    id = db.Column(db.String(36), primary_key=True, default=generate_uuid)
    name = db.Column(db.String(50), unique=True, nullable=False)  # super_admin, team_leader, agent
    display_name = db.Column(db.String(100), nullable=False)
    description = db.Column(db.String(255))
    is_system = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    permissions = db.relationship("Permission", secondary="role_permissions", backref="roles")
    users = db.relationship("User", backref="role", lazy="dynamic")

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "display_name": self.display_name,
            "description": self.description,
            "is_system": self.is_system,
            "permissions": [p.code for p in self.permissions]
        }

class Permission(db.Model):
    __tablename__ = "permissions"
    id = db.Column(db.String(36), primary_key=True, default=generate_uuid)
    code = db.Column(db.String(100), unique=True, nullable=False)  # e.g. leads.assign
    name = db.Column(db.String(100), nullable=False)
    category = db.Column(db.String(50), nullable=False)            # e.g. customers, leads, reports, users

    def to_dict(self):
        return {
            "id": self.id,
            "code": self.code,
            "name": self.name,
            "category": self.category
        }

class User(db.Model):
    __tablename__ = "users"
    id = db.Column(db.String(36), primary_key=True, default=generate_uuid)
    username = db.Column(db.String(80), unique=True, nullable=False, index=True)
    email = db.Column(db.String(120), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(255), nullable=False)
    full_name = db.Column(db.String(120), nullable=False)
    phone = db.Column(db.String(50))
    role_id = db.Column(db.String(36), db.ForeignKey("roles.id"), nullable=False)
    
    # Soft deletion & status
    is_active = db.Column(db.Boolean, default=True, index=True)
    deleted_at = db.Column(db.DateTime, nullable=True)
    
    # Security tracking
    failed_login_count = db.Column(db.Integer, default=0)
    locked_until = db.Column(db.DateTime, nullable=True)
    last_login_at = db.Column(db.DateTime, nullable=True)
    two_factor_secret = db.Column(db.String(64), nullable=True)
    two_factor_enabled = db.Column(db.Boolean, default=False)
    
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    devices = db.relationship("Device", backref="user", lazy="dynamic", cascade="all, delete-orphan")
    team_memberships = db.relationship("TeamMember", backref="user", lazy="dynamic", cascade="all, delete-orphan")

    @property
    def primary_team(self):
        membership = self.team_memberships.filter_by(is_primary=True).first()
        if membership and membership.team and not membership.team.deleted_at:
            return membership.team
        membership = self.team_memberships.first()
        return membership.team if (membership and not membership.team.deleted_at) else None

    @property
    def permissions_list(self):
        if not self.role:
            return []
        return [p.code for p in self.role.permissions]

    def has_permission(self, permission_code):
        if self.role and self.role.name == "super_admin":
            return True
        return permission_code in self.permissions_list

    def to_dict(self, include_permissions=False):
        primary = self.primary_team
        data = {
            "id": self.id,
            "username": self.username,
            "email": self.email,
            "full_name": self.full_name,
            "phone": self.phone,
            "role": self.role.name if self.role else None,
            "role_display": self.role.display_name if self.role else None,
            "role_id": self.role_id,
            "team_id": primary.id if primary else None,
            "team_name": primary.name if primary else None,
            "is_active": self.is_active,
            "last_login_at": self.last_login_at.isoformat() if self.last_login_at else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
            "deleted_at": self.deleted_at.isoformat() if self.deleted_at else None,
        }
        if include_permissions:
            data["permissions"] = self.permissions_list
        return data

class Device(db.Model):
    __tablename__ = "devices"
    id = db.Column(db.String(36), primary_key=True, default=generate_uuid)
    user_id = db.Column(db.String(36), db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    device_name = db.Column(db.String(120), nullable=False)
    device_token = db.Column(db.String(255), unique=True, nullable=False)
    ip_address = db.Column(db.String(60))
    user_agent = db.Column(db.String(255))
    last_active_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    last_sync_at = db.Column(db.DateTime, nullable=True)
    is_revoked = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    def to_dict(self):
        return {
            "id": self.id,
            "user_id": self.user_id,
            "device_name": self.device_name,
            "last_active_at": self.last_active_at.isoformat() if self.last_active_at else None,
            "last_sync_at": self.last_sync_at.isoformat() if self.last_sync_at else None,
            "is_revoked": self.is_revoked,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
