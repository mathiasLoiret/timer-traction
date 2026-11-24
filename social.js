// =====================================================================
// Timer traction — mode en ligne (facultatif)
// Comptes (code à 6 chiffres par email), envoi manuel des entraînements, rapatriement à la
// connexion, page Amis (classement de la semaine, fil d'activité, fiche d'un ami).
//
// Principes :
//  - Le local (tt.history) reste la source de vérité : rien ici ne supprime ni n'écrase une
//    séance locale. Le réseau n'est jamais sur le chemin d'enregistrement d'une séance.
//  - Si supabase-js ou le serveur ne répondent pas, l'app marche en local comme avant.
//  - Les données des autres (pseudos…) sont toujours échappées (escapeHtml).
//
// Le cœur (index.html) appelle : init(TT), renderFriends(el), renderRecap(el),
// renderHomeStatus(el), workoutActions(workout).
// =====================================================================
(() => {
  'use strict';
  const CFG = window.TT_CONFIG || {};
  const AVATARS = ['💪', '🦍', '🐒', '🦇', '🔥', '⚡', '🏋️', '🧗', '🦁', '🐺', '🐻', '🦊', '🐢', '🚀', '🥷', '🤸'];

  let TT = null;   // API du cœur (index.html)
  let sb = null;   // client Supabase
  const st = {
    lib: 'idle',            // 'idle' | 'loading' | 'ready' | 'unavailable'
    user: null,             // utilisateur Supabase connecté
    profile: null,          // { id, pseudo, avatar } — null = pas (encore) de profil
    profileChecked: false,  // profil déjà cherché pour cet utilisateur
    published: {},          // { idEntraînement: { sig, retired } } (copie de tt.published)
    busy: new Set(),        // entraînements en cours d'envoi / de retrait
    social: null,           // cache { at, me, leaderboard, feed } (tt.socialCache)
    socialErr: null,        // dernière erreur de chargement du classement/fil
    loadingSocial: false,
    lastSocialTry: 0,
    pulling: false,
  };
  const log = (tag, ...a) => console.info(`[${tag}]`, ...a);
  const fail = (tag, ...a) => console.error(`[${tag}]`, ...a);
  const esc = s => TT.escapeHtml(s == null ? '' : s);
  const $ = id => document.getElementById(id);
  const isMember = () => !!(st.user && st.profile);
  const sigOf = ids => ids.slice().sort().join(',');

  // ---------- Initialisation ----------
  function init(api) {
    TT = api;
    const p = TT.store.get('tt.published', {});
    st.published = p && typeof p === 'object' && !Array.isArray(p) ? p : {};
    st.social = TT.store.get('tt.socialCache', null);
    document.addEventListener('click', onClick);
    loadLib();
  }

  const savePublished = () => TT.store.set('tt.published', st.published);

  // Charge supabase-js depuis le CDN (version épinglée dans config.js), sans bloquer l'app
  function loadLib() {
    if (!CFG.supabaseUrl || !CFG.supabaseKey) { st.lib = 'unavailable'; return; }
    if (window.supabase && window.supabase.createClient) return createClient();
    st.lib = 'loading';
    const s = document.createElement('script');
    s.src = CFG.supabaseJs;
    s.async = true;
    const timeout = setTimeout(() => unavailable('délai dépassé'), 15000);
    s.onload = () => { clearTimeout(timeout); createClient(); };
    s.onerror = () => { clearTimeout(timeout); unavailable('script non chargé'); };
    document.head.appendChild(s);
  }

  function unavailable(why) {
    if (st.lib === 'ready') return;
    fail('auth', 'mode en ligne indisponible :', why);
    st.lib = 'unavailable';
    rerender();
  }

  function createClient() {
    try {
      sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
      });
    } catch (e) { return unavailable(e.message); }
    st.lib = 'ready';
    // Ne pas appeler Supabase directement dans ce rappel (risque de blocage) : setTimeout
    sb.auth.onAuthStateChange((event, session) => setTimeout(() => onAuth(event, session), 0));
    rerender();
  }

  async function onAuth(event, session) {
    const user = session ? session.user : null;
    const changed = (user && user.id) !== (st.user && st.user.id);
    st.user = user;
    if (!user) { st.profile = null; st.profileChecked = false; rerender(); return; }
    if (changed) {
      st.profile = null;
      st.profileChecked = false;
      log('auth', 'connecté·e', event);
      await afterLogin();
    }
  }

  // Après connexion : vérifie à qui sont les données locales, charge le profil, rapatrie
  async function afterLogin() {
    const owner = TT.store.get('tt.owner', null);
    if (owner && owner !== st.user.id && TT.history.length) {
      const ok = confirm(
        'Ce navigateur contient des séances liées à un AUTRE compte.\n\n' +
        `Les fusionner avec le compte ${st.user.email || ''} ?\n` +
        '(Annuler = te déconnecter, rien n\'est modifié.)');
      if (!ok) { await signOut(true); return; }
      st.published = {}; // les statuts d'envoi appartenaient à l'autre compte
      savePublished();
    }
    TT.store.set('tt.owner', st.user.id);
    await loadProfile();
    if (st.profile) await pullAll();
    rerender();
  }

  async function loadProfile() {
    const { data, error } = await sb.from('profiles').select('id, pseudo, avatar').eq('id', st.user.id).maybeSingle();
    st.profileChecked = true;
    if (error) { fail('auth', 'lecture du profil', error); return; }
    st.profile = data || null;
  }

  // ---------- Rapatriement : séances et badges du compte → local (fusion, jamais d'écrasement) ----------
  async function pullAll() {
    if (st.pulling || !isMember()) return;
    st.pulling = true;
    try {
      const rows = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await sb.from('workouts')
          .select('id, payload, deleted_at')
          .eq('user_id', st.user.id)
          .order('id')
          .range(from, from + 999);
        if (error) throw error;
        rows.push(...data);
        if (data.length < 1000) break;
      }
      const entries = [];
      for (const r of rows) {
        const sessions = r.payload && Array.isArray(r.payload.sessions) ? r.payload.sessions : [];
        entries.push(...sessions);
        // Statut d'envoi tel que le serveur le connaît (utile sur un nouveau navigateur)
        st.published[r.id] = { sig: sigOf(sessions.map(s => s && s.id).filter(Boolean)), retired: !!r.deleted_at };
      }
      savePublished();
      const added = TT.mergeHistory(entries);

      const { data: badges, error: bErr } = await sb.from('user_badges').select('badge_id, earned_at').eq('user_id', st.user.id);
      if (bErr) throw bErr;
      const map = {};
      for (const b of badges) map[b.badge_id] = Date.parse(b.earned_at);
      const newBadges = TT.mergeBadges(map);
      TT.checkBadges();

      log('sync', `${rows.length} entraînements lus, ${added} séances ajoutées, ${newBadges} badges ajoutés`);
      if (added || newBadges) {
        TT.toast(`☁ Récupéré de ton compte : ${TT.plural(added, 'séance')}` + (newBadges ? ` et ${TT.plural(newBadges, 'badge')}` : ''));
      }
      TT.refresh();
    } catch (e) {
      fail('sync', 'rapatriement impossible', e);
    } finally {
      st.pulling = false;
    }
  }

  // ---------- Envoi / retrait d'un entraînement ----------
  const findWorkout = id => TT.buildWorkouts().find(w => w.id === id) || null;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, Math.round(v || 0)));

  function netMessage(e, fallback) {
    const m = String((e && (e.message || e.error_description)) || e || '');
    if (/fetch|network|Failed to/i.test(m) || (typeof navigator !== 'undefined' && navigator.onLine === false)) {
      return 'Connexion au serveur impossible. Vérifie ta connexion et réessaie.';
    }
    return `${fallback} (${m || 'erreur inconnue'})`;
  }

  async function sendWorkout(id) {
    if (!isMember() || st.busy.has(id)) return;
    const w = findWorkout(id);
    if (!w) return;
    st.busy.add(id);
    rerenderActions();
    try {
      const row = {
        id: w.id,
        started_at: new Date(w.start).toISOString(),
        duration_sec: clamp((w.end - w.start) / 1000, 0, 6 * 3600),
        sets: clamp(w.sets, 0, 2000),
        points: clamp(w.points, 0, 500),
        summary: w.summary,
        payload: { v: 2, sessions: w.entries },
        deleted_at: null,
      };
      const { error } = await sb.from('workouts').upsert(row, { onConflict: 'id' });
      if (error) throw error;

      // Un entraînement plus ancien entièrement englobé par celui-ci (fusion après import
      // ou rapatriement) est retiré, pour ne pas compter deux fois les mêmes séances.
      const mine = new Set(w.ids);
      const englobed = Object.entries(st.published)
        .filter(([pid, p]) => pid !== w.id && !p.retired && p.sig && p.sig.split(',').every(s => mine.has(s)))
        .map(([pid]) => pid);
      if (englobed.length) {
        const { error: e2 } = await sb.from('workouts').update({ deleted_at: new Date().toISOString() }).in('id', englobed);
        if (e2) fail('sync', 'retrait des entraînements englobés', e2);
        else englobed.forEach(pid => { st.published[pid].retired = true; });
      }

      st.published[w.id] = { sig: sigOf(w.ids), retired: false };
      savePublished();
      await sendBadges();
      st.lastSocialTry = 0; // le classement sera rechargé à la prochaine ouverture
      TT.toast(`📤 Entraînement envoyé · ${w.points} pts`);
    } catch (e) {
      fail('sync', 'envoi impossible', e);
      alert(netMessage(e, 'Envoi impossible'));
    } finally {
      st.busy.delete(id);
      rerenderActions();
    }
  }

  // Tous les badges débloqués en local (déjà présents en base : ignorés)
  async function sendBadges() {
    const rows = Object.entries(TT.unlocked)
      .filter(([, t]) => Number.isFinite(t) && t <= Date.now() + 864e5)
      .map(([badge_id, t]) => ({ user_id: st.user.id, badge_id, earned_at: new Date(t).toISOString() }));
    if (!rows.length) return;
    const { error } = await sb.from('user_badges').upsert(rows, { onConflict: 'user_id,badge_id', ignoreDuplicates: true });
    if (error) fail('sync', 'envoi des badges', error);
  }

  async function retireWorkout(id) {
    if (!isMember() || st.busy.has(id)) return;
    if (!confirm('Retirer cet entraînement du classement et du fil d\'activité ?\n\nTes séances restent dans ton historique, et tu pourras le renvoyer plus tard.')) return;
    st.busy.add(id);
    rerenderActions();
    try {
      const { error } = await sb.from('workouts').update({ deleted_at: new Date().toISOString() }).eq('id', id);
      if (error) throw error;
      st.published[id] = { ...(st.published[id] || {}), retired: true };
      savePublished();
      st.lastSocialTry = 0;
      TT.toast('Entraînement retiré du classement');
    } catch (e) {
      fail('sync', 'retrait impossible', e);
      alert(netMessage(e, 'Retrait impossible'));
    } finally {
      st.busy.delete(id);
      rerenderActions();
    }
  }

  // Boutons d'un entraînement (cartes de l'historique, récap)
  function workoutActions(w) {
    if (!w || !isMember()) return '';
    const id = esc(w.id);
    if (st.busy.has(w.id)) return '<span class="sent">⏳ …</span>';
    const p = st.published[w.id];
    const retire = `<button class="btn-link" data-tt-act="retire" data-wid="${id}" title="Retirer du classement et du fil">Retirer</button>`;
    if (!p || p.retired) {
      return `<button class="btn-send" data-tt-act="send" data-wid="${id}" title="Envoyer au classement de la semaine (${w.points} pts)">` +
        `📤 ${p && p.retired ? 'Renvoyer' : 'Envoyer'}</button>`;
    }
    if (p.sig !== sigOf(w.ids)) {
      return `<button class="btn-send upd" data-tt-act="send" data-wid="${id}" title="L'entraînement a changé depuis l'envoi">🔄 Mettre à jour</button>${retire}`;
    }
    return `<span class="sent">✓ Envoyé · ${w.points} pts</span>${retire}`;
  }

  function renderRecap(container) {
    if (!container) return;
    if (isMember()) {
      const w = TT.buildWorkouts()[0];
      container.innerHTML = w
        ? `<div class="recap-social"><p>Ton entraînement : ${TT.plural(w.exCount, 'exercice')} · ${TT.plural(w.sets, 'série')} · <b>${w.points} pts</b></p>` +
          `<div class="hist-actions">${workoutActions(w)}</div></div>`
        : '';
    } else if (st.lib === 'ready' && !st.user) {
      container.innerHTML = '<div class="recap-social"><p>👥 Connecte-toi (page Amis) pour envoyer tes entraînements au classement de la semaine.</p></div>';
    } else {
      container.innerHTML = '';
    }
  }

  function renderHomeStatus(el) {
    if (!el) return;
    el.textContent =
      st.lib === 'unavailable' ? '· hors ligne'
      : isMember() ? `· ${st.profile.avatar || ''} ${st.profile.pseudo}`.replace(/\s+/g, ' ')
      : st.user ? (st.profileChecked ? '· profil à créer' : '')
      : st.lib === 'ready' ? '· invité·e' : '';
  }

  // Re-rendu léger après un changement d'état
  function rerender() {
    if (!TT) return;
    const v = TT.view();
    if (v === 'friends') renderFriends($('friendsRoot'));
    else TT.refresh();
    renderHomeStatus($('socialStatus'));
  }
  const rerenderActions = () => TT.refresh();

  // ---------- Clics délégués (boutons générés en HTML) ----------
  function onClick(e) {
    const t = e.target.closest('[data-tt-act], [data-tt-user]');
    if (!t) return;
    if (t.dataset.ttUser) { openFriend(t.dataset.ttUser); return; }
    const act = t.dataset.ttAct, wid = t.dataset.wid;
    if (act === 'send') sendWorkout(wid);
    else if (act === 'retire') retireWorkout(wid);
    else if (act === 'refresh') loadSocial(true);
    else if (act === 'logout') signOut(false);
  }

  // ---------- Auth ----------
  const OTP_KEY = 'tt.otpEmail';
  const otpEmail = () => { try { return sessionStorage.getItem(OTP_KEY); } catch { return null; } };
  const setOtpEmail = v => { try { v ? sessionStorage.setItem(OTP_KEY, v) : sessionStorage.removeItem(OTP_KEY); } catch {} };

  function authMessage(error) {
    const m = String(error.message || '');
    if (error.status === 429 || /rate limit|too many|security purposes/i.test(m)) return 'Trop de demandes de code. Réessaie dans quelques minutes.';
    if (/invalid.*email|email.*invalid|unable to validate email/i.test(m)) return 'Adresse email invalide.';
    if (/signups? not allowed/i.test(m)) return 'Les inscriptions sont fermées sur ce serveur.';
    return netMessage(error, 'Envoi du code impossible');
  }

  async function sendCode(email) {
    const { error } = await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
    if (error) { fail('auth', 'signInWithOtp', error); return authMessage(error); }
    setOtpEmail(email);
    return null;
  }

  async function verifyCode(email, token) {
    const { error } = await sb.auth.verifyOtp({ email, token, type: 'email' });
    if (error) {
      fail('auth', 'verifyOtp', error);
      return /expired|invalid|otp/i.test(error.message || '') ? 'Code incorrect ou expiré. Vérifie le dernier email reçu, ou redemande un code.' : authMessage(error);
    }
    setOtpEmail(null);
    return null;
  }

  async function signOut(silent) {
    if (!silent && !confirm('Te déconnecter ?\n\nTes séances et badges restent sur ce navigateur.')) return;
    const { error } = await sb.auth.signOut({ scope: 'local' }); // ne touche jamais aux données tt.*
    if (error) fail('auth', 'signOut', error);
    st.user = null; st.profile = null; st.profileChecked = false;
    rerender();
  }

  async function createProfile(pseudo, avatar, code) {
    const { data, error } = await sb.rpc('create_profile', { p_pseudo: pseudo, p_avatar: avatar, p_code: code });
    if (error) {
      fail('auth', 'create_profile', error);
      if (error.code === '23505') return 'Ce pseudo est déjà pris, choisis-en un autre.';
      if (/invalid_invite/.test(error.message || '')) return 'Code d\'invitation incorrect. Demande-le à la personne qui t\'a invité·e.';
      if (error.code === '23514') return 'Pseudo : entre 2 et 20 caractères.';
      return netMessage(error, 'Création du profil impossible');
    }
    st.profile = Array.isArray(data) ? data[0] : data;
    return null;
  }

  // ---------- Classement + fil ----------
  async function loadSocial(force) {
    if (!isMember() || st.loadingSocial) return;
    if (!force && Date.now() - st.lastSocialTry < 15000) return;
    st.loadingSocial = true;
    st.lastSocialTry = Date.now();
    rerenderFriendsOnly();
    try {
      const [lb, feed] = await Promise.all([
        sb.from('leaderboard_week').select('*'),
        sb.from('activity_feed').select('*'),
      ]);
      if (lb.error) throw lb.error;
      if (feed.error) throw feed.error;
      st.social = { at: Date.now(), me: st.user.id, leaderboard: lb.data, feed: feed.data };
      st.socialErr = null;
      TT.store.set('tt.socialCache', st.social);
    } catch (e) {
      fail('social', 'chargement du classement / fil', e);
      st.socialErr = netMessage(e, 'Chargement impossible');
    } finally {
      st.loadingSocial = false;
      rerenderFriendsOnly();
    }
  }
  const rerenderFriendsOnly = () => { if (TT.view() === 'friends') renderFriends($('friendsRoot')); };

  const rtf = new Intl.RelativeTimeFormat('fr', { numeric: 'auto' });
  function rel(ts) {
    const s = Math.round((ts - Date.now()) / 1000);
    const a = Math.abs(s);
    if (a < 45) return 'à l\'instant';
    if (a < 3600) return rtf.format(Math.round(s / 60), 'minute');
    if (a < 86400) return rtf.format(Math.round(s / 3600), 'hour');
    if (a < 86400 * 7) return rtf.format(Math.round(s / 86400), 'day');
    return new Date(ts).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  }

  // Temps restant avant lundi 00:00 heure de Paris
  function untilReset() {
    const parts = {};
    new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(new Date()).forEach(p => { parts[p.type] = p.value; });
    const idx = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(parts.weekday);
    const mins = (7 - idx) * 1440 - (Number(parts.hour) * 60 + Number(parts.minute));
    const d = Math.floor(mins / 1440), h = Math.floor((mins % 1440) / 60), m = mins % 60;
    return d ? `${d} j ${h} h` : h ? `${h} h ${m} min` : `${m} min`;
  }

  const badgeById = id => TT.BADGES.find(b => b.id === id) || null;
  const badgeLabel = id => { const b = badgeById(id); return b ? `${b.icon} ${b.name}` : `🏅 ${id}`; };
  const who = (r) => `<span class="who" data-tt-user="${esc(r.user_id)}">${esc(r.avatar || '')} ${esc(r.pseudo)}</span>`;

  function leaderboardHtml(rows, me) {
    const list = (rows || []).slice().sort((a, b) =>
      b.points - a.points || b.workouts - a.workouts || String(a.pseudo).localeCompare(String(b.pseudo), 'fr'));
    const active = list.filter(r => r.points > 0);
    const head = `<div class="section-head"><h2>🏆 Classement de la semaine</h2><small>Remise à zéro lundi 00:00 · dans ${untilReset()}</small></div>`;
    if (!active.length) {
      return head + '<p class="empty">Aucun entraînement envoyé cette semaine pour l\'instant. À toi d\'ouvrir le bal : 📤 Envoyer depuis ton historique !</p>' +
        tableHtml(list, me);
    }
    const pl = (r, i) => r
      ? `<div class="pl p${i + 1}" data-tt-user="${esc(r.user_id)}"><span class="rk">${i + 1}</span><span class="av">${esc(r.avatar || '🙂')}</span>` +
        `<b>${esc(r.pseudo)}</b><span class="pts">${r.points} pts</span></div>`
      : `<div class="pl p${i + 1} empty-pl"></div>`;
    return head + `<div class="podium">${[0, 1, 2].map(i => pl(active[i], i)).join('')}</div>` + tableHtml(list, me);
  }

  function tableHtml(list, me) {
    if (!list.length) return '';
    const rows = list.map((r, i) =>
      `<tr class="${r.user_id === me ? 'me' : ''}" data-tt-user="${esc(r.user_id)}"><td class="rank">${i + 1}</td><td class="av">${esc(r.avatar || '🙂')}</td>` +
      `<td>${esc(r.pseudo)}${r.user_id === me ? ' <small style="color:var(--muted)">(toi)</small>' : ''}</td>` +
      `<td class="num">${r.workouts}</td><td class="num">${r.sets}</td><td class="num"><b>${r.points}</b></td></tr>`).join('');
    return `<table class="lb"><thead><tr><th></th><th></th><th>Pseudo</th><th class="num">Entraîn.</th><th class="num">Séries</th><th class="num">Points</th></tr></thead><tbody>${rows}</tbody></table>`;
  }

  // Fil : les badges obtenus par la même personne à moins de 2 h d'écart sont regroupés
  function feedHtml(events) {
    const items = [];
    for (const ev of events || []) {
      const at = Date.parse(ev.at);
      const prev = items[items.length - 1];
      if (ev.kind === 'badge' && prev && prev.kind === 'badge' && prev.user_id === ev.user_id && Math.abs(prev.at - at) < 2 * 3600e3) {
        prev.badges.push(ev.ref);
        continue;
      }
      items.push({ ...ev, at, badges: ev.kind === 'badge' ? [ev.ref] : null });
    }
    const head = '<div class="section-head"><h2>📣 Fil d\'activité</h2></div>';
    if (!items.length) return head + '<p class="empty">Rien pour l\'instant. Le premier entraînement envoyé apparaîtra ici.</p>';
    const li = items.map(ev => {
      if (ev.kind === 'workout') {
        return `<li><span class="ic">🏋️</span><div class="txt">${who(ev)} a terminé un entraînement <i>· ${esc(ev.label || '')}</i>` +
          `<small>+${ev.points} pts · ${esc(rel(ev.at))}</small></div></li>`;
      }
      const n = ev.badges.length;
      const what = n === 1 ? `le badge <b>${esc(badgeLabel(ev.badges[0]))}</b>`
        : `${n} badges : <b>${ev.badges.map(id => esc(badgeLabel(id))).join(', ')}</b>`;
      return `<li><span class="ic">🏅</span><div class="txt">${who(ev)} a obtenu ${what}<small>${esc(rel(ev.at))}</small></div></li>`;
    }).join('');
    return head + `<ul class="feed">${li}</ul>`;
  }

  function socialBlocks(data, me) {
    return `<section class="card">${leaderboardHtml(data.leaderboard, me)}</section>` +
      `<section class="card">${feedHtml(data.feed)}</section>`;
  }

  function freshnessHtml() {
    if (!st.social) return st.loadingSocial ? '<span class="social-status">Chargement…</span>' : '';
    if (st.socialErr) return `<span class="offline">⚠ hors ligne · mis à jour ${esc(rel(st.social.at))}</span>`;
    return `<span class="social-status">${st.loadingSocial ? 'Mise à jour…' : 'mis à jour ' + esc(rel(st.social.at))}</span>`;
  }

  // ---------- Page Amis ----------
  function renderFriends(root) {
    if (!root || !TT) return;
    const intro = '<p class="empty">Connecte-toi pour envoyer tes entraînements au classement de la semaine, voir ceux de tes amis et leurs badges. ' +
      'Sans compte, tout continue de marcher en local sur ce navigateur.</p>';

    if (st.lib === 'idle' || st.lib === 'loading') {
      root.innerHTML = '<section class="card"><p class="empty">Connexion au serveur…</p></section>';
      return;
    }
    if (st.lib === 'unavailable') {
      root.innerHTML = '<section class="card"><h2>Mode en ligne indisponible</h2><p class="empty" style="margin-top:8px">Le serveur ne répond pas (hors ligne ?). ' +
        'L\'app fonctionne normalement en local ; recharge la page plus tard.</p></section>' +
        (st.social ? `<p class="offline">⚠ hors ligne · dernière version du ${esc(new Date(st.social.at).toLocaleString('fr-FR'))}</p>` + socialBlocks(st.social, st.social.me) : '');
      return;
    }
    if (!st.user) return renderLogin(root, intro);
    if (!st.profileChecked) {
      root.innerHTML = '<section class="card"><p class="empty">Chargement de ton profil…</p></section>';
      return;
    }
    if (!st.profile) return renderProfileForm(root);

    // Membre
    const p = st.profile;
    root.innerHTML =
      `<section class="card account-bar"><span class="av">${esc(p.avatar || '🙂')}</span><span class="who">${esc(p.pseudo)}</span>` +
      `${freshnessHtml()}<div class="tools"><button data-tt-act="refresh" ${st.loadingSocial ? 'disabled' : ''}>↻ Rafraîchir</button>` +
      `<button class="btn-link" data-tt-act="logout">Se déconnecter</button></div></section>` +
      (st.social && st.social.me === st.user.id ? socialBlocks(st.social, st.user.id)
        : st.socialErr ? `<section class="card"><p class="form-msg err">${esc(st.socialErr)}</p></section>`
        : '<section class="card"><p class="empty">Chargement du classement…</p></section>') +
      '<p class="empty" style="text-align:center">Pour apparaître au classement : 📤 Envoyer sur un entraînement de ton historique (10 pts + 1 pt par série).</p>';
    loadSocial(false);
  }

  function renderLogin(root, intro) {
    const email = otpEmail();
    if (!email) {
      root.innerHTML = `<section class="card"><h2>Se connecter</h2>${intro}` +
        '<form id="frEmailForm" class="form-row"><label>Ton email<input class="wide" type="email" id="frEmail" required autocomplete="email" placeholder="toi@exemple.fr"></label>' +
        '<button class="btn-send" type="submit" id="frEmailBtn">Recevoir un code</button></form><p class="form-msg" id="frMsg"></p></section>';
      $('frEmailForm').addEventListener('submit', async e => {
        e.preventDefault();
        const v = $('frEmail').value.trim();
        if (!v) return;
        busyForm('frEmailBtn', 'frMsg', 'Envoi du code…');
        const err = await sendCode(v);
        if (err) return formError('frEmailBtn', 'frMsg', err);
        renderFriends(root);
      });
      return;
    }
    root.innerHTML = `<section class="card"><h2>Saisis ton code</h2>` +
      `<p class="empty" style="margin-top:6px">Un code a été envoyé à <b>${esc(email)}</b>. Il arrive en général en moins d'une minute (pense aux spams).</p>` +
      '<form id="frCodeForm" class="form-row"><label>Code reçu par email<input type="text" id="frCode" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6,10}" maxlength="10" required placeholder="123456"></label>' +
      '<button class="btn-send" type="submit" id="frCodeBtn">Valider</button>' +
      '<button type="button" class="btn-link" id="frResend">Renvoyer un code</button>' +
      '<button type="button" class="btn-link" id="frChange">Changer d\'email</button></form><p class="form-msg" id="frMsg"></p></section>';
    $('frCode').focus();
    $('frCodeForm').addEventListener('submit', async e => {
      e.preventDefault();
      const code = $('frCode').value.replace(/\s/g, '');
      busyForm('frCodeBtn', 'frMsg', 'Vérification…');
      const err = await verifyCode(email, code);
      if (err) return formError('frCodeBtn', 'frMsg', err);
      // onAuthStateChange prend le relais (profil, rapatriement)
    });
    $('frResend').addEventListener('click', async () => {
      busyForm('frResend', 'frMsg', 'Envoi d\'un nouveau code…');
      const err = await sendCode(email);
      if (err) return formError('frResend', 'frMsg', err);
      $('frResend').disabled = false;
      $('frMsg').className = 'form-msg ok';
      $('frMsg').textContent = 'Nouveau code envoyé.';
    });
    $('frChange').addEventListener('click', () => { setOtpEmail(null); renderFriends(root); });
  }

  function renderProfileForm(root) {
    let avatar = AVATARS[0];
    root.innerHTML = '<section class="card"><h2>Choisis ton pseudo</h2>' +
      `<p class="empty" style="margin-top:6px">Connecté·e avec ${esc(st.user.email || '')}. Ton pseudo et ton avatar seront visibles par tes amis.</p>` +
      '<form id="frProfileForm">' +
      '<div class="form-row"><label>Pseudo (2 à 20 caractères)<input class="wide" type="text" id="frPseudo" minlength="2" maxlength="20" required autocomplete="nickname"></label></div>' +
      `<div style="margin-top:12px"><label>Avatar</label><div class="avatars" id="frAvatars">${AVATARS.map((a, i) =>
        `<button type="button" class="${i ? '' : 'on'}" data-av="${a}">${a}</button>`).join('')}</div></div>` +
      '<div class="form-row"><label>Code d\'invitation<input class="wide" type="text" id="frInvite" required autocomplete="off" placeholder="donné par la personne qui t\'invite"></label></div>' +
      '<div class="form-row"><button class="btn-send" type="submit" id="frProfileBtn">Créer mon profil</button>' +
      '<button type="button" class="btn-link" data-tt-act="logout">Se déconnecter</button></div></form>' +
      '<p class="form-msg" id="frMsg"></p></section>';
    $('frAvatars').addEventListener('click', e => {
      const b = e.target.closest('[data-av]');
      if (!b) return;
      avatar = b.dataset.av;
      [...$('frAvatars').children].forEach(c => c.classList.toggle('on', c === b));
    });
    $('frProfileForm').addEventListener('submit', async e => {
      e.preventDefault();
      const pseudo = $('frPseudo').value.trim();
      if (pseudo.length < 2 || pseudo.length > 20) return formError('frProfileBtn', 'frMsg', 'Pseudo : entre 2 et 20 caractères.');
      busyForm('frProfileBtn', 'frMsg', 'Création du profil…');
      const err = await createProfile(pseudo, avatar, $('frInvite').value.trim());
      if (err) return formError('frProfileBtn', 'frMsg', err);
      TT.toast(`Bienvenue ${pseudo} ! 🎉`);
      await pullAll();
      rerender();
    });
  }

  function busyForm(btnId, msgId, text) {
    const b = $(btnId), m = $(msgId);
    if (b) b.disabled = true;
    if (m) { m.className = 'form-msg'; m.textContent = text; }
  }
  function formError(btnId, msgId, text) {
    const b = $(btnId), m = $(msgId);
    if (b) b.disabled = false;
    if (m) { m.className = 'form-msg err'; m.textContent = text; }
  }

  // ---------- Fiche d'un ami ----------
  async function openFriend(userId) {
    const dlg = $('friendDialog');
    if (!dlg || !isMember()) return;
    const row = (st.social && (st.social.leaderboard || []).find(r => r.user_id === userId)) || {};
    const head = `<div class="head"><span class="av">${esc(row.avatar || '🙂')}</span><h2>${esc(row.pseudo || '…')}</h2>` +
      '<button class="btn-ghost" id="frClose">Fermer</button></div>';
    dlg.innerHTML = head + '<p class="empty">Chargement…</p>';
    if (!dlg.open) dlg.showModal();
    const close = () => dlg.close();
    $('frClose').addEventListener('click', close);
    try {
      const [b, w] = await Promise.all([
        sb.from('user_badges').select('badge_id, earned_at').eq('user_id', userId).order('earned_at', { ascending: false }),
        sb.from('workouts').select('started_at, sets, points').eq('user_id', userId).is('deleted_at', null),
      ]);
      if (b.error) throw b.error;
      if (w.error) throw w.error;
      const days = new Set(w.data.map(x => TT.dayStart(Date.parse(x.started_at))));
      const d = new Date(); d.setHours(0, 0, 0, 0);
      if (!days.has(d.getTime())) d.setDate(d.getDate() - 1);
      let streak = 0;
      while (days.has(d.getTime())) { streak++; d.setDate(d.getDate() - 1); }
      const sets = w.data.reduce((n, x) => n + (x.sets || 0), 0);
      const known = b.data.map(x => ({ x, def: badgeById(x.badge_id) }));
      const badges = known.map(({ x, def }) =>
        `<div class="badge on" title="${esc(def ? def.desc : x.badge_id)}"><span class="ic">${esc(def ? def.icon : '🏅')}</span>` +
        `<b>${esc(def ? def.name : x.badge_id)}</b><small>${esc(def ? def.desc : '')}</small>` +
        `<div class="date">✓ ${esc(new Date(x.earned_at).toLocaleDateString('fr-FR'))}</div></div>`).join('');
      dlg.innerHTML = head +
        '<div class="mini">' +
          `<div><b>${w.data.length}</b><span>entraînements envoyés</span></div>` +
          `<div><b>${sets}</b><span>séries</span></div>` +
          `<div class="gold"><b>${streak}</b><span>${streak > 1 ? 'jours d\'affilée' : 'jour d\'affilée'}</span></div>` +
          `<div class="gold"><b>${b.data.length} / ${TT.BADGES.length}</b><span>badges</span></div>` +
        '</div>' +
        (badges ? `<div class="badges">${badges}</div>` : '<p class="empty" style="margin-top:14px">Pas encore de badge partagé.</p>');
    } catch (e) {
      fail('social', 'fiche ami', e);
      dlg.innerHTML = head + `<p class="form-msg err">${esc(netMessage(e, 'Chargement impossible'))}</p>`;
    }
    $('frClose').addEventListener('click', close);
  }

  window.TTSocial = { init, renderFriends, renderRecap, renderHomeStatus, workoutActions };
})();
