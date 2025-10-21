#!/bin/bash

# QA Command Center Build Script
# This script builds both backend and extension for production deployment

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PROJECT_NAME="QA Command Center"
BUILD_DIR="dist"
BACKEND_BUILD_DIR="backend/dist"
EXTENSION_BUILD_DIR="extension/dist"
ARTIFACTS_DIR="build-artifacts"

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

# Parse command line arguments
BUILD_MODE="production"
SKIP_TESTS=false
SKIP_LINT=false
CREATE_ARCHIVE=false
CLEAN_BUILD=false
VERBOSE=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --dev|--development)
            BUILD_MODE="development"
            shift
            ;;
        --skip-tests)
            SKIP_TESTS=true
            shift
            ;;
        --skip-lint)
            SKIP_LINT=true
            shift
            ;;
        --archive)
            CREATE_ARCHIVE=true
            shift
            ;;
        --clean)
            CLEAN_BUILD=true
            shift
            ;;
        --verbose)
            VERBOSE=true
            shift
            ;;
        -h|--help)
            echo "QA Command Center Build Script"
            echo ""
            echo "Usage: $0 [options]"
            echo ""
            echo "Options:"
            echo "  --dev, --development   Build in development mode"
            echo "  --skip-tests          Skip running tests"
            echo "  --skip-lint           Skip linting"
            echo "  --archive             Create deployment archive"
            echo "  --clean               Clean build directories first"
            echo "  --verbose             Verbose output"
            echo "  -h, --help            Show this help message"
            echo ""
            exit 0
            ;;
        *)
            log_error "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Check if script is run from project root
if [ ! -f "package.json" ] || [ ! -d "backend" ] || [ ! -d "extension" ]; then
    log_error "Please run this script from the project root directory"
    exit 1
fi

echo "============================================="
echo "  ${PROJECT_NAME} Build Script"
echo "============================================="
echo "Build mode: $BUILD_MODE"
echo "Skip tests: $SKIP_TESTS"
echo "Skip lint: $SKIP_LINT"
echo "Create archive: $CREATE_ARCHIVE"
echo "Clean build: $CLEAN_BUILD"
echo ""

# Set environment
export NODE_ENV=$BUILD_MODE

# Clean build directories if requested
if [ "$CLEAN_BUILD" = true ]; then
    log_info "Cleaning build directories..."

    # Clean backend build
    if [ -d "$BACKEND_BUILD_DIR" ]; then
        rm -rf "$BACKEND_BUILD_DIR"
        log_success "Cleaned backend build directory"
    fi

    # Clean extension build
    if [ -d "$EXTENSION_BUILD_DIR" ]; then
        rm -rf "$EXTENSION_BUILD_DIR"
        log_success "Cleaned extension build directory"
    fi

    # Clean artifacts
    if [ -d "$ARTIFACTS_DIR" ]; then
        rm -rf "$ARTIFACTS_DIR"
        log_success "Cleaned artifacts directory"
    fi

    # Clean node_modules if needed
    if [ "$BUILD_MODE" = "production" ]; then
        log_info "Cleaning node_modules for fresh install..."
        rm -rf node_modules backend/node_modules extension/node_modules
        log_success "Cleaned node_modules"
    fi
fi

# Install dependencies
log_info "Installing dependencies..."

# Root dependencies
log_info "Installing root dependencies..."
if npm ci --silent; then
    log_success "Root dependencies installed"
else
    log_error "Failed to install root dependencies"
    exit 1
fi

# Backend dependencies
log_info "Installing backend dependencies..."
cd backend
if npm ci --silent; then
    log_success "Backend dependencies installed"
else
    log_error "Failed to install backend dependencies"
    exit 1
fi

# Extension dependencies
log_info "Installing extension dependencies..."
cd ../extension
if npm ci --silent; then
    log_success "Extension dependencies installed"
else
    log_error "Failed to install extension dependencies"
    exit 1
fi

cd ..

# Code quality checks
if [ "$SKIP_LINT" = false ]; then
    echo ""
    log_info "Running code quality checks..."

    # Backend linting
    log_info "Linting backend code..."
    cd backend
    if npm run lint; then
        log_success "Backend linting passed"
    else
        log_error "Backend linting failed"
        exit 1
    fi

    # Backend type checking
    log_info "Type checking backend code..."
    if npm run typecheck; then
        log_success "Backend type checking passed"
    else
        log_error "Backend type checking failed"
        exit 1
    fi

    # Extension linting
    log_info "Linting extension code..."
    cd ../extension
    if npm run lint; then
        log_success "Extension linting passed"
    else
        log_error "Extension linting failed"
        exit 1
    fi

    # Extension type checking
    log_info "Type checking extension code..."
    if npm run typecheck; then
        log_success "Extension type checking passed"
    else
        log_error "Extension type checking failed"
        exit 1
    fi

    cd ..
fi

# Run tests
if [ "$SKIP_TESTS" = false ]; then
    echo ""
    log_info "Running tests..."

    # Backend tests
    log_info "Running backend tests..."
    cd backend
    if npm run test:coverage; then
        log_success "Backend tests passed"
    else
        log_error "Backend tests failed"
        exit 1
    fi

    # Extension tests
    log_info "Running extension tests..."
    cd ../extension
    if npm run test:coverage; then
        log_success "Extension tests passed"
    else
        log_error "Extension tests failed"
        exit 1
    fi

    cd ..

    # Combine test coverage reports
    if check_command nyc; then
        log_info "Combining coverage reports..."
        mkdir -p coverage
        cp backend/coverage/coverage-final.json coverage/backend-coverage.json
        cp extension/coverage/coverage-final.json coverage/extension-coverage.json
    fi
fi

# Build backend
echo ""
log_info "Building backend..."
cd backend

# Create build info
BUILD_INFO="{
    \"version\": \"$(node -p "require('./package.json').version")\",
    \"buildDate\": \"$(date -u +"%Y-%m-%dT%H:%M:%SZ")\",
    \"buildMode\": \"$BUILD_MODE\",
    \"gitCommit\": \"$(git rev-parse --short HEAD 2>/dev/null || echo 'unknown')\",
    \"gitBranch\": \"$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo 'unknown')\"
}"

echo "$BUILD_INFO" > src/build-info.json

if [ "$VERBOSE" = true ]; then
    npm run build
else
    npm run build --silent
fi

if [ -d "dist" ]; then
    log_success "Backend built successfully"

    # Copy additional files
    cp package.json dist/
    cp package-lock.json dist/ 2>/dev/null || true

    # Create production package.json
    node -e "
        const pkg = require('./package.json');
        const prodPkg = {
            name: pkg.name,
            version: pkg.version,
            description: pkg.description,
            main: pkg.main,
            scripts: {
                start: pkg.scripts.start
            },
            dependencies: pkg.dependencies,
            engines: pkg.engines
        };
        require('fs').writeFileSync('./dist/package.json', JSON.stringify(prodPkg, null, 2));
    "

    log_success "Backend package.json optimized for production"
else
    log_error "Backend build failed - dist directory not created"
    exit 1
fi

# Build extension
log_info "Building extension..."
cd ../extension

# Create build info for extension
BUILD_INFO_EXT="{
    \"version\": \"$(node -p "require('./package.json').version")\",
    \"buildDate\": \"$(date -u +"%Y-%m-%dT%H:%M:%SZ")\",
    \"buildMode\": \"$BUILD_MODE\",
    \"gitCommit\": \"$(git rev-parse --short HEAD 2>/dev/null || echo 'unknown')\",
    \"gitBranch\": \"$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo 'unknown')\"
}"

echo "$BUILD_INFO_EXT" > src/build-info.json

if [ "$VERBOSE" = true ]; then
    npm run build
else
    npm run build --silent
fi

if [ -d "dist" ]; then
    log_success "Extension built successfully"

    TARGETS=("chrome" "firefox")
    REQUIRED_FILES=("background.js" "content.js" "popup.html" "options.html")

    for target in "${TARGETS[@]}"; do
        TARGET_DIR="dist/$target"
        if [ ! -d "$TARGET_DIR" ]; then
            log_error "Extension build failed - $TARGET_DIR directory not created"
            exit 1
        fi

        if [ -f "$TARGET_DIR/manifest.json" ]; then
            if node -e "JSON.parse(require('fs').readFileSync('$TARGET_DIR/manifest.json', 'utf8'))" 2>/dev/null; then
                log_success "Extension manifest is valid for $target"
            else
                log_error "Extension manifest is invalid for $target"
                exit 1
            fi
        else
            log_error "Extension manifest not found for $target"
            exit 1
        fi

        for file in "${REQUIRED_FILES[@]}"; do
            if [ -f "$TARGET_DIR/$file" ]; then
                log_success "Extension file found (${target}): $file"
            else
                log_warning "Extension file missing (${target}): $file"
            fi
        done
    done
else
    log_error "Extension build failed - dist directory not created"
    exit 1
fi

cd ..

# Post-build optimizations
echo ""
log_info "Running post-build optimizations..."

# Backend optimizations
if [ "$BUILD_MODE" = "production" ]; then
    log_info "Optimizing backend build..."

    # Remove source maps in production
    find "$BACKEND_BUILD_DIR" -name "*.map" -delete

    # Remove development dependencies
    cd backend/dist
    npm install --production --silent
    cd ../..

    log_success "Backend optimized for production"
fi

# Extension optimizations
if [ "$BUILD_MODE" = "production" ] && check_command zip; then
    log_info "Creating extension package..."

    cd extension/dist
    zip -r "../qa-command-center-extension.zip" . -x "*.map" "*.dev.*"
    cd ../..

    log_success "Extension package created: extension/qa-command-center-extension.zip"
fi

# Create deployment artifacts
if [ "$CREATE_ARCHIVE" = true ]; then
    echo ""
    log_info "Creating deployment artifacts..."

    mkdir -p "$ARTIFACTS_DIR"

    # Create backend archive
    if check_command tar; then
        tar -czf "$ARTIFACTS_DIR/qa-command-center-backend.tar.gz" -C backend dist package.json
        log_success "Backend archive created: $ARTIFACTS_DIR/qa-command-center-backend.tar.gz"
    fi

    # Copy extension package
    if [ -f "extension/qa-command-center-extension.zip" ]; then
        cp "extension/qa-command-center-extension.zip" "$ARTIFACTS_DIR/"
        log_success "Extension package copied to artifacts"
    fi

    # Create Docker images if Dockerfile exists
    if [ -f "backend/Dockerfile" ] && check_command docker; then
        log_info "Building Docker image..."
        docker build -t qa-command-center-backend:latest backend/
        docker save qa-command-center-backend:latest | gzip > "$ARTIFACTS_DIR/qa-command-center-backend-docker.tar.gz"
        log_success "Docker image saved: $ARTIFACTS_DIR/qa-command-center-backend-docker.tar.gz"
    fi

    # Create deployment info
    DEPLOYMENT_INFO="{
        \"version\": \"$(node -p "require('./package.json').version")\",
        \"buildDate\": \"$(date -u +"%Y-%m-%dT%H:%M:%SZ")\",
        \"buildMode\": \"$BUILD_MODE\",
        \"gitCommit\": \"$(git rev-parse --short HEAD 2>/dev/null || echo 'unknown')\",
        \"gitBranch\": \"$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo 'unknown')\",
        \"artifacts\": [
            \"qa-command-center-backend.tar.gz\",
            \"qa-command-center-extension.zip\",
            \"qa-command-center-backend-docker.tar.gz\"
        ]
    }"

    echo "$DEPLOYMENT_INFO" > "$ARTIFACTS_DIR/deployment-info.json"
    log_success "Deployment info created"
fi

# Build verification
echo ""
log_info "Verifying build..."

BUILD_ISSUES=()

# Check backend build
if [ ! -f "$BACKEND_BUILD_DIR/server.js" ]; then
    BUILD_ISSUES+=("Backend server.js not found")
fi

if [ ! -f "$BACKEND_BUILD_DIR/package.json" ]; then
    BUILD_ISSUES+=("Backend package.json not found")
fi

# Check extension build
if [ ! -f "$EXTENSION_BUILD_DIR/manifest.json" ]; then
    BUILD_ISSUES+=("Extension manifest.json not found")
fi

if [ ! -f "$EXTENSION_BUILD_DIR/background.js" ]; then
    BUILD_ISSUES+=("Extension background.js not found")
fi

# Calculate build sizes
BACKEND_SIZE=$(du -sh "$BACKEND_BUILD_DIR" 2>/dev/null | cut -f1 || echo "unknown")
EXTENSION_SIZE=$(du -sh "$EXTENSION_BUILD_DIR" 2>/dev/null | cut -f1 || echo "unknown")

# Generate build report
echo ""
echo "============================================="
echo "  Build Report"
echo "============================================="
echo "Build mode: $BUILD_MODE"
echo "Backend size: $BACKEND_SIZE"
echo "Extension size: $EXTENSION_SIZE"
echo "Build artifacts:"
echo "  - Backend: $BACKEND_BUILD_DIR/"
echo "  - Extension: $EXTENSION_BUILD_DIR/"

if [ -f "extension/qa-command-center-extension.zip" ]; then
    EXTENSION_ZIP_SIZE=$(du -sh "extension/qa-command-center-extension.zip" | cut -f1)
    echo "  - Extension package: extension/qa-command-center-extension.zip ($EXTENSION_ZIP_SIZE)"
fi

if [ "$CREATE_ARCHIVE" = true ] && [ -d "$ARTIFACTS_DIR" ]; then
    echo "  - Deployment artifacts: $ARTIFACTS_DIR/"
fi

echo ""

if [ ${#BUILD_ISSUES[@]} -eq 0 ]; then
    log_success "Build completed successfully!"

    echo ""
    echo "Next steps for deployment:"
    echo "1. Backend: Deploy contents of $BACKEND_BUILD_DIR/"
    echo "2. Extension: Upload extension/qa-command-center-extension.zip to Chrome Web Store"
    echo "3. Database: Run migrations in production environment"
    echo "4. Services: Ensure PostgreSQL and Redis are configured"

    if [ "$BUILD_MODE" = "production" ]; then
        echo ""
        echo "Production deployment checklist:"
        echo "□ Update environment variables"
        echo "□ Configure SSL certificates"
        echo "□ Set up monitoring and logging"
        echo "□ Configure backup procedures"
        echo "□ Test in staging environment"
    fi

else
    log_error "Build completed with issues:"
    for issue in "${BUILD_ISSUES[@]}"; do
        echo "  - $issue"
    done
    exit 1
fi

echo "============================================="

# Optional: Test built applications
if [ "$BUILD_MODE" = "development" ] && [ "$SKIP_TESTS" = false ]; then
    echo ""
    read -p "Run smoke tests on built applications? (y/n): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        log_info "Running smoke tests..."

        # Test backend
        cd backend/dist
        timeout 10s node server.js &
        SERVER_PID=$!
        sleep 3

        if curl -f http://localhost:3000/api/health >/dev/null 2>&1; then
            log_success "Backend smoke test passed"
        else
            log_warning "Backend smoke test failed"
        fi

        kill $SERVER_PID 2>/dev/null || true
        cd ../..
    fi
fi

log_info "Build script completed!"
exit 0
