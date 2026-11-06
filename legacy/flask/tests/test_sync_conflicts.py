import unittest
from datetime import datetime, timezone, timedelta
from app import create_app
from app.models import db, User, Customer, Call, Callback, SyncQueue, SyncConflict
from app.config import Config
from app.seed import seed_database
from app.services.sync_service import process_sync_batch

class TestConfig(Config):
    TESTING = True
    SQLALCHEMY_DATABASE_URI = "sqlite:///:memory:"

class SyncConflictTestCase(unittest.TestCase):
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

    def test_offline_batch_sync_pipeline(self):
        agent_ali = User.query.filter_by(username="agent_ali").first()

        batch_items = [
            {
                "local_id": "loc_lead_001",
                "operation": "CREATE",
                "entity_type": "CUSTOMER",
                "payload": {
                    "full_name": "David Beckham",
                    "company_name": "Inter Miami Cafe",
                    "phone": "07799887766",
                    "email": "david@intermiami.com",
                    "lead_status": "INTERESTED"
                },
                "client_timestamp": datetime.now(timezone.utc).isoformat()
            },
            {
                "local_id": "loc_call_001",
                "operation": "CREATE",
                "entity_type": "CALL",
                "payload": {
                    "customer_id": "loc_lead_001", # Referencing local id!
                    "duration_seconds": 185,
                    "outcome": "Interested",
                    "notes": "Discussed cafe terminal options."
                },
                "client_timestamp": datetime.now(timezone.utc).isoformat()
            },
            {
                "local_id": "loc_cb_001",
                "operation": "CREATE",
                "entity_type": "CALLBACK",
                "payload": {
                    "customer_id": "loc_lead_001",
                    "scheduled_at": (datetime.now(timezone.utc) + timedelta(days=1)).strftime("%Y-%m-%d %H:%M"),
                    "reason": "Finalize agreement",
                    "priority": "HIGH"
                },
                "client_timestamp": datetime.now(timezone.utc).isoformat()
            }
        ]

        result = process_sync_batch(agent_ali, device_id="device_laptop_01", items=batch_items)

        self.assertEqual(result["processed"], 3)
        self.assertEqual(len(result["errors"]), 0)
        self.assertIn("loc_lead_001", result["id_mapping"])

        server_cust_id = result["id_mapping"]["loc_lead_001"]
        cust = Customer.query.get(server_cust_id)
        self.assertIsNotNone(cust)
        self.assertEqual(cust.full_name, "David Beckham")

        # Verify call logged and linked to customer
        call = Call.query.filter_by(customer_id=cust.id).first()
        self.assertIsNotNone(call)
        self.assertEqual(call.duration_seconds, 185)

        # Verify callback scheduled and linked to customer
        cb = Callback.query.filter_by(customer_id=cust.id).first()
        self.assertIsNotNone(cb)
        self.assertEqual(cb.reason, "Finalize agreement")

    def test_sync_conflict_detection_preserves_history(self):
        agent_ali = User.query.filter_by(username="agent_ali").first()
        cust = Customer.query.filter_by(company_name="Golden Grill Diner").first()

        # Simulate customer updated on server 1 hour ago
        now = datetime.now(timezone.utc)
        cust.updated_at = now - timedelta(minutes=10)
        db.session.commit()

        # Offline client had older snapshot (30 minutes ago)
        older_ts = (now - timedelta(minutes=30)).isoformat()

        batch_items = [
            {
                "local_id": "loc_update_001",
                "operation": "UPDATE",
                "entity_type": "CUSTOMER",
                "entity_id": cust.id,
                "payload": {
                    "notes": "Offline note added by agent."
                },
                "client_timestamp": older_ts
            }
        ]

        result = process_sync_batch(agent_ali, device_id="device_laptop_01", items=batch_items)
        self.assertEqual(len(result["conflicts"]), 1)

        # Verify conflict logged in database
        conflicts = SyncConflict.query.filter_by(entity_id=cust.id).all()
        self.assertGreaterEqual(len(conflicts), 1)

if __name__ == "__main__":
    unittest.main()
