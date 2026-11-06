import unittest
from app import create_app
from app.models import db, User, Customer, LeadAssignment, Conversation
from app.config import Config
from app.seed import seed_database
from app.services.assignment_service import assign_lead_to_team_leader, reassign_lead_to_agent

class TestConfig(Config):
    TESTING = True
    SQLALCHEMY_DATABASE_URI = "sqlite:///:memory:"

class AssignmentTransferTestCase(unittest.TestCase):
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

    def test_agent_assign_to_leader_and_reassign(self):
        agent_1 = User.query.filter_by(username="agent_ali").first()
        agent_2 = User.query.filter_by(username="agent_ahmed").first()
        tl_a = User.query.filter_by(username="leader_a").first()

        cust = Customer.query.filter_by(company_name="Golden Grill Diner").first()
        self.assertEqual(cust.assigned_agent_id, agent_1.id)

        # 1. Agent 1 assigns to Team Leader
        asgn1 = assign_lead_to_team_leader(cust.id, agent_1, {
            "reason": "Customer needs custom corporate rates approval",
            "priority": "HIGH",
            "notes": "Director level approval needed."
        })
        self.assertEqual(asgn1.to_user_id, tl_a.id)
        self.assertEqual(cust.assigned_agent_id, tl_a.id)

        # Verify conversation timeline note created
        convo1 = Conversation.query.filter_by(customer_id=cust.id, interaction_type="ASSIGNED_TO_LEADER").first()
        self.assertIsNotNone(convo1)
        self.assertIn("Team Leader", convo1.summary)

        # 2. Team Leader reassigns to Agent 2
        asgn2 = reassign_lead_to_agent(cust.id, tl_a, {
            "target_agent_id": agent_2.id,
            "reason": "Assigned to Ahmed for on-site visit",
            "notes": "Approved discount structure up to 0.8%."
        })
        self.assertEqual(asgn2.to_user_id, agent_2.id)
        self.assertEqual(cust.assigned_agent_id, agent_2.id)

        # Verify complete assignment chain
        assignments = LeadAssignment.query.filter_by(customer_id=cust.id).order_by(LeadAssignment.created_at.asc()).all()
        self.assertGreaterEqual(len(assignments), 2)
        self.assertEqual(assignments[0].to_user_id, tl_a.id)
        self.assertEqual(assignments[1].to_user_id, agent_2.id)

if __name__ == "__main__":
    unittest.main()
