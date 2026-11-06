from flask import Blueprint, request, jsonify
from ..models import db, Customer, LeadStatus, Tag, Call, Callback, Conversation, LeadAssignment
from ..services.rbac_service import require_auth, require_permission, get_current_user, can_access_customer
from ..services.customer_service import search_customers, check_duplicates, create_customer_record
from ..services.auth_service import log_audit_event
from ..services.assignment_service import assign_lead_to_team_leader

customers_bp = Blueprint("customers_bp", __name__)

@customers_bp.route("", methods=["GET"])
@require_auth
def list_or_search_customers():
    user = get_current_user()
    search = request.args.get("search", "")
    page = int(request.args.get("page", 1))
    per_page = int(request.args.get("per_page", 20))

    filters = {}
    for key in ("lead_status", "priority", "team_id", "agent_id", "industry", "lead_source", "tag"):
        val = request.args.get(key)
        if val:
            filters[key] = val

    results = search_customers(user, search_text=search, filters=filters, page=page, per_page=per_page)
    return jsonify(results), 200

@customers_bp.route("/check-duplicate", methods=["POST"])
@require_auth
def check_duplicate_route():
    user = get_current_user()
    data = request.get_json() or {}
    phone = data.get("phone")
    email = data.get("email")
    company_name = data.get("company_name")
    exclude_id = data.get("exclude_id")

    duplicates = check_duplicates(phone=phone, email=email, company_name=company_name, exclude_id=exclude_id, user=user)
    return jsonify({
        "has_duplicates": len(duplicates) > 0,
        "duplicates": duplicates
    }), 200

@customers_bp.route("", methods=["POST"])
@require_auth
@require_permission("customers.create")
def create_customer():
    user = get_current_user()
    data = request.get_json() or {}

    phone = data.get("phone", "").strip()
    name = data.get("full_name") or f"{data.get('first_name', '')} {data.get('last_name', '')}".strip()

    if not phone or not name:
        return jsonify({"error": "Bad Request", "message": "Customer name and phone number are required"}), 400

    assign_to_leader = bool(user.role and user.role.name == "agent" and data.get("assign_to_team_lead") is True)
    if assign_to_leader and (not user.primary_team or not user.primary_team.team_leader):
        return jsonify({"error": "Bad Request", "message": "Your team needs a Team Lead before leads can be sent to them"}), 400

    # Optional duplicate guard unless force=true
    if not data.get("force"):
        dupes = check_duplicates(phone=phone, email=data.get("email"), company_name=data.get("company_name"), user=user)
        if dupes:
            return jsonify({
                "error": "Duplicate Detected",
                "message": "Potential existing customer found with matching phone, email, or company name.",
                "duplicates": dupes
            }), 409

    customer = create_customer_record(data, user, client_ip=request.remote_addr)
    if assign_to_leader:
        assign_lead_to_team_leader(
            customer.id,
            user,
            {"reason": "Lead shared with Team Lead when created", "priority": customer.priority},
            client_ip=request.remote_addr
        )
        db.session.refresh(customer)
    is_agent_submission = bool(user.role and user.role.name == "agent")
    return jsonify({
        "message": "Lead created and shared with Team Lead" if assign_to_leader else ("Lead submitted and visible to Admin" if is_agent_submission else "Lead created successfully"),
        "visible_to_admin": True,
        "customer": customer.to_dict()
    }), 201

@customers_bp.route("/<customer_id>", methods=["GET"])
@require_auth
def get_customer_profile(customer_id):
    user = get_current_user()
    customer = Customer.query.get_or_404(customer_id)

    if not can_access_customer(user, customer):
        return jsonify({"error": "Forbidden", "message": "You do not have permission to view this customer"}), 403

    calls = [c.to_dict() for c in customer.calls.all()]
    callbacks = [cb.to_dict() for cb in customer.callbacks.all()]
    conversations = [cv.to_dict() for cv in customer.conversations.all()]
    assignments = [a.to_dict() for a in customer.assignments.all()]

    return jsonify({
        "customer": customer.to_dict(),
        "calls": calls,
        "callbacks": callbacks,
        "conversations": conversations,
        "assignments": assignments
    }), 200

@customers_bp.route("/<customer_id>", methods=["PUT"])
@require_auth
@require_permission("customers.edit")
def update_customer_info(customer_id):
    user = get_current_user()
    customer = Customer.query.get_or_404(customer_id)

    if not can_access_customer(user, customer):
        return jsonify({"error": "Forbidden", "message": "You do not have permission to edit this customer"}), 403

    data = request.get_json() or {}

    old_status = customer.lead_status

    for field in ("first_name", "last_name", "full_name", "company_name", "phone", "secondary_phone",
                  "email", "address", "city", "postcode", "industry", "customer_type", "lead_source",
                  "previous_provider", "lead_status", "priority", "notes"):
        if field in data and data[field] is not None:
            setattr(customer, field, data[field])

    if "tags" in data:
        customer.tags_list = data["tags"]
    if "custom_fields" in data:
        customer.custom_fields = data["custom_fields"]

    customer.updated_by_id = user.id

    # If status changed, record timeline conversation
    if "lead_status" in data and data["lead_status"] != old_status:
        convo = Conversation(
            customer_id=customer.id,
            agent_id=user.id,
            interaction_type="STATUS_CHANGED",
            summary=f"Lead status changed from '{old_status}' to '{customer.lead_status}' by {user.full_name}"
        )
        db.session.add(convo)

    db.session.commit()

    log_audit_event(
        user_id=user.id,
        action="CUSTOMER_UPDATED",
        entity_type="CUSTOMER",
        entity_id=customer.id,
        summary=f"Updated customer '{customer.full_name}'",
        details=data,
        ip=request.remote_addr
    )

    return jsonify({"message": "Customer updated successfully", "customer": customer.to_dict()}), 200

@customers_bp.route("/<customer_id>", methods=["DELETE"])
@require_auth
@require_permission("customers.delete")
def delete_customer(customer_id):
    user = get_current_user()
    customer = Customer.query.get_or_404(customer_id)

    from datetime import datetime, timezone
    customer.deleted_at = datetime.now(timezone.utc)
    db.session.commit()

    log_audit_event(
        user_id=user.id,
        action="CUSTOMER_SOFT_DELETED",
        entity_type="CUSTOMER",
        entity_id=customer.id,
        summary=f"Soft deleted customer '{customer.full_name}'",
        ip=request.remote_addr
    )

    return jsonify({"message": "Customer moved to trash"}), 200

@customers_bp.route("/statuses", methods=["GET"])
@require_auth
def get_lead_statuses():
    statuses = LeadStatus.query.order_by(LeadStatus.sort_order.asc()).all()
    return jsonify({"statuses": [s.to_dict() for s in statuses]}), 200

@customers_bp.route("/tags", methods=["GET"])
@require_auth
def get_tags():
    tags = Tag.query.order_by(Tag.name.asc()).all()
    return jsonify({"tags": [t.to_dict() for t in tags]}), 200

@customers_bp.route("/<customer_id>/close-deal", methods=["POST"])
@require_auth
def close_customer_deal(customer_id):
    import re
    from datetime import datetime, timezone
    from sqlalchemy.orm.attributes import flag_modified

    user = get_current_user()
    customer = Customer.query.get_or_404(customer_id)

    if not can_access_customer(user, customer):
        return jsonify({"error": "Forbidden", "message": "You do not have access to close deals for this customer"}), 403

    data = request.get_json() or {}
    business = data.get("business_details") or {}
    personal = data.get("personal_details") or {}
    bank = data.get("bank_details") or {}
    plan = data.get("selected_plan") or {}

    # Validations
    business_name = (business.get("business_name") or customer.company_name or "").strip()
    entity_type = business.get("entity_type", "Sole Trader").strip()
    if not business_name:
        return jsonify({"error": "Validation Error", "message": "Business Name is required for closing"}), 400

    full_name = (personal.get("full_name") or customer.full_name or "").strip()
    mobile = (personal.get("mobile_number") or customer.phone or "").strip()
    if not full_name or not mobile:
        return jsonify({"error": "Validation Error", "message": "Signatory Full Name and Mobile Number are required"}), 400

    bank_name = (bank.get("bank_name") or "").strip()
    account_title = (bank.get("account_title") or "").strip()
    raw_sort_code = str(bank.get("sort_code") or "").strip()
    raw_account_number = str(bank.get("account_number") or "").strip()

    if not bank_name or not account_title:
        return jsonify({"error": "Validation Error", "message": "Bank Name and Account Title are required"}), 400

    # Clean and validate sort code (UK format: 6 digits)
    clean_sort_code = re.sub(r"[^0-9]", "", raw_sort_code)
    if len(clean_sort_code) != 6:
        return jsonify({"error": "Validation Error", "message": "Sort Code must be exactly 6 digits (e.g. 12-34-56)"}), 400
    formatted_sort_code = f"{clean_sort_code[0:2]}-{clean_sort_code[2:4]}-{clean_sort_code[4:6]}"

    # Clean and validate account number (UK format: 8 digits)
    clean_account_number = re.sub(r"[^0-9]", "", raw_account_number)
    if len(clean_account_number) != 8:
        return jsonify({"error": "Validation Error", "message": "Account Number must be exactly 8 digits"}), 400

    # Prepare structured closing package
    closing_package = {
        "business": {
            "business_name": business_name,
            "entity_type": entity_type,
            "business_address": (business.get("business_address") or customer.address or "").strip(),
            "landline": (business.get("landline") or "").strip(),
            "trading_years": business.get("trading_years", "")
        },
        "personal": {
            "full_name": full_name,
            "mobile_number": mobile,
            "dob": (personal.get("dob") or "").strip(),
            "email": (personal.get("email") or customer.email or "").strip()
        },
        "bank": {
            "bank_name": bank_name,
            "account_title": account_title,
            "sort_code": formatted_sort_code,
            "account_number": clean_account_number,
            "account_number_masked": f"••••{clean_account_number[-4:]}"
        },
        "plan": {
            "provider_plan": plan.get("provider_plan", "Shift4"),
            "monthly_turnover": float(plan.get("monthly_turnover", 0)),
            "debit_rate": float(plan.get("debit_rate", 0.70)),
            "credit_rate": float(plan.get("credit_rate", 0.70)),
            "terminal_rental": float(plan.get("terminal_rental", 0.0)),
            "notes": (plan.get("notes") or "").strip()
        },
        "closed_at": datetime.now(timezone.utc).isoformat(),
        "closed_by_id": user.id,
        "closed_by_name": user.full_name
    }

    # Store in customer custom_fields
    if customer.custom_fields is None:
        customer.custom_fields = {}
    customer.custom_fields["closing_details"] = closing_package
    flag_modified(customer, "custom_fields")

    # Update customer record fields
    if business_name:
        customer.company_name = business_name
    customer.full_name = full_name
    customer.phone = mobile
    if personal.get("email"):
        customer.email = personal["email"]
    if business.get("business_address") and not customer.address:
        customer.address = business["business_address"]

    customer.lead_status = "CONVERTED"
    customer.customer_type = "Customer"
    customer.updated_by_id = user.id

    # Add conversation history
    turnover_val = closing_package["plan"]["monthly_turnover"]
    provider_name = closing_package["plan"]["provider_plan"]
    summary = f"🏆 Deal Closed! {provider_name} Card Machine setup agreed for {business_name} ({entity_type}). Turnover: £{turnover_val:,.0f}/mo. Bank: {bank_name} ({formatted_sort_code})."
    
    convo = Conversation(
        customer_id=customer.id,
        agent_id=user.id,
        interaction_type="DEAL_CLOSED",
        summary=summary,
        notes=f"Rates: {closing_package['plan']['debit_rate']}% Debit/Credit, £{closing_package['plan']['terminal_rental']}/mo Rental. Agent: {user.full_name}. Notes: {closing_package['plan']['notes']}"
    )
    db.session.add(convo)
    db.session.commit()

    log_audit_event(
        user_id=user.id,
        action="DEAL_CLOSED",
        entity_type="CUSTOMER",
        entity_id=customer.id,
        summary=f"Closed merchant deal for '{customer.company_name or customer.full_name}' ({provider_name})",
        details={
            "plan": closing_package["plan"],
            "bank_name": bank_name,
            "sort_code": formatted_sort_code
        },
        ip=request.remote_addr
    )

    return jsonify({
        "message": "Deal successfully closed and onboarded!",
        "customer": customer.to_dict(),
        "closing_details": closing_package
    }), 200

@customers_bp.route("/<customer_id>/closing-details", methods=["GET"])
@require_auth
def get_customer_closing_details(customer_id):
    user = get_current_user()
    customer = Customer.query.get_or_404(customer_id)

    if not can_access_customer(user, customer):
        return jsonify({"error": "Forbidden", "message": "You do not have permission to view this customer"}), 403

    closing = (customer.custom_fields or {}).get("closing_details")
    if not closing:
        return jsonify({"has_closed_deal": False, "closing_details": None}), 200

    return jsonify({"has_closed_deal": True, "closing_details": closing}), 200

