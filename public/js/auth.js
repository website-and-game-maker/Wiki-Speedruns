/* Firebase Auth + Firestore. Loaded lazily from the CDN; the whole app works without it
 * (runs are always kept locally), login just adds cloud sync and the daily leaderboard. */
(function (root) {
  const WS = (root.WS = root.WS || {});
  const U = WS.util;
  const SDK = 'https://www.gstatic.com/firebasejs/12.3.0/';

  const FB = (WS.fb = { enabled: false, user: null, profile: null, error: null });
  const listeners = new Set();
  let m = {}; // loaded SDK functions
  let auth, db;

  FB.onChange = (fn) => {
    listeners.add(fn);
    return () => listeners.delete(fn);
  };
  const emit = () => listeners.forEach((fn) => { try { fn(FB.user, FB.profile); } catch (e) { console.error(e); } });

  async function loadConfig() {
    const c = root.WS_FIREBASE_CONFIG;
    if (c && c.apiKey) return { ...c };
    if (!/^https?:$/.test(location.protocol)) return null;
    try {
      // Firebase Hosting serves the project's web config here.
      const res = await fetch('/__/firebase/init.json', { cache: 'no-store' });
      if (res.ok && (res.headers.get('content-type') || '').includes('json')) return await res.json();
    } catch (e) { /* not on Firebase Hosting */ }
    return null;
  }

  FB.ready = (async () => {
    const cfg = await loadConfig();
    if (!cfg) return false;
    // Serve the auth handler from our own domain so sign-in works with third-party cookies blocked.
    if (/\.(web\.app|firebaseapp\.com)$/.test(location.hostname)) cfg.authDomain = location.hostname;
    const [app, a, f] = await Promise.all([
      import(SDK + 'firebase-app.js'),
      import(SDK + 'firebase-auth.js'),
      import(SDK + 'firebase-firestore.js'),
    ]);
    m = { ...app, ...a, ...f };
    const fbApp = m.initializeApp(cfg);
    auth = m.getAuth(fbApp);
    db = m.getFirestore(fbApp);
    FB.enabled = true;
    m.getRedirectResult(auth).catch((e) => U.toast(friendly(e), 'bad'));
    await new Promise((resolve) => {
      let first = true;
      m.onAuthStateChanged(auth, async (user) => {
        FB.user = user;
        FB.profile = null;
        if (user) {
          try {
            FB.profile = await ensureProfile(user);
          } catch (e) {
            console.warn('profile', e);
            FB.profile = { displayName: displayNameFor(user), photoURL: user.photoURL || null };
          }
        }
        emit();
        if (first) {
          first = false;
          resolve();
        }
      });
    });
    return true;
  })().catch((e) => {
    console.warn('Firebase unavailable:', e);
    FB.error = e;
    return false;
  });

  function displayNameFor(user) {
    if (user.displayName) return user.displayName.slice(0, 32);
    if (user.email) return user.email.split('@')[0].slice(0, 32);
    return 'Guest ' + user.uid.slice(0, 4).toUpperCase();
  }

  async function ensureProfile(user) {
    const ref = m.doc(db, 'users', user.uid);
    const snap = await m.getDoc(ref);
    if (snap.exists()) return snap.data();
    const profile = {
      displayName: displayNameFor(user),
      photoURL: user.photoURL || null,
      guest: user.isAnonymous,
      createdAt: m.serverTimestamp(),
    };
    await m.setDoc(ref, profile);
    return profile;
  }

  function friendly(e) {
    const code = (e && e.code) || '';
    const map = {
      'auth/popup-closed-by-user': 'Sign-in cancelled.',
      'auth/cancelled-popup-request': 'Sign-in cancelled.',
      'auth/invalid-credential': 'Wrong email or password.',
      'auth/wrong-password': 'Wrong email or password.',
      'auth/user-not-found': 'No account with that email.',
      'auth/email-already-in-use': 'That email already has an account — sign in instead.',
      'auth/weak-password': 'Password must be at least 6 characters.',
      'auth/invalid-email': 'That email address looks wrong.',
      'auth/operation-not-allowed': 'This sign-in method is not enabled in the Firebase console.',
      'auth/unauthorized-domain': 'This domain is not authorized for sign-in (add it in Firebase → Auth → Settings).',
      'auth/network-request-failed': 'Network error — check your connection.',
      'auth/too-many-requests': 'Too many attempts. Try again later.',
      'auth/admin-restricted-operation': 'Guest sign-in is not enabled in the Firebase console.',
    };
    return map[code] || (e && e.message) || 'Something went wrong.';
  }
  FB.friendly = friendly;

  async function need() {
    const ok = await FB.ready;
    if (!ok) throw new Error('Login is not configured for this copy of WikiSpeedruns.');
  }

  FB.signInGoogle = async () => {
    await need();
    const provider = new m.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    const cur = auth.currentUser;
    try {
      // Upgrading a guest keeps their history.
      if (cur && cur.isAnonymous) {
        try {
          await m.linkWithPopup(cur, provider);
          await m.updateDoc(m.doc(db, 'users', cur.uid), { guest: false, displayName: displayNameFor(auth.currentUser), photoURL: auth.currentUser.photoURL || null });
          FB.profile = (await m.getDoc(m.doc(db, 'users', cur.uid))).data();
          emit();
          return;
        } catch (e) {
          if (e.code !== 'auth/credential-already-in-use') throw e;
          const cred = m.GoogleAuthProvider.credentialFromError(e);
          if (cred) return void (await m.signInWithCredential(auth, cred));
        }
      }
      if (U.isStandalone()) return void (await m.signInWithRedirect(auth, provider));
      await m.signInWithPopup(auth, provider);
    } catch (e) {
      if (e.code === 'auth/popup-blocked') return void (await m.signInWithRedirect(auth, provider));
      throw new Error(friendly(e));
    }
  };

  FB.signInEmail = async (email, password, create) => {
    await need();
    try {
      if (create) {
        const cur = auth.currentUser;
        if (cur && cur.isAnonymous) {
          await m.linkWithCredential(cur, m.EmailAuthProvider.credential(email, password));
          await m.updateDoc(m.doc(db, 'users', cur.uid), { guest: false, displayName: email.split('@')[0].slice(0, 32) });
          FB.profile = (await m.getDoc(m.doc(db, 'users', cur.uid))).data();
          emit();
        } else {
          await m.createUserWithEmailAndPassword(auth, email, password);
        }
      } else {
        await m.signInWithEmailAndPassword(auth, email, password);
      }
    } catch (e) {
      throw new Error(friendly(e));
    }
  };

  FB.resetPassword = async (email) => {
    await need();
    try {
      await m.sendPasswordResetEmail(auth, email);
    } catch (e) {
      throw new Error(friendly(e));
    }
  };

  FB.signInGuest = async () => {
    await need();
    try {
      await m.signInAnonymously(auth);
    } catch (e) {
      throw new Error(friendly(e));
    }
  };

  FB.signOut = async () => {
    await need();
    await m.signOut(auth);
  };

  FB.setDisplayName = async (name) => {
    await need();
    name = String(name).trim().slice(0, 32);
    if (!name) throw new Error('Name cannot be empty.');
    await m.updateDoc(m.doc(db, 'users', FB.user.uid), { displayName: name });
    try { await m.updateProfile(FB.user, { displayName: name }); } catch (e) { /* guest accounts */ }
    FB.profile = { ...FB.profile, displayName: name };
    emit();
  };

  // ---------------- Runs & leaderboard ----------------

  const clean = (run) => JSON.parse(JSON.stringify(run)); // drop undefined

  FB.saveRun = async (run) => {
    if (!(await FB.ready) || !FB.user) return false;
    await m.setDoc(m.doc(db, 'users', FB.user.uid, 'runs', run.id), clean(run));
    return true;
  };

  FB.myRuns = async (max = 200) => {
    if (!(await FB.ready) || !FB.user) return [];
    const q = m.query(m.collection(db, 'users', FB.user.uid, 'runs'), m.orderBy('createdAt', 'desc'), m.limit(max));
    const snap = await m.getDocs(q);
    return snap.docs.map((d) => d.data());
  };

  FB.deleteRun = async (id) => {
    if (!(await FB.ready) || !FB.user) return;
    await m.deleteDoc(m.doc(db, 'users', FB.user.uid, 'runs', id));
  };

  /** First attempt of the day goes on the board. Returns 'ok' | 'exists' | 'offline'. */
  FB.submitDaily = async (dateKey, run) => {
    if (!(await FB.ready) || !FB.user) return 'offline';
    const ref = m.doc(db, 'daily', dateKey, 'entries', FB.user.uid);
    const entry = {
      uid: FB.user.uid,
      displayName: (FB.profile && FB.profile.displayName) || displayNameFor(FB.user),
      photoURL: (FB.profile && FB.profile.photoURL) || null,
      finished: !!run.finished,
      path: run.path.map((p) => p.title).slice(0, 500),
      optimal: run.optimal ?? null,
      runId: run.id,
      createdAt: m.serverTimestamp(),
    };
    // Unfinished runs leave clicks/timeMs out entirely, so orderBy() skips them on the board.
    if (run.finished) {
      entry.clicks = run.clicks;
      entry.timeMs = Math.round(run.timeMs);
    }
    try {
      await m.runTransaction(db, async (tx) => {
        const snap = await tx.get(ref);
        if (snap.exists()) throw Object.assign(new Error('exists'), { code: 'exists' });
        tx.set(ref, entry);
      });
      return 'ok';
    } catch (e) {
      if (e.code === 'exists') return 'exists';
      console.warn('daily submit', e);
      return 'error';
    }
  };

  FB.myDailyEntry = async (dateKey) => {
    if (!(await FB.ready) || !FB.user) return null;
    const snap = await m.getDoc(m.doc(db, 'daily', dateKey, 'entries', FB.user.uid));
    return snap.exists() ? snap.data() : null;
  };

  FB.leaderboard = async (dateKey, by = 'time', max = 100) => {
    if (!(await FB.ready)) return null;
    const col = m.collection(db, 'daily', dateKey, 'entries');
    const q = by === 'clicks'
      ? m.query(col, m.orderBy('clicks'), m.orderBy('timeMs'), m.limit(max))
      : m.query(col, m.orderBy('timeMs'), m.limit(max));
    const snap = await m.getDocs(q);
    return snap.docs.map((d) => d.data());
  };

  FB.dailyCount = async (dateKey) => {
    if (!(await FB.ready)) return null;
    try {
      const snap = await m.getCountFromServer(m.collection(db, 'daily', dateKey, 'entries'));
      return snap.data().count;
    } catch (e) {
      return null;
    }
  };
})(window);
