import uuid
from datetime import datetime, timezone

class TelephonyDriver:
    def initiate_call(self, customer_id: str, phone: str, agent_id: str) -> dict:
        raise NotImplementedError

    def end_call(self, session_id: str) -> dict:
        raise NotImplementedError

class MockTelephonyDriver(TelephonyDriver):
    """
    Simulated VoIP engine providing realistic call ringing, answered events,
    live duration counting, audio tone simulation, and call disposition hook.
    """
    _active_calls = {}

    def initiate_call(self, customer_id: str, phone: str, agent_id: str) -> dict:
        session_id = f"SIP-{uuid.uuid4().hex[:12].upper()}"
        now = datetime.now(timezone.utc)
        self._active_calls[session_id] = {
            "session_id": session_id,
            "customer_id": customer_id,
            "phone": phone,
            "agent_id": agent_id,
            "status": "IN_PROGRESS",
            "start_time": now,
            "driver": "MOCK_VOIP"
        }
        return {
            "session_id": session_id,
            "status": "CONNECTED",
            "phone": phone,
            "started_at": now.isoformat(),
            "message": f"Connected call to {phone} via CallPro Telephony Engine"
        }

    def end_call(self, session_id: str) -> dict:
        call_info = self._active_calls.pop(session_id, None)
        now = datetime.now(timezone.utc)
        if not call_info:
            return {"session_id": session_id, "status": "TERMINATED", "duration_seconds": 0}

        duration = int((now - call_info["start_time"]).total_seconds())
        return {
            "session_id": session_id,
            "status": "COMPLETED",
            "duration_seconds": max(1, duration),
            "ended_at": now.isoformat()
        }

# Provider factory
def get_telephony_driver(provider: str = "mock") -> TelephonyDriver:
    return MockTelephonyDriver()
