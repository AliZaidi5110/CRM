import unittest
from app import create_app
from app.models import db, User, Customer, Conversation, AuditLog
from app.config import Config
from app.seed import seed_database
from app.services.auth_service import create_token

class TestConfig(Config):
    TESTING = True
    SQLALCHEMY_DATABASE_URI = "sqlite:///:memory:"

class RebuttalsAndClosingTestCase(unittest.TestCase):
    def setUp(self):
        self.app = create_app(TestConfig)
        self.client = self.app.test_client()
        self.app_context = self.app.app_context()
        self.app_context.push()
        db.create_all()
        seed_database()

    def tearDown(self):
        db.session.remove()
        db.drop_all()
        self.app_context.pop()

    def get_auth_header(self, username="agent_ali"):
        user = User.query.filter_by(username=username).first()
        token = create_token(user)
        return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    def test_rebuttals_catalog_endpoints(self):
        headers = self.get_auth_header("agent_ali")
        res = self.client.get("/api/rebuttals", headers=headers)
        self.assertEqual(res.status_code, 200)
        data = res.get_json()

        # Check all 15 core rebuttals are present
        rebuttals = data.get("rebuttals", [])
        self.assertEqual(len(rebuttals), 15)
        
        # Verify specific core objection matches
        ids = [r["id"] for r in rebuttals]
        self.assertIn("happy_with_provider", ids)
        self.assertIn("not_interested", ids)
        self.assertIn("in_contract", ids)
        self.assertIn("use_worldpay", ids)
        self.assertIn("use_sumup", ids)
        self.assertIn("rate_too_high", ids)
        self.assertIn("send_email", ids)
        self.assertIn("speak_to_partner", ids)
        self.assertIn("dont_want_change_machines", ids)
        self.assertIn("dont_pay_rental", ids)
        self.assertIn("how_much_cost", ids)
        self.assertIn("barely_take_cards", ids)
        self.assertIn("too_busy", ids)
        self.assertIn("call_me_later", ids)
        self.assertIn("not_decision_maker", ids)

        # Verify call flows & rules
        call_flows = data.get("call_flows", {})
        self.assertIn("Ali", call_flows["opening"]["script"])
        self.assertEqual(len(call_flows["branches"]), 4)
        self.assertEqual(len(call_flows["closer_rules"]), 5)

        # Verify pricing plans
        pricing = data.get("pricing_plans", {})
        self.assertIn("shift4", pricing)
        self.assertEqual(pricing["shift4"]["rates"]["tier_under_5k"], 1.25)
        self.assertEqual(pricing["shift4"]["rates"]["tier_over_5k"], 0.70)
        self.assertEqual(pricing["mypos"]["rates"]["debit"], 0.32)

    def test_pricing_calculator_tiers(self):
        headers = self.get_auth_header("agent_ali")
        
        # Tier 1: Under £5,000 -> 1.25%
        calc_under_5k = {
            "turnover": 4000,
            "current_provider": "Worldpay",
            "current_rate": 1.75,
            "current_rental": 25.0
        }
        res1 = self.client.post("/api/rebuttals/calculate", json=calc_under_5k, headers=headers)
        self.assertEqual(res1.status_code, 200)
        data1 = res1.get_json()
        self.assertEqual(data1["shift4"]["applied_rate"], 1.25)
        self.assertEqual(data1["shift4"]["monthly_cost"], 50.00)
        self.assertEqual(data1["current_provider"]["monthly_cost"], 95.00) # (4000 * 1.75%) + 25 = 70 + 25 = 95
        self.assertGreater(data1["shift4"]["annual_savings"], 0)

        # Tier 2: £5,000 and above -> 0.70%
        calc_over_5k = {
            "turnover": 10000,
            "current_provider": "SumUp",
            "current_rate": 1.69,
            "current_rental": 0.0
        }
        res2 = self.client.post("/api/rebuttals/calculate", json=calc_over_5k, headers=headers)
        self.assertEqual(res2.status_code, 200)
        data2 = res2.get_json()
        self.assertEqual(data2["shift4"]["applied_rate"], 0.70)
        self.assertEqual(data2["shift4"]["monthly_cost"], 70.00)
        self.assertEqual(data2["current_provider"]["monthly_cost"], 169.00)
        # Annual savings: (169 - 70) * 12 = 99 * 12 = 1,188
        self.assertEqual(data2["shift4"]["annual_savings"], 1188.00)

    def test_deal_closing_validation_and_success(self):
        agent_ali = User.query.filter_by(username="agent_ali").first()
        customer = Customer.query.filter_by(assigned_agent_id=agent_ali.id).first()
        self.assertIsNotNone(customer)
        headers = self.get_auth_header("agent_ali")

        # 1. Test validation failure (invalid sort code)
        invalid_payload = {
            "business_details": {"business_name": "Test Bakery Ltd", "entity_type": "Ltd"},
            "personal_details": {"full_name": "Oliver Twist", "mobile_number": "07111222333"},
            "bank_details": {"bank_name": "Barclays", "account_title": "Test Bakery Ltd", "sort_code": "12-3", "account_number": "12345678"},
            "selected_plan": {"provider_plan": "Shift4", "monthly_turnover": 6000}
        }
        res_fail = self.client.post(f"/api/customers/{customer.id}/close-deal", json=invalid_payload, headers=headers)
        self.assertEqual(res_fail.status_code, 400)
        self.assertIn("Sort Code must be exactly 6 digits", res_fail.get_json()["message"])

        # 2. Test valid deal closing
        valid_payload = {
            "business_details": {
                "business_name": "Covent Garden Espresso Ltd",
                "entity_type": "Ltd",
                "business_address": "14 Floral Street, London, WC2E 9DH",
                "landline": "020 7946 0199",
                "trading_years": 4
            },
            "personal_details": {
                "full_name": "Oliver Twist",
                "mobile_number": "07700 900 888",
                "dob": "1988-04-12",
                "email": "oliver@coventcoffee.co.uk"
            },
            "bank_details": {
                "bank_name": "Barclays Bank",
                "account_title": "Covent Garden Espresso Ltd",
                "sort_code": "20-04-15",
                "account_number": "83749201"
            },
            "selected_plan": {
                "provider_plan": "Shift4",
                "monthly_turnover": 7500,
                "debit_rate": 0.70,
                "credit_rate": 0.70,
                "terminal_rental": 0.0,
                "notes": "1 terminal delivery requested by end of week."
            }
        }
        res_success = self.client.post(f"/api/customers/{customer.id}/close-deal", json=valid_payload, headers=headers)
        self.assertEqual(res_success.status_code, 200)
        resp_data = res_success.get_json()
        self.assertEqual(resp_data["customer"]["lead_status"], "CONVERTED")
        self.assertIsNotNone(resp_data["closing_details"])
        self.assertEqual(resp_data["closing_details"]["bank"]["sort_code"], "20-04-15")
        self.assertEqual(resp_data["closing_details"]["bank"]["account_number_masked"], "••••9201")

        # Verify DB records
        updated_cust = Customer.query.get(customer.id)
        self.assertEqual(updated_cust.lead_status, "CONVERTED")
        self.assertEqual(updated_cust.company_name, "Covent Garden Espresso Ltd")
        
        # Verify Conversation timeline entry
        convo = Conversation.query.filter_by(customer_id=customer.id, interaction_type="DEAL_CLOSED").first()
        self.assertIsNotNone(convo)
        self.assertIn("Deal Closed", convo.summary)

        # Verify Audit Log
        audit = AuditLog.query.filter_by(entity_id=customer.id, action="DEAL_CLOSED").first()
        self.assertIsNotNone(audit)

        # 3. Test GET closing details
        res_get = self.client.get(f"/api/customers/{customer.id}/closing-details", headers=headers)
        self.assertEqual(res_get.status_code, 200)
        self.assertTrue(res_get.get_json()["has_closed_deal"])
        self.assertEqual(res_get.get_json()["closing_details"]["business"]["business_name"], "Covent Garden Espresso Ltd")

if __name__ == "__main__":
    unittest.main()
