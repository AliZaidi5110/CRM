import unittest
from app import create_app
from app.models import db, User, Customer
from app.config import Config
from app.seed import seed_database
from app.services.customer_service import check_duplicates, search_customers, create_customer_record

class TestConfig(Config):
    TESTING = True
    SQLALCHEMY_DATABASE_URI = "sqlite:///:memory:"

class CustomerLeadTestCase(unittest.TestCase):
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

    def test_create_customer(self):
        agent_ali = User.query.filter_by(username="agent_ali").first()
        data = {
            "full_name": "Marcus Rashford",
            "company_name": "Rashford Foundation",
            "phone": "07711223344",
            "email": "marcus@foundation.org",
            "postcode": "M16 0RA",
            "lead_source": "Cold Call",
            "priority": "HIGH"
        }
        cust = create_customer_record(data, agent_ali)
        self.assertIsNotNone(cust.id)
        self.assertTrue(cust.code.startswith("CUST-"))
        self.assertEqual(cust.assigned_agent_id, agent_ali.id)
        self.assertEqual(cust.lead_status, "NEW")

    def test_duplicate_detection(self):
        # Phone duplicate check
        dupes = check_duplicates(phone="07700 900 222") # Liam Davies phone
        self.assertTrue(len(dupes) > 0)
        self.assertEqual(dupes[0]["company_name"], "Golden Grill Diner")

        # Company name duplicate check
        dupes_comp = check_duplicates(company_name="Apex Hair Studio")
        self.assertTrue(len(dupes_comp) > 0)
        self.assertEqual(dupes_comp[0]["full_name"], "Sophie Turner")

    def test_scoped_search(self):
        agent_ali = User.query.filter_by(username="agent_ali").first()
        agent_sara = User.query.filter_by(username="agent_sara").first()

        # Agent Ali searches "Golden"
        res_ali = search_customers(agent_ali, search_text="Golden")
        self.assertEqual(res_ali["total"], 1)

        # Agent Sara searches "Golden" -> 0 results (belongs to Team A)
        res_sara = search_customers(agent_sara, search_text="Golden")
        self.assertEqual(res_sara["total"], 0)

if __name__ == "__main__":
    unittest.main()
