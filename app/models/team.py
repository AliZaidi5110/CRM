import uuid
from datetime import datetime, timezone
from . import db

def generate_uuid():
    return str(uuid.uuid4())

class Team(db.Model):
    __tablename__ = "teams"
    id = db.Column(db.String(36), primary_key=True, default=generate_uuid)
    name = db.Column(db.String(100), unique=True, nullable=False, index=True)
    description = db.Column(db.String(255))
    team_leader_id = db.Column(db.String(36), db.ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    is_active = db.Column(db.Boolean, default=True, index=True)
    deleted_at = db.Column(db.DateTime, nullable=True)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    team_leader = db.relationship("User", foreign_keys=[team_leader_id], backref="led_teams")
    members = db.relationship("TeamMember", backref="team", lazy="dynamic", cascade="all, delete-orphan")

    def to_dict(self, include_members=False):
        data = {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "team_leader_id": self.team_leader_id,
            "team_leader_name": self.team_leader.full_name if self.team_leader else None,
            "is_active": self.is_active,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
            "deleted_at": self.deleted_at.isoformat() if self.deleted_at else None,
            "member_count": self.members.count()
        }
        if include_members:
            data["members"] = [
                {
                    "user_id": m.user_id,
                    "user_name": m.user.full_name if m.user else "Unknown",
                    "username": m.user.username if m.user else "",
                    "role": m.user.role.name if m.user and m.user.role else "",
                    "is_primary": m.is_primary,
                    "joined_at": m.joined_at.isoformat() if m.joined_at else None
                }
                for m in self.members.all() if m.user and not m.user.deleted_at
            ]
        return data

class TeamMember(db.Model):
    __tablename__ = "team_members"
    id = db.Column(db.String(36), primary_key=True, default=generate_uuid)
    team_id = db.Column(db.String(36), db.ForeignKey("teams.id", ondelete="CASCADE"), nullable=False)
    user_id = db.Column(db.String(36), db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    is_primary = db.Column(db.Boolean, default=True)
    joined_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        db.UniqueConstraint("team_id", "user_id", name="unique_team_user_membership"),
    )
