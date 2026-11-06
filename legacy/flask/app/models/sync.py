import uuid
from datetime import datetime, timezone
from . import db

def generate_uuid():
    return str(uuid.uuid4())

class SyncQueue(db.Model):
    __tablename__ = "sync_queue"
    id = db.Column(db.String(36), primary_key=True, default=generate_uuid)
    local_id = db.Column(db.String(64), nullable=False, index=True)
    server_id = db.Column(db.String(64), nullable=True)
    
    user_id = db.Column(db.String(36), db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    device_id = db.Column(db.String(64), nullable=True)
    
    operation = db.Column(db.String(20), nullable=False) # CREATE, UPDATE, DELETE
    entity_type = db.Column(db.String(50), nullable=False, index=True) # CUSTOMER, CALL, CALLBACK, NOTE, ASSIGNMENT
    entity_id = db.Column(db.String(64), nullable=True, index=True)
    
    payload = db.Column(db.JSON, nullable=False)
    sync_status = db.Column(db.String(30), default="PENDING", index=True) # PENDING, SYNCING, SYNCED, FAILED, CONFLICT
    
    retry_count = db.Column(db.Integer, default=0)
    error_message = db.Column(db.Text, nullable=True)
    
    client_timestamp = db.Column(db.String(50), nullable=True)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    processed_at = db.Column(db.DateTime, nullable=True)

    user = db.relationship("User", foreign_keys=[user_id])

    def to_dict(self):
        return {
            "id": self.id,
            "local_id": self.local_id,
            "server_id": self.server_id,
            "user_id": self.user_id,
            "device_id": self.device_id,
            "operation": self.operation,
            "entity_type": self.entity_type,
            "entity_id": self.entity_id,
            "sync_status": self.sync_status,
            "retry_count": self.retry_count,
            "error_message": self.error_message,
            "client_timestamp": self.client_timestamp,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "processed_at": self.processed_at.isoformat() if self.processed_at else None
        }

class SyncConflict(db.Model):
    __tablename__ = "sync_conflicts"
    id = db.Column(db.String(36), primary_key=True, default=generate_uuid)
    sync_item_id = db.Column(db.String(36), db.ForeignKey("sync_queue.id", ondelete="CASCADE"), nullable=True)
    entity_type = db.Column(db.String(50), nullable=False)
    entity_id = db.Column(db.String(64), nullable=False)
    
    server_data = db.Column(db.JSON, nullable=False)
    client_data = db.Column(db.JSON, nullable=False)
    resolution_strategy = db.Column(db.String(50), default="SERVER_RULES") # SERVER_RULES, MANUAL, MERGED
    
    is_resolved = db.Column(db.Boolean, default=False)
    resolved_by_id = db.Column(db.String(36), db.ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    resolved_at = db.Column(db.DateTime, nullable=True)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    def to_dict(self):
        return {
            "id": self.id,
            "sync_item_id": self.sync_item_id,
            "entity_type": self.entity_type,
            "entity_id": self.entity_id,
            "server_data": self.server_data,
            "client_data": self.client_data,
            "resolution_strategy": self.resolution_strategy,
            "is_resolved": self.is_resolved,
            "created_at": self.created_at.isoformat() if self.created_at else None
        }

class ImportJob(db.Model):
    __tablename__ = "import_jobs"
    id = db.Column(db.String(36), primary_key=True, default=generate_uuid)
    user_id = db.Column(db.String(36), db.ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    filename = db.Column(db.String(255), nullable=False)
    
    total_rows = db.Column(db.Integer, default=0)
    imported_count = db.Column(db.Integer, default=0)
    duplicate_count = db.Column(db.Integer, default=0)
    invalid_count = db.Column(db.Integer, default=0)
    failed_count = db.Column(db.Integer, default=0)
    
    status = db.Column(db.String(30), default="COMPLETED")
    error_summary = db.Column(db.JSON, default=list)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    def to_dict(self):
        return {
            "id": self.id,
            "filename": self.filename,
            "total_rows": self.total_rows,
            "imported_count": self.imported_count,
            "duplicate_count": self.duplicate_count,
            "invalid_count": self.invalid_count,
            "failed_count": self.failed_count,
            "status": self.status,
            "error_summary": self.error_summary or [],
            "created_at": self.created_at.isoformat() if self.created_at else None
        }

class ExportJob(db.Model):
    __tablename__ = "export_jobs"
    id = db.Column(db.String(36), primary_key=True, default=generate_uuid)
    user_id = db.Column(db.String(36), db.ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    entity_type = db.Column(db.String(50), nullable=False)
    filter_params = db.Column(db.JSON, default=dict)
    format = db.Column(db.String(20), default="csv")
    row_count = db.Column(db.Integer, default=0)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    def to_dict(self):
        return {
            "id": self.id,
            "entity_type": self.entity_type,
            "format": self.format,
            "row_count": self.row_count,
            "created_at": self.created_at.isoformat() if self.created_at else None
        }
