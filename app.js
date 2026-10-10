import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getDatabase, ref, set } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

// Firebase Configuration from your Android App credentials
const firebaseConfig = {
    apiKey: "AIzaSyBEd9qstO7wg2oZ5kDAPIPyQRD_d4vUXxM",
    databaseURL: "https://robottracker-cc983-default-rtdb.europe-west1.firebasedatabase.app/",
    appId: "com.example.gpstracker"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const databaseReference = ref(db, 'live_location');

let watchId = null;
let isTracking = false;
let lastLocation = null;
let lastValidBearing = 0;

const btnToggle = document.getElementById('btnToggle');
const statusText = document.getElementById('statusText');
const locationCard = document.getElementById('locationCard');
const predictionCard = document.getElementById('predictionCard');

const latText = document.getElementById('latText');
const longText = document.getElementById('longText');
const timeText = document.getElementById('timeText');
const directionText = document.getElementById('directionText');
const speedText = document.getElementById('speedText');
const predLatText = document.getElementById('predLatText');
const predLongText = document.getElementById('predLongText');
const confidenceText = document.getElementById('confidenceText');

btnToggle.addEventListener('click', () => {
    if (isTracking) {
        stopTracking();
    } else {
        startTracking();
    }
});

function startTracking() {
    if (!navigator.geolocation) {
        alert("Geolocation is not supported by your browser");
        return;
    }

    isTracking = true;
    btnToggle.textContent = "STOP";
    btnToggle.style.backgroundColor = "#F44336";
    statusText.textContent = "Sharing location...";
    locationCard.classList.remove('hidden');
    predictionCard.classList.remove('hidden');

    const options = {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
    };

    watchId = navigator.geolocation.watchPosition(successCallback, errorCallback, options);
}

function stopTracking() {
    if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
        watchId = null;
    }
    isTracking = false;
    btnToggle.textContent = "START";
    btnToggle.style.backgroundColor = "#4CAF50";
    statusText.textContent = "Not sharing location";
    locationCard.classList.add('hidden');
    predictionCard.classList.add('hidden');
    lastLocation = null;
}

function successCallback(position) {
    const rawLocation = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
        speed: position.coords.speed || 0,
        heading: position.coords.heading || lastValidBearing,
        time: position.timestamp
    };

    // Filter minor stationary jitter (< 0.8 meters)
    if (lastLocation) {
        const distanceMoved = calculateDistance(lastLocation.latitude, lastLocation.longitude, rawLocation.latitude, rawLocation.longitude);
        if (distanceMoved < 0.8) return;
    }

    const timestamp = new Date().toLocaleTimeString('en-GB', { hour12: false, fractionalSecondDigits: 3 });

    latText.textContent = `Latitude: ${rawLocation.latitude}`;
    longText.textContent = `Longitude: ${rawLocation.longitude}`;
    timeText.textContent = `Last update: ${timestamp}`;

    let currentSpeed = rawLocation.speed;
    let bearing = rawLocation.heading;

    if (lastLocation) {
        const timeDeltaSeconds = (rawLocation.time - lastLocation.time) / 1000.0;
        if (timeDeltaSeconds > 0) {
            const calculatedDistance = calculateDistance(lastLocation.latitude, lastLocation.longitude, rawLocation.latitude, rawLocation.longitude);
            if (currentSpeed === 0) {
                currentSpeed = calculatedDistance / timeDeltaSeconds;
            }
            if (calculatedDistance > 1.0 && currentSpeed > 0.5) {
                bearing = calculateBearing(lastLocation.latitude, lastLocation.longitude, rawLocation.latitude, rawLocation.longitude);
                lastValidBearing = bearing;
            }
        }
    }

    const directionString = getDirectionString(bearing);
    directionText.textContent = `Direction: ${directionString} (${Math.round(bearing)}°)`;
    speedText.textContent = `Speed: ${currentSpeed.toFixed(1)} m/s`;

    const predicted = projectLocation(rawLocation.latitude, rawLocation.longitude, currentSpeed, bearing, 10.0);
    predLatText.textContent = `Latitude: ${predicted.lat.toFixed(6)}`;
    predLongText.textContent = `Longitude: ${predicted.lon.toFixed(6)}`;

    const confidence = rawLocation.accuracy < 10 ? "92%" : rawLocation.accuracy < 25 ? "82%" : "65%";
    confidenceText.textContent = `Confidence: ${confidence}`;
    confidenceText.style.color = rawLocation.accuracy < 25 ? "#4CAF50" : "#FF9800";

    // Write to Firebase Realtime Database
    set(databaseReference, {
        latitude: rawLocation.latitude,
        longitude: rawLocation.longitude,
        last_updated: timestamp,
        speed_mps: currentSpeed,
        heading_degrees: bearing,
        accuracy_meters: rawLocation.accuracy,
        predicted_lat_10s: predicted.lat,
        predicted_long_10s: predicted.lon
    });

    lastLocation = rawLocation;
}

function errorCallback(error) {
    alert(`GPS Error: ${error.message}. Make sure location permissions are enabled.`);
}

// Math helpers
function getDirectionString(bearing) {
    const norm = (bearing + 360) % 360;
    if (norm >= 337.5 || norm < 22.5) return "North";
    if (norm < 67.5) return "North-East";
    if (norm < 112.5) return "East";
    if (norm < 157.5) return "South-East";
    if (norm < 202.5) return "South";
    if (norm < 247.5) return "South-West";
    if (norm < 292.5) return "West";
    return "North-West";
}

function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3;
    const φ1 = lat1 * Math.PI/180;
    const φ2 = lat2 * Math.PI/180;
    const Δφ = (lat2-lat1) * Math.PI/180;
    const Δλ = (lon2-lon1) * Math.PI/180;
    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

function calculateBearing(lat1, lon1, lat2, lon2) {
    const φ1 = lat1 * Math.PI/180, φ2 = lat2 * Math.PI/180;
    const Δλ = (lon2-lon1) * Math.PI/180;
    const y = Math.sin(Δλ) * Math.cos(φ2);
    const x = Math.cos(φ1)*Math.sin(φ2) - Math.sin(φ1)*Math.cos(φ2)*Math.cos(Δλ);
    const θ = Math.atan2(y, x);
    return (θ*180/Math.PI + 360) % 360;
}

function projectLocation(lat, lon, speedMps, bearingDegrees, secondsAhead) {
    const totalDistance = speedMps * secondsAhead;
    const earthRadius = 6378137.0;
    const bearingRad = bearingDegrees * Math.PI / 180;
    const latRad = lat * Math.PI / 180;

    const deltaLat = (totalDistance * Math.cos(bearingRad)) / earthRadius;
    const deltaLon = (totalDistance * Math.sin(bearingRad)) / (earthRadius * Math.cos(latRad));

    return {
        lat: lat + (deltaLat * 180 / Math.PI),
        lon: lon + (deltaLon * 180 / Math.PI)
    };
}