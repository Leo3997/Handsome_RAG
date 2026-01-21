"""
Authentication Service for DLS_RAG
Handles user management, JWT tokens, and password hashing
"""
import os
import json
import hashlib
import secrets
from datetime import datetime, timedelta
from functools import wraps
from flask import request, jsonify

# Simple JWT implementation (no external dependency)
import base64
import hmac


class AuthService:
    def __init__(self, config):
        self.config = config
        self.users_file = getattr(config, 'USERS_FILE', os.path.join(config.BASE_DIR, 'users.json'))
        self.jwt_secret = getattr(config, 'JWT_SECRET', 'change-me-in-production')
        self.jwt_expiry_hours = getattr(config, 'JWT_EXPIRY_HOURS', 24)
        self._ensure_admin()

    def _load_users(self):
        if os.path.exists(self.users_file):
            try:
                with open(self.users_file, 'r', encoding='utf-8') as f:
                    return json.load(f)
            except:
                return {}
        return {}

    def _save_users(self, users):
        with open(self.users_file, 'w', encoding='utf-8') as f:
            json.dump(users, f, indent=2, ensure_ascii=False)

    def _ensure_admin(self):
        """Create default admin if no users exist"""
        users = self._load_users()
        if not users:
            self.create_user('admin', 'admin123', 'admin')
            print("Created default admin account: admin / admin123")

    def _hash_password(self, password: str) -> str:
        """Hash password using SHA256 with salt"""
        salt = secrets.token_hex(16)
        hashed = hashlib.sha256((password + salt).encode()).hexdigest()
        return f"{salt}:{hashed}"

    def _verify_password(self, password: str, stored: str) -> bool:
        """Verify password against stored hash"""
        try:
            salt, hashed = stored.split(':')
            return hashlib.sha256((password + salt).encode()).hexdigest() == hashed
        except:
            return False

    def create_user(self, username: str, password: str, role: str = 'user') -> dict:
        """Create a new user"""
        users = self._load_users()
        if username in users:
            raise ValueError("用户名已存在")
        
        users[username] = {
            'username': username,
            'password_hash': self._hash_password(password),
            'role': role,
            'created_at': datetime.now().isoformat()
        }
        self._save_users(users)
        return {'username': username, 'role': role}

    def verify_login(self, username: str, password: str) -> dict:
        """Verify login credentials, return user info or None"""
        users = self._load_users()
        user = users.get(username)
        if user and self._verify_password(password, user['password_hash']):
            return {'username': user['username'], 'role': user['role']}
        return None

    def generate_token(self, user: dict) -> str:
        """Generate JWT token"""
        header = base64.urlsafe_b64encode(json.dumps({'alg': 'HS256', 'typ': 'JWT'}).encode()).decode().rstrip('=')
        
        payload_data = {
            'username': user['username'],
            'role': user['role'],
            'exp': (datetime.utcnow() + timedelta(hours=self.jwt_expiry_hours)).timestamp()
        }
        payload = base64.urlsafe_b64encode(json.dumps(payload_data).encode()).decode().rstrip('=')
        
        signature = hmac.new(
            self.jwt_secret.encode(),
            f"{header}.{payload}".encode(),
            hashlib.sha256
        ).hexdigest()
        
        return f"{header}.{payload}.{signature}"

    def verify_token(self, token: str) -> dict:
        """Verify JWT token, return user info or None"""
        try:
            parts = token.split('.')
            if len(parts) != 3:
                return None
            
            header, payload, signature = parts
            
            # Verify signature
            expected_sig = hmac.new(
                self.jwt_secret.encode(),
                f"{header}.{payload}".encode(),
                hashlib.sha256
            ).hexdigest()
            
            if signature != expected_sig:
                return None
            
            # Decode payload
            padding = 4 - len(payload) % 4
            if padding != 4:
                payload += '=' * padding
            
            payload_data = json.loads(base64.urlsafe_b64decode(payload))
            
            # Check expiry
            if datetime.utcnow().timestamp() > payload_data.get('exp', 0):
                return None
            
            return {'username': payload_data['username'], 'role': payload_data['role']}
        except Exception as e:
            print(f"Token verification error: {e}")
            return None

    def get_all_users(self) -> list:
        """Get all users (without password hashes)"""
        users = self._load_users()
        return [
            {'username': u['username'], 'role': u['role'], 'created_at': u.get('created_at', '')}
            for u in users.values()
        ]

    def update_user_role(self, username: str, new_role: str, current_user: str) -> bool:
        """Update user role (admin only, cannot demote self)"""
        if username == current_user:
            raise ValueError("不能修改自己的角色")
        
        if new_role not in ['user', 'admin']:
            raise ValueError("无效的角色")
        
        users = self._load_users()
        if username not in users:
            raise ValueError("用户不存在")
        
        users[username]['role'] = new_role
        self._save_users(users)
        return True


def create_auth_decorators(auth_service: AuthService):
    """Create Flask decorators for authentication"""
    
    def require_auth(f):
        @wraps(f)
        def decorated(*args, **kwargs):
            token = request.headers.get('Authorization', '').replace('Bearer ', '')
            user = auth_service.verify_token(token)
            if not user:
                return jsonify({"error": "Unauthorized"}), 401
            request.current_user = user
            return f(*args, **kwargs)
        return decorated

    def require_admin(f):
        @wraps(f)
        def decorated(*args, **kwargs):
            token = request.headers.get('Authorization', '').replace('Bearer ', '')
            user = auth_service.verify_token(token)
            if not user:
                return jsonify({"error": "Unauthorized"}), 401
            if user.get('role') != 'admin':
                return jsonify({"error": "Forbidden: Admin access required"}), 403
            request.current_user = user
            return f(*args, **kwargs)
        return decorated

    return require_auth, require_admin
