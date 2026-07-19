// ==================== FIREBASE CONFIG ====================
const firebaseConfig = {
  apiKey: "AIzaSyDJ1zgLmA5sb_oVXfwxzh9tHIp4WvvFris",
  authDomain: "fanbase-4eba3.firebaseapp.com",
  databaseURL: "https://fanbase-4eba3-default-rtdb.firebaseio.com",
  projectId: "fanbase-4eba3",
  storageBucket: "fanbase-4eba3.firebasestorage.app",
  messagingSenderId: "264324879296",
  appId: "1:264324879296:web:5832c926bbc6e0ab442e25",
  measurementId: "G-542CS5CMS8"
};

let app, auth, db;
try {
    if (typeof firebase !== 'undefined') {
        app = firebase.initializeApp(firebaseConfig);
        auth = firebase.auth();
        db = firebase.firestore();
    }
} catch(e) {
    console.log("Firebase demo mode - replace config with real credentials");
}

// ==================== STATE ====================
let currentUser = null;
let isSignUp = false;

// ==================== REFERRAL SYSTEM ====================

function getBaseUrl() {
    return window.location.origin + window.location.pathname.replace(/\/index\.html$/, '').replace(/\/[^/]*$/, '');
}

function generateReferralCode(uid) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = 'FANS-';
    const seed = uid || String(Date.now());
    for (let i = 0; i < 6; i++) {
        code += chars[(seed.charCodeAt(i % seed.length) + i * 7) % chars.length];
    }
    return code;
}

function getReferralLink(user) {
    const base = window.location.origin + window.location.pathname.replace(/index\.html$/, '');
    const baseUrl = base.endsWith('/') ? base : base + '/';
    const code = user.referralCode || generateReferralCode(user.uid);
    return baseUrl + 'index.html?ref=' + encodeURIComponent(code);
}

function captureReferralCode() {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get('ref');
    if (ref) {
        try { sessionStorage.setItem('fans_ref_pending', ref); } catch(e) {}
    }
}

// ==================== AUTH STATE & USER LOADING ====================

function loadState() {
    if (!auth) return;
    auth.onAuthStateChanged(async (fbUser) => {
        if (!fbUser) {
            currentUser = null;
            resetUI();
            return;
        }
        try {
            let data = {};
            if (db) {
                const doc = await db.collection('users').doc(fbUser.uid).get();
                data = doc.exists ? (doc.data() || {}) : {};
            }
            currentUser = {
                uid: fbUser.uid,
                email: fbUser.email,
                displayName: data.displayName || fbUser.displayName || 'Fan',
                photoURL: data.photoURL || fbUser.photoURL || '',
                referralCode: data.referralCode || generateReferralCode(fbUser.uid),
                referralLink: data.referralLink || '',
                referralCount: typeof data.referralCount === 'number' ? data.referralCount : 0
            };
            if (!currentUser.referralLink) currentUser.referralLink = getReferralLink(currentUser);
            updateUI(currentUser);
        } catch (e) {
            console.log('User load skipped:', e.message);
        }
    });
}

// ==================== USER DOCUMENT MANAGEMENT ====================

/**
 * Creates a new user document in Firestore.
 * ONLY called once during account creation (signup).
 */
function createUserDocument(user, referredByCode) {
    if (!db || !user) return Promise.resolve();

    const refCode = generateReferralCode(user.uid);
    const refLink = getReferralLink({ uid: user.uid, referralCode: refCode });
    const normalizedReferralCode = (referredByCode || '').trim().toUpperCase();

    const userData = {
        displayName: user.displayName || 'Fan',
        email: user.email,
        photoURL: user.photoURL || '',
        referralCode: refCode,
        referralLink: refLink,
        referralCount: 0,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        lastLogin: firebase.firestore.FieldValue.serverTimestamp()
    };

    if (normalizedReferralCode && normalizedReferralCode !== refCode) {
        userData.referredBy = normalizedReferralCode;
        userData.referredAt = firebase.firestore.FieldValue.serverTimestamp();
    }

    return db.collection('users').doc(user.uid).set(userData)
        .catch(e => console.log('User doc creation skipped:', e.message));
}

/**
 * Updates last login timestamp.
 * Called on every login (NOT signup).
 * NEVER touches referralCount, referralCode, or other persistent fields.
 */
function updateLastLogin(user) {
    if (!db || !user) return Promise.resolve();

    return db.collection('users').doc(user.uid).update({
        lastLogin: firebase.firestore.FieldValue.serverTimestamp()
    }).catch(e => console.log('Last login update skipped:', e.message));
}

/**
 * Processes a referral by looking up the referrer and atomically incrementing their count.
 * 
 * CRITICAL FIX: Firestore transactions CANNOT perform collection queries (.where()).
 * We query for the referrer OUTSIDE the transaction, then do the atomic read+write INSIDE.
 */
async function processReferral(refCode, referredUser) {
    const normalizedRefCode = (refCode || '').trim().toUpperCase();
    if (!normalizedRefCode || !referredUser || !db || !referredUser.uid) {
        return;
    }

    try {
        // STEP 1: Check if this user was already processed (prevents double-counting)
        const referredDoc = await db.collection('users').doc(referredUser.uid).get();
        if (!referredDoc.exists) {
            console.log('Referred user doc not found yet, deferring referral processing');
            return;
        }

        const referredData = referredDoc.data() || {};

        // Already processed? Skip.
        if (referredData.referralProcessed === true) {
            console.log('Referral already processed for this user');
            return;
        }

        // Self-referral by code? Skip.
        if (referredData.referralCode === normalizedRefCode) {
            console.log('Self-referral detected, skipping');
            return;
        }

        // STEP 2: Find the referrer by their referral code (OUTSIDE transaction)
        const referrerSnapshot = await db.collection('users')
            .where('referralCode', '==', normalizedRefCode)
            .limit(1)
            .get();

        if (referrerSnapshot.empty) {
            console.log('Referrer not found for code:', normalizedRefCode);
            return;
        }

        const referrerDoc = referrerSnapshot.docs[0];
        const referrerUid = referrerDoc.id;

        // Self-referral by UID? Skip.
        if (referrerUid === referredUser.uid) {
            console.log('Self-referral by UID detected, skipping');
            return;
        }

        const referrerRef = db.collection('users').doc(referrerUid);
        const referredRef = db.collection('users').doc(referredUser.uid);

        // STEP 3: Atomic transaction — only direct document reads/writes allowed
        await db.runTransaction(async (transaction) => {
            // Read both documents inside transaction
            const referrerSnap = await transaction.get(referrerRef);
            const referredSnap = await transaction.get(referredRef);

            if (!referredSnap.exists) {
                console.log('Referred user doc missing during transaction');
                return;
            }

            const referredCurrent = referredSnap.data() || {};

            // Double-check inside transaction (race condition protection)
            if (referredCurrent.referralProcessed === true) {
                console.log('Referral already processed (transaction check)');
                return;
            }

            const referrerCurrent = referrerSnap.exists ? (referrerSnap.data() || {}) : {};
            const currentCount = typeof referrerCurrent.referralCount === 'number' ? referrerCurrent.referralCount : 0;

            // Atomic increment on referrer
            transaction.update(referrerRef, {
                referralCount: currentCount + 1,
                lastReferredAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            // Mark referred user as processed
            transaction.update(referredRef, {
                referredBy: normalizedRefCode,
                referredAt: firebase.firestore.FieldValue.serverTimestamp(),
                referralProcessed: true
            });

            console.log('Referral processed successfully:', normalizedRefCode, '-> count:', currentCount + 1);
        });

    } catch (e) {
        console.log('Referral processing failed:', e.message);
    }
}

// ==================== NAVIGATION ====================

function scrollToSection(id) {
    const el = document.getElementById(id);
    if (el) {
        const offset = 80;
        const top = el.getBoundingClientRect().top + window.pageYOffset - offset;
        window.scrollTo({ top: top, behavior: 'smooth' });
    }
    document.getElementById('navLinks').classList.remove('active');

    document.querySelectorAll('.nav-links a').forEach(a => a.classList.remove('active'));
    document.querySelectorAll('.nav-links a').forEach(a => {
        if (a.getAttribute('href') === '#' + id) a.classList.add('active');
    });
}

function toggleMobileMenu() {
    document.getElementById('navLinks').classList.toggle('active');
}

function goToDashboard() {
    if (currentUser) {
        window.location.href = 'dashboard.html';
    } else {
        openAuthModal();
    }
}

// ==================== LOGO CHANGE (Firestore) ====================



// ==================== AUTH MODAL ====================

function populateReferralInputFromPending() {
    const refInput = document.getElementById('signupReferralCode');
    if (!refInput) return;
    const pendingRef = sessionStorage.getItem('fans_ref_pending') || '';
    refInput.value = pendingRef;
}

function openAuthModal() {
    const pendingRef = sessionStorage.getItem('fans_ref_pending') || '';
    if (pendingRef && !isSignUp) {
        toggleAuthMode();
    }
    document.getElementById('authModal').classList.add('active');
    document.body.style.overflow = 'hidden';
    if (isSignUp) populateReferralInputFromPending();
}

function closeAuthModal() {
    document.getElementById('authModal').classList.remove('active');
    document.body.style.overflow = '';
    document.getElementById('authError').style.display = 'none';
    document.getElementById('authSuccess').style.display = 'none';
}

function toggleAuthMode() {
    isSignUp = !isSignUp;
    document.getElementById('modalTitle').textContent = isSignUp ? 'Create Account' : 'Welcome Back';
    document.getElementById('btnText').textContent = isSignUp ? 'Sign Up' : 'Sign In';
    document.getElementById('switchText').textContent = isSignUp ? 'Already have an account?' : "Don't have an account?";
    document.getElementById('switchLink').textContent = isSignUp ? 'Sign In' : 'Sign Up';
    document.getElementById('nameGroup').style.display = isSignUp ? 'block' : 'none';
    document.getElementById('referralGroup').style.display = isSignUp ? 'block' : 'none';
    if (isSignUp) populateReferralInputFromPending();
}

// ==================== AUTH HANDLER ====================

function handleAuth(e) {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const name = document.getElementById('fullName').value;
    const spinner = document.getElementById('btnSpinner');
    const btnText = document.getElementById('btnText');

    spinner.style.display = 'inline-block';
    btnText.style.display = 'none';

    let formReferralCode = '';
    if (isSignUp) {
        const refInput = document.getElementById('signupReferralCode');
        if (refInput) formReferralCode = refInput.value.trim().toUpperCase();
    }

    const urlRef = sessionStorage.getItem('fans_ref_pending');
    const effectiveRefCode = formReferralCode || urlRef || '';

    if (!auth) {
        setTimeout(() => {
            const uid = 'demo_' + Date.now();
            simulateLogin({
                displayName: name || 'Demo User',
                email: email,
                photoURL: 'https://ui-avatars.com/api/?name=' + encodeURIComponent(name || 'User') + '&background=d4af37&color=fff',
                uid: uid
            }, isSignUp, effectiveRefCode);
            spinner.style.display = 'none';
            btnText.style.display = 'inline';
        }, 1000);
        return;
    }

    if (isSignUp) {
        auth.createUserWithEmailAndPassword(email, password)
            .then((cred) => {
                return cred.user.updateProfile({ displayName: name }).then(() => cred.user);
            })
            .then((user) => {
                // Create user doc FIRST, then process referral
                return createUserDocument(user, effectiveRefCode).then(() => {
                    // Now that doc exists, process referral
                    return processReferral(effectiveRefCode, user).then(() => user);
                });
            })
            .then((user) => {
                simulateLogin(user, true, effectiveRefCode);
            })
            .catch((err) => showAuthError(err.message))
            .finally(() => { spinner.style.display = 'none'; btnText.style.display = 'inline'; });
    } else {
        auth.signInWithEmailAndPassword(email, password)
            .then((cred) => {
                // Just update last login — NEVER create doc or reset referralCount
                return updateLastLogin(cred.user).then(() => cred.user);
            })
            .then((user) => {
                simulateLogin(user, false, '');
            })
            .catch((err) => showAuthError(err.message))
            .finally(() => { spinner.style.display = 'none'; btnText.style.display = 'inline'; });
    }
}

// ==================== LOGIN SIMULATION ====================

function simulateLogin(user, isNewSignup, referredByCode) {
    if (!user.referralCode) user.referralCode = generateReferralCode(user.uid);
    if (!user.referralLink) user.referralLink = getReferralLink(user);
    if (user.referralCount === undefined) user.referralCount = 0;

    try { sessionStorage.removeItem('fans_ref_pending'); } catch(e) {}

    currentUser = user;
    updateUI(user);
    closeAuthModal();
    showToast('Welcome, ' + (user.displayName || 'Fan') + '! 🎉', 'success');
    setTimeout(() => { window.location.href = 'dashboard.html'; }, 1200);
}

// ==================== UI UPDATES ====================

function resetUI() {
    const a = document.getElementById('userAvatar');
    const n = document.getElementById('userName');
    const authBtn = document.getElementById('authBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    if (a) a.style.display = 'none';
    if (n) n.style.display = 'none';
    if (authBtn) authBtn.style.display = 'inline-flex';
    if (logoutBtn) logoutBtn.style.display = 'none';
}

function logout() {
    const done = () => {
        currentUser = null;
        resetUI();
        showToast('Logged out successfully', 'info');
    };
    if (auth) {
        auth.signOut().then(done).catch(done);
    } else {
        done();
    }
}

function updateUI(user) {
    if (!user) return;
    const avatar = document.getElementById('userAvatar');
    const name = document.getElementById('userName');
    const authBtn = document.getElementById('authBtn');
    const logoutBtn = document.getElementById('logoutBtn');

    avatar.src = user.photoURL || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(user.displayName || 'User') + '&background=d4af37&color=fff';
    avatar.style.display = 'block';
    name.textContent = user.displayName || user.email;
    name.style.display = 'inline';
    authBtn.style.display = 'none';
    logoutBtn.style.display = 'inline-flex';
}

function showAuthError(msg) {
    const el = document.getElementById('authError');
    el.textContent = msg;
    el.style.display = 'block';
    setTimeout(() => el.style.display = 'none', 5000);
}

// ==================== DATA ====================
const groupsData = {
    'A': [
        { name: 'Mexico', flag: '🇲🇽', p: 3, w: 3, d: 0, l: 0, gf: 6, ga: 0, pts: 9 },
        { name: 'South Africa', flag: '🇿🇦', p: 3, w: 1, d: 1, l: 1, gf: 2, ga: 3, pts: 4 },
        { name: 'South Korea', flag: '🇰🇷', p: 3, w: 1, d: 0, l: 2, gf: 2, ga: 3, pts: 3 },
        { name: 'Czechia', flag: '🇨🇿', p: 3, w: 0, d: 1, l: 2, gf: 2, ga: 6, pts: 1 }
    ],
    'B': [
        { name: 'Switzerland', flag: '🇨🇭', p: 3, w: 2, d: 1, l: 0, gf: 7, ga: 3, pts: 7 },
        { name: 'Canada', flag: '🇨🇦', p: 3, w: 1, d: 1, l: 1, gf: 8, ga: 3, pts: 4 },
        { name: 'Bosnia & Herz.', flag: '🇧🇦', p: 3, w: 1, d: 1, l: 1, gf: 5, ga: 6, pts: 4 },
        { name: 'Qatar', flag: '🇶🇦', p: 3, w: 0, d: 1, l: 2, gf: 2, ga: 10, pts: 1 }
    ],
    'C': [
        { name: 'Brazil', flag: '🇧🇷', p: 3, w: 2, d: 1, l: 0, gf: 7, ga: 1, pts: 7 },
        { name: 'Morocco', flag: '🇲🇦', p: 3, w: 2, d: 1, l: 0, gf: 6, ga: 3, pts: 7 },
        { name: 'Scotland', flag: '🏴󠁧󠁢󠁳󠁣󠁴󠁿', p: 3, w: 1, d: 0, l: 2, gf: 1, ga: 4, pts: 3 },
        { name: 'Haiti', flag: '🇭🇹', p: 3, w: 0, d: 0, l: 3, gf: 2, ga: 8, pts: 0 }
    ],
    'D': [
        { name: 'USA', flag: '🇺🇸', p: 3, w: 2, d: 0, l: 1, gf: 8, ga: 4, pts: 6 },
        { name: 'Australia', flag: '🇦🇺', p: 3, w: 1, d: 1, l: 1, gf: 2, ga: 2, pts: 4 },
        { name: 'Paraguay', flag: '🇵🇾', p: 3, w: 1, d: 1, l: 1, gf: 2, ga: 4, pts: 4 },
        { name: 'Türkiye', flag: '🇹🇷', p: 3, w: 1, d: 0, l: 2, gf: 3, ga: 5, pts: 3 }
    ],
    'E': [
        { name: 'Germany', flag: '🇩🇪', p: 3, w: 2, d: 0, l: 1, gf: 10, ga: 4, pts: 6 },
        { name: 'Ivory Coast', flag: '🇨🇮', p: 3, w: 2, d: 0, l: 1, gf: 4, ga: 2, pts: 6 },
        { name: 'Ecuador', flag: '🇪🇨', p: 3, w: 1, d: 1, l: 1, gf: 2, ga: 2, pts: 4 },
        { name: 'Curaçao', flag: '🇨🇼', p: 3, w: 0, d: 1, l: 2, gf: 1, ga: 9, pts: 1 }
    ],
    'F': [
        { name: 'Netherlands', flag: '🇳🇱', p: 3, w: 2, d: 1, l: 0, gf: 10, ga: 4, pts: 7 },
        { name: 'Japan', flag: '🇯🇵', p: 3, w: 1, d: 2, l: 0, gf: 7, ga: 3, pts: 5 },
        { name: 'Sweden', flag: '🇸🇪', p: 3, w: 1, d: 1, l: 1, gf: 7, ga: 7, pts: 4 },
        { name: 'Tunisia', flag: '🇹🇳', p: 3, w: 0, d: 0, l: 3, gf: 2, ga: 12, pts: 0 }
    ],
    'G': [
        { name: 'Belgium', flag: '🇧🇪', p: 3, w: 1, d: 2, l: 0, gf: 6, ga: 2, pts: 5 },
        { name: 'Egypt', flag: '🇪🇬', p: 3, w: 1, d: 2, l: 0, gf: 5, ga: 3, pts: 5 },
        { name: 'Iran', flag: '🇮🇷', p: 3, w: 0, d: 3, l: 0, gf: 3, ga: 3, pts: 3 },
        { name: 'New Zealand', flag: '🇳🇿', p: 3, w: 0, d: 1, l: 2, gf: 4, ga: 10, pts: 1 }
    ],
    'H': [
        { name: 'Spain', flag: '🇪🇸', p: 3, w: 2, d: 1, l: 0, gf: 5, ga: 0, pts: 7 },
        { name: 'Cape Verde', flag: '🇨🇻', p: 3, w: 0, d: 3, l: 0, gf: 2, ga: 2, pts: 3 },
        { name: 'Uruguay', flag: '🇺🇾', p: 3, w: 0, d: 2, l: 1, gf: 3, ga: 4, pts: 2 },
        { name: 'Saudi Arabia', flag: '🇸🇦', p: 3, w: 0, d: 2, l: 1, gf: 1, ga: 5, pts: 2 }
    ],
    'I': [
        { name: 'France', flag: '🇫🇷', p: 3, w: 3, d: 0, l: 0, gf: 10, ga: 2, pts: 9 },
        { name: 'Norway', flag: '🇳🇴', p: 3, w: 2, d: 0, l: 1, gf: 8, ga: 7, pts: 6 },
        { name: 'Senegal', flag: '🇸🇳', p: 3, w: 1, d: 0, l: 2, gf: 8, ga: 6, pts: 3 },
        { name: 'Iraq', flag: '🇮🇶', p: 3, w: 0, d: 0, l: 3, gf: 1, ga: 12, pts: 0 }
    ],
    'J': [
        { name: 'Argentina', flag: '🇦🇷', p: 3, w: 3, d: 0, l: 0, gf: 8, ga: 1, pts: 9 },
        { name: 'Austria', flag: '🇦🇹', p: 3, w: 1, d: 1, l: 1, gf: 6, ga: 6, pts: 4 },
        { name: 'Algeria', flag: '🇩🇿', p: 3, w: 1, d: 1, l: 1, gf: 5, ga: 7, pts: 4 },
        { name: 'Jordan', flag: '🇯🇴', p: 3, w: 0, d: 0, l: 3, gf: 3, ga: 8, pts: 0 }
    ],
    'K': [
        { name: 'Colombia', flag: '🇨🇴', p: 3, w: 2, d: 1, l: 0, gf: 4, ga: 1, pts: 7 },
        { name: 'Portugal', flag: '🇵🇹', p: 3, w: 1, d: 2, l: 0, gf: 6, ga: 1, pts: 5 },
        { name: 'DR Congo', flag: '🇨🇩', p: 3, w: 1, d: 1, l: 1, gf: 4, ga: 3, pts: 4 },
        { name: 'Uzbekistan', flag: '🇺🇿', p: 3, w: 0, d: 0, l: 3, gf: 2, ga: 11, pts: 0 }
    ],
    'L': [
        { name: 'England', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', p: 3, w: 2, d: 1, l: 0, gf: 6, ga: 2, pts: 7 },
        { name: 'Croatia', flag: '🇭🇷', p: 3, w: 2, d: 0, l: 1, gf: 5, ga: 5, pts: 6 },
        { name: 'Ghana', flag: '🇬🇭', p: 3, w: 1, d: 1, l: 1, gf: 2, ga: 2, pts: 4 },
        { name: 'Panama', flag: '🇵🇦', p: 3, w: 0, d: 0, l: 3, gf: 0, ga: 4, pts: 0 }
    ]
};

const knockoutData = {
    'Round of 32': [
        { date: 'June 28', team1: 'Canada', flag1: '🇨🇦', score: '1-0', team2: 'South Africa', flag2: '🇿🇦', status: 'FT', info: 'Houston Stadium' },
        { date: 'June 29', team1: 'Brazil', flag1: '🇧🇷', score: '2-1', team2: 'Japan', flag2: '🇯🇵', status: 'FT', info: 'Houston Stadium' },
        { date: 'June 29', team1: 'Germany', flag1: '🇩🇪', score: '1-1 (3-4 pens)', team2: 'Paraguay', flag2: '🇵🇾', status: 'FT', info: 'Boston Stadium' },
        { date: 'June 29', team1: 'Netherlands', flag1: '🇳🇱', score: '1-1 (2-3 pens)', team2: 'Morocco', flag2: '🇲🇦', status: 'FT', info: 'Monterrey Stadium' },
        { date: 'June 30', team1: 'Norway', flag1: '🇳🇴', score: '2-1', team2: 'Ivory Coast', flag2: '🇨🇮', status: 'FT', info: 'Dallas Stadium' },
        { date: 'June 30', team1: 'France', flag1: '🇫🇷', score: '3-0', team2: 'Sweden', flag2: '🇸🇪', status: 'FT', info: 'New York Stadium' },
        { date: 'July 1', team1: 'Mexico', flag1: '🇲🇽', score: '2-0', team2: 'Ecuador', flag2: '🇪🇨', status: 'FT', info: 'Mexico City - Estadio Azteca' },
        { date: 'July 1', team1: 'England', flag1: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', score: '2-1', team2: 'DR Congo', flag2: '🇨🇩', status: 'FT', info: 'Atlanta Stadium' },
        { date: 'July 1', team1: 'Belgium', flag1: '🇧🇪', score: '3-2 (AET)', team2: 'Senegal', flag2: '🇸🇳', status: 'FT', info: 'Seattle Stadium' },
        { date: 'July 1', team1: 'USA', flag1: '🇺🇸', score: '2-0', team2: 'Bosnia & Herz.', flag2: '🇧🇦', status: 'FT', info: 'San Francisco Stadium' },
        { date: 'July 2', team1: 'Spain', flag1: '🇪🇸', score: '3-0', team2: 'Austria', flag2: '🇦🇹', status: 'FT', info: 'Los Angeles Stadium' },
        { date: 'July 2', team1: 'Portugal', flag1: '🇵🇹', score: '2-1', team2: 'Croatia', flag2: '🇭🇷', status: 'FT', info: 'Toronto Stadium' },
        { date: 'July 2', team1: 'Switzerland', flag1: '🇨🇭', score: '2-0', team2: 'Algeria', flag2: '🇩🇿', status: 'FT', info: 'Vancouver Stadium' },
        { date: 'July 3', team1: 'Egypt', flag1: '🇪🇬', score: '1-1 (4-2 pens)', team2: 'Australia', flag2: '🇦🇺', status: 'FT', info: 'Dallas Stadium' },
        { date: 'July 3', team1: 'Argentina', flag1: '🇦🇷', score: '3-2 (AET)', team2: 'Cape Verde', flag2: '🇨🇻', status: 'FT', info: 'Miami Stadium' },
        { date: 'July 3', team1: 'Colombia', flag1: '🇨🇴', score: '1-0', team2: 'Ghana', flag2: '🇬🇭', status: 'FT', info: 'Kansas City Stadium' }
    ],
    'Round of 16': [
        { date: 'July 4', team1: 'Morocco', flag1: '🇲🇦', score: '3-0', team2: 'Canada', flag2: '🇨🇦', status: 'FT', info: 'Houston Stadium' },
        { date: 'July 4', team1: 'France', flag1: '🇫🇷', score: '1-0', team2: 'Paraguay', flag2: '🇵🇾', status: 'FT', info: 'Philadelphia Stadium' },
        { date: 'July 5', team1: 'Norway', flag1: '🇳🇴', score: '2-1', team2: 'Brazil', flag2: '🇧🇷', status: 'FT', info: 'MetLife Stadium' },
        { date: 'July 5', team1: 'England', flag1: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', score: '3-2', team2: 'Mexico', flag2: '🇲🇽', status: 'FT', info: 'Estadio Azteca' },
        { date: 'July 6', team1: 'Spain', flag1: '🇪🇸', score: '1-0', team2: 'Portugal', flag2: '🇵🇹', status: 'FT', info: 'Arlington Stadium' },
        { date: 'July 6', team1: 'Belgium', flag1: '🇧🇪', score: '4-1', team2: 'USA', flag2: '🇺🇸', status: 'FT', info: 'Seattle Stadium' },
        { date: 'July 7', team1: 'Argentina', flag1: '🇦🇷', score: '3-2', team2: 'Egypt', flag2: '🇪🇬', status: 'FT', info: 'Atlanta Stadium' },
        { date: 'July 7', team1: 'Switzerland', flag1: '🇨🇭', score: '0-0 (4-3 pens)', team2: 'Colombia', flag2: '🇨🇴', status: 'FT', info: 'Vancouver Stadium' }
    ],
    'Quarter Finals': [
        { date: 'July 9', team1: 'France', flag1: '🇫🇷', score: '2-0', team2: 'Morocco', flag2: '🇲🇦', status: 'FT', info: 'Foxborough Stadium' },
        { date: 'July 10', team1: 'Spain', flag1: '🇪🇸', score: '2-1', team2: 'Belgium', flag2: '🇧🇪', status: 'FT', info: 'Los Angeles Stadium' },
        { date: 'July 11', team1: 'England', flag1: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', score: '2-1 (AET)', team2: 'Norway', flag2: '🇳🇴', status: 'FT', info: 'Miami Stadium' },
        { date: 'July 11', team1: 'Argentina', flag1: '🇦🇷', score: '3-1 (AET)', team2: 'Switzerland', flag2: '🇨🇭', status: 'FT', info: 'Kansas City Stadium' }
    ],
    'Semi Finals': [
        { date: 'July 14', team1: 'Spain', flag1: '🇪🇸', score: '2-0', team2: 'France', flag2: '🇫🇷', status: 'FT', info: 'Arlington Stadium' },
        { date: 'July 15', team1: 'Argentina', flag1: '🇦🇷', score: '2-1', team2: 'England', flag2: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', status: 'FT', info: 'Atlanta Stadium' }
    ],
    'Finals': [
        { date: 'July 18', team1: 'France', flag1: '🇫🇷', score: 'vs', team2: 'England', flag2: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', status: 'UPCOMING', info: 'Miami Stadium - Third Place - 5:00 PM ET' },
        { date: 'July 19', team1: 'Spain', flag1: '🇪🇸', score: 'vs', team2: 'Argentina', flag2: '🇦🇷', status: 'UPCOMING', info: 'MetLife Stadium - WORLD CUP FINAL - 3:00 PM ET' }
    ]
};

const flagsData = [
    { name: 'Algeria', flag: '🇩🇿' }, { name: 'Argentina', flag: '🇦🇷' }, { name: 'Australia', flag: '🇦🇺' },
    { name: 'Austria', flag: '🇦🇹' }, { name: 'Belgium', flag: '🇧🇪' }, { name: 'Bosnia & Herz.', flag: '🇧🇦' },
    { name: 'Brazil', flag: '🇧🇷' }, { name: 'Canada', flag: '🇨🇦' }, { name: 'Cape Verde', flag: '🇨🇻' },
    { name: 'Colombia', flag: '🇨🇴' }, { name: 'Croatia', flag: '🇭🇷' }, { name: 'Curaçao', flag: '🇨🇼' },
    { name: 'Czechia', flag: '🇨🇿' }, { name: 'DR Congo', flag: '🇨🇩' }, { name: 'Ecuador', flag: '🇪🇨' },
    { name: 'Egypt', flag: '🇪🇬' }, { name: 'England', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿' }, { name: 'France', flag: '🇫🇷' },
    { name: 'Germany', flag: '🇩🇪' }, { name: 'Ghana', flag: '🇬🇭' }, { name: 'Haiti', flag: '🇭🇹' },
    { name: 'Iran', flag: '🇮🇷' }, { name: 'Iraq', flag: '🇮🇶' }, { name: 'Ivory Coast', flag: '🇨🇮' },
    { name: 'Japan', flag: '🇯🇵' }, { name: 'Jordan', flag: '🇯🇴' }, { name: 'Mexico', flag: '🇲🇽' },
    { name: 'Morocco', flag: '🇲🇦' }, { name: 'Netherlands', flag: '🇳🇱' }, { name: 'New Zealand', flag: '🇳🇿' },
    { name: 'Norway', flag: '🇳🇴' }, { name: 'Panama', flag: '🇵🇦' }, { name: 'Paraguay', flag: '🇵🇾' },
    { name: 'Portugal', flag: '🇵🇹' }, { name: 'Qatar', flag: '🇶🇦' }, { name: 'Saudi Arabia', flag: '🇸🇦' },
    { name: 'Scotland', flag: '🏴󠁧󠁢󠁳󠁣󠁴󠁿' }, { name: 'Senegal', flag: '🇸🇳' }, { name: 'South Africa', flag: '🇿🇦' },
    { name: 'South Korea', flag: '🇰🇷' }, { name: 'Spain', flag: '🇪🇸' }, { name: 'Sweden', flag: '🇸🇪' },
    { name: 'Switzerland', flag: '🇨🇭' }, { name: 'Tunisia', flag: '🇹🇳' }, { name: 'Türkiye', flag: '🇹🇷' },
    { name: 'USA', flag: '🇺🇸' }, { name: 'Uruguay', flag: '🇺🇾' }, { name: 'Uzbekistan', flag: '🇺🇿' }
];

const prizesData = [
    { image: 'https://images.unsplash.com/photo-1612287230217-8c7c6c170b95?w=600&q=80', amount: '$50', title: 'Semi-Finalist Prediction', desc: 'Correctly predict all 4 semi-finalist teams and win $50 cash prize!', badge: 'Task 2' },
    { image: 'https://images.unsplash.com/photo-1574634534894-89d7a3f2f7c6?w=600&q=80', amount: '$500', title: 'World Cup Winner', desc: 'Pick the tournament champion correctly and take home the grand $500 prize!', badge: 'Task 2' },
    { image: 'https://images.unsplash.com/photo-1616348436168-de43ad0db179?w=600&q=80', amount: '$25', title: 'Early Bird Entry', desc: 'Complete Task 1 before July 10th and receive a $25 app credit bonus.', badge: 'Task 1' },
    { image: 'https://images.unsplash.com/photo-1606144042614-b2417e99c4e3?w=600&q=80', amount: '$100', title: 'Referral Champion', desc: 'Refer 5 friends using your locked code and earn $100 when they complete tasks.', badge: 'Both' },
    { image: 'https://images.unsplash.com/photo-1517466787929-bc90951d0974?w=600&q=80', amount: 'Jersey', title: 'Signed Jersey', desc: 'Random draw among all participants who complete both tasks. Win a signed team jersey!', badge: 'Lucky Draw' },
    { image: 'https://images.unsplash.com/photo-1605901309584-818e25960a8f?w=600&q=80', amount: 'Console', title: 'PS5 / Xbox', desc: 'One lucky winner will receive a brand new gaming console. Complete all tasks to enter!', badge: 'Mega Draw' }
];

const stadiumsData = [
    { name: 'Estadio Azteca', city: 'Mexico City, Mexico', capacity: '87,523', matches: 5, image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/47/Estadio_Azteca_%282017%29.jpg/640px-Estadio_Azteca_%282017%29.jpg' },
    { name: 'MetLife Stadium', city: 'East Rutherford, NJ, USA', capacity: '82,500', matches: 8, image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/27/MetLife_stadium_%28Aerial_view%29.jpg/640px-MetLife_stadium_%28Aerial_view%29.jpg' },
    { name: 'SoFi Stadium', city: 'Inglewood, CA, USA', capacity: '70,240', matches: 8, image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/22/SoFi_Stadium_%28Aerial_view%29.jpg/640px-SoFi_Stadium_%28Aerial_view%29.jpg' },
    { name: 'AT&T Stadium', city: 'Arlington, TX, USA', capacity: '80,000', matches: 8, image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3e/ATT_Stadium_2013.jpg/640px-ATT_Stadium_2013.jpg' },
    { name: 'Mercedes-Benz Stadium', city: 'Atlanta, GA, USA', capacity: '71,000', matches: 8, image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0c/Mercedes-Benz_Stadium_2017.jpg/640px-Mercedes-Benz_Stadium_2017.jpg' },
    { name: 'BC Place', city: 'Vancouver, Canada', capacity: '54,500', matches: 7, image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8a/BC_Place_2015_Whitecaps.jpg/640px-BC_Place_2015_Whitecaps.jpg' },
    { name: 'Hard Rock Stadium', city: 'Miami Gardens, FL, USA', capacity: '64,767', matches: 7, image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9c/Hard_Rock_Stadium_2017_2.jpg/640px-Hard_Rock_Stadium_2017_2.jpg' },
    { name: 'Gillette Stadium', city: 'Foxborough, MA, USA', capacity: '65,878', matches: 7, image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7c/Gillette_Stadium_%28Top_View%29.jpg/640px-Gillette_Stadium_%28Top_View%29.jpg' },
    { name: 'Lumen Field', city: 'Seattle, WA, USA', capacity: '69,000', matches: 6, image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0e/Lumen_Field_2011.jpg/640px-Lumen_Field_2011.jpg' },
    { name: 'BMO Field', city: 'Toronto, Canada', capacity: '30,000', matches: 6, image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3e/BMO_Field_2016_East_Stand.jpg/640px-BMO_Field_2016_East_Stand.jpg' },
    { name: "Levi's Stadium", city: 'Santa Clara, CA, USA', capacity: '68,500', matches: 6, image: "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5c/Levi%27s_Stadium_2014.jpg/640px-Levi%27s_Stadium_2014.jpg" },
    { name: 'Lincoln Financial Field', city: 'Philadelphia, PA, USA', capacity: '69,596', matches: 6, image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9c/Lincoln_Financial_Field_%28Aerial_view%29.jpg/640px-Lincoln_Financial_Field_%28Aerial_view%29.jpg' },
    { name: 'Arrowhead Stadium', city: 'Kansas City, MO, USA', capacity: '76,416', matches: 6, image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3e/Arrowhead_Stadium_2017.jpg/640px-Arrowhead_Stadium_2017.jpg' },
    { name: 'NRG Stadium', city: 'Houston, TX, USA', capacity: '72,220', matches: 6, image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6e/NRG_Stadium_2017.jpg/640px-NRG_Stadium_2017.jpg' },
    { name: 'Estadio BBVA', city: 'Monterrey, Mexico', capacity: '53,500', matches: 4, image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4e/Estadio_BBVA_Bancomer_%28Aerial_view%29.jpg/640px-Estadio_BBVA_Bancomer_%28Aerial_view%29.jpg' },
    { name: 'Estadio Akron', city: 'Guadalajara, Mexico', capacity: '49,850', matches: 4, image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2e/Estadio_Akron_%28Aerial_view%29.jpg/640px-Estadio_Akron_%28Aerial_view%29.jpg' }
];

// ==================== RENDER FUNCTIONS ====================

function renderGroups() {
    const grid = document.getElementById('groupsGrid');
    if (!grid) return;
    grid.innerHTML = '';
    Object.entries(groupsData).forEach(([group, teams]) => {
        const card = document.createElement('div');
        card.className = 'group-card';
        card.innerHTML = `
            <div class="group-header">
                <span class="group-title">Group ${group}</span>
                <span style="font-size:0.75rem;color:rgba(255,255,255,0.4)">${teams.length} Teams</span>
            </div>
            <table class="group-table">
                <thead>
                    <tr>
                        <th>Team</th>
                        <th style="text-align:center">P</th>
                        <th style="text-align:center">W</th>
                        <th style="text-align:center">D</th>
                        <th style="text-align:center">L</th>
                        <th style="text-align:center">GD</th>
                        <th style="text-align:center">Pts</th>
                    </tr>
                </thead>
                <tbody>
                    ${teams.map((team, i) => `
                        <tr style="${i < 2 ? 'background:rgba(212,175,55,0.03)' : ''}">
                            <td>
                                <div class="team-row">
                                    <span class="team-flag">${team.flag}</span>
                                    <span class="team-name">${team.name}</span>
                                    ${i < 2 ? '<span style="color:var(--gold);font-size:0.7rem">✓</span>' : ''}
                                </div>
                            </td>
                            <td style="text-align:center">${team.p}</td>
                            <td style="text-align:center" class="stat-box w">${team.w}</td>
                            <td style="text-align:center" class="stat-box d">${team.d}</td>
                            <td style="text-align:center" class="stat-box l">${team.l}</td>
                            <td style="text-align:center">${team.gf - team.ga > 0 ? '+' : ''}${team.gf - team.ga}</td>
                            <td style="text-align:center" class="points">${team.pts}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
        grid.appendChild(card);
    });
}

function renderKnockoutTabs() {
    const tabsContainer = document.getElementById('knockoutTabs');
    if (!tabsContainer) return;

    const rounds = Object.keys(knockoutData);
    tabsContainer.innerHTML = '';

    rounds.forEach((round, index) => {
        const tab = document.createElement('button');
        tab.className = 'knockout-tab' + (index === 0 ? ' active' : '');
        tab.textContent = round;
        tab.onclick = () => switchKnockoutRound(round, tab);
        tabsContainer.appendChild(tab);
    });
}

function switchKnockoutRound(round, clickedTab) {
    document.querySelectorAll('.knockout-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.knockout-round').forEach(r => r.classList.remove('active'));

    clickedTab.classList.add('active');
    const roundEl = document.getElementById('round-' + round.replace(/\s+/g, ''));
    if (roundEl) roundEl.classList.add('active');
}

function renderKnockout() {
    const container = document.getElementById('knockoutContainer');
    if (!container) return;
    container.innerHTML = '';

    Object.entries(knockoutData).forEach(([round, matches]) => {
        const roundDiv = document.createElement('div');
        roundDiv.className = 'knockout-round' + (round === 'Round of 32' ? ' active' : '');
        roundDiv.id = 'round-' + round.replace(/\s+/g, '');
        roundDiv.innerHTML = `
            <div class="knockout-grid">
                ${matches.map(match => `
                    <div class="match-card">
                        <div class="match-date">
                            ${match.date} 
                            <span class="match-status status-${match.status.toLowerCase().replace(/\s+/g, '')}">${match.status}</span>
                        </div>
                        <div class="match-teams">
                            <div class="match-team">
                                <span class="flag">${match.flag1}</span>
                                <span>${match.team1}</span>
                            </div>
                            <div class="match-score">${match.score}</div>
                            <div class="match-team">
                                <span class="flag">${match.flag2}</span>
                                <span>${match.team2}</span>
                            </div>
                        </div>
                        <div class="match-info">
                            <i class="fas fa-map-marker-alt"></i> ${match.info}
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
        container.appendChild(roundDiv);
    });
}

function renderStadiums() {
    const grid = document.getElementById('stadiumsGrid');
    if (!grid) return;
    grid.innerHTML = '';
    stadiumsData.forEach((stadium) => {
        const card = document.createElement('div');
        card.className = 'stadium-card';
        card.innerHTML = `
            <img src="${stadium.image}" alt="${stadium.name}" loading="lazy" onerror="this.style.display='none'; this.parentElement.style.background='linear-gradient(135deg, #1a1a3e, #0a0a1a)'">
            <span class="stadium-capacity"><i class="fas fa-users"></i> ${stadium.capacity}</span>
            <div class="stadium-overlay">
                <div class="stadium-name">${stadium.name}</div>
                <div class="stadium-location"><i class="fas fa-map-pin"></i> ${stadium.city}</div>
                <div style="margin-top:0.5rem;font-size:0.8rem;color:var(--gold)"><i class="fas fa-futbol"></i> ${stadium.matches} Matches</div>
            </div>
        `;
        grid.appendChild(card);
    });
}

function renderFlags() {
    const grid = document.getElementById('flagsGrid');
    if (!grid) return;
    grid.innerHTML = '';
    flagsData.forEach(country => {
        const item = document.createElement('div');
        item.className = 'flag-item';
        item.innerHTML = `
            <span class="flag-emoji">${country.flag}</span>
            <span class="flag-name">${country.name}</span>
        `;
        grid.appendChild(item);
    });
}

function renderPrizes() {
    const grid = document.getElementById('prizesGrid');
    if (!grid) return;
    grid.innerHTML = '';
    prizesData.forEach((prize) => {
        const card = document.createElement('div');
        card.className = 'prize-card';
        card.innerHTML = `
            <img src="${prize.image}" alt="${prize.title}" class="prize-image" loading="lazy" onerror="this.style.display='none'">
            <div class="prize-content">
                <div class="prize-amount">${prize.amount}</div>
                <div class="prize-title">${prize.title}</div>
                <div class="prize-desc">${prize.desc}</div>
                <span class="prize-badge">${prize.badge}</span>
            </div>
        `;
        grid.appendChild(card);
    });
}

// ==================== PARTICLES ====================

function createParticles() {
    const container = document.getElementById('particles');
    if (!container) return;
    for (let i = 0; i < 30; i++) {
        const particle = document.createElement('div');
        particle.className = 'particle';
        particle.style.left = Math.random() * 100 + '%';
        particle.style.animationDelay = Math.random() * 15 + 's';
        particle.style.animationDuration = (10 + Math.random() * 10) + 's';
        particle.style.width = (3 + Math.random() * 5) + 'px';
        particle.style.height = particle.style.width;
        container.appendChild(particle);
    }
}

// ==================== TOAST ====================

function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const icon = type === 'success' ? 'fa-check-circle' : type === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle';
    toast.innerHTML = `<i class="fas ${icon}"></i> ${message}`;
    container.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 400);
    }, 4000);
}

// ==================== SCROLL ====================

function handleScroll() {
    const navbar = document.getElementById('navbar');
    if (navbar) {
        if (window.scrollY > 50) navbar.classList.add('scrolled');
        else navbar.classList.remove('scrolled');
    }
}

// ==================== INIT ====================

document.addEventListener('DOMContentLoaded', () => {
    captureReferralCode();
    loadState();
    loadLogo();
    createParticles();
    renderGroups();
    renderKnockoutTabs();
    renderKnockout();
    renderStadiums();
    renderFlags();
    renderPrizes();
    handleScroll();
    window.addEventListener('scroll', handleScroll);

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeAuthModal();
    });

    const authModal = document.getElementById('authModal');
    if (authModal) {
        authModal.addEventListener('click', (e) => {
            if (e.target === e.currentTarget) closeAuthModal();
        });
    }
});
