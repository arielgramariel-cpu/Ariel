import os
import secrets
from datetime import datetime, timezone

from flask import Flask, request, jsonify, send_from_directory, make_response
from flask_cors import CORS
from pymongo import MongoClient, DESCENDING
from werkzeug.security import generate_password_hash, check_password_hash
from bson import ObjectId

app = Flask(name)
CORS(app)

=========================

MongoDB

=========================

MONGO_URL = os.environ.get(“MONGO_URL”)

if not MONGO_URL:
raise RuntimeError(“MONGO_URL environment variable is not set”)

client = MongoClient(MONGO_URL)
db = client[“photo_messenger”]

users = db[“users”]
posts = db[“posts”]
comments = db[“comments”]

Indexes

users.create_index(“username”, unique=True)
users.create_index(“email”, unique=True)

posts.create_index([(“created_at”, DESCENDING)])
comments.create_index([(“post_id”, 1), (“created_at”, 1)])

=========================

Helpers

=========================

def json_id(value):
return str(value)

def current_user():
token = request.cookies.get(“session”)

if not token:
    return None
user = users.find_one({"session_token": token})
return user

def user_public(user):
return {
“id”: str(user[”_id”]),
“username”: user[“username”]
}

def post_json(post, user=None):
post_id = str(post[”_id”])

likes = post.get("likes", [])
liked = False
if user:
    liked = str(user["_id"]) in [str(x) for x in likes]
comment_count = comments.count_documents({
    "post_id": post["_id"]
})
return {
    "id": post_id,
    "username": post["username"],
    "user_id": str(post["user_id"]),
    "image": post["image"],
    "caption": post.get("caption", ""),
    "likes": len(likes),
    "liked": liked,
    "comments": comment_count,
    "created_at": post["created_at"].isoformat()
}

=========================

Main page

=========================

@app.route(”/”)
def index():
return send_from_directory(”.”, “index.html”)

@app.route(”/path:path”)
def static_files(path):
return send_from_directory(”.”, path)

=========================

Health check

=========================

@app.route(”/api/health”)
def health():
try:
client.admin.command(“ping”)
return jsonify({
“status”: “ok”,
“database”: “connected”
})
except Exception as e:
return jsonify({
“status”: “error”,
“message”: str(e)
}), 500

=========================

Registration

=========================

@app.post(”/api/register”)
def register():
data = request.get_json() or {}

username = data.get("username", "").strip()
email = data.get("email", "").strip().lower()
password = data.get("password", "")
if len(username) < 3:
    return jsonify({"error": "Username must contain at least 3 characters"}), 400
if len(password) < 6:
    return jsonify({"error": "Password must contain at least 6 characters"}), 400
if not email:
    return jsonify({"error": "Email is required"}), 400
if users.find_one({
    "$or": [
        {"username": username},
        {"email": email}
    ]
}):
    return jsonify({"error": "Username or email already exists"}), 409
token = secrets.token_urlsafe(32)
user = {
    "username": username,
    "email": email,
    "password": generate_password_hash(password),
    "session_token": token,
    "created_at": datetime.now(timezone.utc)
}
result = users.insert_one(user)
response = make_response(jsonify({
    "message": "Account created",
    "user": {
        "id": str(result.inserted_id),
        "username": username
    }
}))
response.set_cookie(
    "session",
    token,
    httponly=True,
    samesite="Lax",
    secure=True,
    max_age=60 * 60 * 24 * 30
)
return response

=========================

Login

=========================

@app.post(”/api/login”)
def login():
data = request.get_json() or {}

username = data.get("username", "").strip()
password = data.get("password", "")
user = users.find_one({
    "$or": [
        {"username": username},
        {"email": username.lower()}
    ]
})
if not user or not check_password_hash(user["password"], password):
    return jsonify({
        "error": "Invalid username or password"
    }), 401
token = secrets.token_urlsafe(32)
users.update_one(
    {"_id": user["_id"]},
    {"$set": {"session_token": token}}
)
response = make_response(jsonify({
    "message": "Logged in",
    "user": user_public(user)
}))
response.set_cookie(
    "session",
    token,
    httponly=True,
    samesite="Lax",
    secure=True,
    max_age=60 * 60 * 24 * 30
)
return response

=========================

Logout

=========================

@app.post(”/api/logout”)
def logout():
user = current_user()

response = make_response(jsonify({
    "message": "Logged out"
}))
response.delete_cookie("session")
if user:
    users.update_one(
        {"_id": user["_id"]},
        {"$unset": {"session_token": ""}}
    )
return response

=========================

Current user

=========================

@app.get(”/api/me”)
def me():
user = current_user()

if not user:
    return jsonify({
        "logged_in": False
    })
return jsonify({
    "logged_in": True,
    "user": user_public(user)
})

=========================

Create post

=========================

@app.post(”/api/posts”)
def create_post():
user = current_user()

if not user:
    return jsonify({"error": "Login required"}), 401
data = request.get_json() or {}
image = data.get("image")
caption = data.get("caption", "").strip()
if not image:
    return jsonify({
        "error": "Image is required"
    }), 400
# Basic safety check
if not image.startswith("data:image/"):
    return jsonify({
        "error": "Invalid image"
    }), 400
post = {
    "user_id": user["_id"],
    "username": user["username"],
    "image": image,
    "caption": caption,
    "likes": [],
    "created_at": datetime.now(timezone.utc)
}
result = posts.insert_one(post)
post["_id"] = result.inserted_id
return jsonify({
    "message": "Post created",
    "post": post_json(post, user)
}), 201

=========================

Feed

=========================

@app.get(”/api/posts”)
def get_posts():
user = current_user()

result = []
for post in posts.find().sort("created_at", DESCENDING).limit(100):
    result.append(post_json(post, user))
return jsonify(result)

=========================

Like / unlike

=========================

@app.post(”/api/posts/<post_id>/like”)
def like_post(post_id):
user = current_user()

if not user:
    return jsonify({"error": "Login required"}), 401
try:
    oid = ObjectId(post_id)
except Exception:
    return jsonify({"error": "Invalid post ID"}), 400
post = posts.find_one({"_id": oid})
if not post:
    return jsonify({"error": "Post not found"}), 404
user_id = user["_id"]
if user_id in post.get("likes", []):
    posts.update_one(
        {"_id": oid},
        {"$pull": {"likes": user_id}}
    )
    liked = False
else:
    posts.update_one(
        {"_id": oid},
        {"$addToSet": {"likes": user_id}}
    )
    liked = True
updated = posts.find_one({"_id": oid})
return jsonify({
    "liked": liked,
    "likes": len(updated.get("likes", []))
})

=========================

Comments

=========================

@app.get(”/api/posts/<post_id>/comments”)
def get_comments(post_id):
try:
oid = ObjectId(post_id)
except Exception:
return jsonify({“error”: “Invalid post ID”}), 400

result = []
for comment in comments.find({
    "post_id": oid
}).sort("created_at", 1):
    result.append({
        "id": str(comment["_id"]),
        "username": comment["username"],
        "text": comment["text"],
        "created_at": comment["created_at"].isoformat()
    })
return jsonify(result)

@app.post(”/api/posts/<post_id>/comments”)
def add_comment(post_id):
user = current_user()

if not user:
    return jsonify({"error": "Login required"}), 401
try:
    oid = ObjectId(post_id)
except Exception:
    return jsonify({"error": "Invalid post ID"}), 400
if not posts.find_one({"_id": oid}):
    return jsonify({"error": "Post not found"}), 404
data = request.get_json() or {}
text = data.get("text", "").strip()
if not text:
    return jsonify({"error": "Comment cannot be empty"}), 400
if len(text) > 1000:
    return jsonify({"error": "Comment is too long"}), 400
comment = {
    "post_id": oid,
    "user_id": user["_id"],
    "username": user["username"],
    "text": text,
    "created_at": datetime.now(timezone.utc)
}
result = comments.insert_one(comment)
return jsonify({
    "id": str(result.inserted_id),
    "username": user["username"],
    "text": text
}), 201

=========================

Run

=========================

if name == “main”:
port = int(os.environ.get(“PORT”, 10000))
app.run(
host=“0.0.0.0”,
port=port,
debug=False
)
