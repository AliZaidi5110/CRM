import re
from datetime import datetime, timezone
from sqlalchemy import or_, and_, func
from ..models import db, Customer, User, Team, Conversation
from .rbac_service import apply_customer_scope
from .auth_service import log_audit_event

def normalize_phone(phone: str) -> str:
    if not phone:
        return ""
    # Strip spaces, dashes, parentheses, plus
    digits = re.sub(r"[^\d]", "", phone)
    if digits.startswith("44") and len(digits) > 10: # UK normalization
        return "0" + digits[2:]
    return digits

def check_duplicates(phone: str = None, email: str = None, company_name: str = None, exclude_id: str = None, user: User = None) -> list:
    conditions = []
    
    if phone:
        clean_phone = normalize_phone(phone)
        if len(clean_phone) >= 7:
            conditions.append(func.replace(func.replace(Customer.phone, " ", ""), "-", "").ilike(f"%{clean_phone}%"))
            conditions.append(func.replace(func.replace(Customer.secondary_phone, " ", ""), "-", "").ilike(f"%{clean_phone}%"))

    if email and "@" in email:
        clean_email = email.strip().lower()
        conditions.append(func.lower(Customer.email) == clean_email)

    if company_name and len(company_name.strip()) >= 3:
        clean_company = company_name.strip().lower()
        conditions.append(func.lower(Customer.company_name) == clean_company)

    if not conditions:
        return []

    query = Customer.query.filter(Customer.deleted_at.is_(None)).filter(or_(*conditions))
    if user:
        query = apply_customer_scope(query, user)
    if exclude_id:
        query = query.filter(Customer.id != exclude_id)

    duplicates = query.limit(10).all()
    return [d.to_dict(summary=True) for d in duplicates]

def search_customers(user: User, search_text: str = None, filters: dict = None, page: int = 1, per_page: int = 25):
    query = Customer.query
    query = apply_customer_scope(query, user)

    if search_text and search_text.strip():
        text = f"%{search_text.strip()}%"
        query = query.filter(or_(
            Customer.full_name.ilike(text),
            Customer.company_name.ilike(text),
            Customer.phone.ilike(text),
            Customer.secondary_phone.ilike(text),
            Customer.email.ilike(text),
            Customer.postcode.ilike(text),
            Customer.code.ilike(text),
            Customer.city.ilike(text)
        ))

    if filters:
        if filters.get("lead_status"):
            query = query.filter(Customer.lead_status == filters["lead_status"])
        if filters.get("priority"):
            query = query.filter(Customer.priority == filters["priority"])
        if filters.get("team_id"):
            query = query.filter(Customer.assigned_team_id == filters["team_id"])
        if filters.get("agent_id"):
            query = query.filter(Customer.assigned_agent_id == filters["agent_id"])
        if filters.get("industry"):
            query = query.filter(Customer.industry.ilike(f"%{filters['industry']}%"))
        if filters.get("lead_source"):
            query = query.filter(Customer.lead_source == filters["lead_source"])
        if filters.get("tag"):
            tag_name = filters["tag"].strip()
            # SQLite / PostgreSQL JSON check
            query = query.filter(Customer.tags_list.cast(db.String).ilike(f"%{tag_name}%"))

    # Sorting
    query = query.order_by(Customer.updated_at.desc())

    total = query.count()
    items = query.offset((page - 1) * per_page).limit(per_page).all()

    return {
        "items": [item.to_dict(summary=True) for item in items],
        "total": total,
        "page": page,
        "per_page": per_page,
        "pages": (total + per_page - 1) // per_page
    }

def create_customer_record(data: dict, user: User, client_ip: str = None) -> Customer:
    # Resolve assignment
    team_id = data.get("assigned_team_id")
    agent_id = data.get("assigned_agent_id")

    # Agents always create leads in their own team and under their own name;
    # browser payloads cannot assign leads to another agent or team.
    if user.role and user.role.name == "agent":
        team_id = user.primary_team.id if user.primary_team else None
        agent_id = user.id
    elif not team_id and user.primary_team:
        team_id = user.primary_team.id

    customer = Customer(
        first_name=data.get("first_name", "").strip(),
        last_name=data.get("last_name", "").strip(),
        full_name=(data.get("full_name") or f"{data.get('first_name', '')} {data.get('last_name', '')}".strip() or "Unnamed").strip(),
        company_name=data.get("company_name", "").strip() if data.get("company_name") else None,
        phone=data.get("phone", "").strip(),
        secondary_phone=data.get("secondary_phone", "").strip() if data.get("secondary_phone") else None,
        email=data.get("email", "").strip().lower() if data.get("email") else None,
        address=data.get("address", "").strip() if data.get("address") else None,
        city=data.get("city", "").strip() if data.get("city") else None,
        postcode=data.get("postcode", "").strip().upper() if data.get("postcode") else None,
        country=data.get("country", "United Kingdom"),
        industry=data.get("industry"),
        customer_type=data.get("customer_type", "Lead"),
        lead_source=data.get("lead_source", "Cold Call"),
        previous_provider=data.get("previous_provider"),
        assigned_team_id=team_id,
        assigned_agent_id=agent_id,
        created_by_id=user.id,
        updated_by_id=user.id,
        lead_status=data.get("lead_status", "NEW"),
        priority=data.get("priority", "MEDIUM"),
        tags_list=data.get("tags", []),
        custom_fields=data.get("custom_fields", {}),
        notes=data.get("notes")
    )

    db.session.add(customer)
    db.session.flush()

    # Initial conversation timeline
    convo = Conversation(
        customer_id=customer.id,
        agent_id=user.id,
        interaction_type="LEAD_CREATED",
        summary=f"Lead created by {user.full_name} ({user.role.display_name if user.role else ''})"
    )
    db.session.add(convo)
    db.session.commit()

    log_audit_event(
        user_id=user.id,
        action="LEAD_CREATED",
        entity_type="CUSTOMER",
        entity_id=customer.id,
        summary=f"Created lead '{customer.full_name}' ({customer.company_name or 'No Company'})",
        details={"code": customer.code, "phone": customer.phone, "team_id": customer.assigned_team_id},
        ip=client_ip
    )

    return customer
