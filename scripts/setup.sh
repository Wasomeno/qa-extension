#!/bin/bash

# QA Command Center Development Setup Script
# This script sets up the complete development environment

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PROJECT_NAME="QA Command Center"
NODE_VERSION="18"
POSTGRES_VERSION="15"
REDIS_VERSION="7"

# Helper functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

check_command() {
    if command -v "$1" >/dev/null 2>&1; then
        return 0
    else
        return 1
    fi
}

# Check if script is run from project root
if [ ! -f "package.json" ] || [ ! -d "backend" ] || [ ! -d "extension" ]; then
    log_error "Please run this script from the project root directory"
    exit 1
fi

echo "============================================="
echo "  ${PROJECT_NAME} Development Setup"
echo "============================================="
echo ""

# Check system requirements
log_info "Checking system requirements..."

# Check Node.js
if check_command node; then
    NODE_CURRENT=$(node --version | sed 's/v//')
    NODE_MAJOR=$(echo $NODE_CURRENT | cut -d. -f1)
    if [ "$NODE_MAJOR" -ge "$NODE_VERSION" ]; then
        log_success "Node.js $NODE_CURRENT found"
    else
        log_error "Node.js $NODE_VERSION or higher required. Found: $NODE_CURRENT"
        exit 1
    fi
else
    log_error "Node.js not found. Please install Node.js $NODE_VERSION or higher"
    exit 1
fi

# Check npm
if check_command npm; then
    NPM_VERSION=$(npm --version)
    log_success "npm $NPM_VERSION found"
else
    log_error "npm not found"
    exit 1
fi

# Check Git
if check_command git; then
    GIT_VERSION=$(git --version | cut -d' ' -f3)
    log_success "Git $GIT_VERSION found"
else
    log_error "Git not found. Please install Git"
    exit 1
fi

# Check Docker
if check_command docker; then
    DOCKER_VERSION=$(docker --version | cut -d' ' -f3 | sed 's/,//')
    log_success "Docker $DOCKER_VERSION found"
    DOCKER_AVAILABLE=true
else
    log_warning "Docker not found. Will attempt manual PostgreSQL/Redis setup"
    DOCKER_AVAILABLE=false
fi

# Check Docker Compose
if [ "$DOCKER_AVAILABLE" = true ]; then
    if check_command docker-compose || docker compose version >/dev/null 2>&1; then
        log_success "Docker Compose found"
        DOCKER_COMPOSE_AVAILABLE=true
    else
        log_warning "Docker Compose not found"
        DOCKER_COMPOSE_AVAILABLE=false
    fi
fi

echo ""

# Environment setup
log_info "Setting up environment configuration..."

if [ ! -f ".env" ]; then
    if [ -f ".env.example" ]; then
        cp .env.example .env
        log_success "Created .env file from .env.example"
        log_warning "Please review and update .env file with your configuration"
    else
        log_error ".env.example file not found"
        exit 1
    fi
else
    log_info ".env file already exists"
fi

# Create necessary directories
log_info "Creating necessary directories..."

DIRECTORIES=(
    "logs"
    "uploads"
    "temp"
    "backend/dist"
    "extension/dist"
    "database/backups"
    "tests/screenshots"
    "tests/reports"
)

for dir in "${DIRECTORIES[@]}"; do
    if [ ! -d "$dir" ]; then
        mkdir -p "$dir"
        log_success "Created directory: $dir"
    fi
done

# Setup with Docker (recommended)
if [ "$DOCKER_AVAILABLE" = true ] && [ "$DOCKER_COMPOSE_AVAILABLE" = true ]; then
    echo ""
    log_info "Setting up services with Docker..."
    
    # Check if containers are already running
    if docker-compose ps | grep -q "Up"; then
        log_warning "Some containers are already running. Stopping them first..."
        docker-compose down
    fi
    
    # Start PostgreSQL and Redis
    log_info "Starting PostgreSQL and Redis containers..."
    docker-compose up -d postgres redis
    
    # Wait for PostgreSQL to be ready
    log_info "Waiting for PostgreSQL to be ready..."
    for i in {1..30}; do
        if docker-compose exec -T postgres pg_isready -U qa_user -d qa_command_center >/dev/null 2>&1; then
            log_success "PostgreSQL is ready"
            break
        fi
        if [ $i -eq 30 ]; then
            log_error "PostgreSQL failed to start within 30 seconds"
            exit 1
        fi
        sleep 1
    done
    
    # Wait for Redis to be ready
    log_info "Waiting for Redis to be ready..."
    for i in {1..10}; do
        if docker-compose exec -T redis redis-cli ping >/dev/null 2>&1; then
            log_success "Redis is ready"
            break
        fi
        if [ $i -eq 10 ]; then
            log_error "Redis failed to start within 10 seconds"
            exit 1
        fi
        sleep 1
    done
    
    # Initialize database
    log_info "Initializing database..."
    if [ -f "database/init/001_setup.sql" ]; then
        docker-compose exec -T postgres psql -U qa_user -d qa_command_center -f /docker-entrypoint-initdb.d/001_setup.sql
        log_success "Database initialized"
    fi
    
    SERVICES_SETUP=true
else
    log_warning "Docker setup not available. Please ensure PostgreSQL and Redis are running manually"
    SERVICES_SETUP=false
fi

echo ""

# Install root dependencies
log_info "Installing root dependencies..."
if npm install; then
    log_success "Root dependencies installed"
else
    log_error "Failed to install root dependencies"
    exit 1
fi

# Install backend dependencies
log_info "Installing backend dependencies..."
cd backend
if npm install; then
    log_success "Backend dependencies installed"
else
    log_error "Failed to install backend dependencies"
    exit 1
fi

# Install extension dependencies
log_info "Installing extension dependencies..."
cd ../extension
if npm install; then
    log_success "Extension dependencies installed"
else
    log_error "Failed to install extension dependencies"
    exit 1
fi

cd ..

echo ""

# Database setup
if [ "$SERVICES_SETUP" = true ]; then
    log_info "Setting up database..."
    
    cd backend
    
    # Run migrations
    log_info "Running database migrations..."
    if npm run db:migrate; then
        log_success "Database migrations completed"
    else
        log_error "Database migrations failed"
        exit 1
    fi
    
    # Run seeds
    log_info "Running database seeds..."
    if npm run db:seed; then
        log_success "Database seeds completed"
    else
        log_warning "Database seeds failed (this might be expected if data already exists)"
    fi
    
    cd ..
fi

echo ""

# Build projects
log_info "Building projects..."

# Build backend
log_info "Building backend..."
cd backend
if npm run build; then
    log_success "Backend built successfully"
else
    log_error "Backend build failed"
    exit 1
fi

# Build extension
log_info "Building extension..."
cd ../extension
if npm run build; then
    log_success "Extension built successfully"
else
    log_error "Extension build failed"
    exit 1
fi

cd ..

echo ""

# Run tests
log_info "Running tests..."

# Backend tests
log_info "Running backend tests..."
cd backend
if npm test; then
    log_success "Backend tests passed"
else
    log_warning "Backend tests failed (might be expected on first setup)"
fi

# Extension tests
log_info "Running extension tests..."
cd ../extension
if npm test; then
    log_success "Extension tests passed"
else
    log_warning "Extension tests failed (might be expected on first setup)"
fi

cd ..

echo ""

# Setup Git hooks (if in a Git repository)
if [ -d ".git" ]; then
    log_info "Setting up Git hooks..."
    
    # Check if husky is available
    if [ -f "node_modules/.bin/husky" ]; then
        npx husky install
        log_success "Git hooks installed"
    else
        log_warning "Husky not found, skipping Git hooks setup"
    fi
fi

# Create development scripts
log_info "Creating development scripts..."

# Create start script
cat > scripts/start-dev.sh << 'EOF'
#!/bin/bash

# Start development servers
echo "Starting QA Command Center development environment..."

# Start services if not running
if ! docker-compose ps | grep -q "Up"; then
    echo "Starting Docker services..."
    docker-compose up -d postgres redis
fi

# Start backend in background
echo "Starting backend server..."
cd backend
npm run dev &
BACKEND_PID=$!

# Start extension build watcher
echo "Starting extension build watcher..."
cd ../extension
npm run dev &
EXTENSION_PID=$!

echo ""
echo "Development environment started!"
echo "Backend PID: $BACKEND_PID"
echo "Extension PID: $EXTENSION_PID"
echo ""
echo "Services:"
echo "- Backend API: http://localhost:3000"
echo "- Extension: Load from extension/dist/"
echo ""
echo "Press Ctrl+C to stop all services"

# Wait for interrupt
trap "kill $BACKEND_PID $EXTENSION_PID; exit" INT
wait
EOF

chmod +x scripts/start-dev.sh

# Create stop script
cat > scripts/stop-dev.sh << 'EOF'
#!/bin/bash

echo "Stopping QA Command Center development environment..."

# Kill Node.js processes
pkill -f "npm run dev"
pkill -f "node.*backend"
pkill -f "webpack.*watch"

# Stop Docker services
docker-compose down

echo "Development environment stopped"
EOF

chmod +x scripts/stop-dev.sh

log_success "Development scripts created"

echo ""

# Verify setup
log_info "Verifying setup..."

SETUP_ISSUES=()

# Check if backend can start
cd backend
if ! npm run typecheck; then
    SETUP_ISSUES+=("Backend TypeScript compilation failed")
fi

# Check if extension can build
cd ../extension
if ! npm run typecheck; then
    SETUP_ISSUES+=("Extension TypeScript compilation failed")
fi

cd ..

# Check Docker services
if [ "$SERVICES_SETUP" = true ]; then
    if ! docker-compose ps | grep postgres | grep -q "Up"; then
        SETUP_ISSUES+=("PostgreSQL container not running")
    fi
    
    if ! docker-compose ps | grep redis | grep -q "Up"; then
        SETUP_ISSUES+=("Redis container not running")
    fi
fi

# Report setup status
echo ""
echo "============================================="
if [ ${#SETUP_ISSUES[@]} -eq 0 ]; then
    log_success "Setup completed successfully!"
    echo ""
    echo "Next steps:"
    echo "1. Review and update .env file with your configuration"
    echo "2. Start development servers: ./scripts/start-dev.sh"
    echo "3. Load extension in Chrome from extension/dist/"
    echo "4. Visit http://localhost:3000/api/health to verify backend"
    echo ""
    echo "Default admin credentials:"
    echo "  Email: admin@qa-command-center.com"
    echo "  Password: admin123"
    echo "  (Change this password after first login!)"
    echo ""
    echo "Useful commands:"
    echo "  npm run dev          - Start development servers"
    echo "  npm run test         - Run all tests"
    echo "  npm run build        - Build for production"
    echo "  npm run db:migrate   - Run database migrations"
    echo "  npm run db:seed      - Seed database with test data"
else
    log_warning "Setup completed with issues:"
    for issue in "${SETUP_ISSUES[@]}"; do
        echo "  - $issue"
    done
    echo ""
    echo "Please resolve these issues before proceeding."
fi
echo "============================================="

# Health check
if [ "$SERVICES_SETUP" = true ]; then
    echo ""
    log_info "Running health check..."
    
    # Wait a moment for services to be fully ready
    sleep 3
    
    # Test database connection
    if docker-compose exec -T postgres psql -U qa_user -d qa_command_center -c "SELECT 1;" >/dev/null 2>&1; then
        log_success "Database connection: OK"
    else
        log_error "Database connection: FAILED"
    fi
    
    # Test Redis connection
    if docker-compose exec -T redis redis-cli ping >/dev/null 2>&1; then
        log_success "Redis connection: OK"
    else
        log_error "Redis connection: FAILED"
    fi
fi

echo ""
log_info "Setup script completed!"

# Optional: Open URLs
if check_command open && [ "$(uname)" = "Darwin" ]; then
    echo ""
    read -p "Open documentation in browser? (y/n): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        open "file://$(pwd)/README.md"
        open "file://$(pwd)/docs/api/README.md"
    fi
fi

exit 0