-- QA Command Center Database Initialization Script
-- This script creates the initial database structure and sets up permissions
-- Run this script when setting up a new environment

-- Create database (if not exists)
SELECT 'CREATE DATABASE qa_command_center'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'qa_command_center');

-- Connect to the database
\c qa_command_center;

-- Create extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Create custom types
DO $$
BEGIN
    -- User role enum
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
        CREATE TYPE user_role AS ENUM ('admin', 'user', 'viewer');
    END IF;
    
    -- Issue status enum
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'issue_status') THEN
        CREATE TYPE issue_status AS ENUM ('open', 'in_progress', 'resolved', 'closed', 'rejected');
    END IF;
    
    -- Issue severity enum
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'issue_severity') THEN
        CREATE TYPE issue_severity AS ENUM ('critical', 'high', 'medium', 'low');
    END IF;
    
    -- Issue priority enum
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'issue_priority') THEN
        CREATE TYPE issue_priority AS ENUM ('urgent', 'high', 'normal', 'low');
    END IF;
    
    -- Recording status enum
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'recording_status') THEN
        CREATE TYPE recording_status AS ENUM ('active', 'paused', 'completed', 'failed', 'cancelled');
    END IF;
    
    -- Project status enum
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'project_status') THEN
        CREATE TYPE project_status AS ENUM ('active', 'inactive', 'archived');
    END IF;
    
    -- OAuth provider enum
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'oauth_provider') THEN
        CREATE TYPE oauth_provider AS ENUM ('gitlab', 'slack', 'github');
    END IF;
END
$$;

-- Create users table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    username VARCHAR(50) UNIQUE NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255),
    role user_role DEFAULT 'user',
    avatar_url TEXT,
    email_verified BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    last_login_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT users_email_check CHECK (email ~* '^[A-Za-z0-9._%-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,4}$'),
    CONSTRAINT users_username_check CHECK (username ~* '^[a-zA-Z0-9_-]{3,50}$')
);

-- Create oauth_connections table
CREATE TABLE IF NOT EXISTS oauth_connections (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider oauth_provider NOT NULL,
    provider_user_id VARCHAR(255) NOT NULL,
    access_token TEXT,
    refresh_token TEXT,
    token_expires_at TIMESTAMP WITH TIME ZONE,
    scopes TEXT[],
    provider_data JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraints
    UNIQUE(user_id, provider),
    UNIQUE(provider, provider_user_id)
);

-- Create teams table
CREATE TABLE IF NOT EXISTS teams (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    slug VARCHAR(100) UNIQUE NOT NULL,
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    is_active BOOLEAN DEFAULT TRUE,
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT teams_slug_check CHECK (slug ~* '^[a-z0-9-]{3,100}$')
);

-- Create team_members table
CREATE TABLE IF NOT EXISTS team_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(50) DEFAULT 'member',
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraints
    UNIQUE(team_id, user_id),
    CONSTRAINT team_members_role_check CHECK (role IN ('admin', 'member', 'viewer'))
);

-- Create projects table
CREATE TABLE IF NOT EXISTS projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    slug VARCHAR(100) NOT NULL,
    team_id UUID REFERENCES teams(id) ON DELETE SET NULL,
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    gitlab_project_id INTEGER,
    gitlab_project_path VARCHAR(500),
    repository_url TEXT,
    website_url TEXT,
    status project_status DEFAULT 'active',
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraints
    UNIQUE(team_id, slug),
    CONSTRAINT projects_slug_check CHECK (slug ~* '^[a-z0-9-]{3,100}$')
);

-- Create project_members table
CREATE TABLE IF NOT EXISTS project_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(50) DEFAULT 'member',
    permissions JSONB DEFAULT '{}',
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraints
    UNIQUE(project_id, user_id),
    CONSTRAINT project_members_role_check CHECK (role IN ('admin', 'developer', 'tester', 'viewer'))
);

-- Create recordings table
CREATE TABLE IF NOT EXISTS recordings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    session_id VARCHAR(255),
    url TEXT NOT NULL,
    title VARCHAR(500),
    status recording_status DEFAULT 'active',
    duration INTEGER DEFAULT 0, -- in milliseconds
    step_count INTEGER DEFAULT 0,
    browser_info JSONB,
    viewport JSONB,
    user_agent TEXT,
    metadata JSONB DEFAULT '{}',
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create recording_steps table
CREATE TABLE IF NOT EXISTS recording_steps (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    recording_id UUID NOT NULL REFERENCES recordings(id) ON DELETE CASCADE,
    step_number INTEGER NOT NULL,
    type VARCHAR(50) NOT NULL,
    selector TEXT,
    xpath TEXT,
    element_info JSONB,
    coordinates JSONB,
    value TEXT,
    url TEXT,
    timestamp_offset INTEGER NOT NULL, -- milliseconds from recording start
    screenshot_url TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraints
    UNIQUE(recording_id, step_number),
    CONSTRAINT recording_steps_type_check CHECK (type IN ('click', 'input', 'scroll', 'navigation', 'resize', 'keydown', 'submit', 'hover', 'focus', 'blur'))
);

-- Create issues table
CREATE TABLE IF NOT EXISTS issues (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(500) NOT NULL,
    description TEXT NOT NULL,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    reporter_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    assignee_id UUID REFERENCES users(id) ON DELETE SET NULL,
    recording_id UUID REFERENCES recordings(id) ON DELETE SET NULL,
    gitlab_issue_id INTEGER,
    gitlab_issue_iid INTEGER,
    status issue_status DEFAULT 'open',
    severity issue_severity DEFAULT 'medium',
    priority issue_priority DEFAULT 'normal',
    labels TEXT[] DEFAULT '{}',
    tags TEXT[] DEFAULT '{}',
    acceptance_criteria TEXT[],
    reproduction_steps TEXT[],
    expected_behavior TEXT,
    actual_behavior TEXT,
    browser_info JSONB,
    environment_info JSONB,
    attachments JSONB DEFAULT '[]',
    due_date DATE,
    estimated_hours DECIMAL(5,2),
    actual_hours DECIMAL(5,2),
    resolution_notes TEXT,
    metadata JSONB DEFAULT '{}',
    resolved_at TIMESTAMP WITH TIME ZONE,
    closed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create issue_comments table
CREATE TABLE IF NOT EXISTS issue_comments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    issue_id UUID NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    content TEXT NOT NULL,
    is_internal BOOLEAN DEFAULT FALSE,
    gitlab_note_id INTEGER,
    attachments JSONB DEFAULT '[]',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create issue_history table
CREATE TABLE IF NOT EXISTS issue_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    issue_id UUID NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    action VARCHAR(50) NOT NULL,
    field_name VARCHAR(100),
    old_value TEXT,
    new_value TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT issue_history_action_check CHECK (action IN ('created', 'updated', 'assigned', 'unassigned', 'status_changed', 'priority_changed', 'severity_changed', 'commented', 'closed', 'reopened'))
);

-- Create notifications table
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT,
    data JSONB DEFAULT '{}',
    is_read BOOLEAN DEFAULT FALSE,
    read_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT notifications_type_check CHECK (type IN ('issue_assigned', 'issue_updated', 'issue_commented', 'recording_completed', 'project_invited', 'system_alert'))
);

-- Create webhooks table
CREATE TABLE IF NOT EXISTS webhooks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    name VARCHAR(255) NOT NULL,
    url TEXT NOT NULL,
    secret VARCHAR(255),
    events TEXT[] NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    headers JSONB DEFAULT '{}',
    last_triggered_at TIMESTAMP WITH TIME ZONE,
    last_response_status INTEGER,
    failure_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT webhooks_url_check CHECK (url ~* '^https?://.*')
);

-- Create webhook_deliveries table
CREATE TABLE IF NOT EXISTS webhook_deliveries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    webhook_id UUID NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
    event_type VARCHAR(50) NOT NULL,
    payload JSONB NOT NULL,
    response_status INTEGER,
    response_body TEXT,
    response_headers JSONB,
    delivered_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create sessions table for Redis session fallback
CREATE TABLE IF NOT EXISTS sessions (
    id VARCHAR(255) PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    data JSONB NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create audit_logs table
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(50),
    resource_id UUID,
    details JSONB DEFAULT '{}',
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance

-- Users indexes
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at);
CREATE INDEX IF NOT EXISTS idx_users_active ON users(is_active) WHERE is_active = true;

-- OAuth connections indexes
CREATE INDEX IF NOT EXISTS idx_oauth_connections_user_id ON oauth_connections(user_id);
CREATE INDEX IF NOT EXISTS idx_oauth_connections_provider ON oauth_connections(provider);

-- Teams indexes
CREATE INDEX IF NOT EXISTS idx_teams_owner_id ON teams(owner_id);
CREATE INDEX IF NOT EXISTS idx_teams_slug ON teams(slug);
CREATE INDEX IF NOT EXISTS idx_teams_active ON teams(is_active) WHERE is_active = true;

-- Team members indexes
CREATE INDEX IF NOT EXISTS idx_team_members_team_id ON team_members(team_id);
CREATE INDEX IF NOT EXISTS idx_team_members_user_id ON team_members(user_id);

-- Projects indexes
CREATE INDEX IF NOT EXISTS idx_projects_team_id ON projects(team_id);
CREATE INDEX IF NOT EXISTS idx_projects_owner_id ON projects(owner_id);
CREATE INDEX IF NOT EXISTS idx_projects_gitlab_id ON projects(gitlab_project_id);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_created_at ON projects(created_at);

-- Project members indexes
CREATE INDEX IF NOT EXISTS idx_project_members_project_id ON project_members(project_id);
CREATE INDEX IF NOT EXISTS idx_project_members_user_id ON project_members(user_id);

-- Recordings indexes
CREATE INDEX IF NOT EXISTS idx_recordings_project_id ON recordings(project_id);
CREATE INDEX IF NOT EXISTS idx_recordings_user_id ON recordings(user_id);
CREATE INDEX IF NOT EXISTS idx_recordings_session_id ON recordings(session_id);
CREATE INDEX IF NOT EXISTS idx_recordings_status ON recordings(status);
CREATE INDEX IF NOT EXISTS idx_recordings_created_at ON recordings(created_at);

-- Recording steps indexes
CREATE INDEX IF NOT EXISTS idx_recording_steps_recording_id ON recording_steps(recording_id);
CREATE INDEX IF NOT EXISTS idx_recording_steps_type ON recording_steps(type);
CREATE INDEX IF NOT EXISTS idx_recording_steps_timestamp ON recording_steps(timestamp_offset);

-- Issues indexes
CREATE INDEX IF NOT EXISTS idx_issues_project_id ON issues(project_id);
CREATE INDEX IF NOT EXISTS idx_issues_reporter_id ON issues(reporter_id);
CREATE INDEX IF NOT EXISTS idx_issues_assignee_id ON issues(assignee_id);
CREATE INDEX IF NOT EXISTS idx_issues_recording_id ON issues(recording_id);
CREATE INDEX IF NOT EXISTS idx_issues_gitlab_id ON issues(gitlab_issue_id);
CREATE INDEX IF NOT EXISTS idx_issues_status ON issues(status);
CREATE INDEX IF NOT EXISTS idx_issues_severity ON issues(severity);
CREATE INDEX IF NOT EXISTS idx_issues_priority ON issues(priority);
CREATE INDEX IF NOT EXISTS idx_issues_created_at ON issues(created_at);
CREATE INDEX IF NOT EXISTS idx_issues_labels ON issues USING GIN(labels);
CREATE INDEX IF NOT EXISTS idx_issues_search ON issues USING GIN(title, description);

-- Issue comments indexes
CREATE INDEX IF NOT EXISTS idx_issue_comments_issue_id ON issue_comments(issue_id);
CREATE INDEX IF NOT EXISTS idx_issue_comments_user_id ON issue_comments(user_id);
CREATE INDEX IF NOT EXISTS idx_issue_comments_created_at ON issue_comments(created_at);

-- Issue history indexes
CREATE INDEX IF NOT EXISTS idx_issue_history_issue_id ON issue_history(issue_id);
CREATE INDEX IF NOT EXISTS idx_issue_history_user_id ON issue_history(user_id);
CREATE INDEX IF NOT EXISTS idx_issue_history_action ON issue_history(action);
CREATE INDEX IF NOT EXISTS idx_issue_history_created_at ON issue_history(created_at);

-- Notifications indexes
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(type);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at);

-- Webhooks indexes
CREATE INDEX IF NOT EXISTS idx_webhooks_project_id ON webhooks(project_id);
CREATE INDEX IF NOT EXISTS idx_webhooks_active ON webhooks(is_active) WHERE is_active = true;

-- Webhook deliveries indexes
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_webhook_id ON webhook_deliveries(webhook_id);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_event_type ON webhook_deliveries(event_type);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_created_at ON webhook_deliveries(created_at);

-- Sessions indexes
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);

-- Audit logs indexes
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource ON audit_logs(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);

-- Create functions and triggers

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply updated_at triggers to relevant tables
DO $$
DECLARE
    tables_with_updated_at text[] := ARRAY[
        'users', 'oauth_connections', 'teams', 'projects', 
        'recordings', 'issues', 'issue_comments', 'webhooks', 'sessions'
    ];
    table_name text;
BEGIN
    FOREACH table_name IN ARRAY tables_with_updated_at
    LOOP
        EXECUTE format('
            DROP TRIGGER IF EXISTS trigger_update_%I_updated_at ON %I;
            CREATE TRIGGER trigger_update_%I_updated_at
                BEFORE UPDATE ON %I
                FOR EACH ROW
                EXECUTE FUNCTION update_updated_at_column();
        ', table_name, table_name, table_name, table_name);
    END LOOP;
END $$;

-- Function to create issue history entry
CREATE OR REPLACE FUNCTION create_issue_history()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO issue_history (issue_id, user_id, action, metadata)
        VALUES (NEW.id, NEW.reporter_id, 'created', '{}');
        RETURN NEW;
    ELSIF TG_OP = 'UPDATE' THEN
        -- Track specific field changes
        IF OLD.status != NEW.status THEN
            INSERT INTO issue_history (issue_id, user_id, action, field_name, old_value, new_value)
            VALUES (NEW.id, COALESCE(NEW.assignee_id, NEW.reporter_id), 'status_changed', 'status', OLD.status, NEW.status);
        END IF;
        
        IF OLD.priority != NEW.priority THEN
            INSERT INTO issue_history (issue_id, user_id, action, field_name, old_value, new_value)
            VALUES (NEW.id, COALESCE(NEW.assignee_id, NEW.reporter_id), 'priority_changed', 'priority', OLD.priority, NEW.priority);
        END IF;
        
        IF OLD.severity != NEW.severity THEN
            INSERT INTO issue_history (issue_id, user_id, action, field_name, old_value, new_value)
            VALUES (NEW.id, COALESCE(NEW.assignee_id, NEW.reporter_id), 'severity_changed', 'severity', OLD.severity, NEW.severity);
        END IF;
        
        IF OLD.assignee_id IS DISTINCT FROM NEW.assignee_id THEN
            INSERT INTO issue_history (issue_id, user_id, action, field_name, old_value, new_value)
            VALUES (NEW.id, COALESCE(NEW.assignee_id, NEW.reporter_id), 'assigned', 'assignee_id', 
                   COALESCE(OLD.assignee_id::text, ''), COALESCE(NEW.assignee_id::text, ''));
        END IF;
        
        RETURN NEW;
    END IF;
    RETURN NULL;
END;
$$ language 'plpgsql';

-- Create issue history trigger
DROP TRIGGER IF EXISTS trigger_issue_history ON issues;
CREATE TRIGGER trigger_issue_history
    AFTER INSERT OR UPDATE ON issues
    FOR EACH ROW
    EXECUTE FUNCTION create_issue_history();

-- Function to update recording step count
CREATE OR REPLACE FUNCTION update_recording_step_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE recordings 
        SET step_count = step_count + 1
        WHERE id = NEW.recording_id;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE recordings 
        SET step_count = step_count - 1
        WHERE id = OLD.recording_id;
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ language 'plpgsql';

-- Create recording step count trigger
DROP TRIGGER IF EXISTS trigger_recording_step_count ON recording_steps;
CREATE TRIGGER trigger_recording_step_count
    AFTER INSERT OR DELETE ON recording_steps
    FOR EACH ROW
    EXECUTE FUNCTION update_recording_step_count();

-- Create default admin user (only if no users exist)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM users LIMIT 1) THEN
        INSERT INTO users (
            email, 
            username, 
            full_name, 
            password_hash, 
            role, 
            email_verified,
            is_active
        ) VALUES (
            'admin@qa-command-center.com',
            'admin',
            'QA Admin',
            crypt('admin123', gen_salt('bf')), -- Default password: admin123
            'admin',
            true,
            true
        );
        
        RAISE NOTICE 'Default admin user created: admin@qa-command-center.com / admin123';
        RAISE NOTICE 'Please change the default password after first login!';
    END IF;
END $$;

-- Create sample data for development (only if no projects exist)
DO $$
DECLARE
    admin_user_id UUID;
    sample_team_id UUID;
    sample_project_id UUID;
BEGIN
    -- Only create sample data if no projects exist
    IF NOT EXISTS (SELECT 1 FROM projects LIMIT 1) THEN
        -- Get admin user ID
        SELECT id INTO admin_user_id FROM users WHERE role = 'admin' LIMIT 1;
        
        IF admin_user_id IS NOT NULL THEN
            -- Create sample team
            INSERT INTO teams (name, description, slug, owner_id)
            VALUES ('QA Team', 'Default QA testing team', 'qa-team', admin_user_id)
            RETURNING id INTO sample_team_id;
            
            -- Add admin to team
            INSERT INTO team_members (team_id, user_id, role)
            VALUES (sample_team_id, admin_user_id, 'admin');
            
            -- Create sample project
            INSERT INTO projects (
                name, 
                description, 
                slug, 
                team_id, 
                owner_id,
                website_url,
                status
            ) VALUES (
                'Sample Web Application',
                'Demo project for testing QA Command Center features',
                'sample-web-app',
                sample_team_id,
                admin_user_id,
                'https://example.com',
                'active'
            ) RETURNING id INTO sample_project_id;
            
            -- Add admin to project
            INSERT INTO project_members (project_id, user_id, role)
            VALUES (sample_project_id, admin_user_id, 'admin');
            
            RAISE NOTICE 'Sample data created successfully';
        END IF;
    END IF;
END $$;

-- Clean up old sessions and expired data
CREATE OR REPLACE FUNCTION cleanup_expired_data()
RETURNS void AS $$
BEGIN
    -- Clean up expired sessions
    DELETE FROM sessions WHERE expires_at < NOW();
    
    -- Clean up old webhook deliveries (keep last 30 days)
    DELETE FROM webhook_deliveries WHERE created_at < NOW() - INTERVAL '30 days';
    
    -- Clean up old audit logs (keep last 90 days)
    DELETE FROM audit_logs WHERE created_at < NOW() - INTERVAL '90 days';
    
    -- Clean up old notifications (keep last 30 days for read, 7 days for unread)
    DELETE FROM notifications 
    WHERE (is_read = true AND created_at < NOW() - INTERVAL '30 days')
       OR (is_read = false AND created_at < NOW() - INTERVAL '7 days');
       
    RAISE NOTICE 'Expired data cleanup completed';
END;
$$ LANGUAGE plpgsql;

-- Grant permissions to application user
DO $$
BEGIN
    -- Create application user if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM pg_user WHERE usename = 'qa_user') THEN
        CREATE USER qa_user WITH PASSWORD 'qa_password';
    END IF;
    
    -- Grant necessary permissions
    GRANT CONNECT ON DATABASE qa_command_center TO qa_user;
    GRANT USAGE ON SCHEMA public TO qa_user;
    GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO qa_user;
    GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO qa_user;
    GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO qa_user;
    
    -- Grant permissions on future objects
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO qa_user;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO qa_user;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO qa_user;
END $$;

-- Create database statistics and maintenance
CREATE OR REPLACE FUNCTION database_maintenance()
RETURNS void AS $$
BEGIN
    -- Update table statistics
    ANALYZE;
    
    -- Reindex if needed (commented out for regular runs)
    -- REINDEX DATABASE qa_command_center;
    
    RAISE NOTICE 'Database maintenance completed';
END;
$$ LANGUAGE plpgsql;

-- Final status message
DO $$
BEGIN
    RAISE NOTICE '============================================';
    RAISE NOTICE 'QA Command Center database setup completed!';
    RAISE NOTICE '============================================';
    RAISE NOTICE 'Database: qa_command_center';
    RAISE NOTICE 'Tables created: %', (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public');
    RAISE NOTICE 'Indexes created: %', (SELECT COUNT(*) FROM pg_indexes WHERE schemaname = 'public');
    RAISE NOTICE 'Functions created: %', (SELECT COUNT(*) FROM pg_proc WHERE pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public'));
    RAISE NOTICE '============================================';
    RAISE NOTICE 'Next steps:';
    RAISE NOTICE '1. Run database migrations: npm run db:migrate';
    RAISE NOTICE '2. Seed test data: npm run db:seed';
    RAISE NOTICE '3. Change default admin password';
    RAISE NOTICE '============================================';
END $$;