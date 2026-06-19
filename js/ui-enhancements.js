/* =========================================================
   DUNA NETWORKS HUB — Modern UI Enhancement Script
   Add this as a separate <script> tag AFTER app.js
   or append to your existing app.js
   
   This adds visual polish ONLY — no business logic changes.
========================================================= */

(function() {
    'use strict';

    // ── 1. Smooth Page Load (remove loader gracefully) ──
    const origHideLoader = window.hideLoader;
    if (typeof origHideLoader === 'function') {
        window.hideLoader = function() {
            const overlay = document.getElementById('loader-overlay');
            if (overlay) {
                overlay.style.opacity = '0';
                setTimeout(() => {
                    overlay.style.display = 'none';
                }, 300);
            }
        };
    }

    // ── 2. Enhanced Login Card Structure (if not already styled) ──
    function enhanceLoginIfNeeded() {
        const portal = document.getElementById('login-portal');
        if (!portal) return;
        
        // Check if login-card already exists
        if (portal.querySelector('.login-card')) return;
        
        // Wrap existing content in a login-card
        const existingContent = portal.innerHTML;
        // Only wrap if it's a flat structure (not already wrapped)
        if (!existingContent.includes('class="login-card"')) {
            const card = document.createElement('div');
            card.className = 'login-card';
            
            // Find the h2 for the header
            const h2 = portal.querySelector('h2');
            const headerDiv = document.createElement('div');
            headerDiv.className = 'login-header';
            
            if (h2) {
                const subtitle = document.createElement('p');
                subtitle.textContent = 'Sign in to your workspace';
                h2.parentNode.insertBefore(subtitle, h2.nextSibling);
                headerDiv.appendChild(h2);
                headerDiv.appendChild(subtitle);
            }
            
            // Wrap inputs in labeled groups
            const usernameInput = document.getElementById('portal-username');
            const passwordInput = document.getElementById('portal-password');
            
            if (usernameInput) {
                const wrapper = document.createElement('div');
                wrapper.className = 'login-input';
                const label = document.createElement('label');
                label.textContent = 'Username';
                label.setAttribute('for', 'portal-username');
                usernameInput.parentNode.insertBefore(label, usernameInput);
                wrapper.appendChild(label);
                wrapper.appendChild(usernameInput);
                usernameInput.setAttribute('autocomplete', 'username');
            }
            
            if (passwordInput) {
                const wrapper = document.createElement('div');
                wrapper.className = 'login-input';
                const label = document.createElement('label');
                label.textContent = 'Password';
                label.setAttribute('for', 'portal-password');
                passwordInput.parentNode.insertBefore(label, passwordInput);
                wrapper.appendChild(label);
                wrapper.appendChild(passwordInput);
                passwordInput.setAttribute('autocomplete', 'current-password');
                passwordInput.setAttribute('type', 'password');
            }
        }
    }

    // ── 3. Add Ripple Effect to Buttons ──
    function addRippleEffect() {
        document.addEventListener('click', function(e) {
            const btn = e.target.closest('button');
            if (!btn || btn.disabled) return;

            const ripple = document.createElement('span');
            ripple.style.cssText = `
                position: absolute;
                border-radius: 50%;
                background: rgba(255,255,255,0.3);
                transform: scale(0);
                animation: rippleAnim 0.5s ease-out forwards;
                pointer-events: none;
            `;

            const rect = btn.getBoundingClientRect();
            const size = Math.max(rect.width, rect.height);
            ripple.style.width = ripple.style.height = size + 'px';
            ripple.style.left = (e.clientX - rect.left - size / 2) + 'px';
            ripple.style.top = (e.clientY - rect.top - size / 2) + 'px';

            btn.style.position = 'relative';
            btn.style.overflow = 'hidden';
            btn.appendChild(ripple);

            setTimeout(() => ripple.remove(), 500);
        });

        // Inject ripple keyframes
        const style = document.createElement('style');
        style.textContent = `
            @keyframes rippleAnim {
                to { transform: scale(2.5); opacity: 0; }
            }
        `;
        document.head.appendChild(style);
    }

    // ── 4. Header Enhancement ──
    function enhanceHeader() {
        const header = document.querySelector('.app-header');
        if (!header) return;

        // Wrap clock in live badge if not already
        const clock = document.getElementById('clock-display');
        if (clock && !clock.closest('.live-clock-badge')) {
            const badge = document.createElement('div');
            badge.className = 'live-clock-badge';
            const dot = document.createElement('span');
            dot.className = 'green-dot';
            badge.appendChild(dot);
            badge.appendChild(clock);
            
            const headerLeft = header.querySelector('.header-left');
            if (headerLeft) {
                headerLeft.appendChild(badge);
            }
        }

        // Add brand-info wrapper
        const brandName = header.querySelector('h1, h2');
        if (brandName && !brandName.closest('.brand-info')) {
            const info = document.createElement('div');
            info.className = 'brand-info';
            brandName.parentNode.insertBefore(info, brandName);
            info.appendChild(brandName);
            if (brandName.tagName === 'H2') {
                brandName.tagName = 'H1'; // semantic upgrade (visual only via CSS)
            }
        }

        // Wrap nav buttons for badge positioning
        const chatBadge = document.getElementById('nav-chat-badge');
        if (chatBadge && !chatBadge.closest('.nav-btn-wrapper')) {
            const prevBtn = chatBadge.previousElementSibling;
            if (prevBtn && prevBtn.tagName === 'BUTTON') {
                const wrapper = document.createElement('div');
                wrapper.className = 'nav-btn-wrapper';
                prevBtn.parentNode.insertBefore(wrapper, prevBtn);
                wrapper.appendChild(prevBtn);
                wrapper.appendChild(chatBadge);
            }
        }
    }

    // ── 5. Scroll Reveal Animation ──
    function initScrollReveal() {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.style.opacity = '1';
                    entry.target.style.transform = 'translateY(0)';
                    observer.unobserve(entry.target);
                }
            });
        }, { threshold: 0.1, rootMargin: '0px 0px -20px 0px' });

        document.querySelectorAll('.section-card, .roster-item').forEach(el => {
            if (el.closest('#login-portal')) return;
            el.style.opacity = '0';
            el.style.transform = 'translateY(12px)';
            el.style.transition = 'opacity 0.4s cubic-bezier(0.4,0,0.2,1), transform 0.4s cubic-bezier(0.4,0,0.2,1)';
            observer.observe(el);
        });
    }

    // ── 6. Table Responsive Wrapper ──
    function wrapTables() {
        document.querySelectorAll('.shifts-table, .admin-report-header, #view-table, #fs-table').forEach(table => {
            if (!table.closest('.table-responsive')) {
                const wrapper = document.createElement('div');
                wrapper.className = 'table-responsive';
                wrapper.style.cssText = 'overflow-x:auto;-webkit-overflow-scrolling:touch;';
                table.parentNode.insertBefore(wrapper, table);
                wrapper.appendChild(table);
            }
        });
    }

    // ── 7. Active State Feedback for Inputs ──
    function enhanceInputs() {
        document.addEventListener('focusin', function(e) {
            const input = e.target;
            if (['INPUT', 'TEXTAREA', 'SELECT'].includes(input.tagName)) {
                const card = input.closest('.section-card, .modal-content, .login-card');
                if (card) {
                    card.style.borderColor = 'var(--card-border-hover)';
                }
            }
        });

        document.addEventListener('focusout', function(e) {
            const input = e.target;
            if (['INPUT', 'TEXTAREA', 'SELECT'].includes(input.tagName)) {
                const card = input.closest('.section-card, .modal-content, .login-card');
                if (card) {
                    card.style.borderColor = '';
                }
            }
        });
    }

    // ── 8. Smooth Theme Transition ──
    function enhanceThemeToggle() {
        document.documentElement.style.transition = 'background-color 0.4s ease, color 0.3s ease';
    }

    // ── INITIALIZE ──
    function init() {
        try {
            enhanceThemeToggle();
            enhanceLoginIfNeeded();
            enhanceHeader();
            addRippleEffect();
            enhanceInputs();
            wrapTables();
            
            // Delay scroll reveal to after app renders
            setTimeout(initScrollReveal, 500);
            
            // Re-run header enhancement when main-app shows
            const mainApp = document.getElementById('main-app');
            if (mainApp) {
                const observer = new MutationObserver(() => {
                    if (mainApp.style.display !== 'none') {
                        enhanceHeader();
                        wrapTables();
                        setTimeout(initScrollReveal, 200);
                    }
                });
                observer.observe(mainApp, { attributes: true, attributeFilter: ['style'] });
            }
        } catch (e) {
            console.warn('UI Enhancement init error:', e);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
