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
let task2Data = { semiFinalists: [], winner: '', code: '', codeLocked: false };

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
    if (progressEl) progressEl.textContent = Math.min(count, 5) + '/5';
}

// ==================== SHARE BUTTONS ====================
function setupShareButtons(user) {
    const link = user.referralLink || getReferralLink(user);
    const shareText = 'Join me on Fans for the 2026 FIFA World Cup! Predict, compete, and win prizes. Use my link to sign up:';
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
                    title: 'Fans - 2026 FIFA World Cup',
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
    if (task2Data.semiFinalists.length === 4) t2Progress++;
    if (task2Data.winner) t2Progress++;
    if (task2Data.codeLocked) t2Progress++;
    const t2Bar = document.getElementById('task2Progress');
    const t2Text = document.getElementById('task2ProgressText');
    const t2Btn = document.getElementById('task2Btn');
    const t2Completed = document.getElementById('task2Completed');

    if (t2Bar) t2Bar.style.width = (t2Progress / 3 * 100) + '%';
    if (t2Text) t2Text.textContent = t2Progress + '/3 steps';
    if (t2Progress === 3) {
        if (t2Btn) t2Btn.style.display = 'none';
        if (t2Completed) t2Completed.style.display = 'flex';
    } else {
        if (t2Btn) t2Btn.style.display = 'inline-flex';
        if (t2Completed) t2Completed.style.display = 'none';
    }

    // Stats
    const tasksCompleted = document.getElementById('tasksCompleted');
    const prizesWon = document.getElementById('prizesWon');
    const teamsSelected = document.getElementById('teamsSelected');
    const referralCount = document.getElementById('referralCount');

    if (tasksCompleted) tasksCompleted.textContent = (t1Progress === 3 ? 1 : 0) + (t2Progress === 3 ? 1 : 0) + '/2';
    if (prizesWon) prizesWon.textContent = '$' + ((t1Progress === 3 ? 10 : 0) + (t2Progress === 3 ? 50 : 0));
    if (teamsSelected) teamsSelected.textContent = task2Data.semiFinalists.length;
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

    populateCountryGrid('semiFinalistsGrid', task2Data.semiFinalists, 'semi');
    populateCountryGrid('winnerGrid', task2Data.winner ? [task2Data.winner] : [], 'winner');

    const semiCount = document.getElementById('semiCount');
    const semiError = document.getElementById('semiError');
    if (semiCount) semiCount.textContent = task2Data.semiFinalists.length;
    if (semiError) semiError.style.display = task2Data.semiFinalists.length === 4 ? 'none' : 'block';

    const winnerSelected = document.getElementById('winnerSelected');
    if (winnerSelected) winnerSelected.textContent = task2Data.winner || 'None';

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

function populateCountryGrid(gridId, selected, mode) {
    const grid = document.getElementById(gridId);
    if (!grid) return;
    grid.innerHTML = '';
    flagsData.forEach(c => {
        const item = document.createElement('div');
        item.className = 'country-select-item';
        if (selected.includes(c.name)) item.classList.add('selected');
        item.innerHTML = `
            <span class="flag">${c.flag}</span>
            <span class="name">${c.name}</span>
            <span class="check"><i class="fas fa-check-circle"></i></span>
        `;
        item.onclick = () => selectCountry(c.name, mode, item);
        grid.appendChild(item);
    });
}

function selectCountry(name, mode, element) {
    if (mode === 'semi') {
        const idx = task2Data.semiFinalists.indexOf(name);
        if (idx > -1) {
            task2Data.semiFinalists.splice(idx, 1);
            element.classList.remove('selected');
        } else if (task2Data.semiFinalists.length < 4) {
            task2Data.semiFinalists.push(name);
            element.classList.add('selected');
        } else {
            showToast('You can only select 4 teams!', 'error');
            return;
        }
        const semiCount = document.getElementById('semiCount');
        const semiError = document.getElementById('semiError');
        if (semiCount) semiCount.textContent = task2Data.semiFinalists.length;
        if (semiError) semiError.style.display = task2Data.semiFinalists.length === 4 ? 'none' : 'block';
    } else {
        document.querySelectorAll('#winnerGrid .country-select-item').forEach(el => el.classList.remove('selected'));
        task2Data.winner = name;
        element.classList.add('selected');
        const winnerSelected = document.getElementById('winnerSelected');
        if (winnerSelected) winnerSelected.textContent = name;
    }
    saveState();
    checkT2Complete();
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
    const complete = task2Data.semiFinalists.length === 4 && task2Data.winner && task2Data.codeLocked;
    if (btn) btn.disabled = !complete;
}

function confirmTask2() {
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
