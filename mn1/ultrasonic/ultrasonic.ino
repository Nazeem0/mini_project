#include <ESP32Servo.h>

Servo gateServo;

// ====== Pin Configuration ======
const int SERVO_PIN = 13;   // Servo control pin
#define TRIG_PIN1 25        // Train arrival
#define ECHO_PIN1 26
#define TRIG_PIN2 27        // Obstacle detection
#define ECHO_PIN2 14
#define TRIG_PIN3 18        // Train departure
#define ECHO_PIN3 19

// ====== Gate Angles ======
const int GATE_OPEN  = 90;   // adjust if your gate opens more
const int GATE_HALF  = 45;   // half-close angle
const int GATE_CLOSE = 0;    // fully closed position

// ====== Distance Thresholds (cm) ======
const int TRAIN_DETECT_DIST = 10;  
const int OBSTACLE_DIST     = 10;

// ====== Flags ======
bool trainArrived = false;
bool gateClosed   = false;

void setup() {
  Serial.begin(115200);
  Serial.println("🚦 Railway Gate System (Slow Close + Obstacle Handling) Starting...");

  gateServo.attach(SERVO_PIN, 500, 2400);
  gateServo.write(GATE_OPEN);

  pinMode(TRIG_PIN1, OUTPUT); pinMode(ECHO_PIN1, INPUT);
  pinMode(TRIG_PIN2, OUTPUT); pinMode(ECHO_PIN2, INPUT);
  pinMode(TRIG_PIN3, OUTPUT); pinMode(ECHO_PIN3, INPUT);

  Serial.println("✅ Setup Complete — Waiting for train...");
}

void loop() {
  int distTrainArrive = getDistance(TRIG_PIN1, ECHO_PIN1);
  int distObstacle    = getDistance(TRIG_PIN2, ECHO_PIN2);
  int distTrainLeave  = getDistance(TRIG_PIN3, ECHO_PIN3);

  // ====== Live Sensor Readings ======
  Serial.print("TrainArrival: "); Serial.print(distTrainArrive);
  Serial.print(" cm | Obstacle: "); Serial.print(distObstacle);
  Serial.print(" cm | TrainDeparture: "); Serial.print(distTrainLeave);
  Serial.println(" cm");

  // ===== Train Arrives =====
  if (distTrainArrive <= TRAIN_DETECT_DIST && !trainArrived) {
    Serial.println("🚂 Train detected — closing gate slowly...");
    trainArrived = true;
    closeGateWithSafety();   
    gateClosed = true;
  }

  // ===== Train Departs =====
  if (trainArrived && gateClosed && isTrainGoneStable()) {
    Serial.println("✅ Train departed — opening gate slowly...");
    openGate();
    gateClosed = false;
    trainArrived = false;
  }

  delay(300);
}

// ====== Distance Function ======
int getDistance(int trigPin, int echoPin) {
  digitalWrite(trigPin, LOW);
  delayMicroseconds(2);
  digitalWrite(trigPin, HIGH);
  delayMicroseconds(10);
  digitalWrite(trigPin, LOW);
  long duration = pulseIn(echoPin, HIGH, 30000);
  int distance = duration * 0.034 / 2;
  if (distance == 0) distance = 400;
  return distance;
}

// ====== Close Gate Slowly with Obstacle Handling ======
void closeGateWithSafety() {
  bool fullyClosed = false;

  while (!fullyClosed) {
    int obstacleDist = getDistance(TRIG_PIN2, ECHO_PIN2);

    // --- Obstacle detected before closing ---
    if (obstacleDist <= OBSTACLE_DIST) {
      Serial.println("🚗 Obstacle detected before closing! Closing halfway...");
      halfCloseGate();
      waitUntilObstacleGone();
      Serial.println("✅ Obstacle cleared — continuing to full close...");
    }

    // --- Normal or resumed full close ---
    Serial.println("⬇️ Closing gate fully (slow motion)...");
    for (int pos = GATE_HALF; pos >= GATE_CLOSE; pos -= 1) { // 1° at a time
      gateServo.write(pos);
      delay(40);  // slow and smooth movement
      obstacleDist = getDistance(TRIG_PIN2, ECHO_PIN2);
      if (obstacleDist <= OBSTACLE_DIST) {
        Serial.println("🚗 Obstacle appeared mid-close! Half-closing...");
        halfCloseGate();
        waitUntilObstacleGone();
        Serial.println("🔁 Retrying full close...");
        goto retry;
      }
    }

    Serial.println("🚧 Gate fully closed and holding.");
    fullyClosed = true;

  retry:
    continue;
  }
}

// ====== Half Close (45°) ======
void halfCloseGate() {
  Serial.println("↘️ Moving gate to half-close (45°) slowly...");
  for (int pos = GATE_OPEN; pos >= GATE_HALF; pos -= 1) {
    gateServo.write(pos);
    delay(40);
  }
  Serial.println("⏸ Gate half-closed (waiting for obstacle to clear).");
}

// ====== Wait Until Obstacle Clears ======
void waitUntilObstacleGone() {
  unsigned long start = millis();
  while (true) {
    int dist = getDistance(TRIG_PIN2, ECHO_PIN2);
    Serial.print("🔎 Obstacle distance: ");
    Serial.print(dist);
    Serial.println(" cm");

    if (dist > OBSTACLE_DIST) {
      if (millis() - start > 2000) { // clear for 2 seconds
        Serial.println("✅ Obstacle gone — safe to close fully.");
        break;
      }
    } else {
      start = millis(); // reset timer if obstacle returns
    }
    delay(200);
  }
}

// ====== Open Gate Slowly ======
void openGate() {
  Serial.println("⬆️ Opening gate slowly...");
  for (int pos = GATE_CLOSE; pos <= GATE_OPEN; pos += 1) {
    gateServo.write(pos);
    delay(40);  // slow and steady opening
  }
  Serial.println("🟢 Gate fully opened.");
}

// ====== Train Departure Stability Check =
bool isTrainGoneStable() {
  int count = 0;
  for (int i = 0; i < 6; i++) {
    int dist = getDistance(TRIG_PIN3, ECHO_PIN3);
    if (dist > TRAIN_DETECT_DIST) count++;
    delay(300);
  }
  return (count >= 5);
}
