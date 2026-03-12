# Auth-Gated App Testing Playbook

## Step 1: Create Test User & Session
```bash
mongosh --eval "
use('test_database');
var visitorId = 'user_' + Date.now();
var sessionToken = 'test_session_' + Date.now();
db.users.insertOne({
  user_id: visitorId,
  email: 'test.user.' + Date.now() + '@example.com',
  name: 'Test User',
  picture: 'https://via.placeholder.com/150',
  created_at: new Date(),
  balances: { LTC: 0.05, TRX: 15, JST: 25 },
  last_claim_timestamps: { LTC: null, TRX: null, JST: null },
  consecutive_days: 5,
  last_claim_date: null,
  ip_addresses: []
});
db.user_sessions.insertOne({
  user_id: visitorId,
  session_token: sessionToken,
  expires_at: new Date(Date.now() + 7*24*60*60*1000),
  created_at: new Date()
});
print('Session token: ' + sessionToken);
print('User ID: ' + visitorId);
"
```

## Step 2: Test Backend API
```bash
# Test auth endpoint
curl -X GET "https://ad-crypto-earner.preview.emergentagent.com/api/auth/me" \
  -H "Authorization: Bearer YOUR_SESSION_TOKEN"

# Test balance endpoint
curl -X GET "https://ad-crypto-earner.preview.emergentagent.com/api/balance" \
  -H "Authorization: Bearer YOUR_SESSION_TOKEN"

# Test claim endpoint
curl -X POST "https://ad-crypto-earner.preview.emergentagent.com/api/claim/LTC" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_SESSION_TOKEN" \
  -d '{"ad_viewed": true}'
```

## Step 3: Browser Testing
```python
# Set cookie and navigate
await page.context.add_cookies([{
    "name": "session_token",
    "value": "YOUR_SESSION_TOKEN",
    "domain": "ad-crypto-earner.preview.emergentagent.com",
    "path": "/",
    "httpOnly": True,
    "secure": True,
    "sameSite": "None"
}])
await page.goto("https://ad-crypto-earner.preview.emergentagent.com")
```

## Checklist
- [ ] User document has `user_id` field (custom ID, not MongoDB's _id)
- [ ] Session `user_id` matches `users.user_id` exactly
- [ ] All queries exclude `_id` with `{"_id": 0}`
- [ ] API returns user data (not 401/404)
- [ ] Dashboard loads (not login page)

## Success Indicators
- /api/auth/me returns user data with `user_id` field
- Dashboard loads without redirect
- Claim and withdrawal operations work
- Timer countdown is server-validated

## Failure Indicators
- "User not found" errors
- 401 Unauthorized responses
- Redirect to login page
