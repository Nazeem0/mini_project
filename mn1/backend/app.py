from flask import Flask, request, jsonify
from flask_cors import CORS
from werkzeug.security import generate_password_hash, check_password_hash
import jwt
import datetime
import random
from pymongo import MongoClient
from functools import wraps

app = Flask(__name__)
# Enable CORS to allow connections from your Laptop Browser and ESP32
CORS(app)

# SECRET KEY (Change this for production security)
app.config['SECRET_KEY'] = "RAILWAY_SUPER_SECRET_KEY"

# -----------------------------
# 1. CONNECT TO MONGODB
# -----------------------------
# Ensure MongoDB Compass is open or mongod is running locally
MONGO_URI = "mongodb://localhost:27017/" 
client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=2000)

# Define Database and Collections
db = client["railway_system"]
users_col = db["users"]       # Stores User Accounts (Emails/Passwords)
sensors_col = db["sensors"]   # Stores LATEST Sensor Values (Live Dashboard)
history_col = db["history"]   # Stores PERMANENT Logs (History Tab)

# Check Connection
try:
    client.admin.command("ping")
    print("✅ MongoDB Connected Successfully! Data will be stored.")
    mongo_status = True
except Exception as e:
    print(f"❌ MongoDB Connection Failed: {e}")
    mongo_status = False

# -----------------------------
# HELPER: Token Verification
# -----------------------------
def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = request.headers.get("Authorization")

        if not token:
            return jsonify({"error": "Token missing"}), 401

        try:
            jwt.decode(token, app.config['SECRET_KEY'], algorithms=["HS256"])
        except jwt.ExpiredSignatureError:
            return jsonify({"error": "Token expired"}), 401
        except Exception:
            return jsonify({"error": "Invalid token"}), 401

        return f(*args, **kwargs)
    return decorated

# -----------------------------
# API: SERVER STATUS
# -----------------------------
@app.route("/status", methods=["GET"])
def status():
    return jsonify({
        "server": "running",
        "mongodb": "connected" if mongo_status else "not connected"
    })

# -----------------------------
# 2. SIGNUP (Stores Email & Generates ID)
# -----------------------------
@app.route("/signup", methods=["POST"])
def signup():
    data = request.json
    email = data.get("email")
    role = data.get("role", "Railway Officer")

    if not email or not data.get("password"):
        return jsonify({"error": "Missing email or password"}), 400

    # Check if email exists in MongoDB
    if users_col.find_one({"email": email}):
        return jsonify({"error": "User already exists"}), 400

    # GENERATE UNIQUE BADGE ID
    prefix = "GOV" if role == "Government" else "RLY"
    rand_num = random.randint(1000, 9999)
    badge_id = f"{prefix}-{rand_num}"

    # Create User Object
    user = {
        "name": data.get("name"),
        "email": email,              # <--- Storing Email
        "password": generate_password_hash(data.get("password")),
        "role": role,
        "badgeId": badge_id,
        "created_at": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    }

    users_col.insert_one(user)
    return jsonify({"message": "Signup successful", "badgeId": badge_id}), 201

# -----------------------------
# 3. LOGIN (Retrieves User Data)
# -----------------------------
@app.route("/login", methods=["POST"])
def login():
    data = request.json
    email = data.get("email")

    user = users_col.find_one({"email": email})
    if not user:
        return jsonify({"error": "User not found"}), 404

    if not check_password_hash(user["password"], data.get("password")):
        return jsonify({"error": "Wrong password"}), 401

    # Create Token
    token = jwt.encode({
        "email": user["email"],
        "role": user["role"],
        "exp": datetime.datetime.utcnow() + datetime.timedelta(hours=24)
    }, app.config['SECRET_KEY'], algorithm="HS256")

    # Return User Details to Frontend
    return jsonify({
        "message": "Login successful",
        "token": token,
        "user": {
            "name": user["name"],
            "email": user["email"],
            "role": user["role"],
            "badgeId": user.get("badgeId", "N/A")
        }
    })

# -----------------------------
# 4. SENSOR UPDATE (From ESP32)
# -----------------------------
@app.route("/sensor/update", methods=["POST"])
def sensor_update():
    data = request.json
    sensor_id = data.get("sensor_id")
    value = data.get("value")
    status = data.get("status")

    if not sensor_id:
        return jsonify({"error": "sensor_id missing"}), 400

    current_time = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    # A. Update LIVE Status (Upsert = Create if not exists)
    sensors_col.update_one(
        {"sensor_id": sensor_id},
        {"$set": {
            "value": value,
            "status": status,
            "time": current_time
        }},
        upsert=True
    )

    # B. Add to HISTORY Log
    history_col.insert_one({
        "time": current_time,
        "sensor": sensor_id,
        "value": value,
        "status": status,
        "source": "ESP32", # Mark as Hardware Data
        "user": "System"
    })

    return jsonify({"message": "Sensor data stored"}), 200

# -----------------------------
# 5. GATE LOGGING (Manual Actions)
# -----------------------------
@app.route("/gate/log", methods=["POST"])
def gate_log():
    data = request.json
    action = data.get("action") # "OPEN" or "CLOSE"
    user = data.get("user", "Unknown")

    current_time = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    # Save Manual Action to History
    history_col.insert_one({
        "time": current_time,
        "sensor": "Gate Override",
        "value": action,
        "status": "Manual Force",
        "source": "Dashboard", # Mark as User Action
        "user": user
    })

    return jsonify({"message": f"Gate {action} logged successfully"}), 200

# -----------------------------
# 6. LIVE SENSOR DATA (For Dashboard)
# -----------------------------
@app.route("/sensor/live", methods=["GET"])
@token_required
def live_data():
    sensors = list(sensors_col.find({}, {"_id": 0}))

    # Default structure to prevent frontend errors if DB is empty
    result = {
        "sensor1": {"value": 0, "status": "Inactive", "time": "N/A"},
        "sensor2": {"value": "Clear", "status": "Clear", "time": "N/A"},
        "sensor3": {"value": 0, "status": "Inactive", "time": "N/A"}
    }

    for s in sensors:
        result[s["sensor_id"]] = s

    return jsonify(result)

# -----------------------------
# 7. HISTORY LOGS (For History Tab)
# -----------------------------
@app.route("/history", methods=["GET"])
@token_required
def get_history():
    # Return last 50 logs, sorted by newest first
    logs = list(history_col.find({}, {"_id": 0}).sort("time", -1).limit(50))
    return jsonify(logs)

# -----------------------------
# RUN SERVER
# -----------------------------

if __name__ == "__main__":
    # host='0.0.0.0' allows external devices (ESP32) to connect to your IP
    app.run(debug=True, host='0.0.0.0', port=5000, use_reloader=False)
