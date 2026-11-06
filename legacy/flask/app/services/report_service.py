from datetime import datetime, timezone, timedelta
from sqlalchemy import func, and_, or_
from ..models import db, Customer, Call, Callback, User, Team, TeamMember

def get_date_bounds(date_range_str: str, start_date_str: str = None, end_date_str: str = None):
    now = datetime.now(timezone.utc)
    today_start = datetime(now.year, now.month, now.day, 0, 0, 0)
    today_end = datetime(now.year, now.month, now.day, 23, 59, 59)

    if date_range_str == "today":
        return today_start, today_end
    elif date_range_str == "yesterday":
        y_start = today_start - timedelta(days=1)
        y_end = today_end - timedelta(days=1)
        return y_start, y_end
    elif date_range_str == "this_week":
        w_start = today_start - timedelta(days=today_start.weekday())
        return w_start, today_end
    elif date_range_str == "this_month":
        m_start = datetime(now.year, now.month, 1, 0, 0, 0)
        return m_start, today_end
    elif date_range_str == "custom" and start_date_str and end_date_str:
        s = datetime.strptime(start_date_str, "%Y-%m-%d")
        e = datetime.strptime(end_date_str, "%Y-%m-%d").replace(hour=23, minute=59, second=59)
        return s, e
    
    # Default to 30 days
    return today_start - timedelta(days=30), today_end

def get_agent_dashboard_metrics(agent_user: User, date_range: str = "today"):
    start_dt, end_dt = get_date_bounds(date_range)
    now = datetime.now(timezone.utc)

    # Assigned leads
    leads_q = Customer.query.filter(
        Customer.deleted_at.is_(None),
        Customer.assigned_agent_id == agent_user.id
    )
    total_assigned = leads_q.count()
    new_leads = leads_q.filter(Customer.lead_status == "NEW").count()
    interested_leads = leads_q.filter(Customer.lead_status == "INTERESTED").count()
    converted_leads = leads_q.filter(Customer.lead_status == "CONVERTED").count()
    lost_leads = leads_q.filter(Customer.lead_status.in_(["LOST", "NOT_INTERESTED"])).count()

    conversion_rate = round((converted_leads / total_assigned * 100), 1) if total_assigned > 0 else 0.0

    # Calls
    calls_q = Call.query.filter(
        Call.agent_id == agent_user.id,
        Call.created_at >= start_dt,
        Call.created_at <= end_dt
    )
    calls_count = calls_q.count()
    calls_total_sec = db.session.query(func.coalesce(func.sum(Call.duration_seconds), 0)).filter(
        Call.agent_id == agent_user.id,
        Call.created_at >= start_dt,
        Call.created_at <= end_dt
    ).scalar()

    # Callbacks
    cb_q = Callback.query.join(Customer).filter(
        Customer.deleted_at.is_(None),
        Callback.agent_id == agent_user.id
    )
    today_start = datetime(now.year, now.month, now.day, 0, 0, 0)
    today_end = datetime(now.year, now.month, now.day, 23, 59, 59)

    callbacks_today = cb_q.filter(
        Callback.status == "PENDING",
        Callback.scheduled_at >= today_start,
        Callback.scheduled_at <= today_end
    ).count()

    overdue_callbacks = cb_q.filter(
        Callback.status == "PENDING",
        Callback.scheduled_at < now
    ).count()

    # Recent activities
    recent_calls = Call.query.filter_by(agent_id=agent_user.id).order_by(Call.created_at.desc()).limit(5).all()

    return {
        "user_role": "agent",
        "total_assigned_leads": total_assigned,
        "new_leads": new_leads,
        "interested_leads": interested_leads,
        "converted_leads": converted_leads,
        "lost_leads": lost_leads,
        "conversion_rate": conversion_rate,
        "calls_period": calls_count,
        "calls_duration_seconds": calls_total_sec,
        "callbacks_today": callbacks_today,
        "overdue_callbacks": overdue_callbacks,
        "recent_calls": [c.to_dict() for c in recent_calls]
    }

def get_team_leader_dashboard_metrics(leader_user: User, date_range: str = "today"):
    start_dt, end_dt = get_date_bounds(date_range)
    now = datetime.now(timezone.utc)

    led_teams = Team.query.filter(Team.team_leader_id == leader_user.id, Team.deleted_at.is_(None)).all()
    team_ids = [t.id for t in led_teams]
    if leader_user.primary_team and leader_user.primary_team.id not in team_ids:
        team_ids.append(leader_user.primary_team.id)

    # Agents in team
    members = TeamMember.query.filter(TeamMember.team_id.in_(team_ids)).all()
    member_user_ids = [m.user_id for m in members]

    # Leads
    team_leads_q = Customer.query.filter(
        Customer.deleted_at.is_(None),
        Customer.assigned_team_id.in_(team_ids)
    )
    total_leads = team_leads_q.count()
    new_leads = team_leads_q.filter(Customer.lead_status == "NEW").count()
    interested_leads = team_leads_q.filter(Customer.lead_status == "INTERESTED").count()
    converted_leads = team_leads_q.filter(Customer.lead_status == "CONVERTED").count()
    lost_leads = team_leads_q.filter(Customer.lead_status.in_(["LOST", "NOT_INTERESTED"])).count()
    conversion_rate = round((converted_leads / total_leads * 100), 1) if total_leads > 0 else 0.0

    # Calls
    team_calls = Call.query.filter(
        Call.team_id.in_(team_ids),
        Call.created_at >= start_dt,
        Call.created_at <= end_dt
    ).count()

    # Callbacks
    cb_q = Callback.query.join(Customer).filter(
        Customer.deleted_at.is_(None),
        Callback.team_id.in_(team_ids)
    )
    callbacks_today = cb_q.filter(
        Callback.status == "PENDING",
        Callback.scheduled_at >= datetime(now.year, now.month, now.day, 0, 0, 0),
        Callback.scheduled_at <= datetime(now.year, now.month, now.day, 23, 59, 59)
    ).count()
    overdue_callbacks = cb_q.filter(
        Callback.status == "PENDING",
        Callback.scheduled_at < now
    ).count()

    # Agent Leaderboard
    agent_stats = []
    agents = User.query.filter(User.id.in_(member_user_ids), User.deleted_at.is_(None)).all()
    for ag in agents:
        ag_leads = Customer.query.filter_by(assigned_agent_id=ag.id, deleted_at=None).count()
        ag_converts = Customer.query.filter_by(assigned_agent_id=ag.id, lead_status="CONVERTED", deleted_at=None).count()
        ag_calls = Call.query.filter(Call.agent_id == ag.id, Call.created_at >= start_dt, Call.created_at <= end_dt).count()
        ag_rate = round((ag_converts / ag_leads * 100), 1) if ag_leads > 0 else 0.0
        agent_stats.append({
            "agent_id": ag.id,
            "agent_name": ag.full_name,
            "username": ag.username,
            "leads_count": ag_leads,
            "calls_count": ag_calls,
            "conversions": ag_converts,
            "conversion_rate": ag_rate
        })

    agent_stats.sort(key=lambda x: x["conversions"], reverse=True)

    return {
        "user_role": "team_leader",
        "team_count": len(team_ids),
        "total_team_members": len(member_user_ids),
        "total_team_leads": total_leads,
        "new_leads": new_leads,
        "interested_leads": interested_leads,
        "converted_leads": converted_leads,
        "lost_leads": lost_leads,
        "team_conversion_rate": conversion_rate,
        "team_calls_period": team_calls,
        "callbacks_today": callbacks_today,
        "overdue_callbacks": overdue_callbacks,
        "agent_leaderboard": agent_stats
    }

def get_admin_dashboard_metrics(date_range: str = "today"):
    start_dt, end_dt = get_date_bounds(date_range)
    now = datetime.now(timezone.utc)

    total_users = User.query.filter_by(deleted_at=None).count()
    total_teams = Team.query.filter_by(deleted_at=None).count()
    total_leads = Customer.query.filter_by(deleted_at=None).count()
    total_converted = Customer.query.filter_by(lead_status="CONVERTED", deleted_at=None).count()

    conversion_rate = round((total_converted / total_leads * 100), 1) if total_leads > 0 else 0.0

    calls_period = Call.query.filter(Call.created_at >= start_dt, Call.created_at <= end_dt).count()
    calls_today = Call.query.filter(
        Call.created_at >= datetime(now.year, now.month, now.day, 0, 0, 0),
        Call.created_at <= datetime(now.year, now.month, now.day, 23, 59, 59)
    ).count()

    # Conversion Funnel
    funnel = {
        "NEW": Customer.query.filter_by(lead_status="NEW", deleted_at=None).count(),
        "CONTACTED": Customer.query.filter_by(lead_status="CONTACTED", deleted_at=None).count(),
        "INTERESTED": Customer.query.filter_by(lead_status="INTERESTED", deleted_at=None).count(),
        "FOLLOW_UP": Customer.query.filter_by(lead_status="FOLLOW_UP", deleted_at=None).count(),
        "QUALIFIED": Customer.query.filter_by(lead_status="QUALIFIED", deleted_at=None).count(),
        "CONVERTED": total_converted,
        "LOST": Customer.query.filter(Customer.lead_status.in_(["LOST", "NOT_INTERESTED"]), Customer.deleted_at.is_(None)).count()
    }

    # Lead sources
    sources = db.session.query(Customer.lead_source, func.count(Customer.id)).filter(
        Customer.deleted_at.is_(None)
    ).group_by(Customer.lead_source).all()
    lead_sources = [{"source": s[0] or "Unknown", "count": s[1]} for s in sources]

    # Team Performance
    teams = Team.query.filter_by(deleted_at=None).all()
    team_performance = []
    for tm in teams:
        t_leads = Customer.query.filter_by(assigned_team_id=tm.id, deleted_at=None).count()
        t_converts = Customer.query.filter_by(assigned_team_id=tm.id, lead_status="CONVERTED", deleted_at=None).count()
        t_calls = Call.query.filter(Call.team_id == tm.id, Call.created_at >= start_dt, Call.created_at <= end_dt).count()
        t_rate = round((t_converts / t_leads * 100), 1) if t_leads > 0 else 0.0
        team_performance.append({
            "team_id": tm.id,
            "team_name": tm.name,
            "team_leader": tm.team_leader.full_name if tm.team_leader else "Unassigned",
            "leads": t_leads,
            "calls": t_calls,
            "conversions": t_converts,
            "conversion_rate": t_rate
        })

    return {
        "user_role": "super_admin",
        "total_users": total_users,
        "total_teams": total_teams,
        "total_leads": total_leads,
        "total_converted": total_converted,
        "conversion_rate": conversion_rate,
        "calls_today": calls_today,
        "calls_period": calls_period,
        "funnel": funnel,
        "lead_sources": lead_sources,
        "team_performance": team_performance
    }
