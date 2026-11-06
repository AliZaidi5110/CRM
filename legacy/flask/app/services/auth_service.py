import bcrypt
import jwt
from datetime import datetime, timezone, timedelta
from flask import current_app
from ..models import db, User, Device, AuditLog

def hash_password(plain_password: str) -> str:
    salt = bcrypt.gensalt(rounds=12)
    return bcrypt.hashpw(plain_password.encode("utf-8"), salt).decode("utf-8")

def verify_password(plain_password: str, hashed: str) -> bool:
    if not hashed:
        return False
    try:
        return bcrypt.checkpw(plain_password.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False

def create_token(user: User, device_id: str = None, expires_delta: timedelta = None) -> str:
    secret = current_app.config["JWT_SECRET_KEY"]
    if expires_delta is None:
        expires_delta = current_app.config["JWT_ACCESS_TOKEN_EXPIRES"]
    
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user.id,
        "username": user.username,
        "role": user.role.name if user.role else "agent",
        "role_id": user.role_id,
        "team_id": user.primary_team.id if user.primary_team else None,
        "permissions": user.permissions_list,
        "device_id": device_id,
        "iat": now,
        "exp": now + expires_delta
    }
    return jwt.encode(payload, secret, algorithm="HS256")

def decode_token(token: str) -> dict:
    secret = current_app.config["JWT_SECRET_KEY"]
    try:
        return jwt.decode(token, secret, algorithms=["HS256"])
    except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
        return None

def authenticate_user(username_or_email: str, plain_password: str) -> tuple[User | None, str | None]:
    user = User.query.filter(
        db.or_(User.username == username_or_email, User.email == username_or_email),
        User.deleted_at.is_(None)
    ).first()

    if not user:
        return None, "Invalid username or password"

    if not user.is_active:
        return None, "Account has been deactivated by administrator"

    # Check lockout
    now = datetime.now(timezone.utc)
    if user.locked_until:
        locked_until = user.locked_until.replace(tzinfo=timezone.utc) if user.locked_until.tzinfo is None else user.locked_until
        if locked_until > now:
            minutes_left = int((locked_until - now).total_seconds() // 60) + 1
            return None, f"Account locked due to consecutive failed attempts. Try again in {minutes_left} minutes."
        else:
            user.locked_until = None
            user.failed_login_count = 0
            db.session.commit()

    if not verify_password(plain_password, user.password_hash):
        user.failed_login_count += 1
        max_attempts = current_app.config.get("MAX_FAILED_LOGINS", 5)
        if user.failed_login_count >= max_attempts:
            lock_duration = current_app.config.get("LOCKOUT_DURATION_MINUTES", 15)
            user.locked_until = now + timedelta(minutes=lock_duration)
            db.session.commit()
            return None, f"Account locked for {lock_duration} minutes due to {max_attempts} failed login attempts."
        db.session.commit()
        return None, "Invalid username or password"

    # Reset failed attempts
    user.failed_login_count = 0
    user.locked_until = None
    user.last_login_at = now
    db.session.commit()

    return user, None

def log_audit_event(user_id: str, action: str, entity_type: str, entity_id: str, summary: str, details: dict = None, ip: str = None, user_agent: str = None):
    try:
        audit = AuditLog(
            user_id=user_id,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            summary=summary,
            details=details or {},
            ip_address=ip,
            user_agent=user_agent
        )
        db.session.add(audit)
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Failed to log audit event: {e}")
