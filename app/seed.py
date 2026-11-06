from datetime import datetime, timezone, timedelta
from .models import db, Role, Permission, RolePermission, User, Team, TeamMember, LeadStatus, CallDisposition, Tag, Customer, Call, Callback, Conversation
from .services.auth_service import hash_password

def seed_database():
    # 1. Create Permissions
    permission_defs = [
        ("customers.view", "View Customers", "customers"),
        ("customers.create", "Create Customers", "customers"),
        ("customers.edit", "Edit Customers", "customers"),
        ("customers.delete", "Delete Customers", "customers"),
        ("leads.view", "View Leads", "leads"),
        ("leads.create", "Create Leads", "leads"),
        ("leads.edit", "Edit Leads", "leads"),
        ("leads.assign", "Assign Leads", "leads"),
        ("leads.transfer", "Transfer Leads", "leads"),
        ("leads.delete", "Delete Leads", "leads"),
        ("calls.view", "View Calls", "calls"),
        ("calls.create", "Log Calls", "calls"),
        ("calls.edit", "Edit Calls", "calls"),
        ("callbacks.view", "View Callbacks", "callbacks"),
        ("callbacks.create", "Schedule Callbacks", "callbacks"),
        ("callbacks.edit", "Complete Callbacks", "callbacks"),
        ("reports.view", "View Reports", "reports"),
        ("reports.export", "Export Reports", "reports"),
        ("users.view", "View Users", "users"),
        ("users.create", "Create Users", "users"),
        ("users.edit", "Edit Users", "users"),
        ("users.delete", "Delete Users", "users"),
        ("teams.view", "View Teams", "teams"),
        ("teams.create", "Create Teams", "teams"),
        ("teams.edit", "Edit Teams", "teams"),
        ("teams.delete", "Delete Teams", "teams"),
        ("audit.view", "View Audit Logs", "audit"),
        ("settings.manage", "Manage Settings", "settings"),
    ]

    perm_objs = {}
    for code, name, cat in permission_defs:
        p = Permission.query.filter_by(code=code).first()
        if not p:
            p = Permission(code=code, name=name, category=cat)
            db.session.add(p)
        perm_objs[code] = p
    db.session.commit()

    # 2. Roles
    roles = {
        "super_admin": ("Super Administrator", "Complete company-wide access to all CRM resources", list(perm_objs.values())),
        "team_leader": ("Team Leader", "Manages team roster, views all team leads, reassigns leads", [
            perm_objs[c] for c in [
                "customers.view", "customers.create", "customers.edit",
                "leads.view", "leads.create", "leads.edit", "leads.assign", "leads.transfer",
                "calls.view", "calls.create",
                "callbacks.view", "callbacks.create", "callbacks.edit",
                "reports.view", "reports.export", "teams.view", "users.view"
            ]
        ]),
        "agent": ("Call Center Agent", "Cold calls, creates leads, records dispositions, schedules callbacks", [
            perm_objs[c] for c in [
                "customers.view", "customers.create", "customers.edit",
                "leads.view", "leads.create", "leads.edit", "leads.assign", "leads.transfer",
                "calls.view", "calls.create",
                "callbacks.view", "callbacks.create", "callbacks.edit",
                "teams.view"
            ]
        ])
    }

    role_objs = {}
    for rname, (disp, desc, perms) in roles.items():
        r = Role.query.filter_by(name=rname).first()
        if not r:
            r = Role(name=rname, display_name=disp, description=desc, is_system=True)
            r.permissions = perms
            db.session.add(r)
        else:
            r.permissions = perms
        role_objs[rname] = r
    db.session.commit()

    # 3. Lead Statuses
    statuses = [
        ("NEW", "New Lead", "#3B82F6", 1, False, False),
        ("CONTACTED", "Contacted", "#6366F1", 2, False, False),
        ("INTERESTED", "Interested", "#F59E0B", 3, False, False),
        ("FOLLOW_UP", "Follow-up Required", "#8B5CF6", 4, False, False),
        ("QUALIFIED", "Qualified", "#06B6D4", 5, False, False),
        ("CONVERTED", "Converted Sale", "#10B981", 6, True, True),
        ("NOT_INTERESTED", "Not Interested", "#64748B", 7, True, False),
        ("WRONG_NUMBER", "Wrong Number", "#94A3B8", 8, True, False),
        ("LOST", "Lost", "#EF4444", 9, True, False),
        ("DO_NOT_CONTACT", "Do Not Call", "#334155", 10, True, False),
    ]
    for code, name, color, sort_order, is_term, is_conv in statuses:
        if not LeadStatus.query.filter_by(code=code).first():
            db.session.add(LeadStatus(
                code=code, name=name, color=color, sort_order=sort_order,
                is_terminal=is_term, is_converted=is_conv
            ))
    db.session.commit()

    # 4. Call Dispositions
    dispositions = [
        ("INTERESTED", "Interested", "Positive", "#F59E0B", False, False, 1),
        ("CONVERTED", "Converted / Closed Won", "Positive", "#10B981", True, False, 2),
        ("CALLBACK_REQUESTED", "Callback Requested", "Neutral", "#3B82F6", False, True, 3),
        ("FOLLOW_UP_REQUIRED", "Follow-up Required", "Neutral", "#8B5CF6", False, True, 4),
        ("NO_ANSWER", "No Answer / Ringing", "Neutral", "#64748B", False, False, 5),
        ("BUSY", "Line Busy", "Neutral", "#64748B", False, False, 6),
        ("NOT_INTERESTED", "Not Interested", "Negative", "#EF4444", False, False, 7),
        ("WRONG_NUMBER", "Wrong Number", "Negative", "#94A3B8", False, False, 8),
        ("DO_NOT_CALL", "Do Not Call (DNC)", "Negative", "#334155", False, False, 9),
        ("ALREADY_CUSTOMER", "Already Customer", "Neutral", "#06B6D4", False, False, 10),
        ("INVALID_NUMBER", "Invalid / Disconnected", "Negative", "#DC2626", False, False, 11),
    ]
    for code, name, cat, col, is_conv, is_cb, order in dispositions:
        if not CallDisposition.query.filter_by(code=code).first():
            db.session.add(CallDisposition(
                code=code, name=name, category=cat, color=col,
                is_conversion=is_conv, is_callback=is_cb, sort_order=order
            ))
    db.session.commit()

    # 5. Default Tags
    tags = [
        ("HOT", "#EF4444"), ("WARM", "#F59E0B"), ("COLD", "#3B82F6"),
        ("URGENT", "#DC2626"), ("CARD-MACHINE", "#6366F1"), ("RESTAURANT", "#10B981"),
        ("SALON", "#EC4899"), ("RETAIL", "#8B5CF6"), ("HIGH-VALUE", "#F97316"),
        ("FUNDING", "#06B6D4")
    ]
    for name, color in tags:
        if not Tag.query.filter_by(name=name).first():
            db.session.add(Tag(name=name, color=color))
    db.session.commit()

    # 6. Default Users & Teams for Section 62 Acceptance Scenario
    # Super Admin
    admin_user = User.query.filter_by(username="admin").first()
    if not admin_user:
        admin_user = User(
            username="admin",
            email="admin@callpro-crm.com",
            full_name="Super Administrator",
            password_hash=hash_password("admin123"),
            role_id=role_objs["super_admin"].id,
            is_active=True
        )
        db.session.add(admin_user)
        db.session.commit()

    # Team Leaders
    tl_a = User.query.filter_by(username="leader_a").first()
    if not tl_a:
        tl_a = User(
            username="leader_a",
            email="leader_a@callpro-crm.com",
            full_name="Sarah Jenkins (TL A)",
            password_hash=hash_password("leader123"),
            role_id=role_objs["team_leader"].id,
            is_active=True
        )
        db.session.add(tl_a)

    tl_b = User.query.filter_by(username="leader_b").first()
    if not tl_b:
        tl_b = User(
            username="leader_b",
            email="leader_b@callpro-crm.com",
            full_name="Marcus Vance (TL B)",
            password_hash=hash_password("leader123"),
            role_id=role_objs["team_leader"].id,
            is_active=True
        )
        db.session.add(tl_b)
    db.session.commit()

    # Teams
    team_a = Team.query.filter_by(name="Team A").first()
    if not team_a:
        team_a = Team(name="Team A", description="Cold Calling Retail & Hospitality Team", team_leader_id=tl_a.id)
        db.session.add(team_a)

    team_b = Team.query.filter_by(name="Team B").first()
    if not team_b:
        team_b = Team(name="Team B", description="Commercial & Key Accounts Team", team_leader_id=tl_b.id)
        db.session.add(team_b)
    db.session.commit()

    # Add TLs to team memberships
    if not TeamMember.query.filter_by(team_id=team_a.id, user_id=tl_a.id).first():
        db.session.add(TeamMember(team_id=team_a.id, user_id=tl_a.id, is_primary=True))
    if not TeamMember.query.filter_by(team_id=team_b.id, user_id=tl_b.id).first():
        db.session.add(TeamMember(team_id=team_b.id, user_id=tl_b.id, is_primary=True))

    # Agents
    # Agent 1: Ali (Team A)
    agent_1 = User.query.filter_by(username="agent_ali").first()
    if not agent_1:
        agent_1 = User(
            username="agent_ali",
            email="ali@callpro-crm.com",
            full_name="Ali Khan",
            phone="07700900101",
            password_hash=hash_password("agent123"),
            role_id=role_objs["agent"].id,
            is_active=True
        )
        db.session.add(agent_1)
        db.session.flush()
        db.session.add(TeamMember(team_id=team_a.id, user_id=agent_1.id, is_primary=True))

    # Agent 2: Ahmed (Team A)
    agent_2 = User.query.filter_by(username="agent_ahmed").first()
    if not agent_2:
        agent_2 = User(
            username="agent_ahmed",
            email="ahmed@callpro-crm.com",
            full_name="Ahmed Raza",
            phone="07700900102",
            password_hash=hash_password("agent123"),
            role_id=role_objs["agent"].id,
            is_active=True
        )
        db.session.add(agent_2)
        db.session.flush()
        db.session.add(TeamMember(team_id=team_a.id, user_id=agent_2.id, is_primary=True))

    # Agent 3: Sara (Team B)
    agent_3 = User.query.filter_by(username="agent_sara").first()
    if not agent_3:
        agent_3 = User(
            username="agent_sara",
            email="sara@callpro-crm.com",
            full_name="Sara Miller",
            phone="07700900103",
            password_hash=hash_password("agent123"),
            role_id=role_objs["agent"].id,
            is_active=True
        )
        db.session.add(agent_3)
        db.session.flush()
        db.session.add(TeamMember(team_id=team_b.id, user_id=agent_3.id, is_primary=True))

    db.session.commit()

    # 7. Seed initial sample leads
    if Customer.query.count() == 0:
        now = datetime.now(timezone.utc)
        sample_customers = [
            {
                "full_name": "Liam Davies",
                "company_name": "Golden Grill Diner",
                "phone": "07700900222",
                "email": "liam@goldengrill.co.uk",
                "address": "45 High Street",
                "city": "Manchester",
                "postcode": "M1 4BT",
                "industry": "Restaurant",
                "lead_source": "Cold Call",
                "previous_provider": "Worldpay",
                "assigned_team_id": team_a.id,
                "assigned_agent_id": agent_1.id,
                "lead_status": "INTERESTED",
                "priority": "HIGH",
                "tags_list": ["HOT", "RESTAURANT", "CARD-MACHINE"],
                "notes": "Paying 1.7% transaction rates with Worldpay. Wants sub 1% deal."
            },
            {
                "full_name": "Sophie Turner",
                "company_name": "Apex Hair Studio",
                "phone": "07700900333",
                "email": "sophie@apexhair.co.uk",
                "address": "12 Regent Way",
                "city": "Birmingham",
                "postcode": "B2 5EP",
                "industry": "Salon",
                "lead_source": "Cold Call",
                "previous_provider": "Barclays",
                "assigned_team_id": team_a.id,
                "assigned_agent_id": agent_2.id,
                "lead_status": "CONTACTED",
                "priority": "MEDIUM",
                "tags_list": ["SALON", "WARM"],
                "notes": "Contract with Barclays ends in November."
            },
            {
                "full_name": "Oliver Twist",
                "company_name": "London Grocery Ltd",
                "phone": "07700900444",
                "email": "oliver@londongrocery.co.uk",
                "address": "88 Commercial Road",
                "city": "London",
                "postcode": "E1 1RD",
                "industry": "Retail",
                "lead_source": "Campaign",
                "previous_provider": "Square",
                "assigned_team_id": team_b.id,
                "assigned_agent_id": agent_3.id,
                "lead_status": "NEW",
                "priority": "HIGH",
                "tags_list": ["RETAIL", "HIGH-VALUE"],
                "notes": "High volume retail merchant, £45k monthly turnover."
            }
        ]

        for s in sample_customers:
            cust = Customer(**s, created_by_id=admin_user.id)
            db.session.add(cust)
            db.session.flush()

            # Add initial conversation
            convo = Conversation(
                customer_id=cust.id,
                agent_id=cust.assigned_agent_id,
                interaction_type="CALL",
                outcome="Interested" if cust.lead_status == "INTERESTED" else "Contacted",
                summary=cust.notes or "Initial contact made",
                next_action="Review proposal"
            )
            db.session.add(convo)

            # Schedule sample callback for Liam Davies
            if cust.lead_status == "INTERESTED":
                cb_dt = now + timedelta(days=1, hours=2)
                cb = Callback(
                    customer_id=cust.id,
                    agent_id=cust.assigned_agent_id,
                    team_id=cust.assigned_team_id,
                    scheduled_at=cb_dt,
                    reason="Discuss contract comparison rates",
                    priority="HIGH",
                    notes="Follow up with Liam after business partner review."
                )
                db.session.add(cb)
                cust.next_callback_date = cb_dt

        db.session.commit()
    print("Database seeding completed successfully.")
