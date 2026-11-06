import uuid
from datetime import date, datetime, timezone
from . import db


def generate_uuid():
    return str(uuid.uuid4())


class Contract(db.Model):
    __tablename__ = "contracts"

    id = db.Column(db.String(36), primary_key=True, default=generate_uuid)
    customer_id = db.Column(db.String(36), db.ForeignKey("customers.id", ondelete="SET NULL"), nullable=True, index=True)
    business_name = db.Column(db.String(180), nullable=False)
    customer_name = db.Column(db.String(180), nullable=False)
    contract_status = db.Column(db.String(30), nullable=False, default="PENDING", index=True)
    commission_status = db.Column(db.String(20), nullable=False, default="PENDING", index=True)
    commission_amount = db.Column(db.Numeric(12, 2), nullable=False, default=0)
    original_filename = db.Column(db.String(255), nullable=True)
    stored_filename = db.Column(db.String(255), nullable=True)
    notes = db.Column(db.Text, nullable=True)
    created_by_id = db.Column(db.String(36), db.ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = db.Column(db.DateTime, nullable=False, default=lambda: datetime.now(timezone.utc), index=True)
    updated_at = db.Column(db.DateTime, nullable=False, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    customer = db.relationship("Customer", backref="contracts")
    created_by = db.relationship("User", foreign_keys=[created_by_id])

    def to_dict(self):
        return {
            "id": self.id,
            "customer_id": self.customer_id,
            "business_name": self.business_name,
            "customer_name": self.customer_name,
            "contract_status": self.contract_status,
            "commission_status": self.commission_status,
            "commission_amount": float(self.commission_amount or 0),
            "original_filename": self.original_filename,
            "has_file": bool(self.stored_filename),
            "notes": self.notes or "",
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


class Expense(db.Model):
    __tablename__ = "expenses"

    id = db.Column(db.String(36), primary_key=True, default=generate_uuid)
    category = db.Column(db.String(30), nullable=False, index=True)
    description = db.Column(db.String(255), nullable=False)
    amount = db.Column(db.Numeric(12, 2), nullable=False)
    incurred_on = db.Column(db.Date, nullable=False, default=date.today, index=True)
    created_by_id = db.Column(db.String(36), db.ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = db.Column(db.DateTime, nullable=False, default=lambda: datetime.now(timezone.utc), index=True)

    created_by = db.relationship("User", foreign_keys=[created_by_id])

    def to_dict(self):
        return {
            "id": self.id,
            "category": self.category,
            "description": self.description,
            "amount": float(self.amount or 0),
            "incurred_on": self.incurred_on.isoformat() if self.incurred_on else None,
            "created_by_name": self.created_by.full_name if self.created_by else "Administrator",
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class EmployeeSalary(db.Model):
    __tablename__ = "employee_salaries"
    __table_args__ = (db.UniqueConstraint("employee_id", "period", name="uq_employee_salary_period"),)

    id = db.Column(db.String(36), primary_key=True, default=generate_uuid)
    employee_id = db.Column(db.String(36), db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    period = db.Column(db.String(7), nullable=False, index=True)
    amount = db.Column(db.Numeric(12, 2), nullable=False, default=0)
    status = db.Column(db.String(20), nullable=False, default="PENDING", index=True)
    notes = db.Column(db.String(500))
    created_by_id = db.Column(db.String(36), db.ForeignKey("users.id", ondelete="SET NULL"))
    created_at = db.Column(db.DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))
    updated_at = db.Column(db.DateTime, nullable=False, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    employee = db.relationship("User", foreign_keys=[employee_id])

    def to_dict(self):
        return {"id": self.id, "employee_id": self.employee_id, "employee_name": self.employee.full_name if self.employee else "Former employee", "period": self.period, "amount": float(self.amount or 0), "status": self.status, "notes": self.notes or ""}


class EmployeeSale(db.Model):
    __tablename__ = "employee_sales"

    id = db.Column(db.String(36), primary_key=True, default=generate_uuid)
    employee_id = db.Column(db.String(36), db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    customer_name = db.Column(db.String(180), nullable=False)
    business_name = db.Column(db.String(180), nullable=False)
    sale_amount = db.Column(db.Numeric(12, 2), nullable=False, default=0)
    commission_amount = db.Column(db.Numeric(12, 2), nullable=False, default=0)
    commission_status = db.Column(db.String(20), nullable=False, default="PENDING", index=True)
    sale_date = db.Column(db.Date, nullable=False, default=date.today, index=True)
    notes = db.Column(db.String(500))
    created_by_id = db.Column(db.String(36), db.ForeignKey("users.id", ondelete="SET NULL"))
    created_at = db.Column(db.DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))
    employee = db.relationship("User", foreign_keys=[employee_id])

    def to_dict(self):
        return {"id": self.id, "employee_id": self.employee_id, "employee_name": self.employee.full_name if self.employee else "Former employee", "customer_name": self.customer_name, "business_name": self.business_name, "sale_amount": float(self.sale_amount or 0), "commission_amount": float(self.commission_amount or 0), "commission_status": self.commission_status, "sale_date": self.sale_date.isoformat() if self.sale_date else None, "notes": self.notes or ""}


class EmployeeMonthlySalesStat(db.Model):
    __tablename__ = "employee_monthly_sales_stats"
    __table_args__ = (db.UniqueConstraint("employee_id", "period", name="uq_employee_sales_stat_period"),)

    id = db.Column(db.String(36), primary_key=True, default=generate_uuid)
    employee_id = db.Column(db.String(36), db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    period = db.Column(db.String(7), nullable=False, index=True)
    sales_count = db.Column(db.Integer, nullable=False, default=0)
    sales_amount_gbp = db.Column(db.Numeric(12, 2), nullable=False, default=0)
    commission_amount_gbp = db.Column(db.Numeric(12, 2), nullable=False, default=0)
    imported_by_id = db.Column(db.String(36), db.ForeignKey("users.id", ondelete="SET NULL"))
    imported_at = db.Column(db.DateTime, nullable=False, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    employee = db.relationship("User", foreign_keys=[employee_id])

    def to_dict(self):
        return {"id": self.id, "employee_id": self.employee_id, "employee_name": self.employee.full_name if self.employee else "Former employee", "period": self.period, "sales_count": self.sales_count, "sales_amount_gbp": float(self.sales_amount_gbp or 0), "commission_amount_gbp": float(self.commission_amount_gbp or 0), "imported_at": self.imported_at.isoformat() if self.imported_at else None}


class EmployeeCommissionPayout(db.Model):
    __tablename__ = "employee_commission_payouts"
    __table_args__ = (db.UniqueConstraint("employee_id", "period", name="uq_employee_commission_payout_period"),)

    id = db.Column(db.String(36), primary_key=True, default=generate_uuid)
    employee_id = db.Column(db.String(36), db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    period = db.Column(db.String(7), nullable=False, index=True)
    amount_pkr = db.Column(db.Numeric(12, 2), nullable=False, default=0)
    status = db.Column(db.String(20), nullable=False, default="PENDING", index=True)
    notes = db.Column(db.String(500))
    created_by_id = db.Column(db.String(36), db.ForeignKey("users.id", ondelete="SET NULL"))
    created_at = db.Column(db.DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))
    updated_at = db.Column(db.DateTime, nullable=False, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    employee = db.relationship("User", foreign_keys=[employee_id])

    def to_dict(self):
        return {"id": self.id, "employee_id": self.employee_id, "employee_name": self.employee.full_name if self.employee else "Former employee", "period": self.period, "amount_pkr": float(self.amount_pkr or 0), "status": self.status, "notes": self.notes or ""}
