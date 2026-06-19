const GAS_WEB_APP_URL = "/api/google"; 

let db = {}; let firebaseDataCache = {}; let chatData = {};
let dbNotices = []; let allEmployees = []; let employeeGroups = {}; let masterSchedule = {}; 
let employeePasswords = {}; let employeeBios = {}; let employeeImages = {}; let employeeRoles = {}; 
let employeeLocations = {}; let employeePhones = {}; let employeeAddresses = {}; let employeeEmails = {}; 
let employeeLogTypes = {};

let globalRosterVisibility = {};
let globalAdminGroupVisibility = {};

let chatGroupsMeta = {};
let globalChatSettings = { visibility: 'ALL', canCreateGroups: true };

let currentShift = ''; let isSyncing = false;
let confirmedEmployee = sessionStorage.getItem('duna_employee') || null; 
let activeGroup = sessionStorage.getItem('duna_group') || null; let currentAdminGroup = '';
let currentChatEmp = ''; let currentChatIsGroup = false;

let publicRosterOffset = 0; 

let rtdb; 

function sanitizeFirebaseKey(str) { return encodeURIComponent(str).replace(/\./g, '%2E'); }
function getRoomId(u1, u2) { return [sanitizeFirebaseKey(u1), sanitizeFirebaseKey(u2)].sort().join('___'); }

function getShiftPriority(shiftStr) {
    const s = (shiftStr || "").toUpperCase();
    
    // Priority 5: Not working cases (Push to the very bottom)
    if (s.includes('AWAY') || s.includes('SICK') || s.includes('HOLIDAY') || s.includes('P.HOLIDAY') || s.includes('LEAVE')) {
        return 5;
    }
    
    // Priority 1: Support / SUPT / SUP
    if (s.includes('SUPPORT') || s.includes('SUPT') || s.includes('SUP')) return 1;
    
    // Priority 2: Day (Catches 'DAY', exact 'D', or '(D)' anywhere)
    if (s.includes('DAY') || s === 'D' || s.includes('(D)')) return 2;
    
    // Priority 3: Night (Catches 'NIGHT', exact 'N', or '(N)' anywhere)
    if (s.includes('NIGHT') || s === 'N' || s.includes('(N)')) return 3;
    
    // Priority 4: Rest of the order (Other scheduled shifts, Unscheduled, etc.)
    return 4; 
}


// --- UNIVERSAL MULTI-GROUP EXTRACTOR ---
function getUniqueGroups() {
    return Array.from(new Set(Object.values(employeeGroups).flatMap(g => (g || 'General').split(',').map(s=>s.trim())))).filter(g=>g).sort();
}

window.onload = async () => {
    try {
        const configRes = await fetch('/api/config');
        if (!configRes.ok) throw new Error("Central API initialization barrier encountered.");
        const firebaseConfig = await configRes.json();
        
        firebase.initializeApp(firebaseConfig); 
        rtdb = firebase.database();
        
        setupFirebaseListeners();
        
    } catch (error) {
        console.error("Firebase Initialization Failure:", error);
        document.getElementById('loader-text').innerText = "System configuration link fractured.";
        return; 
    }

    window.hasInitialized = false;
    document.getElementById('log-date').valueAsDate = new Date(); 
    document.getElementById('admin-roster-date').valueAsDate = new Date(); 
    document.getElementById('admin-sdi-date').valueAsDate = new Date(); 
    document.getElementById('admin-sk-date').valueAsDate = new Date(); 
    document.getElementById('schedule-year-filter').value = new Date().getFullYear().toString();
    setupCropEvents(); 
    makeDraggable(document.getElementById('chat-room-modal'), document.getElementById('chat-drag-handle'));
    makeDraggable(document.getElementById('chat-list-modal'), document.getElementById('chat-list-drag-handle'));
    
    setupPublicRosterSwipe();
    
    const isMuted = localStorage.getItem('duna_muted') === 'true';
    document.getElementById('mute-icon').innerText = isMuted ? '🔕' : '🔊';

    const cachedConfig = localStorage.getItem('duna_master_config');
    if (cachedConfig) {
        const parsed = JSON.parse(cachedConfig);
        dbNotices = parsed.notices || []; allEmployees = parsed.employees || []; employeeGroups = parsed.employeeGroups || {}; masterSchedule = parsed.schedule || {};
        if (parsed.employeePasswords) employeePasswords = parsed.employeePasswords; if (parsed.employeeBios) employeeBios = parsed.employeeBios; if (parsed.employeeImages) employeeImages = parsed.employeeImages;
        if (parsed.employeeRoles) employeeRoles = parsed.employeeRoles; if (parsed.employeeLocations) employeeLocations = parsed.employeeLocations; if (parsed.employeePhones) employeePhones = parsed.employeePhones; if (parsed.employeeAddresses) employeeAddresses = parsed.employeeAddresses; if (parsed.employeeEmails) employeeEmails = parsed.employeeEmails; if (parsed.employeeLogTypes) employeeLogTypes = parsed.employeeLogTypes;
        initializeAppState(); document.getElementById('loader-overlay').style.display = 'none'; window.hasInitialized = true;
    }
    fetchDataFromCloud(!cachedConfig); 
};

window.isAdminViewActive = true; 

window.toggleAdminPersonalMode = function() {
    if (!hasManagerAccess()) return; 
    
    window.isAdminViewActive = !window.isAdminViewActive;
    const btn = document.getElementById('nav-mode-switch-btn');
    const adminAvatar = document.getElementById('header-admin-avatar');
    
    if (window.isAdminViewActive) {
        activeGroup = 'ADMIN';
        btn.innerHTML = '🔄 ';
        btn.style.background = '#fbbf24'; 
        
        document.getElementById('selection-card').style.display = 'none';
        document.getElementById('employee-top-controls').style.display = 'none';
        document.getElementById('employee-sdi-ui').style.display = 'none';
        document.getElementById('employee-sk-ui').style.display = 'none';
        document.getElementById('not-scheduled-msg').style.display = 'none';
        document.getElementById('nav-monthly-btn').style.display = 'none';
        document.getElementById('nav-user-profile-btn').style.display = 'none';
        
        document.getElementById('nav-directory-btn').style.display = 'flex';
        document.getElementById('admin-dashboard').style.display = 'flex';
        if (adminAvatar) adminAvatar.style.display = 'block';
        
        backToAdminRoster(); 
        
    } else {
        activeGroup = employeeGroups[confirmedEmployee] || 'SK'; 
        btn.innerHTML = '🛡️ ';
        btn.style.background = 'var(--primary)'; 
        
        document.getElementById('admin-dashboard').style.display = 'none';
        document.getElementById('nav-directory-btn').style.display = 'none';
        if (adminAvatar) adminAvatar.style.display = 'none';
        
        document.getElementById('selection-card').style.display = 'block';
        document.getElementById('nav-monthly-btn').style.display = 'flex';
        document.getElementById('nav-user-profile-btn').style.display = 'flex';
        document.getElementById('employee-display-name').value = confirmedEmployee;
        
        renderEmployeeBioCard();
        updateUI(); 
    }
};

function setupFirebaseListeners() {
    rtdb.ref('group_meta').on('value', snap => {
        chatGroupsMeta = snap.val() || {};
        if(document.getElementById('chat-list-modal').style.display === 'flex') renderChatList();
    });

    rtdb.ref('messages').on('value', (snap) => {
        const rawData = snap.val() || {};
        const newChatData = rawData;
        
        if (confirmedEmployee && window.hasInitialized) {
            const mySafeKey = sanitizeFirebaseKey(confirmedEmployee);
            for(const room in newChatData) {
                if (room === mySafeKey || room.startsWith(mySafeKey + '___') || room.endsWith('___' + mySafeKey) || room.includes('___' + mySafeKey + '___') || (chatGroupsMeta[room] && chatGroupsMeta[room].members && chatGroupsMeta[room].members.includes(confirmedEmployee))) {
                    const keys = Object.keys(newChatData[room]);
                    if(keys.length > 0) {
                        const lastKey = keys[keys.length-1]; const lastMsg = newChatData[room][lastKey];
                        if(lastMsg.sender !== confirmedEmployee && !lastMsg.isRead && (!chatData[room] || !chatData[room][lastKey])) {
                            showToast(`New message from ${lastMsg.sender}`, 'info');
                        }
                    }
                }
            }
        }
        
        chatData = newChatData; updateChatBadges();
        if(document.getElementById('chat-list-modal').style.display === 'flex') renderChatList();
        if(document.getElementById('chat-room-modal').style.display === 'flex') renderChatRoom();
    });
    
    rtdb.ref('settings/roster_visibility').on('value', (snap) => {
        globalRosterVisibility = snap.val() || {};
        if (!confirmedEmployee) renderPublicRoster(); 
        if (document.getElementById('roster-vis-modal')?.style.display === 'flex') renderRosterVisibilityList();
    });

    rtdb.ref('settings/admin_group_visibility').on('value', (snap) => {
        globalAdminGroupVisibility = snap.val() || {};
        if (isAdminUser() && activeGroup === 'ADMIN' && document.getElementById('admin-rosters-wrapper')?.style.display === 'block') {
            renderAdminRosters();
        }
        if (document.getElementById('roster-vis-modal')?.style.display === 'flex') renderRosterVisibilityList();
    });

    rtdb.ref('settings/logo').on('value', (snap) => { 
        const val = snap.val(); 
        if (val) { 
            document.querySelectorAll('.brand-logo').forEach(img => img.src = val); 
            const prev = document.getElementById('admin-logo-preview'); 
            if (prev) prev.src = val; 
        } 
    });
    
    rtdb.ref('settings/chat').on('value', (snap) => {
        const val = snap.val();
        if (val) {
            globalChatSettings = Object.assign(globalChatSettings, val);
            const visSelect = document.getElementById('admin-chat-visibility');
            const grpSelect = document.getElementById('admin-chat-groups');
            if(visSelect) visSelect.value = globalChatSettings.visibility;
            if(grpSelect) grpSelect.value = globalChatSettings.canCreateGroups.toString();
            
            const groupBtn = document.getElementById('create-group-btn');
            if (groupBtn) {
                groupBtn.style.display = (isAdminUser() || globalChatSettings.canCreateGroups) ? 'inline-block' : 'none';
            }
            if(document.getElementById('chat-list-modal').style.display === 'flex') renderChatList();
        }
    });

    rtdb.ref('profile_extensions').on('value', (snapshot) => {
        const data = snapshot.val();
        if (data) {
            for (let safeEmp in data) {
                let normalEmp = decodeURIComponent(safeEmp);
                if (data[safeEmp].password) employeePasswords[normalEmp] = data[safeEmp].password; 
                if (data[safeEmp].bio) employeeBios[normalEmp] = data[safeEmp].bio; 
                if (data[safeEmp].image) employeeImages[normalEmp] = data[safeEmp].image;
                if (data[safeEmp].role) employeeRoles[normalEmp] = data[safeEmp].role; 
                if (data[safeEmp].location) employeeLocations[normalEmp] = data[safeEmp].location; 
                if (data[safeEmp].phone) employeePhones[normalEmp] = data[safeEmp].phone; 
                if (data[safeEmp].address) employeeAddresses[normalEmp] = data[safeEmp].address; 
                if (data[safeEmp].email) employeeEmails[normalEmp] = data[safeEmp].email;
                if (data[safeEmp].logType) employeeLogTypes[normalEmp] = data[safeEmp].logType;
            }
            for (let emp in employeeLocations) { employeeGroups[emp] = employeeLocations[emp] || "General"; }
            if (confirmedEmployee) renderEmployeeBioCard(); 
            if (document.getElementById('directory-modal').style.display === 'flex') renderDirectory();
        }
    });

    rtdb.ref('logs').on('value', (snapshot) => {
        const data = snapshot.val();
        if (data) {
            firebaseDataCache = {};
            for(let date in data) { firebaseDataCache[date] = {}; for(let safeEmp in data[date]) { let normalEmp = decodeURIComponent(safeEmp); firebaseDataCache[date][normalEmp] = data[date][safeEmp]; } }
            mergeFirebaseData();
        }
    });
}

function playBeep() {
    if (localStorage.getItem('duna_muted') === 'true') return;
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator(); const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination); osc.type = 'sine';
        osc.frequency.setValueAtTime(880, ctx.currentTime); gain.gain.setValueAtTime(0.05, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.00001, ctx.currentTime + 0.3); osc.start(); osc.stop(ctx.currentTime + 0.3);
    } catch(e) {}
}

function toggleMute() {
    const isMuted = localStorage.getItem('duna_muted') === 'true';
    localStorage.setItem('duna_muted', isMuted ? 'false' : 'true');
    document.getElementById('mute-icon').innerText = isMuted ? '🔊' : '🔕';
    showToast(isMuted ? "Sound Unmuted" : "Sound Muted", 'info');
}

function showToast(message, type = 'success') {
    if (type === 'info' || type === 'warning') playBeep();
    const container = document.getElementById('toast-container'); const toast = document.createElement('div'); toast.className = `toast ${type}`;
    const icon = type === 'success' ? '✅' : type === 'error' ? '❌' : type === 'warning' ? '⚠️' : '💬'; toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;
    container.appendChild(toast); setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 4000);
}

function auditLog(action, details = '') { rtdb.ref('audit_logs').push({ timestamp: new Date().toISOString(), user: confirmedEmployee || 'System', action: action, details: details }); }

// --- ROLE HIERARCHY ---
function isAdminUser() { 
    if (!confirmedEmployee) return false; 
    return confirmedEmployee === 'ADMIN' || (employeeRoles[confirmedEmployee] && employeeRoles[confirmedEmployee].toUpperCase() === 'ADMIN'); 
}

function isLeaderUser() {
    if (!confirmedEmployee) return false; 
    return employeeRoles[confirmedEmployee] && employeeRoles[confirmedEmployee].toUpperCase() === 'LEADER';
}

function hasManagerAccess() {
    return isAdminUser() || isLeaderUser();
}

function leaderHasAccess(targetGroup) {
    if (!confirmedEmployee || !employeeGroups[confirmedEmployee]) return false;
    const myGroups = employeeGroups[confirmedEmployee].split(',').map(g => g.trim());
    return myGroups.includes(targetGroup);
}

function leaderHasAccessToEmployee(emp) {
    const leaderGroups = (employeeGroups[confirmedEmployee] || '').split(',').map(g=>g.trim());
    const empGroups = (employeeGroups[emp] || '').split(',').map(g=>g.trim());
    return empGroups.some(g => leaderGroups.includes(g));
}


window.convertImage = function(fileInputId, hiddenId, previewId) {
    const file = document.getElementById(fileInputId).files[0]; if (!file) return;
    const reader = new FileReader(); reader.onload = (e) => { document.getElementById(hiddenId).value = e.target.result; document.getElementById(previewId).src = e.target.result; }; reader.readAsDataURL(file);
};

window.pushGlobalLogo = function() {
    const base64 = document.getElementById('admin-logo-base64').value;
    if (!base64) return showToast("Please select a logo file to upload first.", "warning");
    rtdb.ref('settings/logo').set(base64).then(() => showToast("Global branding updated successfully.", "success")).catch(e => showToast("Error updating logo.", "error"));
};

window.pushGlobalChatSettings = function() {
    const visibility = document.getElementById('admin-chat-visibility').value; const canCreateGroups = document.getElementById('admin-chat-groups').value === 'true';
    rtdb.ref('settings/chat').set({ visibility, canCreateGroups }).then(() => showToast("Chat settings updated.", "success")).catch(e => showToast("Error updating chat settings.", "error"));
};

window.openGroupCreateModal = function() {
    document.getElementById('gc-name').value = ''; document.getElementById('gc-photo-file').value = ''; document.getElementById('gc-photo-base64').value = ''; document.getElementById('gc-photo-preview').src = 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?q=80&w=150&auto=format&fit=crop';
    const list = document.getElementById('gc-members-list'); list.innerHTML = ''; let availableEmps = allEmployees.slice(); if (!availableEmps.includes('ADMIN')) availableEmps.push('ADMIN');
    if (!isAdminUser()) {
        if (globalChatSettings.visibility === 'MANAGEMENT') {
            availableEmps = availableEmps.filter(emp => emp === 'ADMIN' || (employeeRoles[emp] && employeeRoles[emp].toUpperCase() === 'ADMIN') || emp === confirmedEmployee);
        } else if (globalChatSettings.visibility === 'GROUP') {
            availableEmps = availableEmps.filter(emp => {
                if (emp === 'ADMIN' || (employeeRoles[emp] && employeeRoles[emp].toUpperCase() === 'ADMIN') || emp === confirmedEmployee) return true;
                const empGroups = (employeeGroups[emp] || 'General').split(',').map(g=>g.trim());
                const myGroups = (employeeGroups[confirmedEmployee] || 'General').split(',').map(g=>g.trim());
                return empGroups.some(g => myGroups.includes(g));
            });
        }
    }
    availableEmps.sort().forEach(emp => { if(emp === confirmedEmployee) return; list.innerHTML += `<label style="display:flex; align-items:center; gap:8px; margin-bottom:6px; font-weight:600; font-size:0.9rem; text-transform:none;"><input type="checkbox" value="${emp}" class="gc-member-chk"> ${emp}</label>`; });
    document.getElementById('group-create-modal').style.display = 'flex';
};

window.confirmCreateGroup = function() {
    const name = document.getElementById('gc-name').value.trim(); if(!name) return showToast("Group name is required.", "error");
    const image = document.getElementById('gc-photo-base64').value; const checked = Array.from(document.querySelectorAll('.gc-member-chk:checked')).map(cb => cb.value); checked.push(confirmedEmployee);
    const groupId = 'GROUP___' + Date.now();
    rtdb.ref(`group_meta/${groupId}`).set({ name: name, members: checked, createdBy: confirmedEmployee, image: image || null });
    rtdb.ref(`messages/${groupId}`).push({ sender: 'System', text: `Group '${name}' created.`, timestamp: new Date().toISOString(), isRead: true });
    closeModal('group-create-modal'); showToast("Group created successfully.", "success");
};

window.changeTableZoom = function(scale) {
    document.getElementById('fs-zoom-display').innerText = Math.round(scale * 100) + '%';
    const table = document.getElementById('fs-table');
    table.style.zoom = scale;
    if (navigator.userAgent.toLowerCase().indexOf('firefox') > -1) {
        table.style.transform = `scale(${scale})`;
        table.style.transformOrigin = 'top left';
    }
};

window.openFullScheduleModal = function() {
    document.getElementById('full-schedule-modal').style.display = 'flex';
    
    // --- NEW: Reset Fullscreen state on open ---
    if (window.isFSMatrixFullscreen) {
        window.toggleFSMatrixFullscreen(); 
    }
    // -------------------------------------------

    const groupFilterContainer = document.getElementById('fs-group-filter-container');
    // ... [Rest of your existing function continues here]
    const groupSelect = document.getElementById('fs-group-filter');

    if (isAdminUser()) {
        groupFilterContainer.style.display = 'block';
        groupSelect.innerHTML = '<option value="ALL">-- All Locations / Groups --</option>';
        getUniqueGroups().forEach(g => {
            groupSelect.innerHTML += `<option value="${g}">${g}</option>`;
        });
        groupSelect.value = 'ALL';
    } else if (isLeaderUser()) {
        const leaderGroups = (employeeGroups[confirmedEmployee] || 'SK').split(',').map(g=>g.trim());
        if (leaderGroups.length > 1) {
            groupFilterContainer.style.display = 'block';
            groupSelect.innerHTML = '';
            leaderGroups.forEach(g => { groupSelect.innerHTML += `<option value="${g}">${g}</option>`; });
            groupSelect.value = leaderGroups[0];
        } else {
            groupFilterContainer.style.display = 'none';
            groupSelect.innerHTML = `<option value="${leaderGroups[0]}">${leaderGroups[0]}</option>`;
            groupSelect.value = leaderGroups[0];
        }
    } else {
        groupFilterContainer.style.display = 'none';
    }

    const now = new Date();
    document.getElementById('fs-month-filter').value = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"][now.getMonth()];
    document.getElementById('fs-year-filter').value = now.getFullYear().toString();
    document.getElementById('fs-zoom-slider').value = 1;
    changeTableZoom(1);

    handleFSGroupFilterChange();
};


window.handleFSGroupFilterChange = function() {
    const groupFilter = (isAdminUser() || isLeaderUser()) ? document.getElementById('fs-group-filter').value : activeGroup;
    const nameSelect = document.getElementById('fs-name-filter');
    
    nameSelect.innerHTML = '<option value="ALL">-- All Employees --</option>';
    
    allEmployees.slice().sort().forEach(emp => {
        const empGroups = (employeeGroups[emp] || '').split(',').map(g=>g.trim());
        if (groupFilter === 'ALL' || empGroups.includes(groupFilter)) {
            nameSelect.innerHTML += `<option value="${emp}">${emp}</option>`;
        }
    });

    fetchAndRenderFullSchedule();
};


window.fetchAndRenderFullSchedule = function() {
    const monthKey = document.getElementById('fs-month-filter').value;
    const yearKey = document.getElementById('fs-year-filter').value;
    let selectedGroup = (isAdminUser() || isLeaderUser()) ? document.getElementById('fs-group-filter').value : activeGroup;
    let selectedName = document.getElementById('fs-name-filter').value;

    rtdb.ref('schedule').once('value').then(snapshot => {
        const firebaseScheduleData = snapshot.val() || {};
        renderCompactMatrix(firebaseScheduleData, monthKey, yearKey, selectedGroup, selectedName);
    }).catch(error => {
        console.error("Firebase Read Error:", error);
        showToast("Matrix data sync failed.", "error");
    });
};

function renderCompactMatrix(dbSchedule, monthKey, yearKey, targetGroup, targetName) {
    const thead = document.getElementById('fs-thead');
    const tbody = document.getElementById('fs-tbody');
    tbody.innerHTML = '';

    // --- UPDATED: EXCLUDE ANYONE WITH ROLE 'ADMIN' ---
    // We check employeeRoles[emp] and ensure it is not 'ADMIN' (case-insensitive)
    let targetEmployees = allEmployees.slice().filter(emp => {
        const role = (employeeRoles[emp] || '').toUpperCase();
        return role !== 'ADMIN';
    }).sort();
    
    // ... rest of your existing logic continues below ...
    
    if (targetGroup !== 'ALL') {
        targetEmployees = targetEmployees.filter(emp => {
            const empGroups = (employeeGroups[emp] || '').split(',').map(g=>g.trim());
            return empGroups.includes(targetGroup);
        });
    }
    
    if (targetName && targetName !== 'ALL') {
        targetEmployees = targetEmployees.filter(emp => emp === targetName);
    }
    

    const monthIndex = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"].indexOf(monthKey);
    const daysInMonth = new Date(parseInt(yearKey, 10), monthIndex + 1, 0).getDate();

    const getShiftColor = (shiftStr) => {
        const s = shiftStr.toUpperCase().trim();
        if (s === 'OFF') return 'background-color: #f1f5f9; color: #64748b;';
        if (s === 'D' || s.includes('DAY')) return 'background-color: #fef08a; color: #a16207;';
        if (s === 'N' || s.includes('NIGHT')) return 'background-color: #312e81; color: #e0e7ff;';
        if (s.includes('SICK') || s.includes('AWAY') || s.includes('LEAVE')) return 'background-color: #fee2e2; color: #b91c1c;';
        
        let hash = 0;
        for (let i = 0; i < s.length; i++) hash = s.charCodeAt(i) + ((hash << 5) - hash);
        const hue = Math.abs(hash % 360);
        return `background-color: hsl(${hue}, 85%, 90%); color: hsl(${hue}, 85%, 25%);`;
    };

    let headerHtml = `<tr>
        <th style="background: #d9e5f2; position: sticky; top: 0; left: 0; z-index: 40; border: 1px solid #000; border-right: 2px solid #000; width: 140px; min-width: 140px; max-width: 140px; padding: 10px 8px;">Name</th>
        <th style="background: #d9e5f2; position: sticky; top: 0; left: 140px; z-index: 40; border: 1px solid #000; border-right: 2px solid #000; width: 80px; min-width: 80px; max-width: 80px; padding: 10px 8px;">Details</th>`;
        
    for (let d = 1; d <= daysInMonth; d++) {
        let exactDate = new Date(parseInt(yearKey, 10), monthIndex, d);
        let weekday = exactDate.toLocaleDateString('en-US', { weekday: 'short' });
        let headerColor = (weekday === 'Sat' || weekday === 'Sun') ? '#ef4444' : '#800000';
        
        headerHtml += `<th style="background: #e6d0de; position: sticky; top: 0; z-index: 10; color: ${headerColor}; min-width: 60px; border: 1px solid #000; padding: 12px 8px;">${d}<br><span style="font-size:11px;">${weekday}</span></th>`;
    }
    headerHtml += `<th style="background: #e2f0d9; position: sticky; top: 0; z-index: 30; border: 1px solid #000; border-left: 2px solid #000; min-width: 50px; padding: 12px 8px;">Total</th></tr>`;
    thead.innerHTML = headerHtml;

    let bodyHtml = '';
    const detailRows = ['Area', 'Basic', 'OT']; 

    targetEmployees.forEach(emp => {
        const empYearData = dbSchedule[emp] ? dbSchedule[emp][yearKey] : null;
        const empMonthData = empYearData ? empYearData[monthKey] : {};

        detailRows.forEach((detailKey, index) => {
            bodyHtml += `<tr>`;
            
            if (index === 0) {
                bodyHtml += `<td rowspan="${detailRows.length}" style="position: sticky; left: 0; background: white; z-index: 20; border: 1px solid #000; border-right: 2px solid #000; font-weight: bold; width: 140px; min-width: 140px; max-width: 140px; word-wrap: break-word; padding: 12px 8px;">
                    ${emp}<br><span style="font-weight:normal; font-size:11px; color:#555;">(${employeeGroups[emp] || 'General'})</span>
                </td>`;
            }
            
            let detailBg = "background-color: #ffffff;";
            if (detailKey === 'Basic') detailBg = "background-color: #f2f2f2;";
            if (detailKey === 'OT') detailBg = "background-color: #fff2cc;";
            
            bodyHtml += `<td style="position: sticky; left: 140px; z-index: 20; border: 1px solid #000; border-right: 2px solid #000; font-weight: bold; width: 80px; min-width: 80px; max-width: 80px; padding: 12px 8px; ${detailBg}">${detailKey}</td>`;

            let rowTotal = 0;
            let hasNumericData = false;

            for (let d = 1; d <= daysInMonth; d++) {
                const dayData = empMonthData ? empMonthData[d] : null;
                const rawVal = dayData ? dayData[detailKey.toLowerCase()] : '';
                const val = rawVal !== undefined ? rawVal : '';

                let cellStyle = "border: 1px solid #000; padding: 12px 8px; height: 40px;";
                
                if (val !== '') {
                    const numericCheck = parseFloat(val);
                    if (isNaN(numericCheck)) {
                        cellStyle += ` font-weight: bold; ${getShiftColor(val)}`;
                    } else {
                        rowTotal += numericCheck;
                        hasNumericData = true;
                    }
                }

                bodyHtml += `<td style="${cellStyle}">${val}</td>`;
            }

            const finalTotal = hasNumericData ? rowTotal : '';
            bodyHtml += `<td style="background: #e2f0d9; font-weight: bold; border: 1px solid #000; border-left: 2px solid #000; padding: 12px 8px;">${finalTotal}</td>`;
            bodyHtml += `</tr>`;
        });
    });

    if (targetEmployees.length === 0) {
        bodyHtml = `<tr><td colspan="${daysInMonth + 3}" style="padding: 30px; text-align: center;">No schedule parameters found for the selected segment.</td></tr>`;
    }

    tbody.innerHTML = bodyHtml;
}

window.deleteCurrentGroup = function() {
    if(!currentChatIsGroup) return; if(!confirm("Are you sure you want to delete this group?")) return;
    rtdb.ref(`group_meta/${currentChatEmp}`).remove(); rtdb.ref(`messages/${currentChatEmp}`).remove();
    closeFloatingModal('chat-room-modal'); showToast("Group chat deleted.", "success");
};

function maskEmployeeName(fullName) {
    if (!fullName) return '';
    const parts = fullName.trim().split(' ');
    if (parts.length === 1) {
        return parts[0].charAt(0).toUpperCase() + '***';
    }
    const firstInitial = parts[0].charAt(0).toUpperCase();
    const lastInitial = parts[parts.length - 1].charAt(0).toUpperCase();
    return `${firstInitial}*** ${lastInitial}***`;
}

function updateChatBadges() {
    let unreadCount = 0; if (!confirmedEmployee) return 0; const mySafeKey = sanitizeFirebaseKey(confirmedEmployee);
    for (const room in chatData) {
        if (room === mySafeKey || room.startsWith(mySafeKey + '___') || room.endsWith('___' + mySafeKey) || room.includes('___' + mySafeKey + '___') || (chatGroupsMeta[room] && chatGroupsMeta[room].members && chatGroupsMeta[room].members.includes(confirmedEmployee))) {
            for (const key in chatData[room]) { if (chatData[room][key].sender !== confirmedEmployee && !chatData[room][key].isRead) unreadCount++; }
        }
    }
    const badge = document.getElementById('nav-chat-badge'); if (badge) { badge.style.display = unreadCount > 0 ? 'flex' : 'none'; badge.innerText = unreadCount; } return unreadCount;
}

function openChatAction() { document.getElementById('chat-list-modal').style.display = 'flex'; renderChatList(); }

function renderChatList() {
    const container = document.getElementById('chat-list-container'); 
    container.innerHTML = ''; 
    let chatTargets = allEmployees.slice(); 
    if (!chatTargets.includes('ADMIN')) chatTargets.push('ADMIN');
    
    if (!isAdminUser()) {
        if (globalChatSettings.visibility === 'MANAGEMENT') chatTargets = chatTargets.filter(emp => emp === 'ADMIN' || (employeeRoles[emp] && employeeRoles[emp].toUpperCase() === 'ADMIN') || emp === confirmedEmployee);
        else if (globalChatSettings.visibility === 'GROUP') {
            chatTargets = chatTargets.filter(emp => {
                if (emp === 'ADMIN' || (employeeRoles[emp] && employeeRoles[emp].toUpperCase() === 'ADMIN') || emp === confirmedEmployee) return true;
                const empGroups = (employeeGroups[emp] || 'General').split(',').map(g=>g.trim());
                const myGroups = (employeeGroups[confirmedEmployee] || 'General').split(',').map(g=>g.trim());
                return empGroups.some(g => myGroups.includes(g));
            });
        }
    }
    
    let empStatus = chatTargets.map(emp => {
        if (emp === confirmedEmployee) return null; 
        let unread = 0; let lastMsgTime = 0; let lastMsgText = ''; const roomId = getRoomId(confirmedEmployee, emp);
        
        if (chatData[roomId]) {
            const keys = Object.keys(chatData[roomId]);
            if (keys.length > 0) { 
                const lastMsg = chatData[roomId][keys[keys.length - 1]]; 
                lastMsgText = lastMsg.text; 
                lastMsgTime = new Date(lastMsg.timestamp).getTime(); 
            }
            for (const k in chatData[roomId]) { if (chatData[roomId][k].sender !== confirmedEmployee && !chatData[roomId][k].isRead) unread++; }
        }
        return { emp, unread, lastMsgTime, lastMsgText, isGroup: false };
    }).filter(Boolean);
    
    for(let groupId in chatGroupsMeta) {
        let meta = chatGroupsMeta[groupId];
        if(meta.members && meta.members.includes(confirmedEmployee)) {
            let lastMsgText = 'No messages', lastMsgTime = 0, unread = 0;
            if(chatData[groupId]) {
                const keys = Object.keys(chatData[groupId]);
                if(keys.length > 0) { 
                    const lastMsg = chatData[groupId][keys[keys.length-1]]; 
                    lastMsgText = (lastMsg.sender === 'System' ? '' : lastMsg.sender + ': ') + lastMsg.text; 
                    lastMsgTime = new Date(lastMsg.timestamp).getTime(); 
                }
                for (const k in chatData[groupId]) { if (chatData[groupId][k].sender !== confirmedEmployee && !chatData[groupId][k].isRead) unread++; }
            }
            empStatus.push({ isGroup: true, groupId: groupId, name: meta.name || 'Group', image: meta.image, unread: unread, lastMsgTime: lastMsgTime, lastMsgText: lastMsgText });
        }
    }
    
    empStatus.sort((a,b) => { if(b.unread !== a.unread) return b.unread - a.unread; return b.lastMsgTime - a.lastMsgTime; });
    
    const todayStr = new Date().toDateString();

    empStatus.forEach(e => {
        let timeDisplay = '';
        if (e.lastMsgTime > 0) {
            const msgDate = new Date(e.lastMsgTime);
            if (msgDate.toDateString() === todayStr) {
                timeDisplay = msgDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
            } else {
                timeDisplay = msgDate.toLocaleDateString([], {month: 'short', day: 'numeric'});
            }
        }

        if(e.isGroup) {
            const img = e.image || "https://images.unsplash.com/photo-1522071820081-009f0129c71c?q=80&w=150&auto=format&fit=crop"; 
            container.innerHTML += `
                <div class="chat-list-item" onclick="openChatRoom('${e.groupId}', true)">
                    <div style="display: flex; gap: 12px; align-items: center; width: 100%; min-width: 0;">
                        <img src="${img}" style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover; flex-shrink: 0;">
                        <div style="flex: 1; min-width: 0;">
                            <div style="display: flex; justify-content: space-between; align-items: baseline;">
                                <div style="font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${e.name} <span style="font-size: 0.7rem; color: var(--primary);">(Group)</span></div>
                                <div style="font-size: 0.65rem; color: var(--text-light); margin-left: 8px; flex-shrink: 0;">${timeDisplay}</div>
                            </div>
                            <div style="font-size: 0.8rem; color: var(--text-light); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${e.lastMsgText}</div>
                        </div>
                    </div>
                    ${e.unread > 0 ? `<div class="chat-list-badge" style="margin-left: 10px;">${e.unread}</div>` : ''}
                </div>`;
        } else {
            const img = employeeImages[e.emp] || (e.emp==='ADMIN' ? 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?q=80&w=150' : 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?q=80&w=150');
            container.innerHTML += `
                <div class="chat-list-item" onclick="openChatRoom('${sanitizeFirebaseKey(e.emp)}', false)">
                    <div style="display: flex; gap: 12px; align-items: center; width: 100%; min-width: 0;">
                        <img src="${img}" style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover; flex-shrink: 0;">
                        <div style="flex: 1; min-width: 0;">
                            <div style="display: flex; justify-content: space-between; align-items: baseline;">
                                <div style="font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${e.emp}</div>
                                <div style="font-size: 0.65rem; color: var(--text-light); margin-left: 8px; flex-shrink: 0;">${timeDisplay}</div>
                            </div>
                            <div style="font-size: 0.8rem; color: var(--text-light); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${e.lastMsgText || 'No messages'}</div>
                        </div>
                    </div>
                    ${e.unread > 0 ? `<div class="chat-list-badge" style="margin-left: 10px;">${e.unread}</div>` : ''}
                </div>`;
        }
    });
}

function openChatRoom(safeEmp, isGroup = false) { currentChatEmp = decodeURIComponent(safeEmp); currentChatIsGroup = isGroup; document.getElementById('chat-list-modal').style.display = 'none'; document.getElementById('chat-room-title').innerText = isGroup ? `Group: ${chatGroupsMeta[currentChatEmp]?.name || 'Chat'}` : `Chat: ${currentChatEmp}`; document.getElementById('chat-room-modal').style.display = 'flex'; renderChatRoom(); }
function closeFloatingModal(id) { document.getElementById(id).style.display = 'none'; }
window.deleteChatMessage = function(roomId, msgKey) { if(confirm("Delete this message?")) rtdb.ref(`messages/${roomId}/${msgKey}`).remove(); };

window.reactToMessage = function(room, msgKey) {
    const safeMyName = sanitizeFirebaseKey(confirmedEmployee); const currentReaction = (chatData[room] && chatData[room][msgKey] && chatData[room][msgKey].userReacts) ? chatData[room][msgKey].userReacts[safeMyName] : null;
    const emoji = prompt("Enter an emoji to react (leave blank to remove existing reaction):", currentReaction || "👍"); if(emoji === null) return;
    const ref = rtdb.ref(`messages/${room}/${msgKey}/userReacts/${safeMyName}`); if(emoji.trim() === "") ref.remove(); else ref.set(emoji.trim());
};

function renderChatRoom() {
    const container = document.getElementById('chat-messages-container'); 
    container.innerHTML = ''; 
    const roomId = currentChatIsGroup ? currentChatEmp : getRoomId(confirmedEmployee, currentChatEmp);
    let msgs = chatData[roomId] || {}; let updateRef = null;
    
    const delBtn = document.getElementById('chat-group-delete-btn'); 
    if(currentChatIsGroup && (chatGroupsMeta[currentChatEmp]?.createdBy === confirmedEmployee || isAdminUser())) {
        delBtn.style.display = 'block'; 
    } else {
        delBtn.style.display = 'none';
    }
    
    let updates = {}; let needsUpdate = false;
    const myImg = employeeImages[confirmedEmployee] || (isAdminUser() ? 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?q=80&w=150' : 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?q=80&w=150');
    const theirImg = employeeImages[currentChatEmp] || (currentChatEmp==='ADMIN' ? 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?q=80&w=150' : 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?q=80&w=150');
    const mySafeKey = sanitizeFirebaseKey(confirmedEmployee);
    
    const todayStr = new Date().toDateString();

    Object.keys(msgs).forEach(key => {
        const m = msgs[key]; 
        const isMe = m.sender === confirmedEmployee; 
        if (!isMe && !m.isRead) { updates[`${key}/isRead`] = true; needsUpdate = true; }
        
        const msgDate = new Date(m.timestamp);
        const isToday = msgDate.toDateString() === todayStr;
        const timeOnly = msgDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        
        const timeStr = isToday ? timeOnly : `${msgDate.toLocaleDateString([], {month: 'short', day: 'numeric'})}, ${timeOnly}`;

        const deleteBtn = isMe ? `<span style="font-size:0.75rem; cursor:pointer; margin-left:8px; color:var(--danger);" onclick="deleteChatMessage('${roomId}', '${key}')" title="Delete">🗑️</span>` : '';
        let renderTheirImg = theirImg; 
        if(currentChatIsGroup && !isMe && m.sender !== 'System') renderTheirImg = employeeImages[m.sender] || "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?q=80&w=150";
        
        const avatarStr = isMe || m.sender === 'System' ? '' : `<div style="display:flex; flex-direction:column; align-items:center; min-width: 32px;"><img src="${renderTheirImg}" style="width: 28px; height: 28px; border-radius: 50%; object-fit: cover; align-self: flex-end; margin-right: 8px;">${currentChatIsGroup?'<span style="font-size:8px; color:var(--text-light); max-width:40px; overflow:hidden; text-overflow:ellipsis;">'+m.sender+'</span>':''}</div>`;
        const avatarStrMe = isMe ? `<img src="${myImg}" style="width: 28px; height: 28px; border-radius: 50%; object-fit: cover; align-self: flex-end; margin-left: 8px;">` : '';
        
        const userReacts = m.userReacts || {}; 
        let reactionCounts = {}; 
        let myReact = null;
        
        for (let user in userReacts) { 
            let emoji = userReacts[user]; 
            if(user === mySafeKey) myReact = emoji; 
            reactionCounts[emoji] = (reactionCounts[emoji] || 0) + 1; 
        }
        
        const updateRefStr = updateRef ? updateRef : roomId; 
        let reactsHTML = '';
        
        for(let r in reactionCounts) {
            let isMine = (r === myReact); 
            let bg = isMine ? 'rgba(79, 70, 229, 0.15)' : 'rgba(0,0,0,0.06)'; 
            let border = isMine ? '1px solid var(--primary)' : '1px solid transparent';
            reactsHTML += `<span style="font-size:11px; background:${bg}; border:${border}; padding:2px 6px; border-radius:10px; margin-right:4px; cursor:pointer;" onclick="reactToMessage('${updateRefStr}', '${key}')">${r} ${reactionCounts[r]}</span>`;
        }
        
        let addReactHTML = `<span style="cursor:pointer; font-size:11px; opacity:0.6; padding:0 4px;" onclick="reactToMessage('${updateRefStr}', '${key}')">😀</span>`;
        
        if(m.sender === 'System') {
            container.innerHTML += `<div style="text-align:center; font-size: 0.8rem; color: var(--text-light); margin: 10px 0;"><i>${m.text}</i></div>`;
        } else {
            container.innerHTML += `<div style="display:flex; justify-content: ${isMe ? 'flex-end' : 'flex-start'}; margin-bottom: 8px;">${avatarStr}<div class="chat-bubble ${isMe ? 'me' : 'them'}"><div>${m.text}</div><div style="margin-top:6px; display:flex; flex-wrap:wrap;">${reactsHTML}${addReactHTML}</div><div class="chat-timestamp">${timeStr} ${deleteBtn}</div></div>${avatarStrMe}</div>`;
        }
    });
    
    if (needsUpdate) { 
        const fixRef = updateRef ? updateRef : roomId; 
        rtdb.ref(`messages/${fixRef}`).update(updates); 
    } 
    container.scrollTop = container.scrollHeight;
}

function sendChatMessage() {
    const input = document.getElementById('chat-input-text'); const text = input.value.trim(); if (!text) return;
    const msg = { sender: confirmedEmployee, text: text, timestamp: new Date().toISOString(), isRead: false };
    const roomId = currentChatIsGroup ? currentChatEmp : getRoomId(confirmedEmployee, currentChatEmp);
    rtdb.ref(`messages/${roomId}`).push(msg).then(() => { input.value = ''; }).catch(err => showToast("Failed to send message.", "error")); 
}

function makeDraggable(element, handle) {
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0; if (handle) { handle.onmousedown = dragMouseDown; handle.ontouchstart = dragTouchStart; } else { element.onmousedown = dragMouseDown; element.ontouchstart = dragTouchStart; }
    function dragMouseDown(e) { e = e || window.event; if (['INPUT', 'TEXTAREA', 'BUTTON'].includes(e.target.tagName)) return; e.preventDefault(); pos3 = e.clientX; pos4 = e.clientY; document.onmouseup = closeDragElement; document.onmousemove = elementDrag; }
    function dragTouchStart(e) { if (['INPUT', 'TEXTAREA', 'BUTTON'].includes(e.target.tagName)) return; pos3 = e.touches[0].clientX; pos4 = e.touches[0].clientY; document.ontouchend = closeDragElement; document.ontouchmove = elementTouchDrag; }
    function elementDrag(e) { e = e || window.event; e.preventDefault(); pos1 = pos3 - e.clientX; pos2 = pos4 - e.clientY; pos3 = e.clientX; pos4 = e.clientY; element.style.top = (element.offsetTop - pos2) + "px"; element.style.left = (element.offsetLeft - pos1) + "px"; element.style.bottom = "auto"; element.style.right = "auto"; }
    function elementTouchDrag(e) { pos1 = pos3 - e.touches[0].clientX; pos2 = pos4 - e.touches[0].clientY; pos3 = e.touches[0].clientX; pos4 = e.touches[0].clientY; element.style.top = (element.offsetTop - pos2) + "px"; element.style.left = (element.offsetLeft - pos1) + "px"; element.style.bottom = "auto"; element.style.right = "auto"; }
    function closeDragElement() { document.onmouseup = null; document.onmousemove = null; document.ontouchend = null; document.ontouchmove = null; }
}

let cropImg = null; let cropScale = 1; let cropX = 0, cropY = 0; let isDragging = false; let startX, startY; let cropTargetHidden = '', cropTargetPreview = '';
function openCropModal(fileInputId, hiddenId, previewId) {
    const file = document.getElementById(fileInputId).files[0]; if (!file) return;
    cropTargetHidden = hiddenId; cropTargetPreview = previewId; const reader = new FileReader();
    reader.onload = (e) => {
        cropImg = new Image(); cropImg.onload = () => {
            const minScale = Math.max(300 / cropImg.width, 300 / cropImg.height); cropScale = minScale; 
            const zoomInput = document.getElementById('crop-zoom'); zoomInput.min = minScale; zoomInput.max = minScale * 3; zoomInput.step = 0.01; zoomInput.value = cropScale;
            cropX = (300 - cropImg.width * cropScale) / 2; cropY = (300 - cropImg.height * cropScale) / 2;
            document.getElementById('crop-modal').style.display = 'flex'; drawCrop();
        }; cropImg.src = e.target.result;
    }; reader.readAsDataURL(file);
}

function drawCrop() { const canvas = document.getElementById('crop-canvas'); const ctx = canvas.getContext('2d'); ctx.clearRect(0,0,300,300); ctx.drawImage(cropImg, cropX, cropY, cropImg.width * cropScale, cropImg.height * cropScale); ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.beginPath(); ctx.rect(0,0,300,300); ctx.arc(150,150,150,0,Math.PI*2,true); ctx.fill(); }
function applyCrop() {
    const tempCanvas = document.createElement('canvas'); tempCanvas.width = 300; tempCanvas.height = 300; const ctx = tempCanvas.getContext('2d'); ctx.drawImage(cropImg, cropX, cropY, cropImg.width * cropScale, cropImg.height * cropScale);
    const dataUrl = tempCanvas.toDataURL('image/jpeg', 0.85); document.getElementById(cropTargetHidden).value = dataUrl; if(cropTargetPreview) document.getElementById(cropTargetPreview).src = dataUrl; document.getElementById('crop-modal').style.display = 'none'; 
    const ueFile = document.getElementById('ue-avatar-file'); if(ueFile) ueFile.value = ""; const adminFile = document.getElementById('admin-mod-img-file'); if(adminFile) adminFile.value = ""; const gcFile = document.getElementById('gc-photo-file'); if(gcFile) gcFile.value = "";
}

function setupCropEvents() {
    const canvas = document.getElementById('crop-canvas');
    const down = e => { isDragging = true; startX = e.offsetX || (e.touches[0].clientX - canvas.getBoundingClientRect().left); startY = e.offsetY || (e.touches[0].clientY - canvas.getBoundingClientRect().top); };
    const move = e => { if(!isDragging) return; if(e.preventDefault) e.preventDefault(); let mx = e.offsetX || (e.touches[0].clientX - canvas.getBoundingClientRect().left); let my = e.offsetY || (e.touches[0].clientY - canvas.getBoundingClientRect().top); cropX += mx - startX; cropY += my - startY; startX = mx; startY = my; drawCrop(); };
    const up = () => isDragging = false; canvas.addEventListener('mousedown', down); canvas.addEventListener('mousemove', move); canvas.addEventListener('mouseup', up); canvas.addEventListener('mouseleave', up); canvas.addEventListener('touchstart', down, {passive:false}); canvas.addEventListener('touchmove', move, {passive:false}); canvas.addEventListener('touchend', up);
    document.getElementById('crop-zoom').addEventListener('input', e => { const oldScale = cropScale; cropScale = parseFloat(e.target.value); cropX -= (150 - cropX) * (cropScale / oldScale - 1); cropY -= (150 - cropY) * (cropScale / oldScale - 1); drawCrop(); });
}

function mergeFirebaseData() {
    db = {}; 
    for (const dateStr in firebaseDataCache) { 
        db[dateStr] = {}; 
        for (const empName in firebaseDataCache[dateStr]) { 
            let zone = (employeeLogTypes[empName] === 'Logs_SDI') ? 'SDI' : 'SK';
            if (zone === 'SDI') db[dateStr][empName] = { format: 'SDI', shift: '', shiftLocked: false, location: employeeGroups[empName], smock: false, gloves: false, noAccessories: false, lineIn: '', lineOut: '', b1Start: '', b1End: '', b2Start: '', b2End: '', b3Start: '', b3End: '', taskError: '', taskClean: '', taskTicket: '', taskAGVIn: '', taskAGVOut: '', comments: '', review: '', reviewRead: false };
            else db[dateStr][empName] = { format: 'SK', shift: '', shiftLocked: false, checkIn: '', b1Out: '', b1In: '', b2Out: '', b2In: '', checkOut: '', remarks: '', review: '', reviewRead: false };
            Object.assign(db[dateStr][empName], JSON.parse(JSON.stringify(firebaseDataCache[dateStr][empName]))); 
        } 
    }
    if (activeGroup === 'ADMIN') { if (document.getElementById('admin-sdi-viewer').style.display === 'block') renderAdminSdiReport(); else if (document.getElementById('admin-sk-viewer').style.display === 'block') renderAdminSkReport(); else renderAdminRosters(); } 
    else if (confirmedEmployee) { updateUI(); } else { renderPublicRoster(); }
}

setInterval(() => { 
    const now = new Date(); const dateStr = now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
    const hours = now.getHours().toString().padStart(2, '0'); const minutes = now.getMinutes().toString().padStart(2, '0'); const seconds = now.getSeconds().toString().padStart(2, '0'); const ampm = now.getHours() >= 12 ? 'PM' : 'AM'; 
    document.getElementById('clock-display').innerText = `${dateStr} | ${hours}:${minutes}:${seconds} ${ampm}`; 
}, 1000);

function toggleTheme() { document.documentElement.classList.toggle('dark-mode'); localStorage.setItem('dashboard_theme', document.documentElement.classList.contains('dark-mode') ? 'dark' : 'light'); }
function togglePublicRoster() {
    const wrapper = document.getElementById('public-roster-wrapper'); const btn = document.getElementById('toggle-roster-btn');
    if (wrapper.style.display === 'none' || wrapper.style.display === '') { wrapper.style.display = 'block'; btn.innerHTML = "▲"; btn.style.background = "var(--primary)"; btn.style.color = "white"; } 
    else { wrapper.style.display = 'none'; btn.innerHTML = "▼"; btn.style.background = "var(--card-bg)"; btn.style.color = "var(--primary)"; }
}
function toggleAdminConfig() { const wrap = document.getElementById('admin-config-wrapper'); wrap.style.display = wrap.style.display === 'none' ? 'block' : 'none'; }

function getYearFromContext() { const dateStr = document.getElementById('log-date').value; return dateStr ? parseInt(dateStr.split('-')[0], 10) : new Date().getFullYear(); }
function stepDate(id, direction, callback) { const input = document.getElementById(id); if(!input.value) return; const d = new Date(input.value); d.setDate(d.getDate() + direction); input.value = d.toISOString().split('T')[0]; if(callback) callback(); }
function handleDateChange() { updateUI(); }
function getMonthKeyFromDate(dateStr) { if (!dateStr) return 'MONTHLY'; return ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"][parseInt(dateStr.split('-')[1], 10) - 1]; }
function getSafeScheduleData(empName, monthKey, yearKey) { if (!masterSchedule[empName] || !masterSchedule[empName][yearKey]) return null; return masterSchedule[empName][yearKey][monthKey] || null; }

async function fetchDataFromCloud(showLoader = true) {
    const overlay = document.getElementById('loader-overlay'); if (showLoader) { overlay.style.display = 'flex'; overlay.style.opacity = '1'; document.getElementById('loader-text').innerText = "Connecting Central Database Sync..."; }
    try {
        const response = await fetch(GAS_WEB_APP_URL); const result = await response.json();
        if (result.status === 'success') {
            dbNotices = result.notices || []; allEmployees = result.employees || []; employeeGroups = result.employeeGroups || {}; masterSchedule = result.schedule || {};
            if(result.employeePasswords) employeePasswords = Object.assign({}, result.employeePasswords, employeePasswords); 
            if(result.employeeRoles) employeeRoles = Object.assign({}, result.employeeRoles, employeeRoles); 
            if(result.employeeLocations) employeeLocations = Object.assign({}, result.employeeLocations, employeeLocations); 
            if(result.employeePhones) employeePhones = Object.assign({}, result.employeePhones, employeePhones); 
            if(result.employeeAddresses) employeeAddresses = Object.assign({}, result.employeeAddresses, employeeAddresses); 
            if(result.employeeBios) employeeBios = Object.assign({}, result.employeeBios, employeeBios); 
            if(result.employeeEmails) employeeEmails = Object.assign({}, result.employeeEmails, employeeEmails); 
            if(result.employeeLogTypes) employeeLogTypes = Object.assign({}, result.employeeLogTypes, employeeLogTypes);
            for (let emp in employeeLocations) { employeeGroups[emp] = employeeLocations[emp] || "General"; }
            localStorage.setItem('duna_master_config', JSON.stringify({ notices: dbNotices, employees: allEmployees, employeeGroups: employeeGroups, schedule: masterSchedule, employeePasswords: employeePasswords, employeeBios: employeeBios, employeeImages: employeeImages, employeeRoles: employeeRoles, employeeLocations: employeeLocations, employeePhones: employeePhones, employeeAddresses: employeeAddresses, employeeEmails: employeeEmails, employeeLogTypes: employeeLogTypes }));
            mergeFirebaseData(); if(showLoader) initializeAppState(); window.hasInitialized = true;
        }
    } catch (error) { console.error("Central pipeline integration breakdown:", error); }
    overlay.style.opacity = '0'; setTimeout(() => { overlay.style.display = 'none'; }, 300);
}

function initializeAppState() {
    if (confirmedEmployee) {
        document.getElementById('login-portal').style.display = 'none'; 
        document.getElementById('main-app').style.display = 'flex';
        
        if (window.justLogged) { 
            window.justLogged = false; 
            const unreadMsgs = updateChatBadges(); 
            if (unreadMsgs > 0) showToast(`You have ${unreadMsgs} unread message(s)!`, 'info'); 
        }

        const adminAvatar = document.getElementById('header-admin-avatar');

        if (hasManagerAccess()) {
            activeGroup = isAdminUser() ? 'ADMIN' : (employeeGroups[confirmedEmployee] || 'SK'); 
            window.isAdminViewActive = true; 
            
            const modeBtn = document.getElementById('nav-mode-switch-btn');
            if (modeBtn) {
                modeBtn.style.display = 'flex';
                modeBtn.innerHTML = '🔄';
                modeBtn.style.background = '#fbbf24';
            }

            document.getElementById('selection-card').style.display = 'none'; 
            document.getElementById('employee-top-controls').style.display = 'none'; 
            document.getElementById('employee-sdi-ui').style.display = 'none'; 
            document.getElementById('employee-sk-ui').style.display = 'none'; 
            document.getElementById('not-scheduled-msg').style.display = 'none';
            
            document.getElementById('nav-user-profile-btn').style.display = 'none'; 
            document.getElementById('nav-directory-btn').style.display = 'flex'; 
            document.getElementById('nav-monthly-btn').style.display = 'none'; 
            document.getElementById('admin-dashboard').style.display = 'flex'; 
            
            if (adminAvatar) {
                adminAvatar.src = employeeImages[confirmedEmployee] || "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?q=80&w=150";
                adminAvatar.style.display = 'block';
            }

            populateAdminModificationDropdown(); 
            const adminWrap = document.getElementById('admin-config-wrapper');
            if(adminWrap) adminWrap.style.display = 'none'; // Keeps settings closed on login
            
            backToAdminRoster(); 
            
        } else {
            activeGroup = employeeGroups[confirmedEmployee] || 'SK'; 
            
            const modeBtn = document.getElementById('nav-mode-switch-btn');
            if (modeBtn) modeBtn.style.display = 'none';

            document.getElementById('selection-card').style.display = 'block'; 
            document.getElementById('admin-dashboard').style.display = 'none';
            
            document.getElementById('nav-user-profile-btn').style.display = 'flex'; 
            document.getElementById('nav-directory-btn').style.display = 'none'; 
            document.getElementById('nav-monthly-btn').style.display = 'flex';
            document.getElementById('employee-display-name').value = confirmedEmployee; 
            
            if (adminAvatar) adminAvatar.style.display = 'none';

            renderEmployeeBioCard(); 
            updateUI();
        }
    } else { 
        document.getElementById('main-app').style.display = 'none'; 
        document.getElementById('login-portal').style.display = 'flex'; 
        populateUserProfileDropdown(); 
        renderPublicRoster(); 
    }
}

function populateUserProfileDropdown() {}
function handleUserSelectChange() {}

function authenticateUserProfile() {
    const enteredSurname = document.getElementById('portal-username').value.trim(); 
    const enteredPass = document.getElementById('portal-password').value; 
    const errorMsg = document.getElementById('portal-error');
    
    if (!enteredSurname) {
        errorMsg.innerText = "Please enter your surname.";
        errorMsg.style.display = 'block';
        return; 
    }
    
    let selectedUser = null;
    let searchName = enteredSurname.toLowerCase();

    if (searchName === 'admin') {
        selectedUser = 'ADMIN';
    } else {
        const possibleMatches = allEmployees.filter(emp => {
            const empLower = emp.toLowerCase();
            return empLower === searchName || empLower.endsWith(' ' + searchName);
        });

        if (possibleMatches.length === 1) {
            selectedUser = possibleMatches[0]; 
        } else if (possibleMatches.length > 1) {
            errorMsg.innerText = "Multiple profiles share this surname. Please enter your full name.";
            errorMsg.style.display = 'block';
            return;
        } else {
            errorMsg.innerText = "Identity profile not found.";
            errorMsg.style.display = 'block';
            return;
        }
    }

    let correctPass;
    if (selectedUser === 'ADMIN') {
        correctPass = employeePasswords['ADMIN'] ? employeePasswords['ADMIN'].toString().trim() : "dunapass2026";
    } else {
        correctPass = employeePasswords[selectedUser] ? employeePasswords[selectedUser].toString().trim() : "1234"; 
    }

    if (enteredPass.trim() === correctPass) {
        confirmedEmployee = selectedUser; 
        const isUserAdmin = confirmedEmployee === 'ADMIN' || (employeeRoles[confirmedEmployee] && employeeRoles[confirmedEmployee].toUpperCase() === 'ADMIN');
        activeGroup = isUserAdmin ? 'ADMIN' : (employeeGroups[selectedUser] || 'SK');
        
        sessionStorage.setItem('duna_employee', confirmedEmployee); 
        sessionStorage.setItem('duna_group', activeGroup);
        
        errorMsg.style.display = 'none'; 
        document.getElementById('portal-password').value = ''; 
        document.getElementById('portal-username').value = ''; 
        
        showToast(`Welcome back, ${confirmedEmployee}!`, 'success'); 
        window.justLogged = true; 
        initializeAppState();
    } else { 
        errorMsg.innerText = "Invalid security credentials.";
        errorMsg.style.display = 'block'; 
    }
}

function signOutUserProfile() { if (confirm("Disconnect active secure terminal runtime instance?")) { activeGroup = null; confirmedEmployee = null; sessionStorage.removeItem('duna_group'); sessionStorage.removeItem('duna_employee'); initializeAppState(); showToast('Securely exited workspace.', 'info'); } }

function renderEmployeeBioCard() {
    const card = document.getElementById('employee-bio-card'); if (!card || !confirmedEmployee || isAdminUser()) { if(card) card.style.display = 'none'; return; }
    const imageSrc = employeeImages[confirmedEmployee] || "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?q=80&w=150&auto=format&fit=crop";
    card.innerHTML = `<img src="${imageSrc}" alt="Avatar" class="bio-avatar" onerror="this.src='https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?q=80&w=150&auto=format&fit=crop'"><div class="bio-details"><h3>${confirmedEmployee}</h3><p style="font-weight: 800; color: var(--primary); font-size: 0.75rem; text-transform: uppercase;">Location: ${employeeGroups[confirmedEmployee] || "General"}</p><p>${employeeRoles[confirmedEmployee] || "Operations Technician"}</p></div>`;
    card.style.display = 'flex';
}

function openDirectoryModal() { 
    document.getElementById('directory-search').value = ''; const grpFilter = document.getElementById('directory-group-filter');
    if (isAdminUser()) { grpFilter.style.display = 'block'; grpFilter.innerHTML = '<option value="">All Locations</option>'; getUniqueGroups().forEach(g => { grpFilter.innerHTML += `<option value="${g}">${g}</option>`; }); } else { grpFilter.style.display = 'none'; }
    renderDirectory(); document.getElementById('directory-modal').style.display = 'flex'; 
}
function filterDirectory() { renderDirectory(); }
function renderDirectory() {
    const container = document.getElementById('directory-container'); container.innerHTML = ''; const query = document.getElementById('directory-search').value.toLowerCase(); const grpQuery = isAdminUser() ? document.getElementById('directory-group-filter').value : '';
    allEmployees.slice().sort().forEach(emp => {
        const role = employeeRoles[emp] || "Staff"; const grp = employeeGroups[emp] || "General"; 
        const empsGroups = grp.split(',').map(g=>g.trim());
        if(query && !emp.toLowerCase().includes(query) && !role.toLowerCase().includes(query)) return; 
        if(grpQuery && !empsGroups.includes(grpQuery)) return;
        const img = employeeImages[emp] || "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?q=80&w=150&auto=format&fit=crop";
        container.innerHTML += `<div class="directory-card" onclick="showEmployeeProfile('${sanitizeFirebaseKey(emp)}')"><img src="${img}" class="dir-avatar" onerror="this.src='https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?q=80&w=150&auto=format&fit=crop'"><div class="dir-info"><span class="dir-name">${emp}</span><span class="dir-role">${role}</span></div></div>`;
    });
}

function showEmployeeProfile(safeEmp) {
    const emp = decodeURIComponent(safeEmp); document.getElementById('ep-name').innerText = emp; document.getElementById('ep-group').innerText = employeeGroups[emp] || 'General';
    document.getElementById('ep-avatar').src = employeeImages[emp] || "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?q=80&w=150&auto=format&fit=crop";
    document.getElementById('ep-role').innerText = employeeRoles[emp] || 'Unspecified'; document.getElementById('ep-location').innerText = employeeLocations[emp] || 'Unspecified'; document.getElementById('ep-phone').innerText = employeePhones[emp] || 'Unspecified'; document.getElementById('ep-address').innerText = employeeAddresses[emp] || 'Unspecified'; document.getElementById('ep-bio').innerText = employeeBios[emp] || 'No extended notes available.';
    document.getElementById('ep-email').innerText = employeeEmails[emp] || 'Unspecified'; document.getElementById('employee-profile-modal').style.display = 'flex';
}

function openUserEditProfile() {
    document.getElementById('ue-phone').value = employeePhones[confirmedEmployee] || ''; document.getElementById('ue-address').value = employeeAddresses[confirmedEmployee] || ''; document.getElementById('ue-password').value = ''; document.getElementById('ue-avatar-file').value = ''; document.getElementById('ue-email').value = employeeEmails[confirmedEmployee] || '';
    const img = employeeImages[confirmedEmployee] || "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?q=80&w=150&auto=format&fit=crop"; document.getElementById('ue-avatar-base64').value = employeeImages[confirmedEmployee] || ''; document.getElementById('ue-avatar-preview').src = img;
    document.getElementById('user-edit-modal').style.display = 'flex';
}

function saveUserProfile() {
    const newPhone = document.getElementById('ue-phone').value; const newAddress = document.getElementById('ue-address').value; const newPass = document.getElementById('ue-password').value; const newImg = document.getElementById('ue-avatar-base64').value; const newEmail = document.getElementById('ue-email').value;
    let updatePayload = { phone: newPhone, address: newAddress, email: newEmail }; employeePhones[confirmedEmployee] = newPhone; employeeAddresses[confirmedEmployee] = newAddress; employeeEmails[confirmedEmployee] = newEmail;
    if(newImg) { updatePayload.image = newImg; employeeImages[confirmedEmployee] = newImg; } if(newPass && newPass.trim() !== "") { updatePayload.password = newPass; employeePasswords[confirmedEmployee] = newPass; }
    rtdb.ref(`profile_extensions/${sanitizeFirebaseKey(confirmedEmployee)}`).update(updatePayload).then(() => { 
        let sheetsPayload = [[ "PROFILE", confirmedEmployee, employeePasswords[confirmedEmployee] || '', employeeRoles[confirmedEmployee] || '', employeeLocations[confirmedEmployee] || '', newPhone, newAddress, employeeBios[confirmedEmployee] || '', newEmail, employeeLogTypes[confirmedEmployee] || 'Logs' ]];
        fetch(GAS_WEB_APP_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(sheetsPayload) });
        showToast("Profile successfully updated."); auditLog("User edited personal profile"); renderEmployeeBioCard(); closeModal('user-edit-modal'); 
    }).catch(e => showToast("Error updating profile.", "error"));
}

window.populateAdminModificationDropdown = function() {
    const select = document.getElementById('admin-mod-select'); if(!select) return; 
    select.innerHTML = '';
    
    if (isAdminUser()) {
        select.innerHTML = '<option value="__NEW__">➕ Create New Profile</option><option value="ADMIN">System Administrator Account</option>';
        allEmployees.slice().sort().forEach(emp => { select.innerHTML += `<option value="${emp}">${emp}</option>`; });
    } else if (isLeaderUser()) {
        select.innerHTML = '<option value="" disabled selected>Select Team Member...</option>';
        allEmployees.slice().sort().forEach(emp => { 
            const isEmpAdmin = emp === 'ADMIN' || (employeeRoles[emp] && employeeRoles[emp].toUpperCase() === 'ADMIN');
            if (leaderHasAccessToEmployee(emp) && !isEmpAdmin) {
                select.innerHTML += `<option value="${emp}">${emp}</option>`; 
            }
        });
    }

    loadEmployeeToAdminConfigPanel();
};

// --- NEW: Dynamic Primary Segment Dropdown Logic ---
window.updateMainGroupDropdown = function(initialMainGroup = null) {
    const dropdown = document.getElementById('admin-mod-main-group');
    if (!dropdown) return;
    
    const currentSelection = dropdown.value || initialMainGroup;
    dropdown.innerHTML = '';
    
    let selectedGroups = Array.from(document.querySelectorAll('.admin-grp-chk:checked')).map(cb => cb.value);
    let newGroupInput = document.getElementById('admin-mod-new-group').value.trim();
    if (newGroupInput && !selectedGroups.includes(newGroupInput)) selectedGroups.push(newGroupInput);
    
    if (selectedGroups.length === 0) {
        dropdown.innerHTML = '<option value="" disabled selected>No segments assigned...</option>';
        return;
    }
    
    selectedGroups.forEach(grp => {
        dropdown.innerHTML += `<option value="${grp}">${grp}</option>`;
    });
    
    // Maintain selection or default to the first available option
    if (currentSelection && selectedGroups.includes(currentSelection)) {
        dropdown.value = currentSelection;
    } else if (selectedGroups.length > 0) {
        dropdown.value = selectedGroups[0];
    }
};

window.renderAdminGroupSelector = function(selectedLocString) {
    const container = document.getElementById('admin-mod-group-checkboxes');
    if (!container) return; 
    container.innerHTML = '';
    
    const allUniqueGrps = getUniqueGroups();
    const selectedArr = (selectedLocString || '').split(',').map(s=>s.trim()).filter(Boolean);
    
    allUniqueGrps.forEach(grp => {
        const isChecked = selectedArr.includes(grp) ? 'checked' : '';
        // Checkbox now triggers the dropdown update
        container.innerHTML += `<label style="display:flex; align-items:center; gap:8px; font-size:0.9rem; font-weight: bold; padding: 4px; border-radius: 4px; background: white;"><input type="checkbox" class="admin-grp-chk" value="${grp}" ${isChecked} style="width: 16px; height: 16px; cursor: pointer;" onchange="updateMainGroupDropdown()"> ${grp}</label>`;
    });

    // The very first group in their saved string is their current Primary segment
    const initialMain = selectedArr.length > 0 ? selectedArr[0] : null;
    updateMainGroupDropdown(initialMain);
};

function loadEmployeeToAdminConfigPanel() {
    const target = document.getElementById('admin-mod-select').value; 
    if(!target) return;
    
    const newNameRow = document.getElementById('admin-mod-name-row'); 
    const newNameInput = document.getElementById('admin-mod-new-name'); 
    const delBtn = document.getElementById('admin-mod-delete-btn');
    
    const currentLoc = (target === '__NEW__' || target === 'ADMIN') ? '' : (employeeLocations[target] || '');
    document.getElementById('admin-mod-loc').value = currentLoc; 
    renderAdminGroupSelector(currentLoc);
    document.getElementById('admin-mod-new-group').value = '';

    // --- UPDATED: LOCK ALL GROUP CONFIGS FOR LEADERS ---
    if (isLeaderUser()) {
        document.querySelectorAll('.admin-grp-chk').forEach(chk => chk.disabled = true);
        const newGrpInput = document.getElementById('admin-mod-new-group');
        if (newGrpInput) newGrpInput.disabled = true;
        const mainGrpDrop = document.getElementById('admin-mod-main-group');
        if (mainGrpDrop) mainGrpDrop.disabled = true;
    } else {
        const mainGrpDrop = document.getElementById('admin-mod-main-group');
        if (mainGrpDrop) mainGrpDrop.disabled = false;
    }

    if (target === '__NEW__') {
        newNameRow.style.display = 'flex'; 
        newNameInput.value = ''; 
        if(delBtn) delBtn.style.display = 'none';
        
        document.getElementById('admin-mod-pass').value = ''; 
        document.getElementById('admin-mod-img-file').value = ""; 
        document.getElementById('admin-mod-img').value = ''; 
        document.getElementById('admin-mod-img-preview').src = "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?q=80&w=150&auto=format&fit=crop";
        document.getElementById('admin-mod-role').value = ''; 
        document.getElementById('admin-mod-phone').value = ''; 
        document.getElementById('admin-mod-address').value = ''; 
        document.getElementById('admin-mod-bio').value = ''; 
        document.getElementById('admin-mod-email').value = ''; 
        document.getElementById('admin-mod-logtype').value = 'Logs';
    } else if (target === 'ADMIN') {
        newNameRow.style.display = 'none'; 
        if(delBtn) delBtn.style.display = 'none';
        document.getElementById('admin-mod-pass').value = ''; 
        document.getElementById('admin-mod-img-file').value = ""; 
        const img = employeeImages[target] || ''; 
        document.getElementById('admin-mod-img').value = img; 
        document.getElementById('admin-mod-img-preview').src = img || "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?q=80&w=150&auto=format&fit=crop";
    } else {
        newNameRow.style.display = 'flex'; 
        newNameInput.value = target; 
        
        if(delBtn) delBtn.style.display = isAdminUser() ? 'block' : 'none';
        
        document.getElementById('admin-mod-pass').value = ''; 
        document.getElementById('admin-mod-img-file').value = ""; 
        const img = employeeImages[target] || ''; 
        document.getElementById('admin-mod-img').value = img; 
        document.getElementById('admin-mod-img-preview').src = img || "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?q=80&w=150&auto=format&fit=crop";
        
        document.getElementById('admin-mod-role').value = employeeRoles[target] || ''; 
        document.getElementById('admin-mod-role').disabled = isLeaderUser();
        
        document.getElementById('admin-mod-phone').value = employeePhones[target] || ''; 
        document.getElementById('admin-mod-address').value = employeeAddresses[target] || ''; 
        document.getElementById('admin-mod-bio').value = employeeBios[target] || ''; 
        document.getElementById('admin-mod-email').value = employeeEmails[target] || ''; 
        document.getElementById('admin-mod-logtype').value = employeeLogTypes[target] || 'Logs';
    }
}

window.pushProfileConfigurationsFromAdmin = function(isSilent = false) {
    let originalTarget = document.getElementById('admin-mod-select').value; 
    if(!originalTarget) return;
    
    let target = originalTarget;
    let isRename = false;
    
    if (originalTarget === '__NEW__') {
        target = document.getElementById('admin-mod-new-name').value.trim();
        if (!target) return showToast("Please enter a valid name for the new profile.", "error");
        if (allEmployees.includes(target)) return showToast("A profile with this name already exists.", "error"); 
        allEmployees.push(target);
    } else if (originalTarget !== 'ADMIN') {
        let updatedName = document.getElementById('admin-mod-new-name').value.trim();
        if (!updatedName) return showToast("Name cannot be empty.", "error");
        
        if (updatedName !== originalTarget) {
            if (allEmployees.includes(updatedName)) return showToast("A profile with this new name already exists.", "error");
            isRename = true;
            target = updatedName;
            
            allEmployees = allEmployees.filter(e => e !== originalTarget);
            allEmployees.push(target);
            
            rtdb.ref(`profile_extensions/${sanitizeFirebaseKey(originalTarget)}`).remove();
            let sheetsDelPayload = [[ "DELETE_PROFILE", originalTarget ]];
            fetch(GAS_WEB_APP_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(sheetsDelPayload) });
        }
    }

    let newPass = document.getElementById('admin-mod-pass').value; 
    if(!newPass || newPass.trim() === '') newPass = employeePasswords[originalTarget] || '1234';
    
    const newImg = document.getElementById('admin-mod-img').value; 
    
    let newRole = document.getElementById('admin-mod-role').value; 
    if (isLeaderUser()) newRole = employeeRoles[originalTarget] || 'Staff';

    // MULTI-GROUP COMPILATION LOGIC WITH PRIMARY SORTING
    let selectedGroups = Array.from(document.querySelectorAll('.admin-grp-chk:checked')).map(cb => cb.value);
    let newGroupInput = document.getElementById('admin-mod-new-group').value.trim();
    if (newGroupInput && !selectedGroups.includes(newGroupInput)) selectedGroups.push(newGroupInput); 
    
    // Grab the explicitly chosen main group from the dropdown
    let mainGroup = document.getElementById('admin-mod-main-group').value;
    
    // Force the explicitly chosen Main Group to index 0 of the array
    if (mainGroup && selectedGroups.includes(mainGroup)) {
        selectedGroups = selectedGroups.filter(g => g !== mainGroup); // Remove it
        selectedGroups.unshift(mainGroup); // Put it exactly at the front
    }

    let newLoc = selectedGroups.length > 0 ? selectedGroups.join(', ') : 'General';
    
    if (isLeaderUser()) {
        newLoc = employeeLocations[originalTarget] || 'General';
    }

    const newPhone = document.getElementById('admin-mod-phone').value; 
    const newAdd = document.getElementById('admin-mod-address').value; 
    const newBio = document.getElementById('admin-mod-bio').value; 
    const newEmail = document.getElementById('admin-mod-email').value; 
    const newLogType = document.getElementById('admin-mod-logtype').value;
    
    if (isRename) {
        delete employeePasswords[originalTarget]; delete employeeImages[originalTarget]; 
        delete employeeRoles[originalTarget]; delete employeeLocations[originalTarget]; 
        delete employeePhones[originalTarget]; delete employeeAddresses[originalTarget]; 
        delete employeeBios[originalTarget]; delete employeeEmails[originalTarget]; 
        delete employeeLogTypes[originalTarget]; delete employeeGroups[originalTarget];
    }

    employeePasswords[target] = newPass; employeeImages[target] = newImg; 
    employeeRoles[target] = newRole; employeeLocations[target] = newLoc; 
    employeePhones[target] = newPhone; employeeAddresses[target] = newAdd; 
    employeeBios[target] = newBio; employeeEmails[target] = newEmail; 
    employeeLogTypes[target] = newLogType; employeeGroups[target] = newLoc; 
    
    rtdb.ref(`profile_extensions/${sanitizeFirebaseKey(target)}`).set({ password: newPass, image: newImg, role: newRole, location: newLoc, phone: newPhone, address: newAdd, bio: newBio, email: newEmail, logType: newLogType });
    
    let sheetsPayload = [[ "PROFILE", target, newPass, newRole, newLoc, newPhone, newAdd, newBio, newEmail, newLogType ]];
    fetch(GAS_WEB_APP_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(sheetsPayload) });
    
    const mc = JSON.parse(localStorage.getItem('duna_master_config') || '{}'); 
    mc.employeePasswords = employeePasswords; mc.employeeImages = employeeImages; 
    mc.employeeRoles = employeeRoles; mc.employeeLocations = employeeLocations; 
    mc.employeePhones = employeePhones; mc.employeeAddresses = employeeAddresses; 
    mc.employeeBios = employeeBios; mc.employeeEmails = employeeEmails; 
    mc.employeeLogTypes = employeeLogTypes; mc.employees = allEmployees; 
    mc.employeeGroups = employeeGroups; 
    localStorage.setItem('duna_master_config', JSON.stringify(mc));
    
    populateAdminModificationDropdown(); 
    document.getElementById('admin-mod-select').value = target; 
    loadEmployeeToAdminConfigPanel();
    
    if(!isSilent) { showToast(isRename ? `Profile renamed to ${target} and saved.` : `Profile attributes updated for ${target}`, "success"); }
};

window.openGlobalGroupManager = function() {
    const container = document.getElementById('group-manager-list');
    container.innerHTML = '';
    const allUniqueGrps = getUniqueGroups();
    
    allUniqueGrps.forEach(grp => {
        container.innerHTML += `
            <div style="display: flex; justify-content: space-between; align-items: center; background: white; padding: 12px; border: 1px solid var(--card-border); border-radius: 8px;">
                <span style="font-weight: 900; color: var(--text-main); font-size: 1rem;">${grp}</span>
                <button onclick="deleteGlobalGroup('${encodeURIComponent(grp).replace(/'/g, "%27")}')" style="background: var(--danger); color: white; border: none; padding: 6px 12px; border-radius: 6px; cursor: pointer; font-weight: bold;">Delete Group</button>
            </div>
        `;
    });
    document.getElementById('group-manager-modal').style.display = 'flex';
};

window.deleteGlobalGroup = function(encodedGrp) {
    const groupToDelete = decodeURIComponent(encodedGrp);
    if(!confirm(`WARNING: Are you sure you want to permanently delete the segment "${groupToDelete}"? Employees inside will be moved to General.`)) return;
    
    let updates = {};
    let usersUpdated = false;
    let sheetsPayload = []; 

    allEmployees.forEach(emp => {
        let empsGroups = (employeeGroups[emp] || '').split(',').map(g=>g.trim()).filter(g=>g);
        if (empsGroups.includes(groupToDelete)) {
            empsGroups = empsGroups.filter(g => g !== groupToDelete);
            let newLoc = empsGroups.length > 0 ? empsGroups.join(', ') : 'General';
            
            updates[`profile_extensions/${sanitizeFirebaseKey(emp)}/location`] = newLoc;
            employeeLocations[emp] = newLoc;
            employeeGroups[emp] = newLoc;
            usersUpdated = true;
            
            sheetsPayload.push([ "PROFILE", emp, employeePasswords[emp] || '1234', employeeRoles[emp] || 'Staff', newLoc, employeePhones[emp] || '', employeeAddresses[emp] || '', employeeBios[emp] || '', employeeEmails[emp] || '', employeeLogTypes[emp] || 'Logs' ]);
        }
    });
    
    updates[`settings/roster_visibility/${sanitizeFirebaseKey(groupToDelete)}`] = null;
    updates[`settings/admin_group_visibility/${sanitizeFirebaseKey(groupToDelete)}`] = null;
    
    rtdb.ref().update(updates).then(() => {
        if (sheetsPayload.length > 0) {
            fetch(GAS_WEB_APP_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(sheetsPayload) });
        }
        
        showToast(`Segment "${groupToDelete}" globally deleted.`, "success");
        openGlobalGroupManager(); 
        if (usersUpdated) populateAdminModificationDropdown();
    }).catch(err => {
        showToast("Error deleting group", "error");
        console.error(err);
    });
};

function adminResetPassword() {
    const target = document.getElementById('admin-mod-select').value; if(target === '__NEW__' || !target || !confirm(`Are you sure you want to reset password for ${target} to 1234?`)) return;
    document.getElementById('admin-mod-pass').value = '1234'; pushProfileConfigurationsFromAdmin(true); showToast(`Password for ${target} reset to default.`); auditLog("Admin Reset Password", target);
}

function adminDeleteProfile() {
    const target = document.getElementById('admin-mod-select').value; if (!target || target === '__NEW__' || target === 'ADMIN') return;
    if (!confirm(`⚠️ WARNING: Permenently delete user: ${target}?`)) return;
    rtdb.ref(`profile_extensions/${sanitizeFirebaseKey(target)}`).remove();
    let sheetsPayload = [[ "DELETE_PROFILE", target ]]; fetch(GAS_WEB_APP_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(sheetsPayload) });
    allEmployees = allEmployees.filter(e => e !== target); delete employeePasswords[target]; delete employeeImages[target]; delete employeeRoles[target]; delete employeeLocations[target]; delete employeePhones[target]; delete employeeAddresses[target]; delete employeeBios[target]; delete employeeEmails[target]; delete employeeLogTypes[target]; delete employeeGroups[target];
    const mc = JSON.parse(localStorage.getItem('duna_master_config') || '{}'); mc.employees = allEmployees; localStorage.setItem('duna_master_config', JSON.stringify(mc));
    showToast(`Profile ${target} deleted.`, 'success'); auditLog("Admin Deleted Profile", target); populateAdminModificationDropdown();
}

function isEditableDate() { const dStr = document.getElementById('log-date').value; if (!dStr) return false; const d = new Date(dStr); d.setHours(0,0,0,0); const today = new Date(); today.setHours(0,0,0,0); const diffDays = Math.round((today - d) / (1000 * 60 * 60 * 24)); return diffDays === 0 || diffDays === 1; }
function ensureDbRecord(date, emp) {
    if (!db[date]) db[date] = {};
    if (!db[date][emp]) {
        let zone = employeeLogTypes[emp] === 'Logs_SDI' ? 'SDI' : 'SK'; 
        if (zone === 'SDI') db[date][emp] = { format: 'SDI', shift: '', shiftLocked: false, location: employeeGroups[emp], smock: false, gloves: false, noAccessories: false, lineIn: '', lineOut: '', b1Start: '', b1End: '', b2Start: '', b2End: '', b3Start: '', b3End: '', taskError: '', taskClean: '', taskTicket: '', taskAGVIn: '', taskAGVOut: '', comments: '', review: '', reviewRead: false };
        else db[date][emp] = { format: 'SK', shift: '', shiftLocked: false, checkIn: '', b1Out: '', b1In: '', b2Out: '', b2In: '', checkOut: '', remarks: '', review: '', reviewRead: false };
    }
}
function getShiftHTML(shiftStr) { if (!shiftStr) return ''; const s = shiftStr.toUpperCase(); let hash = 0; for (let i = 0; i < s.length; i++) hash = s.charCodeAt(i) + ((hash << 5) - hash); return `<span class="tag tag-dynamic" style="--tag-hue: ${Math.abs(hash % 360)};">${shiftStr}</span>`; }
function jumpToDate(dateStr) { document.getElementById('log-date').value = dateStr; handleDateChange(); }

function checkUnreadAlerts(emp, currentDate) {
    const container = document.getElementById('unread-alerts-container'); 
    if (!emp) { container.style.display = 'none'; return; }
    
    let unreadDates = [];
    for (let d in db) { 
        if (db[d][emp] && db[d][emp].review && db[d][emp].review.trim() !== '') { 
            if (!db[d][emp].reviewRead) unreadDates.push(d); 
        } 
    }
    
    if (unreadDates.length > 0) { 
        container.innerHTML = ''; 
        unreadDates.sort().forEach(date => { 
            container.innerHTML += `<button class="persistent-alert-btn" onclick="jumpToDate('${date}')"><span>📢 Admin added notes to your shift on <b>${date}</b></span><span style="background: rgba(255,255,255,0.2); padding: 4px 10px; border-radius: 6px; font-size: 0.8rem;">Open</span></button>`; 
        }); 
        container.style.display = 'flex'; 
        if (window.justLogged) { showToast(`You have ${unreadDates.length} unread management review(s)!`, 'warning'); }
    } else { 
        container.style.display = 'none'; 
    }
}

window.renderAdminRosters = function() {
    const container = document.getElementById('admin-roster-content'); 
    const dateStr = document.getElementById('admin-roster-date').value; 
    if (!dateStr) { container.innerHTML = ''; return; }
    
    const dayNum = parseInt(dateStr.split('-')[2], 10); 
    const monthKey = getMonthKeyFromDate(dateStr); 
    const yearKey = dateStr.split('-')[0];
    
    let allRostersHTML = ''; 
    const groups = getUniqueGroups();
    
    groups.forEach(grp => {
        if (globalAdminGroupVisibility && globalAdminGroupVisibility[sanitizeFirebaseKey(grp)] === false) return;
        if (isLeaderUser() && !leaderHasAccess(grp)) return;

        // --- UPDATED SORTING LOGIC ---
        const groupEmployees = allEmployees.filter(emp => {
            const empsGroups = (employeeGroups[emp] || 'General').split(',').map(g=>g.trim());
            return empsGroups[0] === grp;
        }).sort((a, b) => {
            // Helper to grab the specific shift for this date
            const getShift = (emp) => {
                const sched = getSafeScheduleData(emp, monthKey, yearKey);
                const dayData = sched ? sched[dayNum] : null;
                return (dayData && dayData.area) ? dayData.area.trim() : 'OFF';
            };

            const prioA = getShiftPriority(getShift(a));
            const prioB = getShiftPriority(getShift(b));

            // Sort by shift priority first (Support -> Day -> Night)
            if (prioA !== prioB) return prioA - prioB;
            
            // Tie-breaker: sort alphabetically by name
            return a.localeCompare(b);
        }); 

        if(groupEmployees.length === 0) return;
        
        let rosterHTML = `<h4 style="margin: 20px 0 10px 0; font-size: 1.1rem; font-weight: 800; color: var(--primary); text-transform: uppercase; border-bottom: 2px solid var(--primary); padding-bottom: 8px;">${grp} Operations Segment</h4><div class="roster-list">`;
        let hasWorkers = false;
        
        groupEmployees.forEach(emp => {
            const empSchedMonth = getSafeScheduleData(emp, monthKey, yearKey); 
            const dayData = empSchedMonth ? empSchedMonth[dayNum] : null;
            let scheduledShift = (dayData && dayData.area) ? dayData.area.trim() : ''; 
            let sUpper = scheduledShift.toUpperCase();
            let isLeave = sUpper.includes('AWAY') || sUpper.includes('SICK') || sUpper.includes('HOLIDAY') || sUpper.includes('P.HOLIDAY');
            let isScheduled = scheduledShift !== "" && sUpper !== 'OFF' && !isLeave; 
            let hasLog = db[dateStr] && db[dateStr][emp] && (db[dateStr][emp].checkIn || db[dateStr][emp].lineIn || db[dateStr][emp].shiftLocked);
            
            if (!isScheduled && !isLeave && !hasLog) return; 
            hasWorkers = true; 
            let shiftStr = isScheduled || isLeave ? scheduledShift : 'Unscheduled'; 
            let inTime = null, outTime = null;
            let actualFormat = db[dateStr] && db[dateStr][emp] && db[dateStr][emp].format ? db[dateStr][emp].format : (employeeLogTypes[emp] === 'Logs_SDI' ? 'SDI' : 'SK');
            
            if (hasLog) { 
                inTime = (actualFormat === 'SDI') ? db[dateStr][emp].lineIn : db[dateStr][emp].checkIn; 
                outTime = (actualFormat === 'SDI') ? db[dateStr][emp].lineOut : db[dateStr][emp].checkOut; 
            }
            
            let statusBadge = '';
            if (hasLog) {
                if (inTime && outTime) statusBadge = `<div class="roster-status status-in" style="background:var(--success); color: white;">Done: ${inTime} - ${outTime}</div>`;
                else if (inTime) statusBadge = `<div class="roster-status status-in" style="background:var(--primary); color: white;">✓ Active: ${inTime}</div>`;
                else statusBadge = `<div class="roster-status status-wait">Pending</div>`;
            } else if (isLeave) { 
                statusBadge = `<div class="roster-status" style="background:var(--text-light); color:white;">Not working</div>`; 
            } else { 
                statusBadge = `<div class="roster-status status-wait">Pending</div>`; 
            }
            
            let unreadDates = []; 
            for (let d in db) { 
                if (db[d][emp] && db[d][emp].review && db[d][emp].review.trim() !== '' && !db[d][emp].reviewRead) unreadDates.push(d); 
            }
            
            let unreadHTML = unreadDates.length > 0 ? `<div style="color: var(--danger); font-size: 0.75rem; font-weight: 700; margin-top: 4px;">⚠️ Pending Responses: ${unreadDates.join(', ')}</div>` : '';
            const img = employeeImages[emp] || "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?q=80&w=150&auto=format&fit=crop";
            
            rosterHTML += `<div class="roster-item admin-clickable" onclick="jumpToAdminReview('${grp}', '${dateStr}', '${sanitizeFirebaseKey(emp)}')"><div style="display: flex; gap: 12px; align-items: center;"><img src="${img}" class="roster-avatar" onerror="this.src='https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?q=80&w=150&auto=format&fit=crop'"><div class="roster-info"><span class="roster-name">${emp}</span><span class="roster-shift">${getShiftHTML(shiftStr)}</span>${unreadHTML}</div></div>${statusBadge}</div>`;
        }); 
        
        rosterHTML += '</div>'; 
        if (hasWorkers) allRostersHTML += rosterHTML;
    }); 
    
    container.innerHTML = allRostersHTML || `<div style="text-align:center; padding:40px; color:var(--text-light);">No operational rosters scheduled matching parameters.</div>`;
};



function jumpToAdminReview(grp, date, safeEmp) {
    const emp = decodeURIComponent(safeEmp); currentAdminGroup = grp; document.getElementById('admin-rosters-viewer').style.display = 'none';
    let zone = db[date] && db[date][emp] && db[date][emp].format ? db[date][emp].format : (employeeLogTypes[emp] === 'Logs_SDI' ? 'SDI' : 'SK');
    if (zone === 'SDI') { document.getElementById('admin-sdi-viewer').style.display = 'block'; document.getElementById('admin-sdi-date').value = date; updateAdminSdiNames(emp); } 
    else { document.getElementById('admin-sk-viewer').style.display = 'block'; document.getElementById('admin-sk-date').value = date; updateAdminSkNames(emp); }
}

function backToAdminRoster() { currentAdminGroup = ''; document.getElementById('admin-rosters-viewer').style.display = 'block'; document.getElementById('admin-sdi-viewer').style.display = 'none'; document.getElementById('admin-sk-viewer').style.display = 'none'; renderAdminRosters(); }

function changePublicRosterDay(direction) {
    publicRosterOffset += direction;
    if (publicRosterOffset < -1) publicRosterOffset = -1;
    if (publicRosterOffset > 1) publicRosterOffset = 1;
    renderPublicRoster();
}

function setupPublicRosterSwipe() {
    const wrapper = document.getElementById('public-roster-wrapper');
    if (!wrapper) return;

    let startX = 0; let startY = 0; let endX = 0; let endY = 0;

    wrapper.addEventListener('touchstart', e => { 
        startX = e.changedTouches[0].screenX; 
        startY = e.changedTouches[0].screenY; 
    }, {passive: true});
    
    wrapper.addEventListener('touchend', e => { 
        endX = e.changedTouches[0].screenX; 
        endY = e.changedTouches[0].screenY; 
        
        if (Math.abs(startX - endX) > 50 && Math.abs(startX - endX) > Math.abs(startY - endY)) {
            if (startX > endX) changePublicRosterDay(1); 
            else changePublicRosterDay(-1);             
        }
    }, {passive: true});
}

function renderPublicRoster() {
    const container = document.getElementById('public-roster-content'); 
    if (!container) return;
    
    const targetDateObj = new Date();
    targetDateObj.setDate(targetDateObj.getDate() + publicRosterOffset);
    
    const dateStr = `${targetDateObj.getFullYear()}-${String(targetDateObj.getMonth() + 1).padStart(2, '0')}-${String(targetDateObj.getDate()).padStart(2, '0')}`;
    const dayNum = targetDateObj.getDate(); 
    const monthKey = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"][targetDateObj.getMonth()]; 
    const yearKey = targetDateObj.getFullYear().toString();
    
    let headerLabel = publicRosterOffset === 0 ? "TODAY" : (publicRosterOffset === -1 ? "YESTERDAY" : "TOMORROW");
    
    let allRostersHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; border-bottom: 1px solid var(--card-border); padding-bottom: 12px;">
            <button onclick="changePublicRosterDay(-1)" style="background:none; border:none; color:${publicRosterOffset === -1 ? 'var(--text-light)' : 'var(--primary)'}; font-size:1.5rem; cursor:pointer; padding: 0 10px;">◀</button>
            <h3 style="margin: 0; font-size: 1.2rem; font-weight: 900; color: var(--text-main); text-transform: uppercase;">${headerLabel}</h3>
            <button onclick="changePublicRosterDay(1)" style="background:none; border:none; color:${publicRosterOffset === 1 ? 'var(--text-light)' : 'var(--primary)'}; font-size:1.5rem; cursor:pointer; padding: 0 10px;">▶</button>
        </div>
    `;

    const groups = getUniqueGroups();
    let hasAnyWorkers = false;

    groups.forEach(grp => {
        if (globalRosterVisibility[sanitizeFirebaseKey(grp)] === false) return;

        // --- UPDATED SORTING LOGIC FOR LOGIN ROSTER ---
        const groupEmployees = allEmployees.filter(emp => {
            const empsGroups = (employeeGroups[emp] || 'General').split(',').map(g=>g.trim());
            return empsGroups[0] === grp;
        }).sort((a, b) => {
            const getShift = (emp) => {
                const sched = getSafeScheduleData(emp, monthKey, yearKey);
                const dayData = sched ? sched[dayNum] : null;
                return (dayData && dayData.area) ? dayData.area.trim() : 'OFF';
            };

            const prioA = getShiftPriority(getShift(a));
            const prioB = getShiftPriority(getShift(b));

            if (prioA !== prioB) return prioA - prioB;
            return a.localeCompare(b);
        });

        if (groupEmployees.length === 0) return;
        
        let groupHTML = `<div style="margin-bottom: 20px;"><h4 style="margin: 0 0 10px 0; font-size: 0.95rem; font-weight: 800; color: var(--primary); text-transform: uppercase;">${grp} Segment</h4><div style="display: flex; flex-direction: column; gap: 8px;">`;
        let hasWorkers = false;
        
        groupEmployees.forEach(emp => {
            const empSchedMonth = getSafeScheduleData(emp, monthKey, yearKey); const dayData = empSchedMonth ? empSchedMonth[dayNum] : null;
            let scheduledShift = (dayData && dayData.area) ? dayData.area.trim() : ''; let sUpper = scheduledShift.toUpperCase();
            
            // --- NEW: CODING SHIFT VISIBILITY CHECK ---
            // Checks both the assigned schedule and the daily manual log override for the word "CODING"
            let loggedShift = (db[dateStr] && db[dateStr][emp] && db[dateStr][emp].shift) ? db[dateStr][emp].shift.toUpperCase() : '';
            if (globalRosterVisibility['CODING_SHIFTS'] === false && (sUpper.includes('CODING') || loggedShift.includes('CODING'))) {
                return; // Skips rendering this employee entirely
            }
            // ------------------------------------------

            let isLeave = sUpper.includes('AWAY') || sUpper.includes('SICK') || sUpper.includes('HOLIDAY') || sUpper.includes('P.HOLIDAY');
            
            let isScheduled = scheduledShift !== "" && sUpper !== 'OFF' && !isLeave; 
            let hasLog = db[dateStr] && db[dateStr][emp] && (db[dateStr][emp].checkIn || db[dateStr][emp].lineIn || db[dateStr][emp].shiftLocked);
            
            if (isLeave || (!isScheduled && !hasLog)) return; 

            hasWorkers = true; hasAnyWorkers = true;
            
            let shiftStr = isScheduled || isLeave ? scheduledShift : 'Unscheduled'; let inTime = null, outTime = null;
            let actualFormat = db[dateStr] && db[dateStr][emp] && db[dateStr][emp].format ? db[dateStr][emp].format : ((employeeLogTypes[emp] === 'Logs_SDI') ? 'SDI' : 'SK');
            
            if (hasLog) { inTime = (actualFormat === 'SDI') ? db[dateStr][emp].lineIn : db[dateStr][emp].checkIn; outTime = (actualFormat === 'SDI') ? db[dateStr][emp].lineOut : db[dateStr][emp].checkOut; }
            let statusText = '';
            if (hasLog) {
                if (inTime && outTime) statusText = `<span style="color: var(--success); font-weight: 800; font-size: 0.75rem;">Done: ${inTime} - ${outTime}</span>`;
                else if (inTime) statusText = `<span style="color: var(--primary); font-weight: 800; font-size: 0.75rem;">Active: ${inTime}</span>`;
                else statusText = `<span style="color: var(--danger); font-weight: 700; font-size: 0.75rem;">Waiting</span>`;
            } else if (isLeave) { statusText = `<span style="color: var(--text-light); font-weight: 700; font-size: 0.75rem;">Not working</span>`; } 
            else { statusText = `<span style="color: var(--danger); font-weight: 700; font-size: 0.75rem;">Waiting</span>`; }
            
            const img = employeeImages[emp] || "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?q=80&w=150&auto=format&fit=crop";
            
            groupHTML += `<div style="display: flex; justify-content: space-between; align-items: center; background: var(--input-bg); padding: 10px 14px; border-radius: 8px; border: 1px solid var(--card-border);">
                <div style="display: flex; align-items: center; gap: 12px;">
                    <img src="${img}" style="width:36px; height:36px; border-radius:50%; object-fit:cover; filter: blur(0px);" onerror="this.src='https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?q=80&w=150&auto=format&fit=crop'">
                    <span style="font-weight: 800; font-size: 0.95rem; color: var(--text-main);">${shiftStr}</span>
                </div>
                <div>${statusText}</div>
            </div>`;

        }); 
        
        groupHTML += `</div></div>`; 
        if (hasWorkers) allRostersHTML += groupHTML;
    }); 
    
    if (!hasAnyWorkers) {
        allRostersHTML += `<div style="text-align:center; padding:20px; color:var(--text-light); font-size: 0.9rem;">No operational deployment states found for this date.</div>`;
    }
    
    container.innerHTML = allRostersHTML;
}



function updateUI() {
    if(isAdminUser() && activeGroup === 'ADMIN') return; 
    const date = document.getElementById('log-date').value;
    
    if (confirmedEmployee) {
        checkUnreadAlerts(confirmedEmployee, date);
    }

    const dayNum = parseInt(date.split('-')[2], 10); 
    const sched = getSafeScheduleData(confirmedEmployee, getMonthKeyFromDate(date), date.split('-')[0]);
    let scheduledShift = (sched && sched[dayNum] && sched[dayNum].area) ? sched[dayNum].area.trim() : ''; 
    let sUpper = scheduledShift.toUpperCase();
    let isLeave = sUpper.includes('AWAY') || sUpper.includes('SICK') || sUpper.includes('HOLIDAY') || sUpper.includes('P.HOLIDAY');
    let isScheduled = scheduledShift !== "" && sUpper !== 'OFF' && !isLeave;
    
    if (!isScheduled && !isLeave && (!db[date] || !db[date][confirmedEmployee] || (!db[date][confirmedEmployee].checkIn && !db[date][confirmedEmployee].lineIn && !db[date][confirmedEmployee].shiftLocked))) {
        document.getElementById('employee-sdi-ui').style.display = 'none'; document.getElementById('employee-sk-ui').style.display = 'none'; document.getElementById('employee-top-controls').style.display = 'none'; document.getElementById('not-scheduled-msg').style.display = 'block'; return;
    } else if (isLeave && (!db[date] || !db[date][confirmedEmployee] || !db[date][confirmedEmployee].shiftLocked)) {
        document.getElementById('employee-sdi-ui').style.display = 'none'; document.getElementById('employee-sk-ui').style.display = 'none'; document.getElementById('employee-top-controls').style.display = 'none';
        document.getElementById('not-scheduled-msg').innerHTML = "You are marked as <b>Not working</b> (" + scheduledShift + ") for this date."; document.getElementById('not-scheduled-msg').style.display = 'block'; return;
    } else { 
        document.getElementById('not-scheduled-msg').style.display = 'none'; document.getElementById('employee-top-controls').style.display = 'flex'; 
    }
    
    if (confirmedEmployee && date) { ensureDbRecord(date, confirmedEmployee); currentShift = db[date][confirmedEmployee].shift || ''; }
    const canEdit = isEditableDate(); const isSDI = (employeeLogTypes[confirmedEmployee] === 'Logs_SDI'); 
    
    if (confirmedEmployee && date && !db[date][confirmedEmployee].shiftLocked && !db[date][confirmedEmployee].shift) {
        if (scheduledShift) {
            const sStr = scheduledShift.toUpperCase();
            if (sStr.includes('(D)') || sStr === 'D' || sStr.includes('10')) { currentShift = 'Day'; db[date][confirmedEmployee].shift = 'Day'; }
            else if (sStr.includes('(N)') || sStr === 'N') { currentShift = 'Night'; db[date][confirmedEmployee].shift = 'Night'; }
        }
    }
    if (isSDI) { document.getElementById('employee-sdi-ui').style.display = 'flex'; document.getElementById('employee-sk-ui').style.display = 'none'; }
    else { document.getElementById('employee-sk-ui').style.display = 'flex'; document.getElementById('employee-sdi-ui').style.display = 'none'; }
    const data = db[date][confirmedEmployee]; document.getElementById('btn-day').classList.toggle('active', currentShift === 'Day'); document.getElementById('btn-night').classList.toggle('active', currentShift === 'Night');
    const isShiftLocked = data.shiftLocked; document.getElementById('btn-day').classList.toggle('is-locked-active', isShiftLocked && currentShift === 'Day'); document.getElementById('btn-night').classList.toggle('is-locked-active', isShiftLocked && currentShift === 'Night');
    document.getElementById('btn-day').disabled = !canEdit || isShiftLocked; document.getElementById('btn-night').disabled = !canEdit || isShiftLocked;
        const btnLock = document.getElementById('btn-lock-shift'); 
    btnLock.disabled = !canEdit || isShiftLocked || !(currentShift === 'Day' || currentShift === 'Night'); 
    btnLock.innerText = isShiftLocked ? 'Committed' : 'Commit Rotation';
    
    // --- NEW: Highlight button red if they selected a shift but haven't locked it yet ---
    if (!isShiftLocked && (currentShift === 'Day' || currentShift === 'Night') && canEdit) {
        btnLock.classList.add('needs-commit');
    } else {
        btnLock.classList.remove('needs-commit');
    }

            
    if (isSDI) {
        document.getElementById('chk-smock').checked = data.smock; document.getElementById('chk-gloves').checked = data.gloves; document.getElementById('chk-accessories').checked = data.noAccessories;
        ['chk-smock', 'chk-gloves', 'chk-accessories'].forEach(id => document.getElementById(id).disabled = !canEdit);
        ['lineIn', 'lineOut', 'b1Start', 'b1End', 'b2Start', 'b2End', 'b3Start', 'b3End'].forEach(f => { const btn = document.getElementById(`btn-sdi-${f}`); btn.innerText = data[f] || '--:--'; btn.disabled = data[f] ? true : (!canEdit || !isShiftLocked); });
        ['task-error', 'task-clean', 'task-ticket', 'task-agvIn', 'task-agvOut'].forEach((id, idx) => { document.getElementById(id).value = data[['taskError','taskClean','taskTicket','taskAGVIn','taskAGVOut'][idx]] || ''; document.getElementById(id).disabled = !canEdit; });
        document.getElementById('sdi-comments').value = data.comments || ''; document.getElementById('sdi-comments').disabled = !canEdit;
        if (data.review && data.review.trim() !== '') { 
            document.getElementById('employee-review-display').style.display = 'block'; 
            const reviewerStr = data.reviewBy ? `\n\n— Management Note by: ${data.reviewBy}` : '';
            document.getElementById('read-only-review').innerText = data.review + reviewerStr; 
            
            if(!data.reviewRead) {
                data.reviewRead = true;
                rtdb.ref(`logs/${date}/${sanitizeFirebaseKey(confirmedEmployee)}/reviewRead`).set(true);
            }
        } else { document.getElementById('employee-review-display').style.display = 'none'; }
    } else {
        ['checkIn', 'b1Out', 'b1In', 'b2Out', 'b2In', 'checkOut'].forEach(f => { const displayBox = document.getElementById(`sk-${f}`); const btn = document.getElementById(`btn-sk-${f}`); if (data[f]) { displayBox.innerText = data[f]; btn.innerText = 'Locked'; btn.disabled = true; } else { displayBox.innerText = '--:--'; btn.innerText = 'Dbl Click'; btn.disabled = !canEdit || !isShiftLocked; } });
        document.getElementById('sk-remarks').value = data.remarks || ''; 
        document.getElementById('sk-remarks').disabled = !canEdit;

        if (data.review && data.review.trim() !== '') { 
            document.getElementById('employee-sk-review-display').style.display = 'block'; 
            const reviewerStr = data.reviewBy ? `\n\n— Management Note by: ${data.reviewBy}` : '';
            document.getElementById('sk-read-only-review').innerText = data.review + reviewerStr; 
            
            if(!data.reviewRead) {
                data.reviewRead = true;
                rtdb.ref(`logs/${date}/${sanitizeFirebaseKey(confirmedEmployee)}/reviewRead`).set(true);
            }
        } else { document.getElementById('employee-sk-review-display').style.display = 'none'; }
    }
}


function setShift(shift) { const dateStr = document.getElementById('log-date').value; currentShift = shift; ensureDbRecord(dateStr, confirmedEmployee); db[dateStr][confirmedEmployee].shift = shift; rtdb.ref(`logs/${dateStr}/${sanitizeFirebaseKey(confirmedEmployee)}`).update({ shift: shift }); saveField(); updateUI(); }
function lockShift() {
    const dateStr = document.getElementById('log-date').value; if (!currentShift) return showToast('Assign rotation properties before locking.', "error");
    if(confirm(`Commit log architecture under rotation assignment: ${currentShift}?`)) { 
        db[dateStr][confirmedEmployee].shiftLocked = true; db[dateStr][confirmedEmployee].lockedAt = new Date().toISOString(); saveField(); rtdb.ref(`logs/${dateStr}/${sanitizeFirebaseKey(confirmedEmployee)}`).update({ shiftLocked: true, shift: currentShift, lockedAt: db[dateStr][confirmedEmployee].lockedAt }); auditLog(`Locked Shift (${currentShift})`, `Date: ${dateStr}`); updateUI(); syncCurrentDayToSheets(false); showToast("Shift successfully committed.");
    }
}

function recordTime(field) {
    const dateStr = document.getElementById('log-date').value; 
    if (!db[dateStr][confirmedEmployee].shiftLocked) return showToast(`Commit rotation mapping before recording timestamps.`, "error"); 
    
    // --- NEW: Require comments before Check Out / Line Out ---
    if (field === 'checkOut') {
        const remarks = document.getElementById('sk-remarks').value.trim();
        if (!remarks) {
            alert("Action Blocked: You must write a Shift Report/Comment before checking out.");
            return showToast("Shift report required.", "error");
        }
    }
    if (field === 'lineOut') {
        const sdiComments = document.getElementById('sdi-comments').value.trim();
        if (!sdiComments) {
            alert("Action Blocked: You must write a Shift Report/Comment before exiting the line.");
            return showToast("Shift report required.", "error");
        }
    }
    // ---------------------------------------------------------

    const now = new Date(); 
    db[dateStr][confirmedEmployee][field] = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0'); 
    let updateObj = { format: employeeLogTypes[confirmedEmployee] === 'Logs_SDI' ? 'SDI' : 'SK', location: employeeGroups[confirmedEmployee] || 'Unknown' }; 
    updateObj[field] = db[dateStr][confirmedEmployee][field]; 
    rtdb.ref(`logs/${dateStr}/${sanitizeFirebaseKey(confirmedEmployee)}`).update(updateObj); 
    updateUI(); 
    syncCurrentDayToSheets(false); 
}


function saveField() {
    const dateStr = document.getElementById('log-date').value; 
    if (!confirmedEmployee || !dateStr) return; 
    ensureDbRecord(dateStr, confirmedEmployee); 
    const d = db[dateStr][confirmedEmployee]; 
    let updateObj = { format: employeeLogTypes[confirmedEmployee] === 'Logs_SDI' ? 'SDI' : 'SK', location: employeeGroups[confirmedEmployee] || 'Unknown' }; 
    
    if (employeeLogTypes[confirmedEmployee] === 'Logs_SDI') { 
        Object.assign(updateObj, { smock: document.getElementById('chk-smock').checked, gloves: document.getElementById('chk-gloves').checked, noAccessories: document.getElementById('chk-accessories').checked, taskError: document.getElementById('task-error').value, taskClean: document.getElementById('task-clean').value, taskTicket: document.getElementById('task-ticket').value, taskAGVIn: document.getElementById('task-agvIn').value, taskAGVOut: document.getElementById('task-agvOut').value, comments: document.getElementById('sdi-comments').value }); 
        Object.assign(d, updateObj); 
    } else { 
        Object.assign(updateObj, { remarks: document.getElementById('sk-remarks').value }); 
        Object.assign(d, updateObj); 
    } 
    rtdb.ref(`logs/${dateStr}/${sanitizeFirebaseKey(confirmedEmployee)}`).update(updateObj);
}


function timeToMinutes(timeStr) { if (!timeStr) return 0; let [h, m] = timeStr.split(':').map(Number); return h * 60 + m; }
function diffMinutes(startStr, endStr) { if (!startStr || !endStr || startStr.includes('--') || endStr.includes('--')) return 0; let s = timeToMinutes(startStr), e = timeToMinutes(endStr); if (e < s) e += 1440; return e - s; }
function formatMinutes(mins) { if (mins <= 0) return ""; return `${Math.floor(mins / 60)}:${(mins % 60).toString().padStart(2, '0')}`; }

async function syncCurrentDayToSheets(showAlerts = true) {
    if (isSyncing) return; isSyncing = true; const targetDate = document.getElementById('log-date').value; let payload = [];
    if (db[targetDate]) {
        for (const [emp, d] of Object.entries(db[targetDate])) {
            const grp = employeeGroups[emp] || 'Default'; const targetSheetName = employeeLogTypes[emp] || 'Logs'; 
            if (d.format === 'SDI') { payload.push([ targetSheetName, targetDate, emp, d.shift, d.shiftLocked ? 'Yes' : 'No', d.location || grp, d.smock, d.gloves, d.noAccessories, d.lineIn, d.lineOut, d.b1Start, d.b1End, d.b2Start, d.b2End, d.b3Start, d.b3End, d.taskError, d.taskClean, d.taskTicket, d.taskAGVIn, d.taskAGVOut, d.comments, d.review, d.reviewRead ? 'Read' : 'Unread' ]); } 
            else { const shiftMins = diffMinutes(d.checkIn, d.checkOut), totalBreakMins = diffMinutes(d.b1Out, d.b1In) + diffMinutes(d.b2Out, d.b2In); payload.push([ targetSheetName, targetDate, emp, d.shift, d.shiftLocked ? 'Yes' : 'No', d.location || grp, d.checkIn, d.b1Out, d.b1In, d.b2Out, d.b2In, d.checkOut, (d.checkIn && d.checkOut) ? formatMinutes(shiftMins) : '', formatMinutes(totalBreakMins), (d.checkIn && d.checkOut) ? formatMinutes(shiftMins - totalBreakMins) : '', d.tasks, d.details, d.remarks, d.review, d.reviewRead ? 'Read' : 'Unread' ]); }
        }
    }
    if(payload.length === 0) { isSyncing = false; return; }
    const btn = document.getElementById('sync-btn'); if(showAlerts) { btn.innerHTML = '⏳ Synchronizing...'; btn.disabled = true; }
    try { await fetch(GAS_WEB_APP_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }); if(showAlerts) showToast("Logs successfully committed to central spreadsheet."); } catch(error) { console.error(error); } finally { if(showAlerts) { btn.innerHTML = 'Push Logs to Cloud Spreadsheet'; btn.disabled = false; } isSyncing = false; }
}

function updateAdminSdiNames(targetEmp = null) {
    if (typeof targetEmp !== 'string') targetEmp = null; const date = document.getElementById('admin-sdi-date').value; const select = document.getElementById('admin-sdi-name');
    const dayNum = parseInt(date.split('-')[2], 10); const monthKey = getMonthKeyFromDate(date); const yearKey = date.split('-')[0];
    let foundEmps = new Set(); 
    allEmployees.forEach(emp => { 
        const empsGroups = (employeeGroups[emp] || 'General').split(',').map(g=>g.trim());
        // --- FIXED: Only check the FIRST (Main) group ---
        if (empsGroups[0] === currentAdminGroup) {
            const empSchedMonth = getSafeScheduleData(emp, monthKey, yearKey); const dayData = empSchedMonth ? empSchedMonth[dayNum] : null;
            let scheduledShift = (dayData && dayData.area) ? dayData.area.trim() : ''; let sUpper = scheduledShift.toUpperCase();
            let isLeave = sUpper.includes('AWAY') || sUpper.includes('SICK') || sUpper.includes('HOLIDAY') || sUpper.includes('P.HOLIDAY');
            let isScheduled = scheduledShift !== "" && sUpper !== 'OFF' && !isLeave; let hasLog = db[date] && db[date][emp] && (db[date][emp].checkIn || db[date][emp].lineIn || db[date][emp].shiftLocked);
            if (isScheduled || isLeave || hasLog) foundEmps.add(emp);
        } 
    });
    let sortedEmps = Array.from(foundEmps).sort();
    if (sortedEmps.length === 0) { select.innerHTML = '<option value="" disabled selected>No active logs found</option>'; document.getElementById('admin-sdi-body').style.display = 'none'; document.getElementById('admin-sdi-empty').style.display = 'block'; document.getElementById('admin-sdi-profile').style.display = 'none'; } 
    else { select.innerHTML = ''; sortedEmps.forEach(emp => select.innerHTML += `<option value="${emp}">${emp}</option>`); select.value = sortedEmps.includes(targetEmp) ? targetEmp : sortedEmps[0]; document.getElementById('admin-sdi-body').style.display = 'block'; document.getElementById('admin-sdi-empty').style.display = 'none'; document.getElementById('admin-sdi-profile').style.display = 'flex'; renderAdminSdiReport(); }
}


function renderAdminSdiReport() {
    const date = document.getElementById('admin-sdi-date').value; const emp = document.getElementById('admin-sdi-name').value; if(!date || !emp) return; ensureDbRecord(date, emp); const d = db[date][emp] || {};
    document.getElementById('admin-sdi-avatar').src = employeeImages[emp] || "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?q=80&w=150&auto=format&fit=crop"; document.getElementById('admin-sdi-name-display').innerText = emp; document.getElementById('admin-sdi-role-display').innerText = employeeRoles[emp] || 'Staff';
    const dayNum = parseInt(date.split('-')[2], 10); const monthKey = getMonthKeyFromDate(date); const yearKey = date.split('-')[0]; const empSchedMonth = getSafeScheduleData(emp, monthKey, yearKey); const dayData = empSchedMonth ? empSchedMonth[dayNum] : null; let scheduledShift = (dayData && dayData.area) ? dayData.area.trim() : 'Unscheduled';
    document.getElementById('admin-sdi-shift').innerHTML = `${d.shift || 'Not Logged'} <span style="font-weight: 500; font-size: 0.85rem; color: var(--text-light);">(Scheduled: ${scheduledShift})</span>`; 
    document.getElementById('admin-sdi-location').innerText = d.location || employeeGroups[emp] || 'N/A';
    document.getElementById('v-sdi-smock').innerText = (d.smock === true || d.smock === 'true') ? '✅ Verified' : '❌ Non-Compliant'; 
    document.getElementById('v-sdi-gloves').innerText = (d.gloves === true || d.gloves === 'true') ? '✅ Verified' : '❌ Non-Compliant'; 
    document.getElementById('v-sdi-acc').innerText = (d.noAccessories === true || d.noAccessories === 'true') ? '✅ Verified' : '❌ Non-Compliant';
    document.getElementById('v-sdi-l-in').innerText = d.lineIn ? d.lineIn : '--:--'; document.getElementById('v-sdi-l-out').innerText = d.lineOut ? d.lineOut : '--:--'; document.getElementById('v-sdi-b1-s').innerText = d.b1Start ? d.b1Start : '--:--'; document.getElementById('v-sdi-b1-e').innerText = d.b1End ? d.b1End : '--:--'; document.getElementById('v-sdi-b2-s').innerText = d.b2Start ? d.b2Start : '--:--'; document.getElementById('v-sdi-b2-e').innerText = d.b2End ? d.b2End : '--:--'; document.getElementById('v-sdi-b3-s').innerText = d.b3Start ? d.b3Start : '--:--'; document.getElementById('v-sdi-b3-e').innerText = d.b3End ? d.b3End : '--:--'; document.getElementById('admin-sdi-total-break').innerText = formatMinutes(diffMinutes(d.b1Start, d.b1End) + diffMinutes(d.b2Start, d.b2End) + diffMinutes(d.b3Start, d.b3End)) || '0 mins';
    document.getElementById('v-sdi-t1').innerText = d.taskError || '0'; document.getElementById('v-sdi-t2').innerText = d.taskClean || '0'; document.getElementById('v-sdi-t3').innerText = d.taskTicket || '0'; document.getElementById('v-sdi-t4').innerText = d.taskAGVIn || '0'; document.getElementById('v-sdi-t5').innerText = d.taskAGVOut || '0';
    document.getElementById('v-sdi-comments').innerText = (d.comments && d.comments.trim() !== '') ? d.comments : 'Empty'; document.getElementById('admin-sdi-review').value = d.review || '';
}

function updateAdminSkNames(targetEmp = null) {
    if (typeof targetEmp !== 'string') targetEmp = null; const date = document.getElementById('admin-sk-date').value; const select = document.getElementById('admin-sk-name');
    const dayNum = parseInt(date.split('-')[2], 10); const monthKey = getMonthKeyFromDate(date); const yearKey = date.split('-')[0];
    let foundEmps = new Set(); 
    allEmployees.forEach(emp => { 
        const empsGroups = (employeeGroups[emp] || 'General').split(',').map(g=>g.trim());
        // --- FIXED: Only check the FIRST (Main) group ---
        if (empsGroups[0] === currentAdminGroup) {
            const empSchedMonth = getSafeScheduleData(emp, monthKey, yearKey); const dayData = empSchedMonth ? empSchedMonth[dayNum] : null;
            let scheduledShift = (dayData && dayData.area) ? dayData.area.trim() : ''; let sUpper = scheduledShift.toUpperCase();
            let isLeave = sUpper.includes('AWAY') || sUpper.includes('SICK') || sUpper.includes('HOLIDAY') || sUpper.includes('P.HOLIDAY');
            let isScheduled = scheduledShift !== "" && sUpper !== 'OFF' && !isLeave; let hasLog = db[date] && db[date][emp] && (db[date][emp].checkIn || db[date][emp].lineIn || db[date][emp].shiftLocked);
            if (isScheduled || isLeave || hasLog) foundEmps.add(emp);
        } 
    });
    let sortedEmps = Array.from(foundEmps).sort();
    if (sortedEmps.length === 0) { select.innerHTML = '<option value="" disabled selected>No active logs found</option>'; document.getElementById('admin-sk-body').style.display = 'none'; document.getElementById('admin-sk-empty').style.display = 'block'; document.getElementById('admin-sk-profile').style.display = 'none'; } 
    else { select.innerHTML = ''; sortedEmps.forEach(emp => select.innerHTML += `<option value="${emp}">${emp}</option>`); select.value = sortedEmps.includes(targetEmp) ? targetEmp : sortedEmps[0]; document.getElementById('admin-sk-body').style.display = 'block'; document.getElementById('admin-sk-empty').style.display = 'none'; document.getElementById('admin-sk-profile').style.display = 'flex'; renderAdminSkReport(); }
}


function renderAdminSkReport() {
    const date = document.getElementById('admin-sk-date').value; const emp = document.getElementById('admin-sk-name').value; if(!date || !emp) return; ensureDbRecord(date, emp); const d = db[date][emp] || {};
    document.getElementById('admin-sk-avatar').src = employeeImages[emp] || "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?q=80&w=150&auto=format&fit=crop"; document.getElementById('admin-sk-name-display').innerText = emp; document.getElementById('admin-sk-role-display').innerText = employeeRoles[emp] || 'Staff';
    const dayNum = parseInt(date.split('-')[2], 10); const monthKey = getMonthKeyFromDate(date); const yearKey = date.split('-')[0]; const empSchedMonth = getSafeScheduleData(emp, monthKey, yearKey); const dayData = empSchedMonth ? empSchedMonth[dayNum] : null; let scheduledShift = (dayData && dayData.area) ? dayData.area.trim() : 'Unscheduled';
    document.getElementById('admin-sk-shift').innerHTML = `${d.shift || 'Not Logged'} <span style="font-weight: 500; font-size: 0.85rem; color: var(--text-light);">(Scheduled: ${scheduledShift})</span>`;
    document.getElementById('admin-sk-location').innerText = d.location || employeeGroups[emp] || 'N/A';
    document.getElementById('v-sk-checkin').innerText = d.checkIn ? d.checkIn : '--:--'; document.getElementById('v-sk-b1o').innerText = d.b1Out ? d.b1Out : '--:--'; document.getElementById('v-sk-b1i').innerText = d.b1In ? d.b1In : '--:--'; document.getElementById('v-sk-b2o').innerText = d.b2Out ? d.b2Out : '--:--'; document.getElementById('v-sk-b2i').innerText = d.b2In ? d.b2In : '--:--'; document.getElementById('v-sk-checkout').innerText = d.checkOut ? d.checkOut : '--:--';
    document.getElementById('admin-sk-total-break').innerText = formatMinutes(diffMinutes(d.b1Out, d.b1In) + diffMinutes(d.b2Out, d.b2In)) || '0 mins';
    document.getElementById('v-sk-remarks').innerText = (d.remarks && d.remarks.trim() !== '') ? d.remarks : 'Empty'; 
}

function saveAdminReview() {
    const isSDI = document.getElementById('admin-sdi-viewer').style.display === 'block'; 
    const date = document.getElementById(isSDI ? 'admin-sdi-date' : 'admin-sk-date').value; 
    const emp = document.getElementById(isSDI ? 'admin-sdi-name' : 'admin-sk-name').value; 
    const text = document.getElementById(isSDI ? 'admin-sdi-review' : 'admin-sk-review').value; 
    if(!date || !emp) return; 
    
    ensureDbRecord(date, emp); 
    db[date][emp].review = text; 
    db[date][emp].reviewRead = false; 
    db[date][emp].reviewBy = confirmedEmployee; 
    
    rtdb.ref(`logs/${date}/${sanitizeFirebaseKey(emp)}`).update({
        review: text, 
        reviewRead: false,
        reviewBy: confirmedEmployee 
    }); 
    
    const orig = document.getElementById('log-date').value; 
    document.getElementById('log-date').value = date; 
    syncCurrentDayToSheets(false).then(() => { 
        showToast("Appraisal narrative successfully synchronized."); 
        document.getElementById('log-date').value = orig; 
    });
}

window.openRosterVisibilityModal = function() {
    renderRosterVisibilityList();
    document.getElementById('roster-vis-modal').style.display = 'flex';
};

window.renderRosterVisibilityList = function() {
    const container = document.getElementById('roster-vis-list');
    let htmlStr = ''; 
    
    const groups = getUniqueGroups();
    const isFullAdmin = isAdminUser(); // Check if user is full admin
    
    // --- NEW: SPECIAL CODING SHIFTS TOGGLE ---
    const isCodingVis = globalRosterVisibility['CODING_SHIFTS'] !== false;
    htmlStr += `
        <div style="display: flex; flex-direction: column; background: #f8fafc; padding: 12px; border: 1px solid var(--card-border); border-radius: 8px; margin-bottom: 16px; border-left: 4px solid var(--primary);">
            <span style="font-weight: 900; color: var(--primary); margin-bottom: 10px; font-size: 1rem;">Special Filter: Coding Shifts</span>
            
            <div style="display: flex; justify-content: space-between; align-items: center; gap: 10px;">
                <label style="display: flex; align-items: center; cursor: ${isFullAdmin ? 'pointer' : 'not-allowed'}; flex: 1; background: white; padding: 8px; border-radius: 6px; opacity: ${isFullAdmin ? '1' : '0.6'}; border: 1px solid var(--card-border);">
                    <input type="checkbox" onchange="toggleGroupVisibility('CODING_SHIFTS', 'PUBLIC', this.checked)" ${isCodingVis ? 'checked' : ''} ${isFullAdmin ? '' : 'disabled'} style="width: 16px; height: 16px; cursor: ${isFullAdmin ? 'pointer' : 'not-allowed'};">
                    <span style="margin-left: 8px; font-size: 0.8rem; font-weight: bold; color: ${isCodingVis ? 'var(--success)' : 'var(--text-light)'};">
                        Show on Public Login ${isFullAdmin ? '' : '🔒'}
                    </span>
                </label>
                <div style="flex: 1;"><span style="font-size: 0.75rem; color: var(--text-light);">Hides any user whose shift contains "Coding"</span></div>
            </div>
        </div>
    `;
    
    // --- EXISTING GROUPS LOGIC ---
    groups.forEach(grp => {
        const safeGrp = sanitizeFirebaseKey(grp);
        const isPublicVis = globalRosterVisibility[safeGrp] !== false; 
        const isAdminVis = globalAdminGroupVisibility[safeGrp] !== false; 
        
        const encodedGrp = encodeURIComponent(grp).replace(/'/g, "%27");
        
        htmlStr += `
            <div style="display: flex; flex-direction: column; background: white; padding: 12px; border: 1px solid var(--card-border); border-radius: 8px; margin-bottom: 10px;">
                <span style="font-weight: 900; color: var(--primary); margin-bottom: 10px; font-size: 1rem;">${grp}</span>
                
                <div style="display: flex; justify-content: space-between; align-items: center; gap: 10px;">
                    <label style="display: flex; align-items: center; cursor: pointer; flex: 1; background: var(--input-bg); padding: 8px; border-radius: 6px;">
                        <input type="checkbox" onchange="toggleGroupVisibility(decodeURIComponent('${encodedGrp}'), 'PUBLIC', this.checked)" ${isPublicVis ? 'checked' : ''} style="width: 16px; height: 16px; cursor: pointer;">
                        <span style="margin-left: 8px; font-size: 0.8rem; font-weight: bold; color: ${isPublicVis ? 'var(--success)' : 'var(--text-light)'};">
                            Public Login
                        </span>
                    </label>
                    
                    <label style="display: flex; align-items: center; cursor: pointer; flex: 1; background: var(--input-bg); padding: 8px; border-radius: 6px;">
                        <input type="checkbox" onchange="toggleGroupVisibility(decodeURIComponent('${encodedGrp}'), 'ADMIN', this.checked)" ${isAdminVis ? 'checked' : ''} style="width: 16px; height: 16px; cursor: pointer;">
                        <span style="margin-left: 8px; font-size: 0.8rem; font-weight: bold; color: ${isAdminVis ? 'var(--danger)' : 'var(--text-light)'};">
                            Admin Check
                        </span>
                    </label>
                </div>
            </div>
        `;
    });
    
    container.innerHTML = htmlStr;
};



window.toggleGroupVisibility = function(grp, targetView, isVisible) {
    const databaseNode = targetView === 'PUBLIC' ? 'roster_visibility' : 'admin_group_visibility';
    
    rtdb.ref(`settings/${databaseNode}/${sanitizeFirebaseKey(grp)}`).set(isVisible)
        .then(() => {
            showToast(`${grp} ${targetView.toLowerCase()} visibility updated.`, 'success');
        })
        .catch(err => {
            showToast(`Failed to update ${grp}.`, 'error');
            console.error(err);
        });
};


window.adminForceLockShift = function() {
    const isSDI = document.getElementById('admin-sdi-viewer').style.display === 'block';
    const date = document.getElementById(isSDI ? 'admin-sdi-date' : 'admin-sk-date').value;
    const emp = document.getElementById(isSDI ? 'admin-sdi-name' : 'admin-sk-name').value;
    if(!date || !emp) return;

    if(confirm(`WARNING: Force lock the operational log for ${emp} on ${date}? This prevents further employee edits.`)) {
        ensureDbRecord(date, emp);
        db[date][emp].shiftLocked = true;
        db[date][emp].lockedBy = confirmedEmployee; 
        db[date][emp].lockedAt = new Date().toISOString();

        rtdb.ref(`logs/${date}/${sanitizeFirebaseKey(emp)}`).update({
            shiftLocked: true,
            lockedBy: confirmedEmployee,
            lockedAt: db[date][emp].lockedAt
        });

        showToast("Shift manually locked by management.", "success");
        auditLog("Admin Force Locked Shift", `Target: ${emp}, Date: ${date}, Admin: ${confirmedEmployee}`);
        
        const orig = document.getElementById('log-date').value; 
        document.getElementById('log-date').value = date;
        syncCurrentDayToSheets(false).then(() => { 
            document.getElementById('log-date').value = orig; 
        });
    }
};

function openNoticeModal() {
    const container = document.getElementById('notice-body'); container.innerHTML = ''; let hasNotices = false;
    dbNotices.forEach(notice => { 
        const target = notice.target ? notice.target.toUpperCase() : 'ALL'; 
        const myGroups = (activeGroup || '').toUpperCase().split(',').map(g=>g.trim());
        if (target === 'ALL' || myGroups.includes(target) || isAdminUser()) { 
            hasNotices = true; 
            container.innerHTML += `<div class="notice-card"><div class="notice-date">${notice.date}</div><div class="notice-title">${notice.title}</div><div class="notice-message">${notice.message}</div></div>`; 
        } 
    });
    if (!hasNotices) container.innerHTML = `<div style="text-align:center; padding: 40px; color: var(--text-light);">No announcements matching deployment keys.</div>`; 
    document.getElementById('notice-modal').style.display = 'flex';
}
function closeModal(id) { document.getElementById(id).style.display = 'none'; }

function openMonthlyModal() {
    const now = new Date(); const year = now.getFullYear(); const monthIndex = now.getMonth(); const monthKey = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"][monthIndex]; const daysInMonth = new Date(year, monthIndex + 1, 0).getDate(); const tbody = document.getElementById('shifts-tbody'); tbody.innerHTML = ''; let shiftData = []; const sched = getSafeScheduleData(confirmedEmployee, monthKey, year.toString()) || {};
    for (let i = 1; i <= daysInMonth; i++) {
        const dateStr = `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`; const s = sched[i] ? sched[i].area : ''; const sUpper = s.toUpperCase(); const isLeave = sUpper.includes('AWAY') || sUpper.includes('SICK') || sUpper.includes('HOLIDAY') || sUpper.includes('P.HOLIDAY'); const isAssigned = s && s.trim() !== '' && sUpper !== 'OFF' && !isLeave; const logData = db[dateStr] && db[dateStr][confirmedEmployee] ? db[dateStr][confirmedEmployee] : null; const hasLog = logData && (logData.checkIn || logData.lineIn || logData.shiftLocked);
        if (isAssigned || isLeave || hasLog) { let displayShift = hasLog && logData.shift ? logData.shift : (s || 'Unknown'); let status = hasLog ? 'Logged' : (isLeave ? 'Not working' : 'Pending'); shiftData.push({ date: dateStr, name: confirmedEmployee, shift: displayShift, status: status }); }
    }
    if (shiftData.length === 0) tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding: 30px;">No scheduled or logged shifts this month.</td></tr>';
    else shiftData.sort((a,b)=>b.date.localeCompare(a.date)).forEach(s => tbody.innerHTML += `<tr><td>${s.date}</td><td>${s.name}</td><td>${getShiftHTML(s.shift)}</td><td style="font-size:0.8rem; font-weight:bold; color:${s.status==='Logged'?'var(--success)':'var(--warning)'};">${s.status}</td></tr>`);
    document.getElementById('monthly-modal').style.display = 'flex';
}

function openScheduleModal() {
    const groupSelect = document.getElementById('schedule-group-filter'); const groupContainer = document.getElementById('admin-group-filter-container'); const nameRow = document.getElementById('schedule-name-filter-row');
    if(isAdminUser() && activeGroup === 'ADMIN') { groupContainer.style.display = 'flex'; nameRow.style.display = 'flex'; groupSelect.innerHTML = '<option value="">-- All Locations --</option>'; getUniqueGroups().forEach(g => { groupSelect.innerHTML += `<option value="${g}">${g}</option>`; }); } 
    else { groupContainer.style.display = 'none'; nameRow.style.display = 'none'; document.getElementById('schedule-name-filter').innerHTML = `<option value="${confirmedEmployee}">${confirmedEmployee}</option>`; document.getElementById('schedule-name-filter').value = confirmedEmployee; }
    document.getElementById('schedule-month-filter').value = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"][new Date().getMonth()];
    if(isAdminUser() && activeGroup === 'ADMIN') handleScheduleGroupFilterChange(); else handleScheduleFilterChange(); document.getElementById('schedule-modal').style.display = 'flex';
}

function handleScheduleGroupFilterChange() {
    const groupFilter = document.getElementById('schedule-group-filter').value; const nameSelect = document.getElementById('schedule-name-filter'); nameSelect.innerHTML = '<option value="">-- All Employees --</option>';
    allEmployees.slice().sort().forEach(emp => { 
        const empGroups = (employeeGroups[emp] || 'General').split(',').map(g=>g.trim());
        if (isAdminUser() && activeGroup === 'ADMIN') { 
            if(!groupFilter || empGroups.includes(groupFilter)) nameSelect.innerHTML += `<option value="${emp}">${emp}</option>`; 
        } else if (empGroups.includes(activeGroup)) {
            nameSelect.innerHTML += `<option value="${emp}">${emp}</option>`; 
        } 
    });
    handleScheduleFilterChange();
}

function handleScheduleFilterChange() {
    const empName = document.getElementById('schedule-name-filter').value; const monthKey = document.getElementById('schedule-month-filter').value; const yearKey = document.getElementById('schedule-year-filter').value; const headerText = document.getElementById('schedule-header-text'); const dlBtn = document.getElementById('download-schedule-btn'); const tabs = document.getElementById('schedule-tabs');
    if (empName) { if(isAdminUser() && activeGroup === 'ADMIN') dlBtn.style.display = 'flex'; tabs.style.display = 'flex'; headerText.innerHTML = `<span style="color:var(--primary)">${monthKey} ${yearKey}</span> Schedule Matrix: ${empName}`; renderNameTable(empName, monthKey, yearKey); renderNameCalendar(empName, monthKey, yearKey); } 
    else { dlBtn.style.display = 'none'; tabs.style.display = 'none'; switchTab('table'); document.getElementById('schedule-thead').innerHTML = `<tr><th>Date</th><th>Day</th><th>Area/Shift</th><th>Basic</th><th>OT</th></tr>`; document.getElementById('schedule-tbody').innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 30px;">Isolate identity filter context profile.</td></tr>'; headerText.innerHTML = `<span style="color:var(--primary)">${monthKey} ${yearKey}</span> Master Schedule Overview`; }
}

function switchTab(tab) {
    ['table', 'calendar'].forEach(t => { document.getElementById(`tab-${t}`).style.borderBottomColor = 'transparent'; document.getElementById(`tab-${t}`).style.color = 'var(--text-light)'; });
    document.getElementById(`tab-${tab}`).style.borderBottomColor = 'var(--primary)'; document.getElementById(`tab-${tab}`).style.color = 'var(--primary)';
    document.getElementById('view-table').style.display = (tab === 'table') ? 'table' : 'none'; document.getElementById('view-calendar').style.display = (tab === 'calendar') ? 'block' : 'none';
}

function renderNameTable(empName, monthKey, yearKey) {
    document.getElementById('schedule-thead').innerHTML = `<tr><th>Date</th><th>Day</th><th>Area/Shift</th><th>Basic</th><th>OT</th></tr>`; const tbody = document.getElementById('schedule-tbody'); tbody.innerHTML = '';
    let hasData = false, totalBasic = 0, totalOT = 0; const employeeData = getSafeScheduleData(empName, monthKey, yearKey) || {};
    for (let dayNum = 1; dayNum <= 31; dayNum++) {
        const dayData = employeeData[dayNum];
        if (dayData && dayData.area && dayData.area.trim() !== "") {
            hasData = true; totalBasic += parseFloat(dayData.basic) || 0; totalOT += parseFloat(dayData.ot) || 0;
            tbody.innerHTML += `<tr><td><strong>Day ${dayNum}</strong></td><td>${new Date(parseInt(yearKey, 10), ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"].indexOf(monthKey), dayNum).toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase()}</td><td>${getShiftHTML(dayData.area)}</td><td>${dayData.basic || "0"}</td><td>${dayData.ot || "0"}</td></tr>`;
        }
    } if (hasData) tbody.innerHTML += `<tr class="total-row"><td colspan="3" style="text-align: right;">Accumulated Structural Hours:</td><td>${totalBasic}</td><td>${totalOT}</td></tr>`; else tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding: 30px;">No scheduled elements found.</td></tr>`;
}

function renderNameCalendar(empName, monthKey, yearKey) {
    const grid = document.getElementById('calendar-grid-container'); grid.innerHTML = ''; const employeeData = getSafeScheduleData(empName, monthKey, yearKey) || {};
    ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'].forEach((day, idx) => { grid.innerHTML += `<div class="cal-header" style="color: ${idx >= 5 ? 'var(--danger)' : 'var(--text-light)'}">${day}</div>`; });
    let mIndex = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"].indexOf(monthKey); let startDayOfWeek = new Date(parseInt(yearKey, 10), mIndex, 1).getDay() - 1; if (startDayOfWeek === -1) startDayOfWeek = 6;
    for (let i = 0; i < startDayOfWeek; i++) grid.innerHTML += `<div class="cal-cell cal-cell-empty"></div>`; const daysInMonth = new Date(parseInt(yearKey, 10), mIndex + 1, 0).getDate();
    for (let i = 1; i <= daysInMonth; i++) { let cellContent = `<div class="cal-day-num">${i}</div>`; if (employeeData[i] && employeeData[i].area && employeeData[i].area.trim() !== "") cellContent += `${getShiftHTML(employeeData[i].area)}`; grid.innerHTML += `<div class="cal-cell">${cellContent}</div>`; }
}

function downloadScheduleJPG() {
    const empName = document.getElementById('schedule-name-filter').value; const monthKey = document.getElementById('schedule-month-filter').value; const yearKey = document.getElementById('schedule-year-filter').value;
    const employeeData = getSafeScheduleData(empName, monthKey, yearKey) || {}; const canvas = document.createElement('canvas'); const ctx = canvas.getContext('2d'); canvas.width = 1754; canvas.height = 1240; ctx.fillStyle = "#f8fafc"; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, canvas.width, 140); ctx.fillStyle = "#e2e8f0"; ctx.fillRect(0, 140, canvas.width, 4);
    ctx.fillStyle = "#4f46e5"; ctx.font = "bold 36px Arial"; ctx.fillText("Duna Networks", 60, 80); ctx.fillStyle = "#0f172a"; ctx.font = "bold 42px Arial"; ctx.textAlign = "center"; ctx.fillText(`${monthKey} ${yearKey} Roster Matrix - ${empName}`, canvas.width / 2, 85);
    let totalBasic = 0, totalOT = 0; for (let i = 1; i <= 31; i++) { if (employeeData[i] && employeeData[i].area) { totalBasic += parseFloat(employeeData[i].basic) || 0; totalOT += parseFloat(employeeData[i].ot) || 0; } }
    ctx.fillStyle = "#64748b"; ctx.font = "bold 24px Arial"; ctx.textAlign = "right"; ctx.fillText(`Basic: ${totalBasic} Hrs | OT: ${totalOT} Hrs`, canvas.width - 60, 85);
    const padX = 60, startY = 220, cellW = (canvas.width - 120) / 7, cellH = 140; ctx.font = "bold 22px Arial"; ctx.textAlign = "center";
    ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'].forEach((day, i) => { ctx.fillStyle = (i === 5 || i === 6) ? "#ef4444" : "#64748b"; ctx.fillText(day, padX + (i * cellW) + (cellW/2), startY - 20); });
    let mIndex = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"].indexOf(monthKey); let startDayOfWeek = new Date(parseInt(yearKey, 10), mIndex, 1).getDay() - 1; if (startDayOfWeek === -1) startDayOfWeek = 6;
    const daysInMonth = new Date(parseInt(yearKey, 10), mIndex + 1, 0).getDate();
    for (let i = 1; i <= daysInMonth; i++) {
        let pos = startDayOfWeek + i - 1, row = Math.floor(pos / 7), col = pos % 7; let x = padX + (col * cellW), y = startY + (row * cellH);
        ctx.fillStyle = "#ffffff"; ctx.fillRect(x, y, cellW, cellH); ctx.strokeStyle = "#cbd5e1"; ctx.lineWidth = 1.5; ctx.strokeRect(x, y, cellW, cellH); ctx.fillStyle = "#0f172a"; ctx.font = "bold 24px Arial"; ctx.textAlign = "left"; ctx.fillText(i.toString(), x + 15, y + 35);
        if (employeeData[i] && employeeData[i].area && employeeData[i].area.trim() !== "") { ctx.fillStyle = "#eff6ff"; ctx.fillRect(x + 10, y + 60, cellW - 20, 50); ctx.fillStyle = "#3b82f6"; ctx.font = "bold 18px Arial"; ctx.textAlign = "center"; ctx.fillText(employeeData[i].area, x + (cellW/2), y + 92); }
    }
    const link = document.createElement('a'); link.download = `${empName}_Matrix_Roster.jpg`; link.href = canvas.toDataURL('image/jpeg', 0.95); link.click();
}

// --- FULL SCREEN MATRIX LOGIC ---
window.isFSMatrixFullscreen = false;

window.toggleFSMatrixFullscreen = function() {
    window.isFSMatrixFullscreen = !window.isFSMatrixFullscreen;
    
    const header = document.getElementById('fs-modal-header');
    const filters = document.getElementById('fs-modal-filters');
    const card = document.getElementById('fs-modal-card');
    const wrapper = document.getElementById('fs-table-wrapper');
    
    if (window.isFSMatrixFullscreen) {
        // Hide UI and Maximize Card
        if(header) header.style.display = 'none';
        if(filters) filters.style.display = 'none';
        
        card.style.width = '100vw';
        card.style.height = '100vh';
        card.style.maxWidth = '100vw';
        card.style.maxHeight = '100vh';
        card.style.borderRadius = '0';
        card.style.padding = '0';
        wrapper.style.border = 'none';
        
        // Inject a floating Exit button so the user isn't trapped
        let exitBtn = document.getElementById('fs-floating-exit-btn');
        if (!exitBtn) {
            exitBtn = document.createElement('button');
            exitBtn.id = 'fs-floating-exit-btn';
            exitBtn.innerHTML = '❌ Exit Full Screen';
            exitBtn.style.cssText = 'position: fixed; top: 15px; right: 20px; z-index: 9999; background: #ef4444; color: white; border: none; padding: 10px 16px; border-radius: 8px; font-weight: bold; cursor: pointer; box-shadow: 0 4px 10px rgba(0,0,0,0.3);';
            exitBtn.onclick = window.toggleFSMatrixFullscreen;
            wrapper.appendChild(exitBtn);
        }
        exitBtn.style.display = 'block';
        
    } else {
        // Restore Normal Modal State
        if(header) header.style.display = 'flex';
        if(filters) filters.style.display = 'flex';
        
        card.style.width = '98vw';
        card.style.height = '95vh';
        card.style.borderRadius = '12px';
        card.style.padding = '20px';
        wrapper.style.border = '2px solid #000';
        
        const exitBtn = document.getElementById('fs-floating-exit-btn');
        if (exitBtn) exitBtn.style.display = 'none';
    }
};
