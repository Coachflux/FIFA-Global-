// ==================== FIREBASE CONFIG ====================
// Must match index.html so both pages share the same project/users collection.
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
    console.log("Firebase demo mode");
}

// ==================== STATE ====================
let currentUser = null;
let task1Data = { step1: false, step2: false, step3: false, team: '', regInfo: '' };
let task2Data = { 
    thirdPlace: { france: '', england: '' }, 
    finals: { spain: '', argentina: '' }, 
    address: '', 
    addressLocked: false,
    addressSubmittedAt: null,
    code: '', 
    codeLocked: false,
    submitted: false
};

const flagsData = [
    { name: 'Argentina', flag: '🇦🇷' }, { name: 'Australia', flag: '🇦🇺' }, { name: 'Austria', flag: '🇦🇹' },
    { name: 'Belgium', flag: '🇧🇪' }, { name: 'Bosnia & Herz.', flag: '🇧🇦' }, { name: 'Brazil', flag: '🇧🇷' },
    { name: 'Canada', flag: '🇨🇦' }, { name: 'Cape Verde', flag: '🇨🇻' }, { name: 'Colombia', flag: '🇨🇴' },
    { name: 'Croatia', flag: '🇭🇷' }, { name: 'Czechia', flag: '🇨🇿' }, { name: 'DR Congo', flag: '🇨🇩' },
    { name: 'Ecuador', flag: '🇪🇨' }, { name: 'Egypt', flag: '🇪🇬' }, { name: 'England', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿' },
    { name: 'France', flag: '🇫🇷' }, { name: 'Germany', flag: '🇩🇪' }, { name: 'Ghana', flag: '🇬🇭' },
    { name: 'Haiti', flag: '🇭🇹' }, { name: 'Iran', flag: '🇮🇷' }, { name: 'Iraq', flag: '🇮🇶' },
    { name: 'Ivory Coast', flag: '🇨🇮' }, { name: 'Japan', flag: '🇯🇵' }, { name: 'Mexico', flag: '🇲🇽' },
    { name: 'Morocco', flag: '🇲🇦' }, { name: 'Netherlands', flag: '🇳🇱' }, { name: 'New Zealand', flag: '🇳🇿' },
    { name: 'Norway', flag: '🇳🇴' }, { name: 'Panama', flag: '🇵🇦' }, { name: 'Paraguay', flag: '🇵🇾' },
    { name: 'Portugal', flag: '🇵🇹' }, { name: 'Qatar', flag: '🇶🇦' }, { name: 'Saudi Arabia', flag: '🇸🇦' },
    { name: 'Scotland', flag: '🏴󠁧󠁢󠁳󠁣󠁴󠁿' }, { name: 'Senegal', flag: '🇸🇳' }, { name: 'South Africa', flag: '🇿🇦' },
    { name: 'South Korea', flag: '🇰🇷' }, { name: 'Spain', flag: '🇪🇸' }, { name: 'Sweden', flag: '🇸🇪' },
    { name: 'Switzerland', flag: '🇨🇭' }, { name: 'Tunisia', flag: '🇹🇳' }, { name: 'USA', flag: '🇺🇸' },
    { name: 'Uruguay', flag: '🇺🇾' }, { name: 'Uzbekistan', flag: '🇺🇿' }
];

const prizesData = [
    { image: 'https://images.unsplash.com/photo-1612287230217-8c7c6c170b95?w=600&q=80', amount: '$50', title: 'Semi-Finalist Prediction', desc: 'Correctly predict all 4 semi-finalist teams and win $50 cash prize!', badge: 'Task 2' },
    { image: 'https://images.unsplash.com/photo-1574634534894-89d7a3f2f7c6?w=600&q=80', amount: '$500', title: 'World Cup Winner', desc: 'Pick the tournament champion correctly and take home the grand $500 prize!', badge: 'Task 2' },
    { image: 'https://images.unsplash.com/photo-1616348436168-de43ad0db179?w=600&q=80', amount: '$25', title: 'Early Bird Entry', desc: 'Complete Task 1 before July 10th and receive a $25 app credit bonus.', badge: 'Task 1' },
    { image: 'https://images.unsplash.com/photo-1606144042614-b2417e99c4e3?w=600&q=80', amount: '$100', title: 'Referral Champion', desc: 'Refer 5 friends using your locked code and earn $100 when they complete tasks.', badge: 'Both' },
    { image: 'https://images.unsplash.com/photo-1517466787929-bc90951d0974?w=600&q=80', amount: 'Jersey', title: 'Signed Jersey', desc: 'Random draw among all participants who complete both tasks. Win a signed team jersey!', badge: 'Lucky Draw' },
    { image: 'https://images.unsplash.com/photo-1605901309584-818e25960a8f?w=600&q=80', amount: 'Console', title: 'PS5 / Xbox', desc: 'One lucky winner will receive a brand new gaming console. Complete all tasks to enter!', badge: 'Mega Draw' }
];

// ==================== REFERRAL HELPERS ====================
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
    const base = window.location.origin + window.location.pathname.replace(/dashboard\.html$/, '');
    const baseUrl = base.endsWith('/') ? base : base + '/';
    const code = user.referralCode || generateReferralCode(user.uid);
    return baseUrl + 'index.html?ref=' + encodeURIComponent(code);
}

// ==================== AUTH & INIT (Firestore) ====================
let saveTimer = null;
let userDocUnsub = null;

function loadState() {
    if (!auth) {
        window.location.href = 'index.html';
        return;
    }
    auth.onAuthStateChanged(async (fbUser) => {
        if (!fbUser) {
            window.location.href = 'index.html';
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

            // Load task progress from Firestore (merge with defaults)
            if (data.task1) task1Data = Object.assign(task1Data, data.task1);
            if (data.task2) task2Data = Object.assign(task2Data, data.task2);

            updateUI(currentUser);
            updateDashboard();

            // Live updates for referral count from Firestore
            if (db && userDocUnsub) { try { userDocUnsub(); } catch(e) {} }
            if (db) {
                userDocUnsub = db.collection('users').doc(fbUser.uid)
                    .onSnapshot(snap => {
                        if (!snap.exists) return;
                        const d = snap.data() || {};
                        if (typeof d.referralCount === 'number') {
                            currentUser.referralCount = d.referralCount;
                            updateReferralStats(currentUser);
                            const el = document.getElementById('referralCount');
                            if (el) el.textContent = d.referralCount;
                        }
                        // Also sync task data if changed elsewhere
                        if (d.task1) {
                            task1Data = Object.assign(task1Data, d.task1);
                            updateDashboard();
                        }
                        if (d.task2) {
                            task2Data = Object.assign(task2Data, d.task2);
                            updateDashboard();
                        }
                    }, err => console.log('User snapshot skipped:', err.message));
            }
        } catch (e) {
            console.log('Dashboard load skipped:', e.message);
        }
    });
}

// Persist task1/task2 progress to Firestore (debounced to coalesce rapid clicks).
// NEVER writes referralCount — that field is only incremented by new signups via index.js
function saveState() {
    if (!db || !currentUser || !currentUser.uid) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
        db.collection('users').doc(currentUser.uid).set({
            task1: task1Data,
            task2: task2Data,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true }).catch(e => console.log('Task save skipped:', e.message));
    }, 300);
}

function updateUI(user) {
    if (!user) return;
    const avatar = document.getElementById('userAvatar');
    const name = document.getElementById('userName');
    const dashName = document.getElementById('dashUserName');

    if (avatar) {
        avatar.src = user.photoURL || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(user.displayName || 'User') + '&background=d4af37&color=fff';
        avatar.style.display = 'block';
    }
    if (name) {
        name.textContent = user.displayName || user.email;
        name.style.display = 'inline';
    }
    if (dashName) dashName.textContent = user.displayName || 'Fan';

    // Update referral section
    const refCodeDisplay = document.getElementById('referralCodeDisplay');
    const refLinkInput = document.getElementById('referralLinkInput');
    const refCount = document.getElementById('referralCount');

    if (refCodeDisplay) refCodeDisplay.textContent = user.referralCode || '—';
    if (refLinkInput) refLinkInput.value = user.referralLink || getReferralLink(user);
    if (refCount) refCount.textContent = user.referralCount || 0;

    setupShareButtons(user);
    updateReferralStats(user);
}

function updateReferralStats(user) {
    const count = user.referralCount || 0;
    const totalEl = document.getElementById('totalReferrals');
    const successEl = document.getElementById('successfulReferrals');
    const progressEl = document.getElementById('referralProgress');

    if (totalEl) totalEl.textContent = count;
    if (successEl) successEl.textContent = count;
    if (progressEl) progressEl.textContent = Math.min(count, 10) + '/10';
}

// ==================== SHARE BUTTONS ====================
function setupShareButtons(user) {
    const link = user.referralLink || getReferralLink(user);
     
    let logoUrl = 'kimi-fans.png'; // ←
    const heroLogo = document.getElementById('heroLogo');
    if (heroLogo && heroLogo.src) {
        logoUrl = heroLogo.src;
    }
  
    const shareText = 'Join me on KIMI Fans for the 2026 FIFA World Cup! Predict, compete, and win prizes. Use my link to sign up:';
    const fullText = shareText + ' ' + link;

    const wa = document.getElementById('shareWhatsapp');
    if (wa) wa.href = 'https://wa.me/?text=' + encodeURIComponent(fullText);

    const fb = document.getElementById('shareFacebook');
    if (fb) fb.href = 'https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(link) + '&quote=' + encodeURIComponent(shareText);

    const tw = document.getElementById('shareTwitter');
    if (tw) tw.href = 'https://twitter.com/intent/tweet?text=' + encodeURIComponent(shareText) + '&url=' + encodeURIComponent(link);

    const tg = document.getElementById('shareTelegram');
    if (tg) tg.href = 'https://t.me/share/url?url=' + encodeURIComponent(link) + '&text=' + encodeURIComponent(shareText);

    const copyBtn = document.getElementById('copyLinkBtn');
    if (copyBtn) {
        copyBtn.onclick = function(e) {
            e.preventDefault();
            copyToClipboard(link);
        };
    }

    const nativeBtn = document.getElementById('nativeShareBtn');
    if (nativeBtn) {
        nativeBtn.onclick = function(e) {
            e.preventDefault();
            if (navigator.share) {
                navigator.share({
                    title: 'KIMI - 2026 FIFA World Cup',
                    text: shareText,
                    url: link
                }).catch(function(err) {});
            } else {
                copyToClipboard(link);
            }
        };
    }
}

function copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function() {
            showToast('Referral link copied to clipboard!', 'success');
        }).catch(function() {
            fallbackCopy(text);
        });
    } else {
        fallbackCopy(text);
    }
}

function fallbackCopy(text) {
    const input = document.getElementById('referralLinkInput');
    if (input) {
        input.select();
        input.setSelectionRange(0, 99999);
        try {
            document.execCommand('copy');
            showToast('Referral link copied!', 'success');
        } catch(e) {
            showToast('Could not copy. Please copy manually.', 'error');
        }
    }
}

function logout() {
    if (userDocUnsub) { try { userDocUnsub(); } catch(e) {} userDocUnsub = null; }
    const done = () => { window.location.href = 'index.html'; };
    if (auth) auth.signOut().then(done).catch(done);
    else done();
}

// ==================== DASHBOARD ====================
function updateDashboard() {
    if (!currentUser) return;

    // Task 1 progress
    let t1Progress = 0;
    if (task1Data.step1) t1Progress++;
    if (task1Data.step2) t1Progress++;
    if (task1Data.step3) t1Progress++;
    const t1Bar = document.getElementById('task1Progress');
    const t1Text = document.getElementById('task1ProgressText');
    const t1Btn = document.getElementById('task1Btn');
    const t1Completed = document.getElementById('task1Completed');

    if (t1Bar) t1Bar.style.width = (t1Progress / 3 * 100) + '%';
    if (t1Text) t1Text.textContent = t1Progress + '/3 steps';
    if (t1Progress === 3) {
        if (t1Btn) t1Btn.style.display = 'none';
        if (t1Completed) t1Completed.style.display = 'flex';
    } else {
        if (t1Btn) t1Btn.style.display = 'inline-flex';
        if (t1Completed) t1Completed.style.display = 'none';
    }

    // Task 2 progress
    let t2Progress = 0;
    if (task2Data.thirdPlace.france !== '' && task2Data.thirdPlace.england !== '') t2Progress++;
    if (task2Data.finals.spain !== '' && task2Data.finals.argentina !== '') t2Progress++;
    if (task2Data.address && task2Data.addressLocked) t2Progress++;
    if (task2Data.codeLocked) t2Progress++;
    const t2Bar = document.getElementById('task2Progress');
    const t2Text = document.getElementById('task2ProgressText');
    const t2Btn = document.getElementById('task2Btn');
    const t2Completed = document.getElementById('task2Completed');
    const t2PermNotice = document.getElementById('task2PermanentNotice');

    if (t2Bar) t2Bar.style.width = (t2Progress / 4 * 100) + '%';
    if (t2Text) t2Text.textContent = t2Progress + '/4 steps';
    if (t2Progress === 4) {
        if (t2Btn) t2Btn.style.display = 'none';
        if (t2Completed) t2Completed.style.display = 'flex';
        if (t2PermNotice) t2PermNotice.style.display = 'block';
    } else {
        if (t2Btn) t2Btn.style.display = 'inline-flex';
        if (t2Completed) t2Completed.style.display = 'none';
        if (t2PermNotice) t2PermNotice.style.display = task2Data.submitted ? 'block' : 'none';
    }

    // Stats
    const tasksCompleted = document.getElementById('tasksCompleted');
    const prizesWon = document.getElementById('prizesWon');
    const teamsSelected = document.getElementById('teamsSelected');
    const referralCount = document.getElementById('referralCount');

    if (tasksCompleted) tasksCompleted.textContent = (t1Progress === 3 ? 1 : 0) + (t2Progress === 4 ? 1 : 0) + '/2';
    if (prizesWon) prizesWon.textContent = '$' + ((t1Progress === 3 ? 10 : 0) + (t2Progress === 4 ? 50 : 0));
    if (teamsSelected) teamsSelected.textContent = '0';
    if (referralCount) referralCount.textContent = currentUser.referralCount || 0;

    updateReferralStats(currentUser);
}

// ==================== TASK 1 ====================
function openTask1Modal() {
    const modal = document.getElementById('task1Modal');
    if (modal) {
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    const select = document.getElementById('t1TeamSelect');
    if (select) {
        // Preserve current selection
        const currentVal = task1Data.team || '';
        select.innerHTML = '<option value="">Select a team...</option>';
        flagsData.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c.name;
            opt.textContent = c.flag + ' ' + c.name;
            if (c.name === currentVal) opt.selected = true;
            select.appendChild(opt);
        });
    }

    // Reset step indicators
    const s1 = document.getElementById('t1Step1Success');
    const s2 = document.getElementById('t1Step2Success');
    const s3 = document.getElementById('t1Step3Success');
    const regInput = document.getElementById('t1RegInput');

    if (s1) s1.style.display = task1Data.step1 ? 'block' : 'none';
    if (s2) s2.style.display = task1Data.step2 ? 'block' : 'none';
    if (s3) s3.style.display = task1Data.step3 ? 'block' : 'none';
    if (regInput && task1Data.regInfo) regInput.value = task1Data.regInfo;

    checkT1Complete();
}

function closeTask1Modal() {
    const modal = document.getElementById('task1Modal');
    if (modal) modal.classList.remove('active');
    document.body.style.overflow = '';
}

function completeT1Step1() {
    task1Data.step1 = true;
    const s1 = document.getElementById('t1Step1Success');
    if (s1) s1.style.display = 'block';
    checkT1Complete();
    saveState();
    showToast('Step 1 completed!', 'success');
}

function checkT1Step2() {
    const select = document.getElementById('t1TeamSelect');
    if (!select) return;
    const val = select.value;
    if (val) {
        task1Data.step2 = true;
        task1Data.team = val;
        const s2 = document.getElementById('t1Step2Success');
        if (s2) s2.style.display = 'block';
        checkT1Complete();
        saveState();
    }
}

function checkT1Step3() {
    const input = document.getElementById('t1RegInput');
    if (!input) return;
    const val = input.value.trim();
    if (val.length >= 5) {
        task1Data.step3 = true;
        task1Data.regInfo = val;
        const s3 = document.getElementById('t1Step3Success');
        if (s3) s3.style.display = 'block';
        checkT1Complete();
        saveState();
    }
}

function checkT1Complete() {
    const btn = document.getElementById('t1ConfirmBtn');
    if (btn) btn.disabled = !(task1Data.step1 && task1Data.step2 && task1Data.step3);
}

function confirmTask1() {
    saveState();
    closeTask1Modal();
    updateDashboard();
    showToast('Task 1 completed! You earned $10 entry bonus!', 'success');
    createConfetti();
}

// ==================== TASK 2 ====================
function openTask2Modal() {
    const modal = document.getElementById('task2Modal');
    if (modal) {
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    // Step 1: Third Place scores
    const franceInput = document.getElementById('t2FranceScore');
    const englandInput = document.getElementById('t2EnglandScore');
    if (franceInput) franceInput.value = task2Data.thirdPlace.france || '';
    if (englandInput) englandInput.value = task2Data.thirdPlace.england || '';
    const s1 = document.getElementById('t2Step1Success');
    if (s1) s1.style.display = (task2Data.thirdPlace.france !== '' && task2Data.thirdPlace.england !== '') ? 'block' : 'none';

    // Step 2: Finals scores
    const spainInput = document.getElementById('t2SpainScore');
    const argentinaInput = document.getElementById('t2ArgentinaScore');
    if (spainInput) spainInput.value = task2Data.finals.spain || '';
    if (argentinaInput) argentinaInput.value = task2Data.finals.argentina || '';
    const s2 = document.getElementById('t2Step2Success');
    if (s2) s2.style.display = (task2Data.finals.spain !== '' && task2Data.finals.argentina !== '') ? 'block' : 'none';

    // Step 3: Address
    const addressInput = document.getElementById('t2AddressInput');
    const addressLockedDisplay = document.getElementById('addressLockedDisplay');
    const permanentAddress = document.getElementById('permanentAddress');
    const addressLockTimer = document.getElementById('addressLockTimer');
    const s3 = document.getElementById('t2Step3Success');

    const now = Date.now();
    const threeDays = 3 * 24 * 60 * 60 * 1000;
    const isAddressLocked = task2Data.addressLocked && task2Data.addressSubmittedAt && (now - task2Data.addressSubmittedAt < threeDays);

    if (isAddressLocked) {
        if (addressInput) addressInput.style.display = 'none';
        if (addressLockedDisplay) addressLockedDisplay.style.display = 'block';
        if (permanentAddress) permanentAddress.textContent = task2Data.address;
        if (addressLockTimer) {
            const remaining = threeDays - (now - task2Data.addressSubmittedAt);
            const hours = Math.ceil(remaining / (60 * 60 * 1000));
            addressLockTimer.innerHTML = '<i class="fas fa-lock"></i> Locked for ' + hours + ' more hour' + (hours === 1 ? '' : 's');
        }
        if (s3) s3.style.display = 'block';
    } else {
        if (addressInput) {
            addressInput.style.display = 'block';
            addressInput.value = task2Data.address || '';
        }
        if (addressLockedDisplay) addressLockedDisplay.style.display = 'none';
        if (s3) s3.style.display = task2Data.addressLocked ? 'block' : 'none';
        // If lock expired, allow editing
        if (task2Data.addressLocked && task2Data.addressSubmittedAt && (now - task2Data.addressSubmittedAt >= threeDays)) {
            task2Data.addressLocked = false;
            task2Data.addressSubmittedAt = null;
            saveState();
        }
    }

    // Step 4: Referral Code
    const codeInput = document.getElementById('t2CodeInput');
    const confirmDialog = document.getElementById('codeConfirmDialog');
    const permDisplay = document.getElementById('permanentCodeDisplay');
    const permCode = document.getElementById('permanentCode');

    if (task2Data.codeLocked) {
        if (codeInput) codeInput.style.display = 'none';
        if (confirmDialog) confirmDialog.style.display = 'none';
        if (permDisplay) permDisplay.style.display = 'block';
        if (permCode) permCode.textContent = task2Data.code;
    } else {
        if (codeInput) {
            codeInput.style.display = 'block';
            codeInput.value = task2Data.code || '';
        }
        if (confirmDialog) confirmDialog.style.display = 'none';
        if (permDisplay) permDisplay.style.display = 'none';
    }

    checkT2Complete();
}

function closeTask2Modal() {
    const modal = document.getElementById('task2Modal');
    if (modal) modal.classList.remove('active');
    document.body.style.overflow = '';
}

function checkT2Step1() {
    const france = document.getElementById('t2FranceScore');
    const england = document.getElementById('t2EnglandScore');
    if (!france || !england) return;
    const fVal = france.value.trim();
    const eVal = england.value.trim();
    if (fVal !== '' && eVal !== '' && !isNaN(fVal) && !isNaN(eVal) && parseInt(fVal) >= 0 && parseInt(eVal) >= 0) {
        task2Data.thirdPlace.france = fVal;
        task2Data.thirdPlace.england = eVal;
        const s1 = document.getElementById('t2Step1Success');
        if (s1) s1.style.display = 'block';
        saveState();
        checkT2Complete();
    }
}

function checkT2Step2() {
    const spain = document.getElementById('t2SpainScore');
    const argentina = document.getElementById('t2ArgentinaScore');
    if (!spain || !argentina) return;
    const sVal = spain.value.trim();
    const aVal = argentina.value.trim();
    if (sVal !== '' && aVal !== '' && !isNaN(sVal) && !isNaN(aVal) && parseInt(sVal) >= 0 && parseInt(aVal) >= 0) {
        task2Data.finals.spain = sVal;
        task2Data.finals.argentina = aVal;
        const s2 = document.getElementById('t2Step2Success');
        if (s2) s2.style.display = 'block';
        saveState();
        checkT2Complete();
    }
}

function checkT2Step3() {
    const input = document.getElementById('t2AddressInput');
    if (!input) return;
    const val = input.value.trim();
    // Address must be at least 15 characters to be valid
    if (val.length >= 15) {
        task2Data.address = val;
        task2Data.addressLocked = true;
        task2Data.addressSubmittedAt = Date.now();
        const s3 = document.getElementById('t2Step3Success');
        const addressInput = document.getElementById('t2AddressInput');
        const addressLockedDisplay = document.getElementById('addressLockedDisplay');
        const permanentAddress = document.getElementById('permanentAddress');
        const addressLockTimer = document.getElementById('addressLockTimer');
        if (s3) s3.style.display = 'block';
        if (addressInput) addressInput.style.display = 'none';
        if (addressLockedDisplay) addressLockedDisplay.style.display = 'block';
        if (permanentAddress) permanentAddress.textContent = val;
        if (addressLockTimer) addressLockTimer.innerHTML = '<i class="fas fa-lock"></i> Locked for 72 hours';
        saveState();
        checkT2Complete();
        showToast('Address saved and locked for 3 days!', 'success');
    }
}

function cancelCodeConfirm() {
    const confirmDialog = document.getElementById('codeConfirmDialog');
    const codeInput = document.getElementById('t2CodeInput');
    if (confirmDialog) confirmDialog.style.display = 'none';
    if (codeInput) codeInput.value = '';
}

function confirmCode() {
    const codeInput = document.getElementById('t2CodeInput');
    const code = codeInput ? codeInput.value.trim() : '';
    if (!code) return;

    task2Data.code = code;
    task2Data.codeLocked = true;
    saveState();

    const codeInputEl = document.getElementById('t2CodeInput');
    const confirmDialog = document.getElementById('codeConfirmDialog');
    const permDisplay = document.getElementById('permanentCodeDisplay');
    const permCode = document.getElementById('permanentCode');

    if (codeInputEl) codeInputEl.style.display = 'none';
    if (confirmDialog) confirmDialog.style.display = 'none';
    if (permDisplay) permDisplay.style.display = 'block';
    if (permCode) permCode.textContent = code;

    showToast('Referral code locked permanently!', 'success');
    checkT2Complete();
}

function checkT2Complete() {
    const btn = document.getElementById('t2ConfirmBtn');
    const complete = task2Data.thirdPlace.france !== '' && task2Data.thirdPlace.england !== '' &&
                     task2Data.finals.spain !== '' && task2Data.finals.argentina !== '' &&
                     task2Data.address && task2Data.addressLocked &&
                     task2Data.codeLocked;
    if (btn) btn.disabled = !complete;
}

function confirmTask2() {
    task2Data.submitted = true;
    saveState();
    closeTask2Modal();
    updateDashboard();
    showToast('Task 2 submitted! You are entered to win $50!', 'success');
    createConfetti();
}

// ==================== PRIZES ====================
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

// ==================== CONFETTI ====================
function createConfetti() {
    const colors = ['#d4af37', '#e94560', '#34a853', '#f4d03f', '#667eea', '#fff'];
    for (let i = 0; i < 60; i++) {
        const confetti = document.createElement('div');
        confetti.className = 'confetti';
        confetti.style.left = Math.random() * 100 + 'vw';
        confetti.style.background = colors[Math.floor(Math.random() * colors.length)];
        confetti.style.borderRadius = Math.random() > 0.5 ? '50%' : '0';
        confetti.style.width = (5 + Math.random() * 8) + 'px';
        confetti.style.height = (5 + Math.random() * 8) + 'px';
        confetti.style.animationDuration = (2 + Math.random() * 2) + 's';
        document.body.appendChild(confetti);
        setTimeout(() => confetti.remove(), 4000);
    }
}

// ==================== MOBILE MENU ====================
function toggleMobileMenu() {
    document.getElementById('navLinks').classList.toggle('active');
}

// ==================== INIT ====================
document.addEventListener('DOMContentLoaded', () => {
    // Setup Task 2 code input blur handler
    const t2CodeInput = document.getElementById('t2CodeInput');
    if (t2CodeInput) {
        t2CodeInput.addEventListener('blur', function() {
            const val = this.value.trim();
            if (val && !task2Data.codeLocked) {
                const confirmDialog = document.getElementById('codeConfirmDialog');
                const confirmCodeText = document.getElementById('confirmCodeText');
                if (confirmDialog) confirmDialog.style.display = 'block';
                if (confirmCodeText) confirmCodeText.textContent = val;
            }
        });
    }

    loadState();
    renderPrizes();

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeTask1Modal();
            closeTask2Modal();
        }
    });

    ['task1Modal', 'task2Modal'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('click', (e) => {
                if (e.target === e.currentTarget) {
                    if (id === 'task1Modal') closeTask1Modal();
                    if (id === 'task2Modal') closeTask2Modal();
                }
            });
        }
    });
});
