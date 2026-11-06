import unittest
from datetime import datetime, timezone, timedelta
from app import create_app
from app.models import db, User, Team, TeamMember, Customer, Call, Callback, Conversation, LeadAssignment
from app.config import Config
from app.seed import seed_database
from app.services.auth_service import authenticate_user, create_token
from app.services.customer_service import search_customers, create_customer_record
from app.services.call_service import log_call_record
from app.services.callback_service import schedule_new_callback
from app.services.assignment_service import assign_lead_to_team_leader, reassign_lead_to_agent
from app.services.sync_service import process_sync_batch
from app.services.report_service import get_admin_dashboard_metrics

class TestConfig(Config):
    TESTING = True
    SQLALCHEMY_DATABASE_URI = "sqlite:///:memory:"

class AcceptanceWorkflowTestCase(unittest.TestCase):
    """
    Simulates Section 62: FINAL ACCEPTANCE TEST step-by-step
    """
    def setUp(self):
        self.app = create_app(TestConfig)
        self.app_context = self.app.app_context()
        self.app_context.push()
        db.create_all()
        seed_database()

    def tearDown(self):
        db.session.remove()
        db.drop_all()
        self.app_context.pop()

    def test_section_62_complete_lifecycle(self):
        # Step 1 & 2: Verification of Admin, Teams, Team Leaders, and Agents
        admin = User.query.filter_by(username="admin").first()
        tl_a = User.query.filter_by(username="leader_a").first()
        tl_b = User.query.filter_by(username="leader_b").first()
        agent_1 = User.query.filter_by(username="agent_ali").first()
        agent_2 = User.query.filter_by(username="agent_ahmed").first()
        agent_3 = User.query.filter_by(username="agent_sara").first()

        self.assertIsNotNone(admin)
        self.assertIsNotNone(tl_a)
        self.assertIsNotNone(tl_b)
        self.assertIsNotNone(agent_1)
        self.assertIsNotNone(agent_2)
        self.assertIsNotNone(agent_3)

        # Step 3: Agent 1 logs in
        user_auth, err = authenticate_user("agent_ali", "agent123")
        self.assertIsNotNone(user_auth)
        self.assertEqual(user_auth.id, agent_1.id)
        token_agent1 = create_token(user_auth)
        self.assertIsNotNone(token_agent1)

        # Step 4: Agent 1 searches: "ABC Restaurant" (no customer exists)
        search_res = search_customers(agent_1, search_text="ABC Restaurant")
        self.assertEqual(search_res["total"], 0)

        # Step 5: Agent 1 creates the lead
        lead_data = {
            "full_name": "John Smith",
            "company_name": "ABC Restaurant",
            "phone": "07712345678",
            "email": "john@abcrestaurant.com",
            "industry": "Restaurant",
            "lead_source": "Cold Call",
            "priority": "HIGH",
            "notes": "Interested in card machine rates."
        }
        customer = create_customer_record(lead_data, agent_1)
        self.assertIsNotNone(customer.id)
        self.assertEqual(customer.company_name, "ABC Restaurant")
        self.assertEqual(customer.assigned_agent_id, agent_1.id)
        self.assertEqual(customer.lead_status, "NEW")

        # Step 6: Agent 1 calls the customer, records Outcome: Interested
        tomorrow_str = (datetime.now(timezone.utc) + timedelta(days=1)).strftime("%Y-%m-%d")
        call_payload = {
            "duration_seconds": 195,
            "outcome": "Interested",
            "notes": "Customer is interested in changing their current provider and requested a callback tomorrow.",
            "next_action": "Call back with rates proposal",
            "callback_date": tomorrow_str,
            "callback_time": "11:30"
        }
        call, convo = log_call_record(customer.id, agent_1, call_payload)
        self.assertEqual(call.outcome, "Interested")
        self.assertEqual(customer.lead_status, "INTERESTED")

        # Step 7: Callback scheduled for tomorrow 11:30 AM
        cb = Callback.query.filter_by(customer_id=customer.id).first()
        self.assertIsNotNone(cb)
        self.assertIn("11:30", cb.to_dict()["scheduled_formatted"])

        # Step 8: Agent 1 assigns the lead to Team Leader A
        asgn1 = assign_lead_to_team_leader(customer.id, agent_1, {
            "reason": "Special discount approval needed for ABC Restaurant",
            "priority": "HIGH",
            "notes": "High monthly turnover £60k."
        })
        self.assertEqual(asgn1.to_user_id, tl_a.id)
        self.assertEqual(customer.assigned_agent_id, tl_a.id)

        # Step 9: Team Leader A logs in, sees NEW LEAD "ABC Restaurant" with history
        tl_auth, err = authenticate_user("leader_a", "leader123")
        self.assertIsNotNone(tl_auth)

        tl_view_cust = Customer.query.get(customer.id)
        self.assertEqual(tl_view_cust.company_name, "ABC Restaurant")
        self.assertEqual(tl_view_cust.calls.count(), 1)
        self.assertEqual(tl_view_cust.callbacks.count(), 1)
        self.assertGreaterEqual(tl_view_cust.conversations.count(), 2)

        # Step 10: Team Leader A assigns the lead to Agent 2
        asgn2 = reassign_lead_to_agent(customer.id, tl_a, {
            "target_agent_id": agent_2.id,
            "reason": "Assigned to Agent 2 to close deal",
            "notes": "Proceed with 0.85% transaction rate."
        })
        self.assertEqual(asgn2.to_user_id, agent_2.id)
        self.assertEqual(customer.assigned_agent_id, agent_2.id)

        # Step 11: Agent 2 logs in, sees the lead and COMPLETE HISTORY
        ag2_auth, err = authenticate_user("agent_ahmed", "agent123")
        self.assertIsNotNone(ag2_auth)

        ag2_lead = Customer.query.get(customer.id)
        self.assertEqual(ag2_lead.assigned_agent_id, agent_2.id)
        self.assertEqual(ag2_lead.calls.count(), 1)
        self.assertEqual(ag2_lead.callbacks.count(), 1)

        # Step 12: Agent 2 calls the customer, changes status to CONVERTED
        call2_payload = {
            "duration_seconds": 320,
            "outcome": "Converted",
            "notes": "Merchant signed contract for 2 terminals at 0.85%. Won deal!",
            "next_action": "Onboard merchant terminal dispatch"
        }
        call2, convo2 = log_call_record(customer.id, agent_2, call2_payload)
        self.assertEqual(customer.lead_status, "CONVERTED")
        self.assertEqual(customer.customer_type, "Customer")

        # Step 13: Admin logs in, verifies complete call history, conversations, assignments, and conversion
        admin_metrics = get_admin_dashboard_metrics(date_range="today")
        self.assertGreaterEqual(admin_metrics["total_converted"], 1)

        cust_admin_view = Customer.query.get(customer.id)
        self.assertEqual(cust_admin_view.lead_status, "CONVERTED")
        self.assertEqual(cust_admin_view.calls.count(), 2)
        self.assertGreaterEqual(cust_admin_view.assignments.count(), 2)
        self.assertGreaterEqual(cust_admin_view.conversations.count(), 3)

        # Step 14: Disconnect Internet (Offline simulation)
        # Agent 2 creates another lead, adds a call note, schedules a callback offline
        offline_batch = [
            {
                "local_id": "offline_lead_abc_2",
                "operation": "CREATE",
                "entity_type": "CUSTOMER",
                "payload": {
                    "full_name": "Tony Stark",
                    "company_name": "Stark Electronics",
                    "phone": "07755443322",
                    "lead_status": "INTERESTED",
                    "industry": "Retail"
                },
                "client_timestamp": datetime.now(timezone.utc).isoformat()
            },
            {
                "local_id": "offline_call_abc_2",
                "operation": "CREATE",
                "entity_type": "CALL",
                "payload": {
                    "customer_id": "offline_lead_abc_2",
                    "duration_seconds": 150,
                    "outcome": "Interested",
                    "notes": "Logged offline during network interruption."
                },
                "client_timestamp": datetime.now(timezone.utc).isoformat()
            },
            {
                "local_id": "offline_cb_abc_2",
                "operation": "CREATE",
                "entity_type": "CALLBACK",
                "payload": {
                    "customer_id": "offline_lead_abc_2",
                    "scheduled_at": (datetime.now(timezone.utc) + timedelta(days=2)).strftime("%Y-%m-%d %H:%M"),
                    "reason": "Offline scheduled follow-up"
                },
                "client_timestamp": datetime.now(timezone.utc).isoformat()
            }
        ]

        # Step 15: Reconnect Internet -> Sync queue processed
        sync_result = process_sync_batch(agent_2, device_id="agent_2_laptop", items=offline_batch)
        self.assertEqual(sync_result["processed"], 3)
        self.assertEqual(len(sync_result["errors"]), 0)

        # Admin can now see the offline-created information
        stark_lead = Customer.query.filter_by(company_name="Stark Electronics").first()
        self.assertIsNotNone(stark_lead)
        self.assertEqual(stark_lead.calls.count(), 1)
        self.assertEqual(stark_lead.callbacks.count(), 1)
        self.assertEqual(stark_lead.calls.first().notes, "Logged offline during network interruption.")

if __name__ == "__main__":
    unittest.main()
