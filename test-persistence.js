// Test script to manually check login persistence
// Run this in the browser console on the extension popup

async function testPersistence() {
  console.log('=== TESTING LOGIN PERSISTENCE ===');
  
  // Test 1: Check current storage state
  console.log('1. Checking current storage state...');
  
  try {
    const result = await chrome.storage.local.get(['auth', 'user']);
    console.log('Raw storage data:', result);
    
    if (result.auth) {
      console.log('✅ Auth data found:', {
        hasJwtToken: !!result.auth.jwtToken,
        hasRefreshToken: !!result.auth.refreshToken,
        expiresAt: result.auth.expiresAt ? new Date(result.auth.expiresAt).toISOString() : 'none',
        isExpired: result.auth.expiresAt ? Date.now() > result.auth.expiresAt : 'unknown'
      });
    } else {
      console.log('❌ No auth data found in storage');
    }
    
    if (result.user) {
      console.log('✅ User data found:', {
        email: result.user.email,
        fullName: result.user.fullName
      });
    } else {
      console.log('❌ No user data found in storage');
    }
    
  } catch (error) {
    console.error('❌ Error accessing storage:', error);
  }
  
  // Test 2: Set test data
  console.log('2. Setting test auth data...');
  
  const testAuth = {
    jwtToken: 'test-jwt-token-' + Date.now(),
    refreshToken: 'test-refresh-token-' + Date.now(),
    expiresAt: Date.now() + (24 * 60 * 60 * 1000) // 24 hours from now
  };
  
  const testUser = {
    id: 'test-user-id',
    email: 'test@example.com',
    fullName: 'Test User'
  };
  
  try {
    await chrome.storage.local.set({
      auth: testAuth,
      user: testUser
    });
    console.log('✅ Test data stored successfully');
    
    // Verify immediately
    const verification = await chrome.storage.local.get(['auth', 'user']);
    console.log('✅ Verification successful:', {
      authMatches: verification.auth?.jwtToken === testAuth.jwtToken,
      userMatches: verification.user?.email === testUser.email
    });
    
    console.log('🎯 Now close and reopen the popup to test persistence!');
    
  } catch (error) {
    console.error('❌ Error storing test data:', error);
  }
}

// Run the test
testPersistence();