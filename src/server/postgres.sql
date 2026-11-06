CREATE TABLE call_dispositions (
	id VARCHAR(36) NOT NULL, 
	code VARCHAR(50) NOT NULL, 
	name VARCHAR(100) NOT NULL, 
	category VARCHAR(50), 
	color VARCHAR(30), 
	is_conversion BOOLEAN, 
	is_callback BOOLEAN, 
	is_system BOOLEAN, 
	sort_order INTEGER, 
	PRIMARY KEY (id), 
	UNIQUE (code)
);

CREATE TABLE lead_statuses (
	id VARCHAR(36) NOT NULL, 
	code VARCHAR(50) NOT NULL, 
	name VARCHAR(100) NOT NULL, 
	color VARCHAR(30), 
	sort_order INTEGER, 
	is_terminal BOOLEAN, 
	is_converted BOOLEAN, 
	is_system BOOLEAN, 
	PRIMARY KEY (id), 
	UNIQUE (code)
);

CREATE TABLE permissions (
	id VARCHAR(36) NOT NULL, 
	code VARCHAR(100) NOT NULL, 
	name VARCHAR(100) NOT NULL, 
	category VARCHAR(50) NOT NULL, 
	PRIMARY KEY (id), 
	UNIQUE (code)
);

CREATE TABLE roles (
	id VARCHAR(36) NOT NULL, 
	name VARCHAR(50) NOT NULL, 
	display_name VARCHAR(100) NOT NULL, 
	description VARCHAR(255), 
	is_system BOOLEAN, 
	created_at TIMESTAMP WITHOUT TIME ZONE, 
	PRIMARY KEY (id), 
	UNIQUE (name)
);

CREATE TABLE tags (
	id VARCHAR(36) NOT NULL, 
	name VARCHAR(50) NOT NULL, 
	color VARCHAR(30), 
	PRIMARY KEY (id), 
	UNIQUE (name)
);

CREATE TABLE role_permissions (
	id VARCHAR(36) NOT NULL, 
	role_id VARCHAR(36) NOT NULL, 
	permission_id VARCHAR(36) NOT NULL, 
	PRIMARY KEY (id)
);

CREATE TABLE users (
	id VARCHAR(36) NOT NULL, 
	username VARCHAR(80) NOT NULL, 
	email VARCHAR(120) NOT NULL, 
	password_hash VARCHAR(255) NOT NULL, 
	full_name VARCHAR(120) NOT NULL, 
	phone VARCHAR(50), 
	role_id VARCHAR(36) NOT NULL, 
	is_active BOOLEAN, 
	deleted_at TIMESTAMP WITHOUT TIME ZONE, 
	failed_login_count INTEGER, 
	locked_until TIMESTAMP WITHOUT TIME ZONE, 
	last_login_at TIMESTAMP WITHOUT TIME ZONE, 
	two_factor_secret VARCHAR(64), 
	two_factor_enabled BOOLEAN, 
	created_at TIMESTAMP WITHOUT TIME ZONE, 
	updated_at TIMESTAMP WITHOUT TIME ZONE, 
	PRIMARY KEY (id)
);

CREATE TABLE audit_logs (
	id VARCHAR(36) NOT NULL, 
	user_id VARCHAR(36), 
	action VARCHAR(80) NOT NULL, 
	entity_type VARCHAR(50), 
	entity_id VARCHAR(50), 
	summary VARCHAR(255) NOT NULL, 
	details JSON, 
	ip_address VARCHAR(60), 
	user_agent VARCHAR(255), 
	created_at TIMESTAMP WITHOUT TIME ZONE, 
	PRIMARY KEY (id)
);

CREATE TABLE devices (
	id VARCHAR(36) NOT NULL, 
	user_id VARCHAR(36) NOT NULL, 
	device_name VARCHAR(120) NOT NULL, 
	device_token VARCHAR(255) NOT NULL, 
	ip_address VARCHAR(60), 
	user_agent VARCHAR(255), 
	last_active_at TIMESTAMP WITHOUT TIME ZONE, 
	last_sync_at TIMESTAMP WITHOUT TIME ZONE, 
	is_revoked BOOLEAN, 
	created_at TIMESTAMP WITHOUT TIME ZONE, 
	PRIMARY KEY (id), 
	UNIQUE (device_token)
);

CREATE TABLE employee_commission_payouts (
	id VARCHAR(36) NOT NULL, 
	employee_id VARCHAR(36) NOT NULL, 
	period VARCHAR(7) NOT NULL, 
	amount_pkr NUMERIC(12, 2) NOT NULL, 
	status VARCHAR(20) NOT NULL, 
	notes VARCHAR(500), 
	created_by_id VARCHAR(36), 
	created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
	updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
	PRIMARY KEY (id), 
	CONSTRAINT uq_employee_commission_payout_period UNIQUE (employee_id, period)
);

CREATE TABLE employee_monthly_sales_stats (
	id VARCHAR(36) NOT NULL, 
	employee_id VARCHAR(36) NOT NULL, 
	period VARCHAR(7) NOT NULL, 
	sales_count INTEGER NOT NULL, 
	sales_amount_gbp NUMERIC(12, 2) NOT NULL, 
	commission_amount_gbp NUMERIC(12, 2) NOT NULL, 
	imported_by_id VARCHAR(36), 
	imported_at TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
	PRIMARY KEY (id), 
	CONSTRAINT uq_employee_sales_stat_period UNIQUE (employee_id, period)
);

CREATE TABLE employee_salaries (
	id VARCHAR(36) NOT NULL, 
	employee_id VARCHAR(36) NOT NULL, 
	period VARCHAR(7) NOT NULL, 
	amount NUMERIC(12, 2) NOT NULL, 
	status VARCHAR(20) NOT NULL, 
	notes VARCHAR(500), 
	created_by_id VARCHAR(36), 
	created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
	updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
	PRIMARY KEY (id), 
	CONSTRAINT uq_employee_salary_period UNIQUE (employee_id, period)
);

CREATE TABLE employee_sales (
	id VARCHAR(36) NOT NULL, 
	employee_id VARCHAR(36) NOT NULL, 
	customer_name VARCHAR(180) NOT NULL, 
	business_name VARCHAR(180) NOT NULL, 
	sale_amount NUMERIC(12, 2) NOT NULL, 
	commission_amount NUMERIC(12, 2) NOT NULL, 
	commission_status VARCHAR(20) NOT NULL, 
	sale_date DATE NOT NULL, 
	notes VARCHAR(500), 
	created_by_id VARCHAR(36), 
	created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
	PRIMARY KEY (id)
);

CREATE TABLE expenses (
	id VARCHAR(36) NOT NULL, 
	category VARCHAR(30) NOT NULL, 
	description VARCHAR(255) NOT NULL, 
	amount NUMERIC(12, 2) NOT NULL, 
	incurred_on DATE NOT NULL, 
	created_by_id VARCHAR(36), 
	created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
	PRIMARY KEY (id)
);

CREATE TABLE export_jobs (
	id VARCHAR(36) NOT NULL, 
	user_id VARCHAR(36), 
	entity_type VARCHAR(50) NOT NULL, 
	filter_params JSON, 
	format VARCHAR(20), 
	row_count INTEGER, 
	created_at TIMESTAMP WITHOUT TIME ZONE, 
	PRIMARY KEY (id)
);

CREATE TABLE import_jobs (
	id VARCHAR(36) NOT NULL, 
	user_id VARCHAR(36), 
	filename VARCHAR(255) NOT NULL, 
	total_rows INTEGER, 
	imported_count INTEGER, 
	duplicate_count INTEGER, 
	invalid_count INTEGER, 
	failed_count INTEGER, 
	status VARCHAR(30), 
	error_summary JSON, 
	created_at TIMESTAMP WITHOUT TIME ZONE, 
	PRIMARY KEY (id)
);

CREATE TABLE sync_queue (
	id VARCHAR(36) NOT NULL, 
	local_id VARCHAR(64) NOT NULL, 
	server_id VARCHAR(64), 
	user_id VARCHAR(36) NOT NULL, 
	device_id VARCHAR(64), 
	operation VARCHAR(20) NOT NULL, 
	entity_type VARCHAR(50) NOT NULL, 
	entity_id VARCHAR(64), 
	payload JSON NOT NULL, 
	sync_status VARCHAR(30), 
	retry_count INTEGER, 
	error_message TEXT, 
	client_timestamp VARCHAR(50), 
	created_at TIMESTAMP WITHOUT TIME ZONE, 
	processed_at TIMESTAMP WITHOUT TIME ZONE, 
	PRIMARY KEY (id)
);

CREATE TABLE teams (
	id VARCHAR(36) NOT NULL, 
	name VARCHAR(100) NOT NULL, 
	description VARCHAR(255), 
	team_leader_id VARCHAR(36), 
	is_active BOOLEAN, 
	deleted_at TIMESTAMP WITHOUT TIME ZONE, 
	created_at TIMESTAMP WITHOUT TIME ZONE, 
	updated_at TIMESTAMP WITHOUT TIME ZONE, 
	PRIMARY KEY (id)
);

CREATE TABLE customers (
	id VARCHAR(36) NOT NULL, 
	code VARCHAR(50) NOT NULL, 
	first_name VARCHAR(80), 
	last_name VARCHAR(80), 
	full_name VARCHAR(160) NOT NULL, 
	company_name VARCHAR(160), 
	phone VARCHAR(50) NOT NULL, 
	secondary_phone VARCHAR(50), 
	email VARCHAR(120), 
	address VARCHAR(255), 
	city VARCHAR(100), 
	postcode VARCHAR(30), 
	country VARCHAR(100), 
	industry VARCHAR(100), 
	customer_type VARCHAR(50), 
	lead_source VARCHAR(100), 
	previous_provider VARCHAR(100), 
	assigned_team_id VARCHAR(36), 
	assigned_agent_id VARCHAR(36), 
	created_by_id VARCHAR(36), 
	updated_by_id VARCHAR(36), 
	last_contacted_by_id VARCHAR(36), 
	lead_status VARCHAR(50), 
	priority VARCHAR(20), 
	last_contact_date TIMESTAMP WITHOUT TIME ZONE, 
	next_callback_date TIMESTAMP WITHOUT TIME ZONE, 
	tags_list JSON, 
	custom_fields JSON, 
	notes TEXT, 
	is_active BOOLEAN, 
	deleted_at TIMESTAMP WITHOUT TIME ZONE, 
	created_at TIMESTAMP WITHOUT TIME ZONE, 
	updated_at TIMESTAMP WITHOUT TIME ZONE, 
	PRIMARY KEY (id)
);

CREATE TABLE sync_conflicts (
	id VARCHAR(36) NOT NULL, 
	sync_item_id VARCHAR(36), 
	entity_type VARCHAR(50) NOT NULL, 
	entity_id VARCHAR(64) NOT NULL, 
	server_data JSON NOT NULL, 
	client_data JSON NOT NULL, 
	resolution_strategy VARCHAR(50), 
	is_resolved BOOLEAN, 
	resolved_by_id VARCHAR(36), 
	resolved_at TIMESTAMP WITHOUT TIME ZONE, 
	created_at TIMESTAMP WITHOUT TIME ZONE, 
	PRIMARY KEY (id)
);

CREATE TABLE team_members (
	id VARCHAR(36) NOT NULL, 
	team_id VARCHAR(36) NOT NULL, 
	user_id VARCHAR(36) NOT NULL, 
	is_primary BOOLEAN, 
	joined_at TIMESTAMP WITHOUT TIME ZONE, 
	PRIMARY KEY (id), 
	CONSTRAINT unique_team_user_membership UNIQUE (team_id, user_id)
);

CREATE TABLE callbacks (
	id VARCHAR(36) NOT NULL, 
	customer_id VARCHAR(36) NOT NULL, 
	agent_id VARCHAR(36), 
	created_by_id VARCHAR(36), 
	team_id VARCHAR(36), 
	scheduled_at TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
	reason VARCHAR(255) NOT NULL, 
	priority VARCHAR(20), 
	reminder_minutes INTEGER, 
	status VARCHAR(30), 
	notes TEXT, 
	completed_at TIMESTAMP WITHOUT TIME ZONE, 
	completed_by_id VARCHAR(36), 
	created_at TIMESTAMP WITHOUT TIME ZONE, 
	updated_at TIMESTAMP WITHOUT TIME ZONE, 
	PRIMARY KEY (id)
);

CREATE TABLE calls (
	id VARCHAR(36) NOT NULL, 
	call_code VARCHAR(50) NOT NULL, 
	customer_id VARCHAR(36) NOT NULL, 
	agent_id VARCHAR(36), 
	team_id VARCHAR(36), 
	call_type VARCHAR(30), 
	duration_seconds INTEGER, 
	outcome VARCHAR(80) NOT NULL, 
	notes TEXT, 
	next_action VARCHAR(255), 
	callback_date VARCHAR(30), 
	callback_time VARCHAR(30), 
	telephony_session_id VARCHAR(100), 
	recording_url VARCHAR(255), 
	created_at TIMESTAMP WITHOUT TIME ZONE, 
	PRIMARY KEY (id)
);

CREATE TABLE contracts (
	id VARCHAR(36) NOT NULL, 
	customer_id VARCHAR(36), 
	business_name VARCHAR(180) NOT NULL, 
	customer_name VARCHAR(180) NOT NULL, 
	contract_status VARCHAR(30) NOT NULL, 
	commission_status VARCHAR(20) NOT NULL, 
	commission_amount NUMERIC(12, 2) NOT NULL, 
	original_filename VARCHAR(255), 
	stored_filename VARCHAR(255), 
	notes TEXT, 
	created_by_id VARCHAR(36), 
	created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
	updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
	PRIMARY KEY (id)
);

CREATE TABLE customer_tags (
	id VARCHAR(36) NOT NULL, 
	customer_id VARCHAR(36) NOT NULL, 
	tag_id VARCHAR(36) NOT NULL, 
	PRIMARY KEY (id)
);

CREATE TABLE lead_assignments (
	id VARCHAR(36) NOT NULL, 
	customer_id VARCHAR(36) NOT NULL, 
	from_user_id VARCHAR(36), 
	to_user_id VARCHAR(36), 
	from_team_id VARCHAR(36), 
	to_team_id VARCHAR(36), 
	assigned_by_id VARCHAR(36), 
	reason VARCHAR(255), 
	priority VARCHAR(20), 
	notes TEXT, 
	status VARCHAR(30), 
	created_at TIMESTAMP WITHOUT TIME ZONE, 
	PRIMARY KEY (id)
);

CREATE TABLE lead_transfers (
	id VARCHAR(36) NOT NULL, 
	customer_id VARCHAR(36) NOT NULL, 
	from_agent_id VARCHAR(36) NOT NULL, 
	target_type VARCHAR(30) NOT NULL, 
	target_id VARCHAR(36) NOT NULL, 
	reason VARCHAR(255) NOT NULL, 
	notes TEXT, 
	status VARCHAR(30), 
	resolved_by_id VARCHAR(36), 
	resolved_at TIMESTAMP WITHOUT TIME ZONE, 
	created_at TIMESTAMP WITHOUT TIME ZONE, 
	PRIMARY KEY (id)
);

CREATE TABLE conversations (
	id VARCHAR(36) NOT NULL, 
	customer_id VARCHAR(36) NOT NULL, 
	agent_id VARCHAR(36), 
	call_id VARCHAR(36), 
	interaction_type VARCHAR(50), 
	outcome VARCHAR(80), 
	summary TEXT NOT NULL, 
	next_action VARCHAR(255), 
	callback_info VARCHAR(255), 
	notes TEXT, 
	created_at TIMESTAMP WITHOUT TIME ZONE, 
	PRIMARY KEY (id)
);

ALTER TABLE role_permissions ADD CONSTRAINT fk_role_permissions_0 FOREIGN KEY(role_id) REFERENCES roles (id) ON DELETE CASCADE;

ALTER TABLE role_permissions ADD CONSTRAINT fk_role_permissions_1 FOREIGN KEY(permission_id) REFERENCES permissions (id) ON DELETE CASCADE;

ALTER TABLE users ADD CONSTRAINT fk_users_0 FOREIGN KEY(role_id) REFERENCES roles (id);

ALTER TABLE audit_logs ADD CONSTRAINT fk_audit_logs_0 FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE SET NULL;

ALTER TABLE devices ADD CONSTRAINT fk_devices_0 FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE;

ALTER TABLE employee_commission_payouts ADD CONSTRAINT fk_employee_commission_payouts_0 FOREIGN KEY(employee_id) REFERENCES users (id) ON DELETE CASCADE;

ALTER TABLE employee_commission_payouts ADD CONSTRAINT fk_employee_commission_payouts_1 FOREIGN KEY(created_by_id) REFERENCES users (id) ON DELETE SET NULL;

ALTER TABLE employee_monthly_sales_stats ADD CONSTRAINT fk_employee_monthly_sales_stats_0 FOREIGN KEY(imported_by_id) REFERENCES users (id) ON DELETE SET NULL;

ALTER TABLE employee_monthly_sales_stats ADD CONSTRAINT fk_employee_monthly_sales_stats_1 FOREIGN KEY(employee_id) REFERENCES users (id) ON DELETE CASCADE;

ALTER TABLE employee_salaries ADD CONSTRAINT fk_employee_salaries_0 FOREIGN KEY(created_by_id) REFERENCES users (id) ON DELETE SET NULL;

ALTER TABLE employee_salaries ADD CONSTRAINT fk_employee_salaries_1 FOREIGN KEY(employee_id) REFERENCES users (id) ON DELETE CASCADE;

ALTER TABLE employee_sales ADD CONSTRAINT fk_employee_sales_0 FOREIGN KEY(created_by_id) REFERENCES users (id) ON DELETE SET NULL;

ALTER TABLE employee_sales ADD CONSTRAINT fk_employee_sales_1 FOREIGN KEY(employee_id) REFERENCES users (id) ON DELETE CASCADE;

ALTER TABLE expenses ADD CONSTRAINT fk_expenses_0 FOREIGN KEY(created_by_id) REFERENCES users (id) ON DELETE SET NULL;

ALTER TABLE export_jobs ADD CONSTRAINT fk_export_jobs_0 FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE SET NULL;

ALTER TABLE import_jobs ADD CONSTRAINT fk_import_jobs_0 FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE SET NULL;

ALTER TABLE sync_queue ADD CONSTRAINT fk_sync_queue_0 FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE;

ALTER TABLE teams ADD CONSTRAINT fk_teams_0 FOREIGN KEY(team_leader_id) REFERENCES users (id) ON DELETE SET NULL;

ALTER TABLE customers ADD CONSTRAINT fk_customers_0 FOREIGN KEY(last_contacted_by_id) REFERENCES users (id) ON DELETE SET NULL;

ALTER TABLE customers ADD CONSTRAINT fk_customers_1 FOREIGN KEY(created_by_id) REFERENCES users (id) ON DELETE SET NULL;

ALTER TABLE customers ADD CONSTRAINT fk_customers_2 FOREIGN KEY(assigned_team_id) REFERENCES teams (id) ON DELETE SET NULL;

ALTER TABLE customers ADD CONSTRAINT fk_customers_3 FOREIGN KEY(updated_by_id) REFERENCES users (id) ON DELETE SET NULL;

ALTER TABLE customers ADD CONSTRAINT fk_customers_4 FOREIGN KEY(assigned_agent_id) REFERENCES users (id) ON DELETE SET NULL;

ALTER TABLE sync_conflicts ADD CONSTRAINT fk_sync_conflicts_0 FOREIGN KEY(resolved_by_id) REFERENCES users (id) ON DELETE SET NULL;

ALTER TABLE sync_conflicts ADD CONSTRAINT fk_sync_conflicts_1 FOREIGN KEY(sync_item_id) REFERENCES sync_queue (id) ON DELETE CASCADE;

ALTER TABLE team_members ADD CONSTRAINT fk_team_members_0 FOREIGN KEY(team_id) REFERENCES teams (id) ON DELETE CASCADE;

ALTER TABLE team_members ADD CONSTRAINT fk_team_members_1 FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE;

ALTER TABLE callbacks ADD CONSTRAINT fk_callbacks_0 FOREIGN KEY(created_by_id) REFERENCES users (id) ON DELETE SET NULL;

ALTER TABLE callbacks ADD CONSTRAINT fk_callbacks_1 FOREIGN KEY(customer_id) REFERENCES customers (id) ON DELETE CASCADE;

ALTER TABLE callbacks ADD CONSTRAINT fk_callbacks_2 FOREIGN KEY(team_id) REFERENCES teams (id) ON DELETE SET NULL;

ALTER TABLE callbacks ADD CONSTRAINT fk_callbacks_3 FOREIGN KEY(agent_id) REFERENCES users (id) ON DELETE SET NULL;

ALTER TABLE callbacks ADD CONSTRAINT fk_callbacks_4 FOREIGN KEY(completed_by_id) REFERENCES users (id) ON DELETE SET NULL;

ALTER TABLE calls ADD CONSTRAINT fk_calls_0 FOREIGN KEY(customer_id) REFERENCES customers (id) ON DELETE CASCADE;

ALTER TABLE calls ADD CONSTRAINT fk_calls_1 FOREIGN KEY(team_id) REFERENCES teams (id) ON DELETE SET NULL;

ALTER TABLE calls ADD CONSTRAINT fk_calls_2 FOREIGN KEY(agent_id) REFERENCES users (id) ON DELETE SET NULL;

ALTER TABLE contracts ADD CONSTRAINT fk_contracts_0 FOREIGN KEY(customer_id) REFERENCES customers (id) ON DELETE SET NULL;

ALTER TABLE contracts ADD CONSTRAINT fk_contracts_1 FOREIGN KEY(created_by_id) REFERENCES users (id) ON DELETE SET NULL;

ALTER TABLE customer_tags ADD CONSTRAINT fk_customer_tags_0 FOREIGN KEY(customer_id) REFERENCES customers (id) ON DELETE CASCADE;

ALTER TABLE customer_tags ADD CONSTRAINT fk_customer_tags_1 FOREIGN KEY(tag_id) REFERENCES tags (id) ON DELETE CASCADE;

ALTER TABLE lead_assignments ADD CONSTRAINT fk_lead_assignments_0 FOREIGN KEY(assigned_by_id) REFERENCES users (id) ON DELETE SET NULL;

ALTER TABLE lead_assignments ADD CONSTRAINT fk_lead_assignments_1 FOREIGN KEY(from_team_id) REFERENCES teams (id) ON DELETE SET NULL;

ALTER TABLE lead_assignments ADD CONSTRAINT fk_lead_assignments_2 FOREIGN KEY(from_user_id) REFERENCES users (id) ON DELETE SET NULL;

ALTER TABLE lead_assignments ADD CONSTRAINT fk_lead_assignments_3 FOREIGN KEY(to_team_id) REFERENCES teams (id) ON DELETE SET NULL;

ALTER TABLE lead_assignments ADD CONSTRAINT fk_lead_assignments_4 FOREIGN KEY(to_user_id) REFERENCES users (id) ON DELETE SET NULL;

ALTER TABLE lead_assignments ADD CONSTRAINT fk_lead_assignments_5 FOREIGN KEY(customer_id) REFERENCES customers (id) ON DELETE CASCADE;

ALTER TABLE lead_transfers ADD CONSTRAINT fk_lead_transfers_0 FOREIGN KEY(resolved_by_id) REFERENCES users (id) ON DELETE SET NULL;

ALTER TABLE lead_transfers ADD CONSTRAINT fk_lead_transfers_1 FOREIGN KEY(from_agent_id) REFERENCES users (id) ON DELETE CASCADE;

ALTER TABLE lead_transfers ADD CONSTRAINT fk_lead_transfers_2 FOREIGN KEY(customer_id) REFERENCES customers (id) ON DELETE CASCADE;

ALTER TABLE conversations ADD CONSTRAINT fk_conversations_0 FOREIGN KEY(call_id) REFERENCES calls (id) ON DELETE SET NULL;

ALTER TABLE conversations ADD CONSTRAINT fk_conversations_1 FOREIGN KEY(agent_id) REFERENCES users (id) ON DELETE SET NULL;

ALTER TABLE conversations ADD CONSTRAINT fk_conversations_2 FOREIGN KEY(customer_id) REFERENCES customers (id) ON DELETE CASCADE;