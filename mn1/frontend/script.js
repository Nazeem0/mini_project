// --- CONFIGURATION ---
const API_BASE_URL = "http://127.0.0.1:5000"; 

// --- DOM ELEMENTS ---
const navbar = document.getElementById('navbar');
const roleBadge = document.getElementById('role-badge');
const logoutBtn = document.getElementById('logout-btn');

// --- GLOBAL VARIABLES ---
let sensorInterval = null; // Store timer ID to stop it later

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    // 1. Check Authentication on Load
    checkAuthStatus();
    
    // 2. Handle Initial Routing
    handleNavigation();

    // 3. Setup All Event Listeners
    setupEventListeners();
});

// --- CORE EVENT LISTENERS ---
function setupEventListeners() {
    // Navigation Routing (Hash change)
    window.addEventListener('hashchange', handleNavigation);

    // Login Form
    const loginForm = document.getElementById('login-form');
    if (loginForm) loginForm.addEventListener('submit', handleLogin);

    // Signup Form
    const signupForm = document.getElementById('signup-form');
    if (signupForm) signupForm.addEventListener('submit', handleSignup);

    // Logout Button
    if (logoutBtn) logoutBtn.addEventListener('click', logout);

    // Role Selection Logic (Visual + Hidden Input)
    document.querySelectorAll('.role-selection').forEach(container => {
        container.addEventListener('click', (e) => {
            const btn = e.target.closest('.role-btn');
            if (!btn) return;
            
            // Visual selection
            container.querySelectorAll('.role-btn').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');

            // Set hidden input value
            const form = container.closest('form');
            const hiddenInput = form.querySelector('input[type="hidden"]');
            if (hiddenInput) hiddenInput.value = btn.dataset.role;
        });
    });

    // Initialize Gate Controls
    setupGateControls();
}

// --- NAVIGATION & ROUTING ---
function handleNavigation() {
    const hash = window.location.hash || '#/home';
    const pageId = hash.substring(2) + '-page'; // e.g., 'dashboard-page'
    
    // 1. STOP TIMER (If running)
    // We clear this every time we change pages to save performance
    if (sensorInterval) {
        clearInterval(sensorInterval);
        sensorInterval = null;
    }

    // Check Authentication (Using SessionStorage for auto-logout on close)
    const authToken = sessionStorage.getItem('auth_token');
    const protectedPages = ['dashboard-page', 'sensors-page', 'history-page'];

    // Redirect to login if accessing protected page without token
    if (protectedPages.includes(pageId) && !authToken) {
        window.location.hash = '#/login';
        return;
    }

    // Hide all pages, show target
    document.querySelectorAll('.page-section').forEach(section => {
        section.style.display = 'none';
        section.classList.remove('active-page');
    });

    const targetPage = document.getElementById(pageId);
    if (targetPage) {
        targetPage.style.display = 'block';
        setTimeout(() => targetPage.classList.add('active-page'), 10);

        // Load page-specific data
        if (pageId === 'dashboard-page') {
            updateDashboardUI();
        }
        else if (pageId === 'sensors-page') {
            fetchSensorData(); // Run once immediately
            // Run every 2 seconds
            sensorInterval = setInterval(fetchSensorData, 2000);
        }
        else if (pageId === 'history-page') {
            fetchHistoryData();
        }
    } else {
        // Fallback to Home
        const homePage = document.getElementById('home-page');
        if (homePage) {
            homePage.style.display = 'block';
            homePage.classList.add('active-page');
        }
    }
}

// --- AUTHENTICATION (API) ---

// 1. LOGIN
async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    const msg = document.getElementById('login-message');

    if(msg) {
        msg.textContent = "Verifying credentials...";
        msg.style.color = "blue";
    }

    try {
        const response = await fetch(`${API_BASE_URL}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });

        const data = await response.json();

        if (response.ok) {
            // SUCCESS: Save to sessionStorage (Auto-logout on tab close)
            sessionStorage.setItem('auth_token', data.token);
            sessionStorage.setItem('user_name', data.user.name);
            sessionStorage.setItem('user_email', data.user.email);
            sessionStorage.setItem('user_role', data.user.role);
            sessionStorage.setItem('user_badge_id', data.user.badgeId);

            // Update UI
            if(msg) {
                msg.textContent = "Success! Redirecting...";
                msg.style.color = "green";
            }
            checkAuthStatus();

            // FORCE REDIRECT
            window.location.hash = '#/dashboard';
            setTimeout(() => handleNavigation(), 50); // Ensure page load
            e.target.reset();
        } else {
            if(msg) {
                msg.textContent = data.message || 'Login failed';
                msg.style.color = '#e74c3c';
            }
        }
    } catch (error) {
        console.error(error);
        if(msg) {
            msg.textContent = 'Server connection failed.';
            msg.style.color = '#e74c3c';
        }
    }
}

// 2. SIGNUP
async function handleSignup(e) {
    e.preventDefault();
    const name = document.getElementById('signup-name').value;
    const email = document.getElementById('signup-email').value;
    const password = document.getElementById('signup-password').value;
    const confirmPass = document.getElementById('signup-confirm-password').value;
    const role = document.getElementById('signup-role').value;
    const msg = document.getElementById('signup-message');

    if (password !== confirmPass) {
        msg.textContent = "Passwords do not match!";
        msg.style.color = '#e74c3c';
        return;
    }

    if (!role) {
        msg.textContent = "Please select a role.";
        msg.style.color = '#e74c3c';
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/signup`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, email, password, role })
        });

        const data = await response.json();

        if (response.ok) {
            alert('Account created! Please login.');
            window.location.hash = '#/login';
            e.target.reset();
        } else {
            msg.textContent = data.message || "Signup failed";
            msg.style.color = '#e74c3c';
        }
    } catch (error) {
        msg.textContent = 'Server error.';
    }
}

// 3. LOGOUT
function logout() {
    if (sensorInterval) clearInterval(sensorInterval); // Ensure timer stops
    sessionStorage.clear(); // Clears token and user data
    checkAuthStatus();
    window.location.hash = '#/login';
}

// 4. UI AUTH STATUS UPDATE
function checkAuthStatus() {
    const authToken = sessionStorage.getItem('auth_token');
    const publicLinks = document.querySelectorAll('.public-link');
    const protectedLinks = document.querySelectorAll('.protected-link');

    if (authToken) {
        publicLinks.forEach(el => el.style.display = 'none');
        protectedLinks.forEach(el => el.style.display = 'inline-block');
        
        // Update Navbar Badge
        const role = sessionStorage.getItem('user_role');
        if(roleBadge) {
            roleBadge.textContent = role;
            roleBadge.style.display = 'inline-block';
            
            // Color coding
            if(role === 'Government') {
                roleBadge.style.background = '#e8f4fc';
                roleBadge.style.color = '#3498db';
            } else {
                roleBadge.style.background = '#eafaf1';
                roleBadge.style.color = '#2ecc71';
            }
        }
        if(logoutBtn) logoutBtn.style.display = 'inline-block';
    } else {
        publicLinks.forEach(el => el.style.display = 'inline-block');
        protectedLinks.forEach(el => el.style.display = 'none');
        if(roleBadge) roleBadge.style.display = 'none';
        if(logoutBtn) logoutBtn.style.display = 'none';
    }
}

// --- DASHBOARD UI ---
function updateDashboardUI() {
    // Retrieve data
    const name = sessionStorage.getItem('user_name') || "Officer";
    const email = sessionStorage.getItem('user_email') || "Loading...";
    const role = sessionStorage.getItem('user_role') || "Railway Officer";
    const badgeId = sessionStorage.getItem('user_badge_id') || "ID-Pending";
    
    // Initials
    const initials = name.substring(0, 2).toUpperCase();

    // Update HTML Elements
    if(document.getElementById('dash-user-name')) document.getElementById('dash-user-name').innerText = name;
    if(document.getElementById('dash-user-email')) document.getElementById('dash-user-email').innerText = email;
    if(document.getElementById('dash-user-role')) document.getElementById('dash-user-role').innerText = role;
    if(document.getElementById('dash-user-id')) document.getElementById('dash-user-id').innerText = `ID: #${badgeId}`;
    if(document.getElementById('avatar-initials')) document.getElementById('avatar-initials').innerText = initials;

    // Date
    if(document.getElementById('current-date')) {
        const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        document.getElementById('current-date').innerText = new Date().toLocaleDateString('en-US', options);
    }
}

// --- GATE CONTROL (With Backend Logging) ---
function setupGateControls() {
    const btnOpen = document.getElementById('btn-force-open');
    const btnClose = document.getElementById('btn-force-close');
    const gateBar = document.getElementById('visual-gate-bar');
    const gateText = document.getElementById('gate-status-text');

    if(btnOpen && btnClose) {
        // Using arrow functions to pass arguments
        btnOpen.addEventListener('click', () => handleGateAction("OPEN", gateBar, gateText));
        btnClose.addEventListener('click', () => handleGateAction("CLOSE", gateBar, gateText));
    }
}

async function handleGateAction(action, barElement, textElement) {
    // 1. Visual Update
    if(action === "OPEN") {
        barElement.style.width = '0%';
        textElement.innerText = "OPEN (FORCED)";
        textElement.style.color = "#2ecc71"; 
    } else {
        barElement.style.width = '100%';
        textElement.innerText = "CLOSED (FORCED)";
        textElement.style.color = "#e74c3c"; 
    }

    // 2. Log to Backend (MongoDB)
    try {
        const userName = sessionStorage.getItem('user_name') || "Unknown";
        await fetch(`${API_BASE_URL}/gate/log`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: action, user: userName })
        });
    } catch (err) {
        console.error("Failed to log gate action:", err);
    }
}

// --- SENSOR DATA FETCHING ---
async function fetchSensorData() {
    // If we left the page but the interval fired one last time, check here:
    if(!document.getElementById('sensors-page').classList.contains('active-page') && !window.location.hash.includes('sensors')) {
        return;
    }

    const token = sessionStorage.getItem('auth_token');
    if(!token) return;

    try {
        // NOTE: Ensure this endpoint matches your app.py 
        // (Use /get_sensor_data OR /sensor/live depending on your python code)
        const response = await fetch(`${API_BASE_URL}/get_sensor_data`, {
            headers: { 'Authorization': token }
        });
        
        if(response.status === 401) { logout(); return; }
        
        const data = await response.json();
        
        // Helper to update card
        const updateCard = (id, val, status, time) => {
            const elVal = document.getElementById(id + '-distance') || document.getElementById(id + '-range');
            const elStat = document.getElementById(id + '-status') || document.getElementById(id + '-obstruction');
            const elTime = document.getElementById(id + '-updated');
            const elBadge = document.getElementById('sensor' + id.charAt(1) + '-badge');

            if(elVal) elVal.textContent = val || '--';
            if(elStat) elStat.textContent = status || '--';
            if(elTime) elTime.textContent = new Date().toLocaleTimeString(); // Update time locally
            
            // Badge color
            if(elBadge) {
                elBadge.className = 'sensor-status-badge'; 
                if(status === 'Active' || status === 'Clear') elBadge.classList.add('badge-active');
                else elBadge.classList.add('badge-inactive');
            }
        };

        // Update UI based on API structure
        // Assuming API returns { s1_distance: 10, s1_status: "Active", ... }
        // Adjust these keys if your Python sends nested objects like data.sensor1.value
        updateCard('s1', data.s1_distance, data.s1_status);
        updateCard('s2', data.s2_distance, data.s2_obstruction); // Map obstruction to status
        updateCard('s3', data.s3_distance, data.s3_status);

    } catch (error) {
        console.error("Error fetching sensors:", error);
    }
}

async function fetchHistoryData() {
    const token = sessionStorage.getItem('auth_token');
    if(!token) return;

    try {
        const response = await fetch(`${API_BASE_URL}/history`, {
            headers: { 'Authorization': token }
        });
        
        if(response.status === 401) { logout(); return; }

        const data = await response.json();
        const tbody = document.getElementById('history-table-body');
        if(tbody) {
            tbody.innerHTML = '';
            data.forEach(row => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${row.time}</td>
                    <td>${row.sensor}</td>
                    <td>${row.value || '-'}</td>
                    <td>${row.status}</td>
                    <td>${row.user || (row.source ? row.source : '-')}</td>
                `;
                tbody.appendChild(tr);
            });
        }
    } catch (error) {
        console.error("Error fetching history:", error);
    }
}