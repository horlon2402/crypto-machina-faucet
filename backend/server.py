from fastapi import FastAPI, APIRouter, HTTPException, Request, Depends, Response, Header
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Dict
import uuid
from datetime import datetime, timezone, timedelta
import httpx

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# ===================== CONSTANTS =====================
CLAIM_COOLDOWN_SECONDS = 300  # 5 minutes
MAX_LOYALTY_BONUS = 100  # +100% max

# Admin password - CHANGE THIS IN PRODUCTION!
ADMIN_PASSWORD = "admin123"

REWARDS = {
    "LTC": 0.00000250,
    "TRX": 0.01,
    "JST": 0.05
}

WITHDRAWAL_THRESHOLDS = {
    "LTC": 0.01,
    "TRX": 10,
    "JST": 20
}

# ===================== MODELS =====================
class User(BaseModel):
    user_id: str
    email: str
    name: str
    picture: Optional[str] = None
    created_at: datetime
    balances: Dict[str, float] = {"LTC": 0.0, "TRX": 0.0, "JST": 0.0}
    last_claim_timestamps: Dict[str, Optional[datetime]] = {"LTC": None, "TRX": None, "JST": None}
    consecutive_days: int = 0
    last_claim_date: Optional[str] = None  # YYYY-MM-DD format
    ip_addresses: List[str] = []

class SessionDataResponse(BaseModel):
    id: str
    email: str
    name: str
    picture: Optional[str] = None
    session_token: str

class ClaimRequest(BaseModel):
    ad_viewed: bool = True  # Client confirms ad was viewed

class ClaimResponse(BaseModel):
    success: bool
    coin: str
    reward: float
    bonus_percent: int
    total_reward: float
    new_balance: float
    next_claim_available: datetime
    message: str

class BalanceResponse(BaseModel):
    balances: Dict[str, float]
    consecutive_days: int
    bonus_percent: int
    claim_status: Dict[str, dict]  # {coin: {available: bool, seconds_remaining: int}}

class WithdrawalRequest(BaseModel):
    coin: str
    amount: float
    wallet_address: str

class WithdrawalResponse(BaseModel):
    success: bool
    request_id: str
    message: str

class WithdrawalRecord(BaseModel):
    request_id: str
    user_id: str
    coin: str
    amount: float
    wallet_address: str
    status: str  # "pending", "completed", "rejected"
    created_at: datetime
    processed_at: Optional[datetime] = None

# ===================== AUTH HELPERS =====================
async def get_session_from_emergent(session_id: str) -> Optional[SessionDataResponse]:
    """Exchange session_id for user data from Emergent Auth"""
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
                headers={"X-Session-ID": session_id}
            )
            if response.status_code == 200:
                user_data = response.json()
                return SessionDataResponse(**user_data)
            else:
                logger.error(f"Emergent auth failed: {response.status_code} - {response.text}")
                return None
    except Exception as e:
        logger.error(f"Error getting session from Emergent: {e}")
        return None

async def get_current_user(request: Request) -> Optional[User]:
    """Get current user from session token"""
    # Try cookie first
    session_token = request.cookies.get("session_token")
    
    # Fallback to Authorization header
    if not session_token:
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            session_token = auth_header.split(" ")[1]
    
    if not session_token:
        return None
    
    # Find session
    session = await db.user_sessions.find_one(
        {"session_token": session_token},
        {"_id": 0}
    )
    
    if not session:
        return None
    
    # Check expiry (handle naive datetime from MongoDB)
    expires_at = session["expires_at"]
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    
    if expires_at < datetime.now(timezone.utc):
        return None
    
    # Get user
    user_doc = await db.users.find_one(
        {"user_id": session["user_id"]},
        {"_id": 0}
    )
    
    if user_doc:
        return User(**user_doc)
    return None

async def require_auth(request: Request) -> User:
    """Require authentication - raises 401 if not authenticated"""
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user

def get_client_ip(request: Request) -> str:
    """Get client IP address"""
    # Check for forwarded headers
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    
    real_ip = request.headers.get("X-Real-IP")
    if real_ip:
        return real_ip
    
    return request.client.host if request.client else "unknown"

# ===================== ADMIN AUTH =====================
async def verify_admin(x_admin_key: Optional[str] = Header(None)) -> bool:
    """Verify admin authentication"""
    if x_admin_key != ADMIN_PASSWORD:
        raise HTTPException(status_code=401, detail="Invalid admin credentials")
    return True

# ===================== VPN DETECTION =====================
# Simple VPN detection - check for known VPN/proxy patterns
VPN_INDICATORS = [
    "proxy", "vpn", "tor", "datacenter", "hosting",
    "cloud", "amazon", "google", "azure", "digital"
]

async def is_vpn_or_proxy(ip: str) -> bool:
    """Basic VPN/Proxy detection using IP reputation"""
    try:
        # For MVP, we'll do a simple check
        # In production, you'd use a service like ipinfo.io, ipapi.com, etc.
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get(f"http://ip-api.com/json/{ip}?fields=proxy,hosting")
            if response.status_code == 200:
                data = response.json()
                return data.get("proxy", False) or data.get("hosting", False)
    except Exception as e:
        logger.warning(f"VPN check failed for {ip}: {e}")
    return False

async def check_ip_abuse(user_id: str, ip: str) -> Optional[str]:
    """Check if IP is already used by another account"""
    existing_user = await db.users.find_one(
        {
            "user_id": {"$ne": user_id},
            "ip_addresses": ip
        },
        {"_id": 0}
    )
    
    if existing_user:
        return f"This IP address is already associated with another account"
    return None

# ===================== LOYALTY BONUS =====================
def calculate_bonus_percent(consecutive_days: int) -> int:
    """Calculate loyalty bonus percentage (max 100%)"""
    return min(consecutive_days, MAX_LOYALTY_BONUS)

def update_streak(last_claim_date: Optional[str], consecutive_days: int) -> tuple:
    """Update streak based on last claim date. Returns (new_consecutive_days, new_last_claim_date)"""
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    yesterday = (datetime.now(timezone.utc) - timedelta(days=1)).strftime("%Y-%m-%d")
    
    if last_claim_date is None:
        # First claim ever
        return (1, today)
    elif last_claim_date == today:
        # Already claimed today, no change
        return (consecutive_days, today)
    elif last_claim_date == yesterday:
        # Consecutive day!
        return (consecutive_days + 1, today)
    else:
        # Streak broken, reset to 1
        return (1, today)

# ===================== AUTH ENDPOINTS =====================
@api_router.post("/auth/session")
async def exchange_session(request: Request, response: Response):
    """Exchange session_id for session_token"""
    body = await request.json()
    session_id = body.get("session_id")
    
    if not session_id:
        raise HTTPException(status_code=400, detail="session_id required")
    
    # Get user data from Emergent
    session_data = await get_session_from_emergent(session_id)
    if not session_data:
        raise HTTPException(status_code=401, detail="Invalid session_id")
    
    # Get client IP
    client_ip = get_client_ip(request)
    
    # Check for VPN
    if await is_vpn_or_proxy(client_ip):
        raise HTTPException(status_code=403, detail="VPN/Proxy detected. Please disable to continue.")
    
    # Check or create user
    existing_user = await db.users.find_one({"email": session_data.email}, {"_id": 0})
    
    if existing_user:
        user_id = existing_user["user_id"]
        # Check IP abuse
        ip_error = await check_ip_abuse(user_id, client_ip)
        if ip_error:
            raise HTTPException(status_code=403, detail=ip_error)
        
        # Add IP to user's list if not already there
        if client_ip not in existing_user.get("ip_addresses", []):
            await db.users.update_one(
                {"user_id": user_id},
                {"$addToSet": {"ip_addresses": client_ip}}
            )
    else:
        # Check if IP is used by other accounts
        ip_conflict = await db.users.find_one({"ip_addresses": client_ip}, {"_id": 0})
        if ip_conflict:
            raise HTTPException(status_code=403, detail="This IP address is already associated with another account")
        
        # Create new user
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        new_user = {
            "user_id": user_id,
            "email": session_data.email,
            "name": session_data.name,
            "picture": session_data.picture,
            "created_at": datetime.now(timezone.utc),
            "balances": {"LTC": 0.0, "TRX": 0.0, "JST": 0.0},
            "last_claim_timestamps": {"LTC": None, "TRX": None, "JST": None},
            "consecutive_days": 0,
            "last_claim_date": None,
            "ip_addresses": [client_ip]
        }
        await db.users.insert_one(new_user)
    
    # Create session
    session_token = session_data.session_token
    expires_at = datetime.now(timezone.utc) + timedelta(days=7)
    
    await db.user_sessions.insert_one({
        "user_id": user_id,
        "session_token": session_token,
        "expires_at": expires_at,
        "created_at": datetime.now(timezone.utc)
    })
    
    # Set cookie
    response.set_cookie(
        key="session_token",
        value=session_token,
        httponly=True,
        secure=True,
        samesite="none",
        path="/",
        max_age=7 * 24 * 60 * 60  # 7 days
    )
    
    # Get user for response
    user_doc = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    
    return {
        "success": True,
        "session_token": session_token,
        "user": user_doc
    }

@api_router.get("/auth/me")
async def get_me(user: User = Depends(require_auth)):
    """Get current user info"""
    return user.model_dump()

@api_router.post("/auth/logout")
async def logout(request: Request, response: Response):
    """Logout user"""
    session_token = request.cookies.get("session_token")
    if not session_token:
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            session_token = auth_header.split(" ")[1]
    
    if session_token:
        await db.user_sessions.delete_one({"session_token": session_token})
    
    response.delete_cookie(key="session_token", path="/")
    return {"success": True, "message": "Logged out"}

# ===================== CLAIM ENDPOINTS =====================
@api_router.post("/claim/{coin}", response_model=ClaimResponse)
async def claim_reward(
    coin: str,
    claim_data: ClaimRequest,
    request: Request,
    user: User = Depends(require_auth)
):
    """Claim reward for a specific coin"""
    coin = coin.upper()
    
    # Validate coin
    if coin not in REWARDS:
        raise HTTPException(status_code=400, detail=f"Invalid coin: {coin}")
    
    # Check if ad was viewed
    if not claim_data.ad_viewed:
        raise HTTPException(status_code=400, detail="Must watch ad to claim reward")
    
    # Get client IP for anti-fraud
    client_ip = get_client_ip(request)
    
    # Check VPN
    if await is_vpn_or_proxy(client_ip):
        raise HTTPException(status_code=403, detail="VPN/Proxy detected. Please disable to claim.")
    
    # Get fresh user data
    user_doc = await db.users.find_one({"user_id": user.user_id}, {"_id": 0})
    if not user_doc:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Check cooldown - SERVER-SIDE VALIDATION
    last_claim = user_doc.get("last_claim_timestamps", {}).get(coin)
    now = datetime.now(timezone.utc)
    
    if last_claim:
        # Handle naive datetime from MongoDB
        if last_claim.tzinfo is None:
            last_claim = last_claim.replace(tzinfo=timezone.utc)
        
        time_since_claim = (now - last_claim).total_seconds()
        if time_since_claim < CLAIM_COOLDOWN_SECONDS:
            seconds_remaining = int(CLAIM_COOLDOWN_SECONDS - time_since_claim)
            raise HTTPException(
                status_code=429,
                detail=f"Please wait {seconds_remaining} seconds before claiming {coin} again"
            )
    
    # Update streak
    current_streak = user_doc.get("consecutive_days", 0)
    last_claim_date = user_doc.get("last_claim_date")
    new_streak, new_last_claim_date = update_streak(last_claim_date, current_streak)
    
    # Calculate reward with bonus
    base_reward = REWARDS[coin]
    bonus_percent = calculate_bonus_percent(new_streak)
    total_reward = base_reward * (1 + bonus_percent / 100)
    
    # Update balances
    current_balance = user_doc.get("balances", {}).get(coin, 0.0)
    new_balance = current_balance + total_reward
    
    # Update user in database
    await db.users.update_one(
        {"user_id": user.user_id},
        {
            "$set": {
                f"balances.{coin}": new_balance,
                f"last_claim_timestamps.{coin}": now,
                "consecutive_days": new_streak,
                "last_claim_date": new_last_claim_date
            },
            "$addToSet": {"ip_addresses": client_ip}
        }
    )
    
    # Log claim for audit
    await db.claim_logs.insert_one({
        "user_id": user.user_id,
        "coin": coin,
        "base_reward": base_reward,
        "bonus_percent": bonus_percent,
        "total_reward": total_reward,
        "ip_address": client_ip,
        "timestamp": now
    })
    
    next_claim = now + timedelta(seconds=CLAIM_COOLDOWN_SECONDS)
    
    return ClaimResponse(
        success=True,
        coin=coin,
        reward=base_reward,
        bonus_percent=bonus_percent,
        total_reward=total_reward,
        new_balance=new_balance,
        next_claim_available=next_claim,
        message=f"Successfully claimed {total_reward:.8f} {coin}! (+{bonus_percent}% loyalty bonus)"
    )

@api_router.get("/balance", response_model=BalanceResponse)
async def get_balance(user: User = Depends(require_auth)):
    """Get user balances and claim status"""
    # Get fresh user data
    user_doc = await db.users.find_one({"user_id": user.user_id}, {"_id": 0})
    if not user_doc:
        raise HTTPException(status_code=404, detail="User not found")
    
    now = datetime.now(timezone.utc)
    claim_status = {}
    
    for coin in REWARDS.keys():
        last_claim = user_doc.get("last_claim_timestamps", {}).get(coin)
        
        if last_claim is None:
            claim_status[coin] = {"available": True, "seconds_remaining": 0}
        else:
            if last_claim.tzinfo is None:
                last_claim = last_claim.replace(tzinfo=timezone.utc)
            
            time_since = (now - last_claim).total_seconds()
            if time_since >= CLAIM_COOLDOWN_SECONDS:
                claim_status[coin] = {"available": True, "seconds_remaining": 0}
            else:
                claim_status[coin] = {
                    "available": False,
                    "seconds_remaining": int(CLAIM_COOLDOWN_SECONDS - time_since)
                }
    
    consecutive_days = user_doc.get("consecutive_days", 0)
    bonus_percent = calculate_bonus_percent(consecutive_days)
    
    return BalanceResponse(
        balances=user_doc.get("balances", {"LTC": 0.0, "TRX": 0.0, "JST": 0.0}),
        consecutive_days=consecutive_days,
        bonus_percent=bonus_percent,
        claim_status=claim_status
    )

# ===================== WITHDRAWAL ENDPOINTS =====================
@api_router.post("/withdraw/request", response_model=WithdrawalResponse)
async def request_withdrawal(
    withdrawal: WithdrawalRequest,
    user: User = Depends(require_auth)
):
    """Request a withdrawal"""
    coin = withdrawal.coin.upper()
    
    # Validate coin
    if coin not in WITHDRAWAL_THRESHOLDS:
        raise HTTPException(status_code=400, detail=f"Invalid coin: {coin}")
    
    # Validate wallet address (basic check)
    if not withdrawal.wallet_address or len(withdrawal.wallet_address) < 20:
        raise HTTPException(status_code=400, detail="Invalid wallet address")
    
    # Get user's current balance
    user_doc = await db.users.find_one({"user_id": user.user_id}, {"_id": 0})
    if not user_doc:
        raise HTTPException(status_code=404, detail="User not found")
    
    current_balance = user_doc.get("balances", {}).get(coin, 0.0)
    
    # Check minimum threshold
    min_threshold = WITHDRAWAL_THRESHOLDS[coin]
    if withdrawal.amount < min_threshold:
        raise HTTPException(
            status_code=400,
            detail=f"Minimum withdrawal for {coin} is {min_threshold}"
        )
    
    # Check sufficient balance
    if current_balance < withdrawal.amount:
        raise HTTPException(
            status_code=400,
            detail=f"Insufficient balance. You have {current_balance} {coin}"
        )
    
    # Create withdrawal request
    request_id = f"wd_{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc)
    
    withdrawal_record = {
        "request_id": request_id,
        "user_id": user.user_id,
        "coin": coin,
        "amount": withdrawal.amount,
        "wallet_address": withdrawal.wallet_address,
        "status": "pending",
        "created_at": now,
        "processed_at": None
    }
    
    await db.withdrawal_requests.insert_one(withdrawal_record)
    
    # Deduct from balance
    new_balance = current_balance - withdrawal.amount
    await db.users.update_one(
        {"user_id": user.user_id},
        {"$set": {f"balances.{coin}": new_balance}}
    )
    
    return WithdrawalResponse(
        success=True,
        request_id=request_id,
        message=f"Withdrawal request for {withdrawal.amount} {coin} submitted. Status: Pending"
    )

@api_router.get("/withdraw/history")
async def get_withdrawal_history(user: User = Depends(require_auth)):
    """Get user's withdrawal history"""
    withdrawals = await db.withdrawal_requests.find(
        {"user_id": user.user_id},
        {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    
    return {"withdrawals": withdrawals}

# ===================== ADMIN ENDPOINTS =====================
@api_router.get("/admin/stats")
async def get_admin_stats(admin: bool = Depends(verify_admin)):
    """Get admin statistics"""
    total_users = await db.users.count_documents({})
    total_claims = await db.claim_logs.count_documents({})
    pending_withdrawals = await db.withdrawal_requests.count_documents({"status": "pending"})
    
    # Calculate total withdrawn per coin
    pipeline = [
        {"$match": {"status": "completed"}},
        {"$group": {"_id": "$coin", "total": {"$sum": "$amount"}}}
    ]
    withdrawn_cursor = db.withdrawal_requests.aggregate(pipeline)
    withdrawn_list = await withdrawn_cursor.to_list(10)
    total_withdrawn = {item["_id"]: item["total"] for item in withdrawn_list}
    
    return {
        "total_users": total_users,
        "total_claims": total_claims,
        "pending_withdrawals": pending_withdrawals,
        "total_withdrawn": total_withdrawn
    }

@api_router.get("/admin/withdrawals")
async def get_admin_withdrawals(
    status: str = "pending",
    admin: bool = Depends(verify_admin)
):
    """Get withdrawal requests for admin"""
    query = {}
    if status != "all":
        query["status"] = status
    
    withdrawals = await db.withdrawal_requests.find(
        query,
        {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    
    # Add user email to each withdrawal
    for withdrawal in withdrawals:
        user = await db.users.find_one(
            {"user_id": withdrawal["user_id"]},
            {"_id": 0, "email": 1}
        )
        if user:
            withdrawal["user_email"] = user.get("email")
    
    return {"withdrawals": withdrawals}

@api_router.post("/admin/withdrawals/{request_id}/approve")
async def approve_withdrawal(
    request_id: str,
    admin: bool = Depends(verify_admin)
):
    """Approve a withdrawal request"""
    withdrawal = await db.withdrawal_requests.find_one(
        {"request_id": request_id},
        {"_id": 0}
    )
    
    if not withdrawal:
        raise HTTPException(status_code=404, detail="Withdrawal request not found")
    
    if withdrawal["status"] != "pending":
        raise HTTPException(status_code=400, detail="Withdrawal is not pending")
    
    # Update status to completed
    await db.withdrawal_requests.update_one(
        {"request_id": request_id},
        {
            "$set": {
                "status": "completed",
                "processed_at": datetime.now(timezone.utc)
            }
        }
    )
    
    return {"success": True, "message": "Withdrawal approved"}

@api_router.post("/admin/withdrawals/{request_id}/reject")
async def reject_withdrawal(
    request_id: str,
    admin: bool = Depends(verify_admin)
):
    """Reject a withdrawal request and refund the user"""
    withdrawal = await db.withdrawal_requests.find_one(
        {"request_id": request_id},
        {"_id": 0}
    )
    
    if not withdrawal:
        raise HTTPException(status_code=404, detail="Withdrawal request not found")
    
    if withdrawal["status"] != "pending":
        raise HTTPException(status_code=400, detail="Withdrawal is not pending")
    
    # Refund the user
    user_doc = await db.users.find_one(
        {"user_id": withdrawal["user_id"]},
        {"_id": 0}
    )
    
    if user_doc:
        current_balance = user_doc.get("balances", {}).get(withdrawal["coin"], 0.0)
        new_balance = current_balance + withdrawal["amount"]
        
        await db.users.update_one(
            {"user_id": withdrawal["user_id"]},
            {"$set": {f"balances.{withdrawal['coin']}": new_balance}}
        )
    
    # Update status to rejected
    await db.withdrawal_requests.update_one(
        {"request_id": request_id},
        {
            "$set": {
                "status": "rejected",
                "processed_at": datetime.now(timezone.utc)
            }
        }
    )
    
    return {"success": True, "message": "Withdrawal rejected and refunded"}

# ===================== HEALTH CHECK =====================
@api_router.get("/")
async def root():
    return {"message": "Crypto Faucet API", "status": "running"}

@api_router.get("/health")
async def health_check():
    return {"status": "healthy", "timestamp": datetime.now(timezone.utc).isoformat()}

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
