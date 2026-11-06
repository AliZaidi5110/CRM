import unittest
from datetime import datetime, timezone, timedelta
from app import create_app
from app.models import db, User, Customer, Call, Callback, Conversation
from app.config import Config
from app.seed import seed_database
from app.services.call_service import log_call_record
from app.services.callback_service import schedule_new_callback, get_callbacks_for_user, complete_callback

class TestConfig(Config):
    TESTING = True
    SQLALCHEMY_DATABASE_URI = "sqlite:///:memory:"

class CallingCallbackTestCase(unittest.TestCase):
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

    def test_call_logging_and_conversation_timeline(self):
        agent_ali = User.query.filter_by(username="agent_ali").first()
        cust = Customer.query.filter_by(company_name="Golden Grill Diner").first()

        call_data = {
            "duration_seconds": 272, # 04:32
            "outcome": "Interested",
            "notes": "Customer currently using another card machine provider. Asked for better transaction rates.",
            "next_action": "Send pricing sheet",
            "callback_date": (datetime.now(timezone.utc) + timedelta(days=2)).strftime("%Y-%m-%d"),
            "callback_time": "15:00"
        }

        call, convo = log_call_record(cust.id, agent_ali, call_data)
        self.assertIsNotNone(call.id)
        self.assertEqual(call.duration_seconds, 272)
        self.assertEqual(call.outcome, "Interested")

        # Check Customer status updated
        self.assertEqual(cust.lead_status, "INTERESTED")
        self.assertIsNotNone(cust.last_contact_date)

        # Check Conversation timeline entry
        self.assertEqual(convo.customer_id, cust.id)
        self.assertEqual(convo.agent_id, agent_ali.id)
        self.assertIn("Worldpay", cust.notes or "")
        self.assertIn("rates", convo.summary)

    def test_callback_lifecycle(self):
        agent_ali = User.query.filter_by(username="agent_ali").first()
        cust = Customer.query.filter_by(company_name="Golden Grill Diner").first()

        now = datetime.now(timezone.utc)
        sched_time = (now + timedelta(hours=2)).strftime("%Y-%m-%dT%H:%M")

        cb = schedule_new_callback(cust.id, agent_ali, {
            "scheduled_at": sched_time,
            "reason": "Discuss rates with business partner",
            "priority": "HIGH"
        })
        self.assertIsNotNone(cb.id)
        self.assertEqual(cb.status, "PENDING")

        callbacks_data = get_callbacks_for_user(agent_ali)
        self.assertGreaterEqual(callbacks_data["counts"]["total_pending"], 1)

        # Complete callback
        completed = complete_callback(cb.id, agent_ali, notes="Agreed to rate reduction")
        self.assertEqual(completed.status, "COMPLETED")

if __name__ == "__main__":
    unittest.main()
