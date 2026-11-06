import unittest
from app import create_app
from app.models import db, User, Role, Customer, Team
from app.config import Config
from app.seed import seed_database
from app.services.auth_service import authenticate_user, create_token, verify_password, hash_password
from app.services.rbac_service import apply_customer_scope, can_access_customer

class TestConfig(Config):
    TESTING = True
    SQLALCHEMY_DATABASE_URI = "sqlite:///:memory:"

class AuthRBACTestCase(unittest.TestCase):
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

    def test_password_hashing(self):
        pw = "SuperSecure123!"
        hashed = hash_password(pw)
        self.assertNotEqual(pw, hashed)
        self.assertTrue(verify_password(pw, hashed))
        self.assertFalse(verify_password("WrongPassword", hashed))

    def test_authentication_success(self):
        user, err = authenticate_user("admin", "admin123")
        self.assertIsNone(err)
        self.assertIsNotNone(user)
        self.assertEqual(user.username, "admin")

    def test_authentication_failed(self):
        user, err = authenticate_user("admin", "wrong_password")
        self.assertIsNone(user)
        self.assertIn("Invalid username or password", err)

    def test_jwt_token_generation_and_claims(self):
        user = User.query.filter_by(username="agent_ali").first()
        token = create_token(user)
        self.assertIsInstance(token, str)

        from app.services.auth_service import decode_token
        decoded = decode_token(token)
        self.assertEqual(decoded["sub"], user.id)
        self.assertEqual(decoded["username"], "agent_ali")
        self.assertEqual(decoded["role"], "agent")
        self.assertIn("leads.assign", decoded["permissions"])

    def test_rbac_data_scoping(self):
        agent_ali = User.query.filter_by(username="agent_ali").first()
        agent_sara = User.query.filter_by(username="agent_sara").first()
        tl_a = User.query.filter_by(username="leader_a").first()
        admin = User.query.filter_by(username="admin").first()

        team_a = Team.query.filter_by(name="Team A").first()
        team_b = Team.query.filter_by(name="Team B").first()

        # Customer 1 belongs to Agent Ali (Team A)
        cust_a = Customer.query.filter_by(company_name="Golden Grill Diner").first()
        # Customer 3 belongs to Agent Sara (Team B)
        cust_b = Customer.query.filter_by(company_name="London Grocery Ltd").first()

        # Agent Ali can access his lead
        self.assertTrue(can_access_customer(agent_ali, cust_a))
        # Agent Ali CANNOT access Team B lead
        self.assertFalse(can_access_customer(agent_ali, cust_b))

        # Team Leader A can access Team A lead
        self.assertTrue(can_access_customer(tl_a, cust_a))
        # Team Leader A CANNOT access Team B lead
        self.assertFalse(can_access_customer(tl_a, cust_b))

        # Super Admin can access all leads
        self.assertTrue(can_access_customer(admin, cust_a))
        self.assertTrue(can_access_customer(admin, cust_b))

if __name__ == "__main__":
    unittest.main()
