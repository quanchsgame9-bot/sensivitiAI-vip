/* ==========================================================================
   DUY LỢI DISRILE APP - CORE LOGIC
   ========================================================================== */

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyApQfKUe6lbA7_VY1NacJdTdz4lnesAFI4",
  authDomain: "ultralock-key.firebaseapp.com",
  databaseURL: "https://ultralock-key-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "ultralock-key",
  storageBucket: "ultralock-key.firebasestorage.app",
  messagingSenderId: "1055844200853",
  appId: "1:1055844200853:web:1ec19a4982f3b074ae069c"
};

document.addEventListener("DOMContentLoaded", () => {

  const DB_PATH = {
    keys: 'headlock/keys',
    features: 'headlock/features',        // Bảo trì từng chức năng
    customCode: 'headlock/custom_code',   // Code admin ép vào
    settings: 'headlock/settings'
  };
  const STORAGE_SESSION = 'duyloi_session';
  const STORAGE_DEVICE = 'duyloi_device';
  const STORAGE_FEATURES = 'duyloi_features';

  // ========== DANH SÁCH CHỨC NĂNG PREMIUM ==========
  const DEFAULT_FEATURES = [
    { id: 'aimlock', name: 'AIMLOCK PREMIUM' },
    { id: 'headlock', name: 'HEADLOCK PREMIUM' },
    { id: 'nhetam', name: 'NHẸ TÂM PREMIUM' },
    { id: 'aimdrag', name: 'AIMDRAG PREMIUM' },
    { id: 'aimhold', name: 'AIM HOLD PREMIUM' },
    { id: 'sensilock', name: 'SENSILOCK PREMIUM' },
    { id: 'autofire', name: 'AUTO FIRE PREMIUM' },
    { id: 'norecoil', name: 'NO RECOIL PREMIUM' },
    { id: 'bostram', name: 'BOST RAM PREMIUM' },
    { id: 'cpu', name: 'CPU TUNER PREMIUM' },
    { id: 'gpu', name: 'GPU BOOST PREMIUM' },
    { id: 'network', name: 'NETWORK PREMIUM' },
    { id: 'dpi', name: 'DPI BOOST PREMIUM' },
    { id: 'touch', name: 'TOUCH BOOST PREMIUM' }
  ];

  let FEATURES = [...DEFAULT_FEATURES];
  let maintenanceFeatures = {};   // { featureId: { active, message } }
  let customCode = {};             // { featureId: "code..." }

  let currentTab = 'main';
  let featureState = {};
  let selectedGameScheme = "freefire://";
  let selectedGamePkg = "com.dts.freefireth";
  let audioCtx = null;
  let db = null;
  let currentSession = null;

  const $ = id => document.getElementById(id);

  // ========== BONG BÓNG CAM ==========
  function createBubbles() {
    const container = $('bubbles');
    if (!container) return;
    for (let i = 0; i < 25; i++) {
      const bubble = document.createElement('div');
      bubble.className = 'bubble';
      const size = Math.random() * 40 + 15;
      bubble.style.width = size + 'px';
      bubble.style.height = size + 'px';
      bubble.style.left = Math.random() * 100 + '%';
      bubble.style.animationDuration = (Math.random() * 15 + 12) + 's';
      bubble.style.animationDelay = (Math.random() * 15) + 's';
      container.appendChild(bubble);
    }
  }

  function getDeviceId() {
    let id = localStorage.getItem(STORAGE_DEVICE);
    if (!id) {
      let hash = 0;
      const base = navigator.userAgent + screen.width + screen.height + Date.now();
      for (let i = 0; i < base.length; i++) hash = ((hash << 5) - hash) + base.charCodeAt(i);
      id = 'DEV-' + Math.abs(hash).toString(16).toUpperCase().padStart(8, '0');
      localStorage.setItem(STORAGE_DEVICE, id);
    }
    return id;
  }
  const DEVICE_ID = getDeviceId();

  function initFirebase() {
    try {
      if (typeof firebase === 'undefined') return false;
      firebase.initializeApp(FIREBASE_CONFIG);
      db = firebase.database();
      return true;
    } catch (e) { return false; }
  }

  // ========== LOADING ==========
  function runLoading() {
    const steps = [
      'ĐANG TẢI CẤU HÌNH...',
      'ĐANG KẾT NỐI SERVER...',
      'ĐANG TỐI ƯU HỆ THỐNG...',
      'HOÀN TẤT!'
    ];
    let progress = 0, stepIdx = 0;
    const interval = setInterval(() => {
      progress += Math.random() * 15 + 5;
      if (progress > 100) progress = 100;
      $('loadingBar').style.width = progress + '%';
      const newIdx = Math.floor((progress / 100) * steps.length);
      if (newIdx !== stepIdx && newIdx < steps.length) {
        stepIdx = newIdx;
        $('loadingText').textContent = steps[stepIdx];
      }
      if (progress >= 100) {
        clearInterval(interval);
        setTimeout(() => {
          $('loadingScreen').classList.add('hide');
          $('appContainer').style.display = 'flex';
          setTimeout(() => { $('loadingScreen').style.display = 'none'; }, 600);
          showWelcomePopup();
        }, 400);
      }
    }, 200);
  }

  // ========== WELCOME POPUP ==========
  function showWelcomePopup() {
    $('welcomeOverlay').classList.add('show');
  }

  $('btn-welcome-ok').addEventListener('click', () => {
    $('welcomeOverlay').classList.remove('show');
    playBeep();
    // Load dữ liệu từ Firebase rồi auto-login
    listenFeaturesConfig(() => {
      listenCustomCode(() => {
        checkAutoLogin();
      });
    });
  });

  // ========== LISTEN CẤU HÌNH CHỨC NĂNG (BẢO TRÌ) ==========
  function listenFeaturesConfig(callback) {
    if (!db) { if (callback) callback(); return; }
    db.ref(DB_PATH.features).on('value', snap => {
      maintenanceFeatures = snap.val() || {};
      renderMenu();
      if (callback) { const cb = callback; callback = null; cb(); }
    }, () => { if (callback) { const cb = callback; callback = null; cb(); } });
  }

  // ========== LISTEN CUSTOM CODE ==========
  function listenCustomCode(callback) {
    if (!db) { if (callback) callback(); return; }
    db.ref(DB_PATH.customCode).on('value', snap => {
      customCode = snap.val() || {};
      if (callback) { const cb = callback; callback = null; cb(); }
    }, () => { if (callback) { const cb = callback; callback = null; cb(); } });
  }

  // ========== AUTO LOGIN ==========
  function checkAutoLogin() {
    try {
      const sess = JSON.parse(localStorage.getItem(STORAGE_SESSION) || 'null');
      if (!sess || !sess.key) return;
      if (!db) {
        if (sess.key === 'DUYLOIFILE' || sess.key === 'TEST') { currentSession = sess; switchToMenu(); }
        return;
      }
      db.ref(DB_PATH.keys + '/' + sess.key).once('value').then(snap => {
        const data = snap.val();
        if (!data || data.active === false) { localStorage.removeItem(STORAGE_SESSION); return; }
        if (data.expireAt && data.expireAt < Date.now()) {
          localStorage.removeItem(STORAGE_SESSION);
          return;
        }
        currentSession = sess;
        switchToMenu();
      });
    } catch (e) {}
  }

  // ========== LOGIN (CHỈ KEY - KHÔNG CẦN TÊN) ==========
  $('btn-submit-login').addEventListener('click', () => {
    const val = $('input-key').value.trim().toUpperCase();
    if (!val) { showToast('⚠️ Nhập key!', 'off'); return; }

    const btn = $('btn-submit-login');
    btn.textContent = '⏳ ...';
    btn.disabled = true;

    if (!db) {
      if (val === 'DUYLOIFILE' || val === 'TEST') {
        saveSession(val, null);
        btn.textContent = '⚔️ ĐĂNG NHẬP ⚔️'; btn.disabled = false;
        switchToMenu();
        showToast('💀 OK!', 'on');
      } else {
        btn.textContent = '⚔️ ĐĂNG NHẬP ⚔️'; btn.disabled = false;
        showToast('☠ Key không tồn tại!', 'off');
      }
      return;
    }

    db.ref(DB_PATH.keys + '/' + val).once('value').then(snap => {
      const data = snap.val();
      btn.textContent = '⚔️ ĐĂNG NHẬP ⚔️';
      btn.disabled = false;

      if (!data) { showToast('☠ Key không tồn tại!', 'off'); return; }
      if (data.active === false) { showToast('☠ Key đã bị xoá!', 'off'); return; }
      if (data.expireAt && data.expireAt < Date.now()) { showToast('☠ Key đã hết hạn!', 'off'); return; }

      const devices = data.devices || {};
      const deviceLimit = data.deviceLimit || 1;
      if (!devices[DEVICE_ID] && Object.keys(devices).length >= deviceLimit) {
        showToast('☠ Đã đạt giới hạn ' + deviceLimit + ' thiết bị!', 'off');
        return;
      }

      devices[DEVICE_ID] = {
        activatedAt: devices[DEVICE_ID]?.activatedAt || Date.now(),
        lastLogin: Date.now()
      };
      db.ref(DB_PATH.keys + '/' + val).update({ devices });

      saveSession(val, data.expireAt);
      currentSession = { key: val, expireAt: data.expireAt };
      switchToMenu();
      showToast('💀 Chào mừng!', 'on');
    }).catch(() => {
      btn.textContent = '⚔️ ĐĂNG NHẬP ⚔️';
      btn.disabled = false;
      showToast('⚠️ Lỗi kết nối!', 'off');
    });
  });

  $('input-key').addEventListener('keypress', e => { if (e.key === 'Enter') $('btn-submit-login').click(); });

  function saveSession(key, expireAt) {
    localStorage.setItem(STORAGE_SESSION, JSON.stringify({
      key, deviceId: DEVICE_ID, loginAt: Date.now(), expireAt
    }));
  }

  function switchToMenu() {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    $('view-menu').classList.add('active');
    if (currentSession) {
      $('user-key-display').textContent = currentSession.key;
      $('user-expire').textContent = currentSession.expireAt
        ? 'Hạn: ' + new Date(currentSession.expireAt).toLocaleDateString('vi-VN')
        : 'Hạn: Vĩnh viễn';
    }
    loadFeatureState();
    renderMenu();
  }

  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      currentTab = btn.dataset.tab;
      $('tab-' + currentTab).classList.add('active');
      $('master-controls').style.display = (currentTab === 'main') ? 'flex' : 'none';
      playBeep();
    });
  });

  // ========== RENDER MENU (CÓ BẢO TRÌ TỪNG CHỨC NĂNG) ==========
  function renderMenu() {
    const listEl = $('menu-list-main');
    listEl.innerHTML = '';

    FEATURES.forEach(f => {
      const isOn = featureState[f.id] === true;
      const maint = maintenanceFeatures[f.id] || {};
      const isMaint = maint.active === true;

      const div = document.createElement('div');
      div.className = 'menu-item' + (isOn && !isMaint ? ' active' : '') + (isMaint ? ' maintenance' : '');
      div.innerHTML = `
        <span class="item-name">${f.name}${isMaint ? ' <span style="color:#ff4444;font-size:11px;">[BẢO TRÌ]</span>' : ''}</span>
        <label class="switch">
          <input type="checkbox" ${isOn ? 'checked' : ''} ${isMaint ? 'disabled' : ''}>
          <span class="slider"></span>
        </label>
      `;

      if (isMaint) {
        div.style.opacity = '0.5';
        div.style.cursor = 'not-allowed';
        div.addEventListener('click', (e) => {
          e.stopPropagation();
          showCenterPopup('🚧', 'CHỨC NĂNG ĐANG BẢO TRÌ', '#ff4444');
          showToast('🚧 ' + (maint.message || 'Đang bảo trì!'), 'off');
        });
      } else {
        const cb = div.querySelector('input');
        div.addEventListener('click', (e) => {
          if (e.target.closest('.switch')) return;
          cb.checked = !cb.checked;
          cb.dispatchEvent(new Event('change'));
        });
        cb.addEventListener('change', (e) => {
          e.stopPropagation();
          handleToggle(f, cb.checked);
        });
      }

      listEl.appendChild(div);
    });
  }

  // ========== CENTER POPUP ==========
  let centerPopupTimer = null;
  function showCenterPopup(icon, text, color) {
    const popup = $('centerPopup');
    $('center-icon').textContent = icon;
    $('center-text').textContent = text;
    popup.classList.add('show');
    clearTimeout(centerPopupTimer);
    centerPopupTimer = setTimeout(() => {
      popup.classList.remove('show');
    }, 1800);
  }

  function handleToggle(feature, isOn) {
    featureState[feature.id] = isOn;
    saveFeatureState();
    playBeep(); vibrate(30);

    if (!isOn) {
      showCenterPopup('⛔', feature.name + ' ĐÃ TẮT', '#ff4444');
      return;
    }

    // Chạy custom code nếu admin ép vào
    runCustomCode(feature.id);

    if (feature.id === 'headlock') {
      showCenterPopup('💀', 'HEADLOCK PREMIUM', '#ff8800');
      $('overlay-game').classList.add('show');
    } else if (['bostram', 'cpu', 'gpu', 'network'].includes(feature.id)) {
      showCenterPopup('⚡', feature.name, '#ff8800');
      runTerminal(feature.name, ['$ Initializing...', '$ Optimizing...', '$ DONE!']);
    } else {
      showCenterPopup('🔥', feature.name, '#ff8800');
    }
  }

  // ========== CHẠY CUSTOM CODE TỪ ADMIN ==========
  function runCustomCode(featureId) {
    const code = customCode[featureId];
    if (!code || !code.code) return;
    try {
      // Chạy code admin ép vào (mô phỏng log)
      console.log('[CUSTOM CODE]', featureId, ':', code.code);
      // Nếu code là hàm, chạy thử
      // new Function(code.code)();
    } catch (e) {
      console.error('Custom code error:', e);
    }
  }

  function loadFeatureState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_FEATURES) || '{}');
      FEATURES.forEach(f => { featureState[f.id] = saved[f.id] === true; });
    } catch (e) {}
  }

  function saveFeatureState() {
    localStorage.setItem(STORAGE_FEATURES, JSON.stringify(featureState));
  }

  function runTerminal(title, logs, callback) {
    $('terminal-title').textContent = '🩸 ' + title;
    const overlay = $('overlay-terminal');
    const content = $('terminal-content');
    overlay.classList.add('show');
    content.innerHTML = '';
    let i = 0;
    function next() {
      if (i < logs.length) {
        const line = document.createElement('div');
        line.className = 'terminal-line';
        line.textContent = logs[i];
        content.appendChild(line);
        content.scrollTop = content.scrollHeight;
        i++;
        setTimeout(next, 250);
      } else {
        setTimeout(() => {
          overlay.classList.remove('show');
          if (typeof callback === 'function') callback();
        }, 400);
      }
    }
    next();
}

  // ========== AI ==========
  // ========== AI PHÂN TÍCH 6 DÒNG ĐỘ NHẠY + NÚT BẮN ==========
$('btn-analyze').addEventListener('click', () => {
    const device = $('device-model').value.trim();
    if (!device) { showToast('⚠️ Nhập tên máy!', 'off'); return; }
    playBeep(); vibrate(30);

    const clean = device.toLowerCase();
    let general, reddot, scope2x, scope4x, snip, scope6x, button, reason;

    // === 6 DÒNG ĐỘ NHẠY FF + NÚT BẮN ===
    if (clean.includes('iphone') || clean.includes('ipad') || clean.includes('ios') || clean.includes('apple')) {
      general = Math.floor(172 + Math.random() * 6);
      reddot  = Math.floor(180 + Math.random() * 5);
      scope2x = Math.floor(184 + Math.random() * 4);
      scope4x = Math.floor(176 + Math.random() * 4);
      snip    = Math.floor(108 + Math.random() * 6);
      scope6x = Math.floor(168 + Math.random() * 5);
      button  = Math.floor(38 + Math.random() * 4);
      reason  = '🔹 iOS tần số quét cao. Range 168-190 kéo tâm mượt, chống rung lố khi vuốt nhanh.';
    } 
    else if (clean.includes('rog') || clean.includes('magic') || clean.includes('shark') || clean.includes('gaming')) {
      general = Math.floor(196 + Math.random() * 4);
      reddot  = Math.floor(194 + Math.random() * 4);
      scope2x = Math.floor(192 + Math.random() * 4);
      scope4x = Math.floor(188 + Math.random() * 4);
      snip    = Math.floor(132 + Math.random() * 6);
      scope6x = Math.floor(180 + Math.random() * 5);
      button  = Math.floor(44 + Math.random() * 3);
      reason  = '🔹 Gaming phone phần cứng mạnh. Nhạy sát 200 + nút bắn 45% kéo tâm cực nhanh.';
    } 
    else if (clean.includes('samsung') || clean.includes('galaxy')) {
      general = 200;
      reddot  = Math.floor(192 + Math.random() * 5);
      scope2x = Math.floor(190 + Math.random() * 4);
      scope4x = Math.floor(186 + Math.random() * 4);
      snip    = Math.floor(122 + Math.random() * 6);
      scope6x = Math.floor(178 + Math.random() * 5);
      button  = Math.floor(44 + Math.random() * 3);
      reason  = '🔹 Samsung tối ưu: khóa nhìn quanh 200, DPI cao triệt tiêu độ trễ.';
    } 
    else if (clean.includes('xiaomi') || clean.includes('poco') || clean.includes('redmi') || clean.includes('snapdragon')) {
      general = Math.floor(188 + Math.random() * 5);
      reddot  = Math.floor(184 + Math.random() * 4);
      scope2x = Math.floor(182 + Math.random() * 4);
      scope4x = Math.floor(178 + Math.random() * 4);
      snip    = Math.floor(112 + Math.random() * 6);
      scope6x = Math.floor(172 + Math.random() * 5);
      button  = Math.floor(44 + Math.random() * 3);
      reason  = '🔹 Snapdragon/MIUI mượt. Range 172-190 cân bằng các ống ngắm.';
    } 
    else if (clean.includes('oppo') || clean.includes('realme') || clean.includes('oneplus')) {
      general = Math.floor(186 + Math.random() * 5);
      reddot  = Math.floor(182 + Math.random() * 4);
      scope2x = Math.floor(180 + Math.random() * 4);
      scope4x = Math.floor(176 + Math.random() * 4);
      snip    = Math.floor(110 + Math.random() * 6);
      scope6x = Math.floor(170 + Math.random() * 5);
      button  = Math.floor(43 + Math.random() * 3);
      reason  = '🔹 ColorOS/OxygenOS tối ưu cảm ứng tốt. Nhạy 176-190 mượt.';
    } 
    else if (clean.includes('vivo') || clean.includes('iqoo')) {
      general = Math.floor(184 + Math.random() * 5);
      reddot  = Math.floor(180 + Math.random() * 4);
      scope2x = Math.floor(178 + Math.random() * 4);
      scope4x = Math.floor(174 + Math.random() * 4);
      snip    = Math.floor(108 + Math.random() * 6);
      scope6x = Math.floor(168 + Math.random() * 5);
      button  = Math.floor(42 + Math.random() * 3);
      reason  = '🔹 Vivo/iQOO cảm ứng nhạy. Range 168-186 phù hợp đa dạng ống ngắm.';
    } 
    else {
      general = Math.floor(182 + Math.random() * 6);
      reddot  = Math.floor(178 + Math.random() * 5);
      scope2x = Math.floor(176 + Math.random() * 4);
      scope4x = Math.floor(172 + Math.random() * 4);
      snip    = Math.floor(106 + Math.random() * 6);
      scope6x = Math.floor(166 + Math.random() * 5);
      button  = Math.floor(42 + Math.random() * 3);
      reason  = '🔹 Android phổ thông. Range 166-186 phù hợp tầm trung.';
    }

    // Hiển thị 6 dòng + nút bắn
    $('result-device').textContent = '🔹 ' + device.toUpperCase();
    $('val-general').textContent = general;
    $('val-reddot').textContent = reddot;
    $('val-scope2x').textContent = scope2x;
    $('val-scope4x').textContent = scope4x;
    $('val-snip').textContent = snip;
    $('val-scope6x').textContent = scope6x;
    $('val-button').textContent = button + '%';
    $('reason-text').textContent = reason;
    
    showCenterPopup('🧠', 'AI ĐÃ PHÂN TÍCH 6 DÒNG', '#ff8800');
});

  // ========== MASTER ==========
  $('master-on').addEventListener('click', () => {
    playBeep(); vibrate([50, 30, 50]);
    
    // Bật tất cả chức năng không bảo trì
    FEATURES.forEach(f => {
      const maint = maintenanceFeatures[f.id] || {};
      if (maint.active !== true) featureState[f.id] = true;
    });
    saveFeatureState();
    renderMenu();
    
    // Chạy terminal rồi hiện chọn game
    runTerminal('💀 BẬT TẤT CẢ PREMIUM', [
      '$ Initializing FULL ENGINE...',
      '$ Loading AIMLOCK module...',
      '$ Loading HEADLOCK module...',
      '$ Tuning CPU & GPU...',
      '$ Optimizing RAM & Network...',
      '$ All systems ready!',
      '$ Opening game selector...'
    ], function() {
      // Sau khi terminal xong → hiện popup chọn game
      showCenterPopup('⚔️', 'CHỌN GAME ĐỂ VÀO', '#ff8800');
      setTimeout(function() {
        $('overlay-game').classList.add('show');
      }, 600);
    });
});

  $('master-off').addEventListener('click', () => {
    playBeep(); vibrate([50, 30, 50]);
    FEATURES.forEach(f => { featureState[f.id] = false; });
    saveFeatureState();
    renderMenu();
    $('overlay-game').classList.remove('show');
    $('overlay-terminal').classList.remove('show');
    showCenterPopup('☠', 'ĐÃ TẮT TẤT CẢ', '#ff4444');
  });

  document.querySelectorAll('.game-card').forEach(card => {
    card.addEventListener('click', () => {
      document.querySelectorAll('.game-card').forEach(c => c.classList.remove('active-card'));
      card.classList.add('active-card');
      selectedGameScheme = card.dataset.game;
      selectedGamePkg = card.dataset.pkg;
      playBeep();
    });
  });

  // ========== VÀO GAME (KHÔNG VÀO APP STORE) ==========
  $('btn-headlock-success').addEventListener('click', () => {
    playBeep(); vibrate([50, 30, 50]);
    $('overlay-game').classList.remove('show');

    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const gameName = selectedGamePkg === 'com.dts.freefiremax' ? 'Free Fire Max' : 'Free Fire';

    if (isIOS) {
      // iOS: chỉ thử mở game, KHÔNG vào App Store
      const startTime = Date.now();
      try {
        window.location.href = selectedGameScheme;
      } catch (e) {}

      // Kiểm tra sau 2s: nếu vẫn ở app (không chuyển sang game) → báo chưa cài
      setTimeout(() => {
        if (Date.now() - startTime < 3000 && !document.hidden) {
          showCenterPopup('❌', 'GAME CHƯA CÀI ĐẶT', '#ff4444');
          showToast('❌ ' + gameName + ' chưa được cài!', 'off');
        }
      }, 2000);
    } else {
      // Android: dùng intent, KHÔNG fallback sang CH Play
      try {
        window.location.href = 'intent://#Intent;package=' + selectedGamePkg + ';end';
      } catch (e) {
        showToast('❌ ' + gameName + ' chưa được cài!', 'off');
      }

      // Sau 2s nếu vẫn ở app → báo chưa cài
      setTimeout(() => {
        if (!document.hidden) {
          showCenterPopup('❌', 'GAME CHƯA CÀI ĐẶT', '#ff4444');
          showToast('❌ ' + gameName + ' chưa được cài!', 'off');
        }
      }, 2000);
    }
  });

  $('btn-headlock-turnoff').addEventListener('click', () => {
    $('overlay-game').classList.remove('show');
    featureState['headlock'] = false;
    saveFeatureState(); renderMenu();
  });

  $('btn-logout').addEventListener('click', () => {
    if (confirm('Đăng xuất?')) {
      localStorage.removeItem(STORAGE_SESSION);
      currentSession = null;
      document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
      $('view-login').classList.add('active');
      $('input-key').value = '';
    }
  });

  function updateClock() {
    const n = new Date();
    $('clock').textContent = String(n.getHours()).padStart(2,'0') + ':' + String(n.getMinutes()).padStart(2,'0');
  }
  setInterval(updateClock, 1000); updateClock();

  if (navigator.getBattery) {
    navigator.getBattery().then(b => { $('batteryLevel').textContent = Math.round(b.level * 100); });
  }

  function playBeep() {
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.connect(g); g.connect(audioCtx.destination);
      o.frequency.value = 660; o.type = 'sine'; g.gain.value = 0.06;
      o.start(); o.stop(audioCtx.currentTime + 0.08);
    } catch (e) {}
  }

  function vibrate(p) { if (navigator.vibrate) navigator.vibrate(p); }

  let toastTimer = null;
  function showToast(msg, type) {
    let t = $('global-toast');
    if (!t) { t = document.createElement('div'); t.id = 'global-toast'; document.body.appendChild(t); }
    t.textContent = msg;
    t.style.borderColor = type === 'off' ? '#ff4444' : '#ff8800';
    t.style.transform = 'translateX(-50%) translateY(0)';
    t.style.opacity = '1';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      t.style.transform = 'translateX(-50%) translateY(80px)';
      t.style.opacity = '0';
    }, 2000);
  }

  // ========== INIT ==========
  createBubbles();
  const fbOK = initFirebase();
  console.log('☁️ Firebase:', fbOK ? 'OK' : 'Offline');
  runLoading();
});