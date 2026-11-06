import csv
import io
from ..models import db, Customer, User, Team, ImportJob, ExportJob
from .customer_service import check_duplicates, create_customer_record
from .rbac_service import apply_customer_scope
from .auth_service import log_audit_event

def preview_csv_data(file_content: str) -> dict:
    stream = io.StringIO(file_content)
    reader = csv.reader(stream)
    rows = list(reader)
    if not rows:
        return {"headers": [], "preview_rows": [], "total_rows": 0}
    
    headers = [h.strip() for h in rows[0]]
    preview_rows = rows[1:6] # first 5 data rows
    return {
        "headers": headers,
        "preview_rows": preview_rows,
        "total_rows": len(rows) - 1
    }

def execute_csv_import(file_content: str, column_mapping: dict, user: User, team_id: str = None, agent_id: str = None, duplicate_strategy: str = "skip", client_ip: str = None) -> dict:
    stream = io.StringIO(file_content)
    reader = csv.DictReader(stream)
    
    imported_count = 0
    duplicate_count = 0
    invalid_count = 0
    failed_count = 0
    error_summary = []

    target_team_id = team_id or (user.primary_team.id if user.primary_team else None)
    target_agent_id = agent_id or (user.id if user.role and user.role.name == "agent" else None)

    row_index = 0
    for row in reader:
        row_index += 1
        try:
            # Map fields using user-defined column_mapping e.g. {"phone": "Phone Number", "full_name": "Customer Name"}
            customer_data = {}
            for target_field, csv_header in column_mapping.items():
                if csv_header and csv_header in row:
                    customer_data[target_field] = row[csv_header].strip()

            phone = customer_data.get("phone")
            name = customer_data.get("full_name") or f"{customer_data.get('first_name', '')} {customer_data.get('last_name', '')}".strip()

            if not phone or not name:
                invalid_count += 1
                error_summary.append(f"Row {row_index}: Missing phone or name")
                continue

            customer_data["full_name"] = name
            customer_data["assigned_team_id"] = target_team_id
            customer_data["assigned_agent_id"] = target_agent_id

            # Duplicate check
            existing_dupes = check_duplicates(
                phone=phone,
                email=customer_data.get("email"),
                company_name=customer_data.get("company_name")
            )

            if existing_dupes:
                duplicate_count += 1
                if duplicate_strategy == "skip":
                    continue

            create_customer_record(customer_data, user, client_ip=client_ip)
            imported_count += 1

        except Exception as ex:
            failed_count += 1
            error_summary.append(f"Row {row_index}: {str(ex)}")

    job = ImportJob(
        user_id=user.id,
        filename="csv_upload.csv",
        total_rows=row_index,
        imported_count=imported_count,
        duplicate_count=duplicate_count,
        invalid_count=invalid_count,
        failed_count=failed_count,
        error_summary=error_summary[:50] # cap
    )
    db.session.add(job)
    db.session.commit()

    log_audit_event(
        user_id=user.id,
        action="DATA_IMPORTED",
        entity_type="IMPORT_JOB",
        entity_id=job.id,
        summary=f"Imported CSV: {imported_count} imported, {duplicate_count} duplicates, {invalid_count} invalid, {failed_count} failed",
        details=job.to_dict(),
        ip=client_ip
    )

    return job.to_dict()

def export_customers_csv(user: User, filters: dict = None) -> str:
    query = Customer.query
    query = apply_customer_scope(query, user)

    if filters:
        if filters.get("lead_status"):
            query = query.filter(Customer.lead_status == filters["lead_status"])
        if filters.get("team_id"):
            query = query.filter(Customer.assigned_team_id == filters["team_id"])
        if filters.get("agent_id"):
            query = query.filter(Customer.assigned_agent_id == filters["agent_id"])

    customers = query.order_by(Customer.created_at.desc()).all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Customer Code", "Full Name", "Company", "Phone", "Secondary Phone",
        "Email", "Address", "City", "Postcode", "Industry", "Lead Source",
        "Lead Status", "Priority", "Assigned Team", "Assigned Agent",
        "Last Contact Date", "Next Callback Date", "Created Date"
    ])

    for c in customers:
        writer.writerow([
            c.code,
            c.full_name,
            c.company_name or "",
            c.phone,
            c.secondary_phone or "",
            c.email or "",
            c.address or "",
            c.city or "",
            c.postcode or "",
            c.industry or "",
            c.lead_source or "",
            c.lead_status or "",
            c.priority or "",
            c.assigned_team.name if c.assigned_team else "",
            c.assigned_agent.full_name if c.assigned_agent else "",
            c.last_contact_date.isoformat() if c.last_contact_date else "",
            c.next_callback_date.isoformat() if c.next_callback_date else "",
            c.created_at.isoformat() if c.created_at else ""
        ])

    return output.getvalue()
