from datetime import datetime, timezone
from ..models import db, Customer, Call, Callback, Conversation, SyncQueue, SyncConflict, User, LeadAssignment
from .call_service import log_call_record
from .customer_service import create_customer_record
from .callback_service import schedule_new_callback
from .assignment_service import assign_lead_to_team_leader
from .rbac_service import can_access_customer
from .auth_service import log_audit_event

def process_sync_batch(user: User, device_id: str, items: list, client_ip: str = None) -> dict:
    processed_count = 0
    synced_items = []
    conflicts = []
    errors = []

    id_mapping = {} # local_id -> server_id

    for item in items:
        local_id = item.get("local_id")
        operation = item.get("operation") # CREATE, UPDATE, DELETE
        entity_type = item.get("entity_type") # CUSTOMER, CALL, CALLBACK, NOTE, ASSIGNMENT
        entity_id = item.get("entity_id")
        payload = item.get("payload", {})
        client_ts = item.get("client_timestamp")

        # Check if entity_id refers to a newly created local entity
        if entity_id in id_mapping:
            entity_id = id_mapping[entity_id]
        if payload.get("customer_id") in id_mapping:
            payload["customer_id"] = id_mapping[payload["customer_id"]]

        # Track sync queue entry
        sq = SyncQueue(
            local_id=local_id or "",
            user_id=user.id,
            device_id=device_id,
            operation=operation,
            entity_type=entity_type,
            entity_id=entity_id,
            payload=payload,
            client_timestamp=client_ts,
            sync_status="SYNCING"
        )
        db.session.add(sq)
        db.session.flush()

        try:
            server_id = None

            if entity_type == "CUSTOMER":
                if operation == "CREATE":
                    send_to_leader = bool(user.role and user.role.name == "agent" and payload.get("assign_to_team_lead") is True)
                    if send_to_leader and (not user.primary_team or not user.primary_team.team_leader):
                        raise ValueError("Your team needs a Team Lead before leads can be sent to them")
                    customer = create_customer_record(payload, user, client_ip=client_ip)
                    server_id = customer.id
                    if local_id:
                        id_mapping[local_id] = customer.id
                    if send_to_leader:
                        assign_lead_to_team_leader(
                            customer.id,
                            user,
                            {"reason": "Lead shared with Team Lead when created", "priority": customer.priority},
                            client_ip=client_ip
                        )
                elif operation == "UPDATE":
                    customer = Customer.query.get(entity_id)
                    if not customer:
                        raise ValueError(f"Customer {entity_id} not found")
                    if not can_access_customer(user, customer):
                        raise ValueError("You do not have access to update this lead")
                    
                    # Check for conflict: compare client_ts with customer.updated_at
                    is_conflict = False
                    if client_ts and customer.updated_at:
                        try:
                            c_dt = datetime.fromisoformat(client_ts.replace("Z", "+00:00"))
                            s_dt = customer.updated_at
                            if s_dt.tzinfo is None:
                                s_dt = s_dt.replace(tzinfo=timezone.utc)
                            if s_dt > c_dt:
                                is_conflict = True
                        except Exception:
                            pass

                    if is_conflict:
                        # Conflict handling: preserve call history, merge fields non-destructively
                        conflict_rec = SyncConflict(
                            sync_item_id=sq.id,
                            entity_type="CUSTOMER",
                            entity_id=customer.id,
                            server_data=customer.to_dict(),
                            client_data=payload,
                            resolution_strategy="NON_DESTRUCTIVE_MERGE"
                        )
                        db.session.add(conflict_rec)
                        conflicts.append({"entity_id": customer.id, "reason": "Server record was modified while offline"})

                    # Non-destructive field updates
                    for field in ("full_name", "company_name", "phone", "email", "postcode", "industry", "lead_status", "priority", "notes"):
                        if field in payload and payload[field] is not None:
                            setattr(customer, field, payload[field])
                    
                    customer.updated_by_id = user.id
                    server_id = customer.id

            elif entity_type == "CALL":
                cust_id = payload.get("customer_id") or entity_id
                if not can_access_customer(user, Customer.query.get(cust_id)):
                    raise ValueError("You do not have access to this lead")
                call, convo = log_call_record(cust_id, user, payload, client_ip=client_ip)
                server_id = call.id
                if local_id:
                    id_mapping[local_id] = call.id

            elif entity_type == "CALLBACK":
                cust_id = payload.get("customer_id") or entity_id
                if not can_access_customer(user, Customer.query.get(cust_id)):
                    raise ValueError("You do not have access to this lead")
                cb = schedule_new_callback(cust_id, user, payload, client_ip=client_ip)
                server_id = cb.id
                if local_id:
                    id_mapping[local_id] = cb.id

            elif entity_type == "NOTE":
                cust_id = payload.get("customer_id") or entity_id
                if not can_access_customer(user, Customer.query.get(cust_id)):
                    raise ValueError("You do not have access to this lead")
                convo = Conversation(
                    customer_id=cust_id,
                    agent_id=user.id,
                    interaction_type="NOTE",
                    summary=payload.get("note") or payload.get("summary") or "Note added offline",
                    notes=payload.get("notes")
                )
                db.session.add(convo)
                db.session.commit()
                server_id = convo.id

            elif entity_type == "ASSIGNMENT":
                cust_id = payload.get("customer_id") or entity_id
                if not can_access_customer(user, Customer.query.get(cust_id)):
                    raise ValueError("You do not have access to this lead")
                asgn = assign_lead_to_team_leader(cust_id, user, payload, client_ip=client_ip)
                server_id = asgn.id

            sq.server_id = server_id
            sq.sync_status = "SYNCED"
            sq.processed_at = datetime.now(timezone.utc)
            db.session.commit()

            processed_count += 1
            synced_items.append({
                "local_id": local_id,
                "server_id": server_id,
                "entity_type": entity_type,
                "status": "SYNCED"
            })

        except Exception as ex:
            db.session.rollback()
            sq.sync_status = "FAILED"
            sq.error_message = str(ex)
            db.session.commit()
            errors.append({"local_id": local_id, "error": str(ex)})

    log_audit_event(
        user_id=user.id,
        action="OFFLINE_SYNC_COMPLETED",
        entity_type="SYNC_BATCH",
        entity_id=device_id or "web",
        summary=f"Processed sync batch: {processed_count} items synced, {len(conflicts)} conflicts, {len(errors)} errors",
        details={"processed": processed_count, "conflicts": len(conflicts), "errors": len(errors)},
        ip=client_ip
    )

    return {
        "processed": processed_count,
        "synced": synced_items,
        "conflicts": conflicts,
        "errors": errors,
        "id_mapping": id_mapping
    }
