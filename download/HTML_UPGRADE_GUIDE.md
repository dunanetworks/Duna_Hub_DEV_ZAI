# Duna Networks Hub — HTML Upgrade Guide

## Overview
Your `styles.css` has been completely restyled for a modern, professional look.
This guide shows the **HTML changes needed** to unlock the full visual upgrade.

## ⚠️ IMPORTANT
- **BACK UP** your original files before making changes
- The new CSS is **backwards compatible** — it works with your current HTML
- HTML changes below are **optional enhancements** that improve the visual result
- **Your app.js requires ZERO changes**

---

## 1. Login Page Enhancement

### Current:
```html
<div id="login-portal">
    <h2>Duna Networks</h2>
    <input id="portal-username" placeholder="Enter Username">
    <input id="portal-password" placeholder="Enter personal password">
    <button class="btn-unlock">Unlock Workspace</button>
    <button id="toggle-roster-btn">▼</button>
</div>
```

### Upgrade to:
```html
<div id="login-portal">
    <div class="login-card">
        <div class="login-header">
            <h2>Duna Networks</h2>
            <p>Sign in to your workspace</p>
        </div>
        <div class="login-input">
            <label for="portal-username">Username</label>
            <input id="portal-username" placeholder="Enter your username" autocomplete="username">
        </div>
        <div class="login-input">
            <label for="portal-password">Password</label>
            <input id="portal-password" type="password" placeholder="Enter your password" autocomplete="current-password">
        </div>
        <button class="btn-unlock" id="portal-submit">Unlock Workspace</button>
        <button id="toggle-roster-btn">View Public Roster</button>
    </div>
</div>
```

---

## 2. Header Enhancement

### Current:
```html
<div class="app-header">
    <div class="header-left">
        <h2>Duna Networks</h2>
    </div>
    <div class="header-right">
        <span id="clock-display"></span>
        <!-- nav buttons -->
    </div>
</div>
```

### Upgrade to:
```html
<div class="app-header">
    <div class="header-left">
        <img class="brand-logo" src="" alt="Logo" onerror="this.style.display='none'">
        <div class="brand-info">
            <h1>Duna Networks</h1>
            <div class="live-clock-badge">
                <span class="green-dot"></span>
                <span id="clock-display"></span>
            </div>
        </div>
    </div>
    <div class="header-right">
        <!-- wrap each nav button in: -->
        <div class="nav-btn-wrapper">
            <button class="icon-btn-refined" onclick="...">🔔</button>
            <div class="nav-badge" id="nav-chat-badge">3</div>
        </div>
        <!-- other buttons -->
    </div>
</div>
```

---

## 3. Section Cards — Add Semantic Wrappers

Wrap your sections in section-card divs for consistent styling:
```html
<div class="section-card">
    <div class="section-card-header">
        <h3>Section Title</h3>
    </div>
    <!-- section content -->
</div>
```

---

## 4. Modal Enhancement (Optional)

For modals, the new CSS adds `modalSlideUp` animation automatically.
To make modals slide up from bottom on mobile, add this class:

```html
<div id="schedule-modal" class="modal-overlay">
    <div class="modal-content">
        <!-- unchanged -->
    </div>
</div>
```

No HTML change needed — the CSS handles it via:
```css
@media (max-width: 767px) {
    .modal-overlay { align-items: flex-end; }
}
```

---

## 5. Responsive Table Wrapper

For the shifts table and admin tables, wrap them:
```html
<div class="table-responsive">
    <table class="shifts-table">
        <!-- unchanged -->
    </table>
</div>
```

Add this CSS (if not already in the new stylesheet):
```css
.table-responsive {
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    margin: 0 -24px;
    padding: 0 24px;
}
```

---

## 6. File Structure

```
your-project/
├── index.html          ← Update with HTML enhancements above
├── css/
│   └── styles.css      ← Replace with the new restyled version
├── js/
│   └── app.js          ← NO CHANGES NEEDED
└── (other assets)
```

---

## Quick Win: Just Replace CSS

If you want the **minimum effort upgrade**, simply:
1. Replace `css/styles.css` with the new file
2. Keep `index.html` and `js/app.js` unchanged

The new CSS is fully backwards compatible. You'll see improvements immediately:
- Modern gradient background
- Better card shadows
- Smoother animations
- Responsive breakpoints
- Glass-morphism effects
- Refined typography

The HTML changes above unlock **additional polish** (login card, header badges, table responsiveness).
