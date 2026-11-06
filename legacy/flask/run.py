import os
import sys
sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))
from app import create_app
from app.models import db
from app.seed import seed_database
from sqlalchemy import inspect, text

app = create_app()

def init_db():
    with app.app_context():
        db.create_all()
        # Additive migrations for databases created by older CRM versions.
        # create_all() creates new tables but does not add new model columns.
        inspector = inspect(db.engine)
        if "conversations" in inspector.get_table_names():
            conversation_columns = {column["name"] for column in inspector.get_columns("conversations")}
            if "notes" not in conversation_columns:
                db.session.execute(text("ALTER TABLE conversations ADD COLUMN notes TEXT"))
                db.session.commit()
        if "callbacks" in inspector.get_table_names():
            callback_columns = {column["name"] for column in inspector.get_columns("callbacks")}
            if "created_by_id" not in callback_columns:
                db.session.execute(text("ALTER TABLE callbacks ADD COLUMN created_by_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL"))
                db.session.commit()
        seed_database()

if __name__ == "__main__":
    init_db()
    port = int(os.environ.get("PORT", 5050))
    host = os.environ.get("HOST", "127.0.0.1")
    
    print("\n" + "=" * 65)
    print(" [CALLPRO] MULTI-TEAM CALL CENTER CRM SYSTEM")
    print("=" * 65)
    print(f" Server URL: http://{host}:{port}")
    print("-" * 65)
    print(" PRE-CONFIGURED ACCOUNTS FOR ACCEPTANCE SCENARIOS:")
    print("  * Super Admin:   admin      / admin123")
    print("  * Team Leader A: leader_a   / leader123  (Team A)")
    print("  * Team Leader B: leader_b   / leader123  (Team B)")
    print("  * Agent 1:       agent_ali  / agent123   (Team A)")
    print("  * Agent 2:       agent_ahmed/ agent123   (Team A)")
    print("  * Agent 3:       agent_sara / agent123   (Team B)")
    print("=" * 65 + "\n")
    
    app.run(host=host, port=port, debug=False)
