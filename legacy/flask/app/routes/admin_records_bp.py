import csv
import io
import os
import uuid
from datetime import date
from decimal import Decimal, InvalidOperation
from flask import Blueprint, current_app, jsonify, request, send_from_directory
from sqlalchemy import or_
from werkzeug.utils import secure_filename
from ..models import db, Contract, Expense, EmployeeSalary, EmployeeSale, EmployeeMonthlySalesStat, EmployeeCommissionPayout, User, Customer, Callback
from ..services.auth_service import log_audit_event
from ..services.rbac_service import get_current_user, require_auth

admin_records_bp = Blueprint("admin_records_bp", __name__)

CONTRACT_STATUSES = {"PENDING", "UNDER_REVIEW", "APPROVED"}
COMMISSION_STATUSES = {"PENDING", "PAID"}
EXPENSE_CATEGORIES = {"SALARY", "FOOD", "DIALER", "RENT", "OTHER"}
ALLOWED_CONTRACT_EXTENSIONS = {"pdf", "doc", "docx", "xls", "xlsx", "csv", "jpg", "jpeg", "png"}


def admin_user():
    user = get_current_user()
    if not user or not user.role or user.role.name != "super_admin":
        return None, (jsonify({"error": "Forbidden", "message": "Administrator access is required"}), 403)
    return user, None


def parse_amount(value, field_name):
    try:
        amount = Decimal(str(value or "0")).quantize(Decimal("0.01"))
    except (InvalidOperation, ValueError):
        raise ValueError(f"{field_name} must be a valid amount")
    if not amount.is_finite() or amount < 0:
        raise ValueError(f"{field_name} cannot be negative")
    return amount


def allowed_contract_file(file):
    filename = secure_filename(file.filename or "")
    if not filename or "." not in filename:
        return None
    extension = filename.rsplit(".", 1)[1].lower()
    return filename if extension in ALLOWED_CONTRACT_EXTENSIONS else None


@admin_records_bp.route("/contracts", methods=["GET"])
@require_auth
def list_contracts():
    user, error = admin_user()
    if error:
        return error
    contracts = Contract.query.order_by(Contract.created_at.desc()).limit(1000).all()
    return jsonify({"contracts": [contract.to_dict() for contract in contracts]}), 200


@admin_records_bp.route("/contracts", methods=["POST"])
@require_auth
def create_contract():
    user, error = admin_user()
    if error:
        return error

    business_name = (request.form.get("business_name") or "").strip()
    customer_name = (request.form.get("customer_name") or "").strip()
    if not business_name or not customer_name:
        return jsonify({"error": "Bad Request", "message": "Business name and customer name are required"}), 400

    contract_status = (request.form.get("contract_status") or "PENDING").upper()
    commission_status = (request.form.get("commission_status") or "PENDING").upper()
    if contract_status not in CONTRACT_STATUSES or commission_status not in COMMISSION_STATUSES:
        return jsonify({"error": "Bad Request", "message": "Select a valid contract and commission status"}), 400

    try:
        amount = parse_amount(request.form.get("commission_amount"), "Commission")
    except ValueError as exc:
        return jsonify({"error": "Bad Request", "message": str(exc)}), 400

    upload = request.files.get("contract_file")
    original_filename = None
    stored_filename = None
    if upload and upload.filename:
        safe_name = allowed_contract_file(upload)
        if not safe_name:
            return jsonify({"error": "Bad Request", "message": "Upload a PDF, Word, Excel, CSV, or image file"}), 400
        original_filename = safe_name[:255]
        stored_filename = f"{uuid.uuid4().hex}.{safe_name.rsplit('.', 1)[1].lower()}"
        contract_dir = os.path.join(current_app.config["UPLOAD_FOLDER"], "contracts")
        os.makedirs(contract_dir, exist_ok=True)
        upload.save(os.path.join(contract_dir, stored_filename))

    contract = Contract(
        business_name=business_name[:180],
        customer_name=customer_name[:180],
        contract_status=contract_status,
        commission_status=commission_status,
        commission_amount=amount,
        original_filename=original_filename,
        stored_filename=stored_filename,
        notes=(request.form.get("notes") or "").strip() or None,
        created_by_id=user.id,
    )
    db.session.add(contract)
    db.session.commit()
    log_audit_event(
        user_id=user.id,
        action="CONTRACT_CREATED",
        entity_type="CONTRACT",
        entity_id=contract.id,
        summary=f"Added contract for {contract.business_name}",
        ip=request.remote_addr,
    )
    return jsonify({"message": "Contract added", "contract": contract.to_dict()}), 201


@admin_records_bp.route("/contracts/import", methods=["POST"])
@require_auth
def import_contract_list():
    user, error = admin_user()
    if error:
        return error
    upload = request.files.get("file")
    if not upload or not upload.filename or not upload.filename.lower().endswith(".csv"):
        return jsonify({"error": "Bad Request", "message": "Choose a CSV contract list"}), 400
    try:
        contents = upload.read().decode("utf-8-sig")
        reader = csv.DictReader(io.StringIO(contents))
    except (UnicodeDecodeError, csv.Error):
        return jsonify({"error": "Bad Request", "message": "The contract list must be a UTF-8 CSV file"}), 400
    required = {"business_name", "customer_name", "contract_status", "commission_status", "commission_amount"}
    if not reader.fieldnames or not required.issubset({name.strip().lower() for name in reader.fieldnames}):
        return jsonify({"error": "Bad Request", "message": "CSV headers must include business_name, customer_name, contract_status, commission_status, and commission_amount"}), 400

    headers = {name.strip().lower(): name for name in reader.fieldnames}
    contracts = []
    for row_number, row in enumerate(reader, start=2):
        if row_number > 5001:
            return jsonify({"error": "Bad Request", "message": "A single import can contain at most 5,000 contracts"}), 400
        business_name = (row.get(headers["business_name"]) or "").strip()
        customer_name = (row.get(headers["customer_name"]) or "").strip()
        contract_status = (row.get(headers["contract_status"]) or "PENDING").strip().upper().replace(" ", "_")
        commission_status = (row.get(headers["commission_status"]) or "PENDING").strip().upper()
        try:
            amount = parse_amount(row.get(headers["commission_amount"]), f"Commission on CSV row {row_number}")
        except ValueError as exc:
            return jsonify({"error": "Bad Request", "message": str(exc)}), 400
        if not business_name or not customer_name:
            return jsonify({"error": "Bad Request", "message": f"Business and customer names are required on CSV row {row_number}"}), 400
        if contract_status not in CONTRACT_STATUSES or commission_status not in COMMISSION_STATUSES:
            return jsonify({"error": "Bad Request", "message": f"Invalid status on CSV row {row_number}"}), 400
        contracts.append(Contract(
            business_name=business_name[:180],
            customer_name=customer_name[:180],
            contract_status=contract_status,
            commission_status=commission_status,
            commission_amount=amount,
            notes=(row.get(headers.get("notes", "")) or "").strip() or None,
            created_by_id=user.id,
        ))

    if not contracts:
        return jsonify({"error": "Bad Request", "message": "The CSV contains no contract rows"}), 400
    db.session.add_all(contracts)
    db.session.commit()
    log_audit_event(
        user_id=user.id,
        action="CONTRACT_LIST_IMPORTED",
        entity_type="CONTRACT",
        entity_id=contracts[0].id,
        summary=f"Imported {len(contracts)} contract records",
        details={"count": len(contracts)},
        ip=request.remote_addr,
    )
    return jsonify({"message": f"Imported {len(contracts)} contracts", "count": len(contracts)}), 201


@admin_records_bp.route("/contracts/<contract_id>", methods=["PATCH"])
@require_auth
def update_contract(contract_id):
    user, error = admin_user()
    if error:
        return error
    contract = Contract.query.get_or_404(contract_id)
    data = request.get_json() or {}

    if "contract_status" in data:
        value = str(data["contract_status"]).upper()
        if value not in CONTRACT_STATUSES:
            return jsonify({"error": "Bad Request", "message": "Invalid contract status"}), 400
        contract.contract_status = value
    if "commission_status" in data:
        value = str(data["commission_status"]).upper()
        if value not in COMMISSION_STATUSES:
            return jsonify({"error": "Bad Request", "message": "Invalid commission status"}), 400
        contract.commission_status = value
    if "commission_amount" in data:
        try:
            contract.commission_amount = parse_amount(data["commission_amount"], "Commission")
        except ValueError as exc:
            return jsonify({"error": "Bad Request", "message": str(exc)}), 400
    if "notes" in data:
        contract.notes = (data["notes"] or "").strip() or None

    db.session.commit()
    return jsonify({"message": "Contract updated", "contract": contract.to_dict()}), 200


@admin_records_bp.route("/contracts/<contract_id>/file", methods=["GET"])
@require_auth
def download_contract_file(contract_id):
    user, error = admin_user()
    if error:
        return error
    contract = Contract.query.get_or_404(contract_id)
    if not contract.stored_filename:
        return jsonify({"error": "Not found", "message": "No contract file was uploaded"}), 404
    contract_dir = os.path.join(current_app.config["UPLOAD_FOLDER"], "contracts")
    return send_from_directory(
        contract_dir,
        contract.stored_filename,
        as_attachment=True,
        download_name=contract.original_filename or "contract",
    )


@admin_records_bp.route("/finance", methods=["GET"])
@require_auth
def finance_summary():
    user, error = admin_user()
    if error:
        return error

    paid = db.session.query(db.func.coalesce(db.func.sum(Contract.commission_amount), 0)).filter(
        Contract.commission_status == "PAID"
    ).scalar()
    pending = db.session.query(db.func.coalesce(db.func.sum(Contract.commission_amount), 0)).filter(
        Contract.commission_status == "PENDING"
    ).scalar()
    expenses_total = db.session.query(db.func.coalesce(db.func.sum(Expense.amount), 0)).scalar()
    expenses = Expense.query.order_by(Expense.incurred_on.desc(), Expense.created_at.desc()).limit(500).all()

    paid_amount = Decimal(str(paid or 0))
    pending_amount = Decimal(str(pending or 0))
    expense_amount = Decimal(str(expenses_total or 0))
    payroll_paid = Decimal(str(db.session.query(db.func.coalesce(db.func.sum(EmployeeSalary.amount), 0)).filter(EmployeeSalary.status == "PAID").scalar() or 0))
    payroll_pending = Decimal(str(db.session.query(db.func.coalesce(db.func.sum(EmployeeSalary.amount), 0)).filter(EmployeeSalary.status == "PENDING").scalar() or 0))
    sales_comm_paid = Decimal(str(db.session.query(db.func.coalesce(db.func.sum(EmployeeCommissionPayout.amount_pkr), 0)).filter(EmployeeCommissionPayout.status == "PAID").scalar() or 0))
    sales_comm_pending = Decimal(str(db.session.query(db.func.coalesce(db.func.sum(EmployeeCommissionPayout.amount_pkr), 0)).filter(EmployeeCommissionPayout.status == "PENDING").scalar() or 0))
    return jsonify({
        "currency": current_app.config.get("CURRENCY", "GBP"),
        "paid_commissions": float(paid_amount),
        "pending_commissions": float(pending_amount),
        "total_expenses": float(expense_amount),
        "employee_salaries_paid_pkr": float(payroll_paid),
        "employee_salaries_pending_pkr": float(payroll_pending),
        "employee_commissions_paid_pkr": float(sales_comm_paid),
        "employee_commissions_pending_pkr": float(sales_comm_pending),
        "net_profit_loss": float(paid_amount - expense_amount),
        "projected_profit_loss": float(paid_amount + pending_amount - expense_amount),
        "expenses": [expense.to_dict() for expense in expenses],
    }), 200


def employee_user(employee_id):
    employee = User.query.filter_by(id=employee_id, is_active=True).first()
    if not employee or not employee.role or employee.role.name not in {"agent", "team_leader"}:
        return None
    return employee


@admin_records_bp.route("/employees", methods=["GET"])
@require_auth
def employee_finance_summary():
    user, error = admin_user()
    if error:
        return error
    period = request.args.get("period") or date.today().strftime("%Y-%m")
    try:
        date.fromisoformat(period + "-01")
    except ValueError:
        return jsonify({"error": "Bad Request", "message": "Choose a valid month"}), 400
    employees = User.query.filter(User.is_active.is_(True), (User.role.has(name="agent") | User.role.has(name="team_leader"))).order_by(User.full_name).all()
    salaries = {s.employee_id: s.to_dict() for s in EmployeeSalary.query.filter_by(period=period).all()}
    commission_payouts = {p.employee_id: p.to_dict() for p in EmployeeCommissionPayout.query.filter_by(period=period).all()}
    uploaded_stats = {s.employee_id: s for s in EmployeeMonthlySalesStat.query.filter_by(period=period).all()}
    sales = EmployeeSale.query.filter(db.func.strftime("%Y-%m", EmployeeSale.sale_date) == period).all()
    by_employee = {}
    for sale in sales:
        data = by_employee.setdefault(sale.employee_id, {"sales_count": 0, "sales_total": Decimal("0"), "commission_paid": Decimal("0"), "commission_pending": Decimal("0")})
        data["sales_count"] += 1
        data["sales_total"] += Decimal(str(sale.sale_amount or 0))
        key = "commission_paid" if sale.commission_status == "PAID" else "commission_pending"
        data[key] += Decimal(str(sale.commission_amount or 0))
    result = []
    for employee in employees:
        item = by_employee.get(employee.id, {"sales_count": 0, "sales_total": 0, "commission_paid": 0, "commission_pending": 0})
        stat = uploaded_stats.get(employee.id)
        result.append({"id": employee.id, "name": employee.full_name, "username": employee.username, "role": employee.role.display_name, "role_key": employee.role.name, "salary": salaries.get(employee.id), "commission_payout": commission_payouts.get(employee.id), "sales_count": stat.sales_count if stat else item["sales_count"], "sales_total_gbp": float(stat.sales_amount_gbp if stat else item["sales_total"]), "commission_earned_gbp": float(stat.commission_amount_gbp if stat else item["commission_paid"] + item["commission_pending"]), "commission_paid_gbp": float(item["commission_paid"]), "commission_pending_gbp": float(item["commission_pending"]), "sales_stats_uploaded": bool(stat)})
    return jsonify({"period": period, "employees": result}), 200


@admin_records_bp.route("/employees/<employee_id>/activity", methods=["GET"])
@require_auth
def employee_activity(employee_id):
    user, error = admin_user()
    if error:
        return error
    employee = employee_user(employee_id)
    if not employee or employee.role.name != "agent":
        return jsonify({"error": "Not Found", "message": "Agent not found"}), 404
    leads = Customer.query.filter(
        Customer.deleted_at.is_(None),
        or_(Customer.assigned_agent_id == employee.id, Customer.created_by_id == employee.id)
    ).order_by(Customer.updated_at.desc()).limit(5000).all()
    callbacks = Callback.query.join(Customer, Callback.customer_id == Customer.id).filter(
        or_(Callback.agent_id == employee.id, Customer.assigned_agent_id == employee.id, Customer.created_by_id == employee.id)
    ).order_by(Callback.scheduled_at.desc()).limit(5000).all()
    return jsonify({
        "agent": {"id": employee.id, "name": employee.full_name, "username": employee.username},
        "leads": [lead.to_dict(summary=True) for lead in leads],
        "callbacks": [callback.to_dict() for callback in callbacks],
        "lead_count": len(leads),
        "callback_count": len(callbacks),
    }), 200


@admin_records_bp.route("/employees/salaries", methods=["POST"])
@require_auth
def save_employee_salary():
    user, error = admin_user()
    if error:
        return error
    data = request.get_json() or {}
    employee = employee_user(str(data.get("employee_id") or ""))
    period = str(data.get("period") or "")
    status = str(data.get("status") or "PENDING").upper()
    if not employee or status not in COMMISSION_STATUSES:
        return jsonify({"error": "Bad Request", "message": "Choose an active employee and valid payment status"}), 400
    try:
        date.fromisoformat(period + "-01")
        amount = parse_amount(data.get("amount"), "Salary")
    except ValueError as exc:
        return jsonify({"error": "Bad Request", "message": str(exc)}), 400
    salary = EmployeeSalary.query.filter_by(employee_id=employee.id, period=period).first()
    if not salary:
        salary = EmployeeSalary(employee_id=employee.id, period=period, created_by_id=user.id)
        db.session.add(salary)
    salary.amount, salary.status = amount, status
    salary.notes = (data.get("notes") or "").strip()[:500] or None
    db.session.commit()
    log_audit_event(user_id=user.id, action="EMPLOYEE_SALARY_SAVED", entity_type="EMPLOYEE_SALARY", entity_id=salary.id, summary=f"Saved salary for {employee.full_name} ({period})", ip=request.remote_addr)
    return jsonify({"message": "Employee salary saved in PKR", "salary": salary.to_dict()}), 200


@admin_records_bp.route("/employees/salaries/<salary_id>", methods=["PATCH"])
@require_auth
def update_employee_salary(salary_id):
    user, error = admin_user()
    if error:
        return error
    salary = EmployeeSalary.query.get_or_404(salary_id)
    data = request.get_json() or {}
    status = str(data.get("status") or "").upper()
    if status not in COMMISSION_STATUSES:
        return jsonify({"error": "Bad Request", "message": "Select a valid payment status"}), 400
    salary.status = status
    db.session.commit()
    log_audit_event(user_id=user.id, action="EMPLOYEE_SALARY_STATUS_UPDATED", entity_type="EMPLOYEE_SALARY", entity_id=salary.id, summary=f"Marked {salary.employee.full_name} salary {status.lower()} ({salary.period})", ip=request.remote_addr)
    return jsonify({"message": "Salary payment status updated", "salary": salary.to_dict()}), 200


@admin_records_bp.route("/employees/commissions", methods=["POST"])
@require_auth
def save_employee_commission_payout():
    user, error = admin_user()
    if error:
        return error
    data = request.get_json() or {}
    employee = employee_user(str(data.get("employee_id") or ""))
    period = str(data.get("period") or "")
    status = str(data.get("status") or "PENDING").upper()
    if not employee or status not in COMMISSION_STATUSES:
        return jsonify({"error": "Bad Request", "message": "Choose an active employee and valid payment status"}), 400
    try:
        date.fromisoformat(period + "-01")
        amount = parse_amount(data.get("amount_pkr"), "Commission payment in PKR")
    except ValueError as exc:
        return jsonify({"error": "Bad Request", "message": str(exc)}), 400
    payout = EmployeeCommissionPayout.query.filter_by(employee_id=employee.id, period=period).first()
    if not payout:
        payout = EmployeeCommissionPayout(employee_id=employee.id, period=period, created_by_id=user.id)
        db.session.add(payout)
    payout.amount_pkr, payout.status = amount, status
    payout.notes = (data.get("notes") or "").strip()[:500] or None
    db.session.commit()
    log_audit_event(user_id=user.id, action="EMPLOYEE_COMMISSION_PAYOUT_SAVED", entity_type="EMPLOYEE_COMMISSION_PAYOUT", entity_id=payout.id, summary=f"Saved PKR commission payout for {employee.full_name} ({period})", ip=request.remote_addr)
    return jsonify({"message": "Employee commission payout saved in PKR", "payout": payout.to_dict()}), 200


@admin_records_bp.route("/employees/commissions/<payout_id>", methods=["PATCH"])
@require_auth
def update_employee_commission_payout(payout_id):
    user, error = admin_user()
    if error:
        return error
    payout = EmployeeCommissionPayout.query.get_or_404(payout_id)
    data = request.get_json() or {}
    status = str(data.get("status") or "").upper()
    if status not in COMMISSION_STATUSES:
        return jsonify({"error": "Bad Request", "message": "Select a valid payment status"}), 400
    payout.status = status
    db.session.commit()
    return jsonify({"message": "Commission payout status updated", "payout": payout.to_dict()}), 200


@admin_records_bp.route("/employees/sales", methods=["GET", "POST"])
@require_auth
def employee_sales():
    user, error = admin_user()
    if error:
        return error
    if request.method == "GET":
        period = request.args.get("period")
        query = EmployeeSale.query
        if period:
            query = query.filter(db.func.strftime("%Y-%m", EmployeeSale.sale_date) == period)
        return jsonify({"sales": [sale.to_dict() for sale in query.order_by(EmployeeSale.sale_date.desc(), EmployeeSale.created_at.desc()).limit(500).all()]}), 200
    data = request.get_json() or {}
    employee = employee_user(str(data.get("employee_id") or ""))
    customer_name = (data.get("customer_name") or "").strip()
    business_name = (data.get("business_name") or "").strip()
    status = str(data.get("commission_status") or "PENDING").upper()
    if not employee or not customer_name or not business_name or status not in COMMISSION_STATUSES:
        return jsonify({"error": "Bad Request", "message": "Employee, customer, business, and valid commission status are required"}), 400
    try:
        sale_amount = parse_amount(data.get("sale_amount"), "Sale amount")
        commission_amount = parse_amount(data.get("commission_amount"), "Commission")
        sale_date = date.fromisoformat(data.get("sale_date") or date.today().isoformat())
    except (ValueError, TypeError) as exc:
        return jsonify({"error": "Bad Request", "message": str(exc)}), 400
    sale = EmployeeSale(employee_id=employee.id, customer_name=customer_name[:180], business_name=business_name[:180], sale_amount=sale_amount, commission_amount=commission_amount, commission_status=status, sale_date=sale_date, notes=(data.get("notes") or "").strip()[:500] or None, created_by_id=user.id)
    db.session.add(sale)
    db.session.commit()
    log_audit_event(user_id=user.id, action="EMPLOYEE_SALE_CREATED", entity_type="EMPLOYEE_SALE", entity_id=sale.id, summary=f"Recorded sale for {employee.full_name}", ip=request.remote_addr)
    return jsonify({"message": "Sale recorded", "sale": sale.to_dict()}), 201


@admin_records_bp.route("/employees/sales-stats/import", methods=["POST"])
@require_auth
def import_employee_sales_stats():
    user, error = admin_user()
    if error:
        return error
    upload = request.files.get("file")
    if not upload or not upload.filename or not upload.filename.lower().endswith(".csv"):
        return jsonify({"error": "Bad Request", "message": "Choose a monthly sales CSV file"}), 400
    try:
        reader = csv.DictReader(io.StringIO(upload.read().decode("utf-8-sig")))
    except UnicodeDecodeError:
        return jsonify({"error": "Bad Request", "message": "The CSV must use UTF-8 encoding"}), 400
    required = {"username", "period", "sales_count", "sales_amount_gbp", "commission_amount_gbp"}
    if not reader.fieldnames or not required.issubset({field.strip().lower() for field in reader.fieldnames}):
        return jsonify({"error": "Bad Request", "message": "CSV headers must include username, period, sales_count, sales_amount_gbp, commission_amount_gbp"}), 400
    headers = {field.strip().lower(): field for field in reader.fieldnames}
    rows = []
    seen_periods = set()
    for row_number, row in enumerate(reader, start=2):
        username = (row.get(headers["username"]) or "").strip()
        employee = User.query.filter_by(username=username, is_active=True).first()
        period = (row.get(headers["period"]) or "").strip()
        if not employee or not employee.role or employee.role.name not in {"agent", "team_leader"}:
            return jsonify({"error": "Bad Request", "message": f"Row {row_number}: username must match an active agent or team leader"}), 400
        try:
            date.fromisoformat(period + "-01")
            key = (employee.id, period)
            if key in seen_periods:
                raise ValueError("only one summary row per employee per month is allowed")
            seen_periods.add(key)
            count = int(row.get(headers["sales_count"]) or "0")
            if count < 0:
                raise ValueError("sales_count cannot be negative")
            amount = parse_amount(row.get(headers["sales_amount_gbp"]), f"Sales value on row {row_number}")
            commission = parse_amount(row.get(headers["commission_amount_gbp"]), f"Commission on row {row_number}")
        except (ValueError, TypeError) as exc:
            return jsonify({"error": "Bad Request", "message": f"Row {row_number}: {str(exc)}"}), 400
        rows.append((employee, period, count, amount, commission))
    if not rows:
        return jsonify({"error": "Bad Request", "message": "The CSV contains no sales statistics"}), 400
    for employee, period, count, amount, commission in rows:
        stat = EmployeeMonthlySalesStat.query.filter_by(employee_id=employee.id, period=period).first()
        if not stat:
            stat = EmployeeMonthlySalesStat(employee_id=employee.id, period=period)
            db.session.add(stat)
        stat.sales_count, stat.sales_amount_gbp, stat.commission_amount_gbp, stat.imported_by_id = count, amount, commission, user.id
    db.session.commit()
    log_audit_event(user_id=user.id, action="EMPLOYEE_SALES_STATS_IMPORTED", entity_type="EMPLOYEE_MONTHLY_SALES_STATS", entity_id=None, summary=f"Imported monthly sales statistics for {len(rows)} employees", details={"count": len(rows)}, ip=request.remote_addr)
    return jsonify({"message": f"Imported monthly sales statistics for {len(rows)} employees", "count": len(rows)}), 201


@admin_records_bp.route("/employees/sales/<sale_id>", methods=["PATCH"])
@require_auth
def update_employee_sale(sale_id):
    user, error = admin_user()
    if error:
        return error
    sale = EmployeeSale.query.get_or_404(sale_id)
    data = request.get_json() or {}
    if "commission_status" in data:
        status = str(data["commission_status"]).upper()
        if status not in COMMISSION_STATUSES:
            return jsonify({"error": "Bad Request", "message": "Select a valid commission status"}), 400
        sale.commission_status = status
    db.session.commit()
    return jsonify({"message": "Sale updated", "sale": sale.to_dict()}), 200


@admin_records_bp.route("/finance/expenses", methods=["POST"])
@require_auth
def create_expense():
    user, error = admin_user()
    if error:
        return error
    data = request.get_json() or {}
    category = str(data.get("category") or "").upper()
    description = (data.get("description") or "").strip()
    if category not in EXPENSE_CATEGORIES or not description:
        return jsonify({"error": "Bad Request", "message": "Choose an expense category and enter a description"}), 400
    try:
        amount = parse_amount(data.get("amount"), "Expense")
        incurred_on = date.fromisoformat(data.get("incurred_on") or date.today().isoformat())
    except (ValueError, TypeError) as exc:
        return jsonify({"error": "Bad Request", "message": str(exc) or "Enter a valid date"}), 400

    expense = Expense(
        category=category,
        description=description[:255],
        amount=amount,
        incurred_on=incurred_on,
        created_by_id=user.id,
    )
    db.session.add(expense)
    db.session.commit()
    log_audit_event(
        user_id=user.id,
        action="EXPENSE_CREATED",
        entity_type="EXPENSE",
        entity_id=expense.id,
        summary=f"Added {category.lower()} expense",
        ip=request.remote_addr,
    )
    return jsonify({"message": "Expense recorded", "expense": expense.to_dict()}), 201
