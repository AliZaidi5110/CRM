import os
from flask import Flask, jsonify, send_from_directory, request
from flask_compress import Compress
from .config import Config
from .models import db

compress = Compress()

def create_app(config_class=Config):
    app = Flask(__name__, static_folder=config_class.STATIC_FOLDER, static_url_path="")
    app.config.from_object(config_class)

    # Initialize extensions
    db.init_app(app)
    compress.init_app(app)

    @app.before_request
    def check_cloud_configuration():
        if os.environ.get("VERCEL") and request.path.startswith("/api/"):
            missing = [name for name in ("DATABASE_URL", "SECRET_KEY", "JWT_SECRET_KEY") if not os.environ.get(name)]
            if missing:
                return jsonify(error="Cloud setup incomplete", message="The administrator must configure the cloud database and signing keys before CRM access is available."), 503
            if request.files:
                return jsonify(error="Cloud file storage is not configured", message="Document uploads are unavailable until persistent cloud file storage is connected."), 503

    # Ensure upload directory exists
    os.makedirs(app.config["UPLOAD_FOLDER"], exist_ok=True)

    # CORS Headers
    @app.after_request
    def add_security_headers(response):
        response.headers["Access-Control-Allow-Origin"] = "*"
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS, PATCH"
        response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization, X-Requested-With, X-Device-ID"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "SAMEORIGIN"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        return response

    # Global Error Handlers
    @app.errorhandler(400)
    def bad_request(e):
        return jsonify({"error": "Bad request", "message": str(e)}), 400

    @app.errorhandler(401)
    def unauthorized(e):
        return jsonify({"error": "Unauthorized", "message": "Authentication required"}), 401

    @app.errorhandler(403)
    def forbidden(e):
        return jsonify({"error": "Forbidden", "message": "You do not have permission to perform this action"}), 403

    @app.errorhandler(404)
    def not_found(e):
        return jsonify({"error": "Not found", "message": "The requested resource was not found"}), 404

    @app.errorhandler(409)
    def conflict_error(e):
        return jsonify({"error": "Conflict", "message": str(e)}), 409

    @app.errorhandler(500)
    def internal_error(e):
        return jsonify({"error": "Server error", "message": "An internal error occurred"}), 500

    # Register Blueprints
    from .routes.auth_bp import auth_bp
    from .routes.users_bp import users_bp
    from .routes.teams_bp import teams_bp
    from .routes.customers_bp import customers_bp
    from .routes.calls_bp import calls_bp
    from .routes.callbacks_bp import callbacks_bp
    from .routes.assignments_bp import assignments_bp
    from .routes.reports_bp import reports_bp
    from .routes.audit_bp import audit_bp
    from .routes.sync_bp import sync_bp
    from .routes.telephony_bp import telephony_bp
    from .routes.ai_bp import ai_bp
    from .routes.rebuttals_bp import rebuttals_bp
    from .routes.admin_records_bp import admin_records_bp

    app.register_blueprint(auth_bp, url_prefix="/api/auth")
    app.register_blueprint(users_bp, url_prefix="/api/users")
    app.register_blueprint(teams_bp, url_prefix="/api/teams")
    app.register_blueprint(customers_bp, url_prefix="/api/customers")
    app.register_blueprint(calls_bp, url_prefix="/api/calls")
    app.register_blueprint(callbacks_bp, url_prefix="/api/callbacks")
    app.register_blueprint(assignments_bp, url_prefix="/api/assignments")
    app.register_blueprint(reports_bp, url_prefix="/api/reports")
    app.register_blueprint(audit_bp, url_prefix="/api/audit")
    app.register_blueprint(sync_bp, url_prefix="/api/sync")
    app.register_blueprint(telephony_bp, url_prefix="/api/telephony")
    app.register_blueprint(ai_bp, url_prefix="/api/ai")
    app.register_blueprint(rebuttals_bp, url_prefix="/api/rebuttals")
    app.register_blueprint(admin_records_bp, url_prefix="/api/admin")

    # Serve Frontend Single Page Application
    @app.route("/", defaults={"path": ""})
    @app.route("/<path:path>")
    def serve_frontend(path):
        if path and os.path.exists(os.path.join(app.static_folder, path)):
            return send_from_directory(app.static_folder, path)
        return send_from_directory(app.static_folder, "index.html")

    return app
