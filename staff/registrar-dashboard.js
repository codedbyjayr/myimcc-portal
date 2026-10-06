// staff/registrar-dashboard.js
//
// Registrar portal logic.
//
// Previously this was inline in registrar-dashbaord.html and had three
// defects that made the portal unusable or unsafe:
//   1. It queried a table named "courses", which does not exist. The
//      prospectus was therefore always empty and the offer dialog always
//      said "No subjects available".
//   2. It read s.category and s.year_level, which course_offerings does
//      not have. Category is derived from is_major below.
//   3. Every table row was built with string concatenation into innerHTML
//      using unescaped database values, so a student could store script in
//      their name and run it inside an administrator's session.
(function () {
  'use strict';

  const { html, raw, escapeHtml, toast, getEl, qsa, on, setText, withBusy, openDialog, pluralize } = window.UIM;

  // ── Configuration ───────────────────────────────────────────────────
  // Table names verified against database/supabase-schema.sql.
  const TABLES = Object.freeze({
    students: 'profiles',
    // The real catalogue table. There is no "courses" table.
    subjects: 'course_offerings',
    offers: 'enrollments'
  });

  // An offer row counts as active only for these statuses. The previous
  // filter was `status !== 'dropped'`, so a soft-removed row
  // (status 'removed') was still rendered as an active subject.
  const ACTIVE_OFFER_STATUSES = Object.freeze(['enrolled', 'offered', 'pending']);

  // ── State ───────────────────────────────────────────────────────────
  let allSubjects = [];
  let allStudents = [];
  let allOffers = [];
  let category = 'ALL';
  let selectedStudent = null;
  let closeOfferDialog = null;

  // ── Messaging state ────────────────────────────────────────────────
  // The messages table is flat (sender_id, recipient_id, subject, body)
  // with no thread column, so a "thread" here is derived: every message
  // exchanged with one counterpart, keyed by that counterpart's id.
  let messagesLoaded = false;
  let allMessages = [];
  let messagePeers = new Map();
  let openThreadPeerId = null;
  let currentUserId = null;

  // Students pick a topic when they ask a question (see
  // database/messaging-qa.sql). The label is derived, never stored twice.
  const MSG_TOPICS = {
    enrollment: 'Enrollment',
    grades: 'Grades & Evaluation',
    billing: 'Billing & Payment',
    clearance: 'Online Clearance',
    schedule: 'Class Schedule',
    registration: 'Registration',
    other: 'Other'
  };

  function topicLabel(topic) {
    return MSG_TOPICS[topic] || null;
  }

  // ── Mobile navigation drawer ────────────────────────────────────────
  const sidebar = getEl('sidebar');
  const sidebarOverlay = getEl('sidebarOverlay');
  const menuToggle = getEl('menuToggle');

  function closeMobileNav() {
    if (sidebar) sidebar.classList.remove('open');
    if (sidebarOverlay) sidebarOverlay.classList.remove('active');
    document.body.style.overflow = '';
    if (menuToggle) menuToggle.setAttribute('aria-expanded', 'false');
  }

  function openMobileNav() {
    if (sidebar) sidebar.classList.add('open');
    if (sidebarOverlay) sidebarOverlay.classList.add('active');
    if (window.innerWidth < 1024) document.body.style.overflow = 'hidden';
    if (menuToggle) menuToggle.setAttribute('aria-expanded', 'true');
    // Move focus into the drawer so keyboard users are not stranded.
    const firstLink = sidebar && sidebar.querySelector('button, a');
    if (firstLink) firstLink.focus();
  }

  function toggleMobileNav() {
    if (sidebar && sidebar.classList.contains('open')) closeMobileNav();
    else openMobileNav();
  }

  // ── View navigation ─────────────────────────────────────────────────
  const VIEW_TITLES = {
    dashboard: 'Dashboard',
    prospectus: 'Prospectus',
    offers: 'Student Offers',
    appointments: 'Appointments',
    messages: 'Messages'
  };

  function goTo(view) {
    const target = getEl('view-' + view);
    if (!target) return;

    qsa("section[id^='view-']").forEach(section => {
      section.classList.add('hidden');
      section.hidden = true;
    });
    target.classList.remove('hidden');
    target.hidden = false;

    qsa('.nav-item[data-view]').forEach(button => {
      const active = button.dataset.view === view;
      button.classList.toggle('active', active);
      if (active) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });

    const title = VIEW_TITLES[view] || 'Registrar';
    setText(getEl('pageTitle'), title);
    // Route changes must be announced and must move focus, otherwise a
    // keyboard or screen-reader user is left on a hidden heading.
    document.title = title + ' — MyIMCC Registrar';

    const heading = target.querySelector('h1, h2, h3');
    if (heading) {
      heading.setAttribute('tabindex', '-1');
      heading.focus();
    }

    closeMobileNav();

    // Messages are loaded on first open, not on every navigation.
    if (view === 'messages' && !messagesLoaded) {
      loadMessages().catch(err => {
        console.warn('[messages] load error:', err);
        toast('Could not load messages', { type: 'error' });
      });
    }

    // Same for the appointment queue. It is a count staff act on, so it is
    // also refreshed on every open rather than cached, otherwise a request
    // that arrived after the first visit would be invisible.
    if (view === 'appointments') {
      loadAppointments().catch(err => {
        console.warn('[appointments] load error:', err);
        toast('Could not load requests', { type: 'error' });
      });
    }
  }

  function setCategoryFilter(value) {
    category = value;
    qsa('#prospectusFilters .chip').forEach(chip => {
      const active = chip.dataset.cat === value;
      chip.classList.toggle('active', active);
      chip.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    renderProspectus();
  }

  // ── Data loading ────────────────────────────────────────────────────
  function announce(message) {
    setText(getEl('registrarStatus'), message);
  }

  async function loadStudents() {
    const { data, error } = await supabaseClient
      .from(TABLES.students)
      .select('id, full_name, student_no, program, year_level, section, status, is_active')
      // Only approved, active students can be given subjects.
      .eq('role', 'student')
      .eq('status', 'approved')
      .order('full_name');

    if (error) throw new Error('Could not load students: ' + error.message);
    allStudents = data || [];
  }

  async function loadSubjects() {
    const { data, error } = await supabaseClient
      .from(TABLES.subjects)
      .select('id, code, title, units, program, year, semester, school_year, is_major')
      .order('code');

    if (error) throw new Error('Could not load the prospectus: ' + error.message);
    allSubjects = data || [];
  }

  async function loadOffers() {
    const { data, error } = await supabaseClient
      .from(TABLES.offers)
      .select('id, student_id, offering_id, status, course_offerings(id, code, title, units, is_major, year, semester)');

    if (error) throw new Error('Could not load subject offers: ' + error.message);
    allOffers = data || [];
  }

  async function loadAll() {
    const results = await Promise.allSettled([loadStudents(), loadSubjects(), loadOffers()]);

    const failures = results.filter(r => r.status === 'rejected');
    if (failures.length) {
      // Surface the reason rather than silently rendering empty tables,
      // which is what made this portal look merely "empty" before.
      const message = failures.map(f => f.reason && f.reason.message).filter(Boolean).join(' | ');
      toast(message || 'Some data could not be loaded.', { type: 'error' });
      announce('Some data could not be loaded: ' + message);
    }

    renderStudents();
    renderProspectus();
    renderStudentOffers();
    renderDashboardStats();
  }

  // ── Rendering ───────────────────────────────────────────────────────
  function categoryOf(subject) {
    return subject && subject.is_major ? 'MAJOR' : 'GE';
  }

  function categoryBadge(subject) {
    const label = categoryOf(subject) === 'MAJOR' ? 'Major' : 'GE';
    const cls = categoryOf(subject) === 'MAJOR' ? 'major' : 'ge';
    return html`<span class="badge ${raw(cls)}">${label}</span>`;
  }

  function renderDashboardStats() {
    setText(getEl('statStudents'), String(allStudents.length));
    setText(getEl('statSubjects'), String(allSubjects.length));

    const pending = allOffers.filter(o => o.status === 'pending').length;
    setText(getEl('statPending'), String(pending));
  }

  function renderProspectus() {
    const input = getEl('prospectusSearch');
    const q = (input && input.value ? input.value : '').trim().toLowerCase();

    const rows = allSubjects.filter(subject => {
      const matchCategory = category === 'ALL' || categoryOf(subject) === category;
      const matchQuery = !q
        || String(subject.code || '').toLowerCase().includes(q)
        || String(subject.title || '').toLowerCase().includes(q);
      return matchCategory && matchQuery;
    });

    const body = getEl('prospectusBody');
    if (body) {
      body.innerHTML = rows.length
        ? rows.map(subject => html`
            <tr>
              <th scope="row">${subject.code}</th>
              <td>${subject.title}</td>
              <td>${subject.units}</td>
              <td>${categoryBadge(subject)}</td>
              <td>${subject.year ? 'Yr ' + subject.year : ''}${subject.semester ? ' · Sem ' + subject.semester : ''}</td>
            </tr>`)
        : '';
    }

    const empty = getEl('prospectusEmpty');
    if (empty) {
      empty.classList.toggle('hidden', rows.length > 0);
      empty.hidden = rows.length > 0;
      setText(empty, allSubjects.length
        ? 'No subjects match this filter.'
        : 'The prospectus is empty. No course offerings have been published yet.');
    }

    announce(pluralize(rows.length, 'subject') + ' shown.');
  }

  function renderStudents() {
    const input = getEl('studentSearch');
    const q = (input && input.value ? input.value : '').trim().toLowerCase();

    const rows = allStudents.filter(student => {
      if (!q) return true;
      return String(student.full_name || '').toLowerCase().includes(q)
        || String(student.student_no || '').toLowerCase().includes(q);
    });

    const body = getEl('studentBody');
    if (body) {
      body.innerHTML = rows.map(student => html`
        <tr class="student-row" tabindex="0" role="button"
            data-student-id="${student.id}"
            aria-label="Manage subjects for ${student.full_name}">
          <td>${student.student_no || '—'}</td>
          <th scope="row"><b>${student.full_name}</b></th>
          <td>${student.program || '—'}</td>
          <td>${student.year_level || '—'}</td>
        </tr>`);
    }

    const empty = getEl('studentEmpty');
    if (empty) {
      empty.classList.toggle('hidden', rows.length > 0);
      empty.hidden = rows.length > 0;
      setText(empty, allStudents.length
        ? 'No students match this search.'
        : 'No approved students yet.');
    }
  }

  function selectStudent(id) {
    selectedStudent = allStudents.find(s => String(s.id) === String(id));
    if (!selectedStudent) return;

    const panel = getEl('studentDetailPanel');
    if (panel) {
      panel.hidden = false;
      panel.style.display = 'block';
    }
    setText(getEl('studentDetailName'),
      selectedStudent.full_name + ' — ' + (selectedStudent.program || 'Unassigned program'));
    renderStudentOffers();
  }

  function offersForStudent() {
    if (!selectedStudent) return [];
    return allOffers
      .filter(offer => String(offer.student_id) === String(selectedStudent.id))
      .filter(offer => offer.status === null || ACTIVE_OFFER_STATUSES.indexOf(offer.status) !== -1)
      .map(offer => ({ ...offer, subject: offer.course_offerings || null }))
      .filter(offer => offer.subject);
  }

  function renderStudentOffers() {
    const body = getEl('offersBody');
    if (!body) return;
    if (!selectedStudent) { body.innerHTML = ''; return; }

    const rows = offersForStudent();

    body.innerHTML = rows.map(offer => html`
      <tr>
        <th scope="row">${offer.subject.code}</th>
        <td>${offer.subject.title}</td>
        <td>${offer.subject.units}</td>
        <td>${categoryBadge(offer.subject)}</td>
        <td><span class="badge ${raw(offer.status === 'enrolled' ? 'enrolled' : 'offered')}">${offer.status || 'enrolled'}</span></td>
        <td>
          <button class="btn btn-danger" type="button" data-remove-offer="${offer.id}"
                  aria-label="Remove ${offer.subject.code} from ${selectedStudent.full_name}">Remove</button>
        </td>
      </tr>`);

    const empty = getEl('offersEmpty');
    if (empty) {
      empty.classList.toggle('hidden', rows.length > 0);
      empty.hidden = rows.length > 0;
    }

    announce(pluralize(rows.length, 'subject', 'subjects') + ' offered to ' + selectedStudent.full_name + '.');
  }

  // ── Offer dialog ────────────────────────────────────────────────────
  function openOfferModal() {
    if (!selectedStudent) return;
    setText(getEl('offerModalSub'),
      'Assign a prospectus subject to ' + selectedStudent.full_name + '.');
    setText(getEl('offerCategory'), 'ALL');
    category = 'ALL';
    populateOfferSubjects();

    const modal = getEl('offerModal');
    if (!modal) return;
    closeOfferDialog = openDialog(modal, {
      closeOnBackdrop: true,
      onClose: () => { closeOfferDialog = null; }
    });
  }

  function closeOfferModal() {
    if (closeOfferDialog) closeOfferDialog();
    else {
      const modal = getEl('offerModal');
      if (modal) { modal.hidden = true; modal.classList.add('hidden'); }
    }
  }

  function populateOfferSubjects() {
    const select = getEl('offerSubject');
    if (!select) return;

    const chosen = (getEl('offerCategory') || {}).value || 'ALL';
    const taken = new Set(
      offersForStudent().map(offer => String(offer.offering_id))
    );

    const options = allSubjects.filter(subject => {
      if (taken.has(String(subject.id))) return false;
      return chosen === 'ALL' || categoryOf(subject) === chosen;
    });

    select.innerHTML = options.length
      ? options.map(subject => html`<option value="${subject.id}">${subject.code} — ${subject.title}</option>`)
      : '<option value="">No subjects available</option>';
  }

  async function confirmOffer(button) {
    const select = getEl('offerSubject');
    const subjectId = select && select.value;
    if (!subjectId || !selectedStudent) return;

    await withBusy(button, 'Saving…', async () => {
      const { error } = await supabaseClient
        .from(TABLES.offers)
        .insert({ student_id: selectedStudent.id, offering_id: subjectId, status: 'enrolled' });

      if (error) {
        // Report the operation, not the raw driver message, which can
        // expose schema details.
        toast('Could not offer this subject. Please try again.', { type: 'error' });
        console.error('[registrar] offer insert failed:', error);
        return;
      }

      toast('Subject offered to ' + selectedStudent.full_name + '.', { type: 'success' });
      closeOfferModal();
      await loadOffers();
      renderStudentOffers();
      renderDashboardStats();
    });
  }

  async function removeOffer(offeringId, button) {
    if (!selectedStudent) return;
    const ok = window.confirm('Remove this subject from ' + selectedStudent.full_name + "'s load?");
    if (!ok) return;

    await withBusy(button, 'Removing…', async () => {
      const { error } = await supabaseClient
        .from(TABLES.offers)
        .update({ status: 'removed' })
        .eq('id', offeringId);

      if (error) {
        toast('Could not remove this subject. Please try again.', { type: 'error' });
        console.error('[registrar] offer update failed:', error);
        return;
      }

      toast('Subject removed.', { type: 'success' });
      await loadOffers();
      renderStudentOffers();
      renderDashboardStats();
    });
  }

  // ── Messaging ───────────────────────────────────────────────────────
  // Table verified against database/supabase-schema-v2.sql:77.
  const MESSAGES_TABLE = 'messages';

  function fmtMessageStamp(value) {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleString(undefined, {
      year: 'numeric', month: 'short', day: '2-digit',
      hour: '2-digit', minute: '2-digit'
    });
  }

  // Set from the initAuthGuard() result in init(). There is no global auth
  // state to read: shared/authGuard.js returns { user, profile } and does
  // not publish anything on window.
  function myId() {
    return currentUserId;
  }

  // The registrar only ever needs counterpart names, so one lookup of the
  // student roster is enough; peers are resolved from allStudents plus the
  // ids that actually appear in the inbox.
  async function loadMessages() {
    const me = myId();
    if (!me) return;

    const { data, error } = await supabaseClient
      .from(MESSAGES_TABLE)
      .select('id, sender_id, recipient_id, subject, topic, body, is_read, read_at, created_at')
      .or(`sender_id.eq.${me},recipient_id.eq.${me}`)
      .order('created_at', { ascending: false })
      .limit(300);

    if (error) throw error;

    allMessages = data || [];

    // Resolve any counterpart that is not already in the roster.
    const known = new Set(allStudents.map(s => s.id));
    const missing = [...new Set(allMessages
      .flatMap(m => [m.sender_id, m.recipient_id])
      .filter(id => id && id !== me && !known.has(id)))];

    if (missing.length) {
      const { data: peers } = await supabaseClient
        .from(TABLES.students)
        .select('id, full_name, email, student_no, id_number, program')
        .in('id', missing);
      (peers || []).forEach(p => allStudents.push(p));
    }

    messagePeers = new Map(allStudents.map(s => [s.id, s]));
    messagesLoaded = true;
    renderMessageThreads();
    updateUnreadBadge();
  }

  function peerFor(id) {
    return messagePeers.get(id) || { id, full_name: 'Unknown user', email: '' };
  }

  function peerName(id) {
    const peer = peerFor(id);
    return peer.full_name || peer.email || 'Unknown user';
  }

  // Group by counterpart, newest first.
  function threadList() {
    const me = myId();
    const groups = new Map();

    allMessages.forEach(message => {
      const otherId = message.sender_id === me ? message.recipient_id : message.sender_id;
      if (!otherId) return;
      if (!groups.has(otherId)) groups.set(otherId, []);
      groups.get(otherId).push(message);
    });

    return [...groups.entries()]
      .map(([peerId, items]) => {
        const sorted = [...items].sort((a, b) =>
          String(b.created_at).localeCompare(String(a.created_at)));
        const last = sorted[0];
        const unread = sorted.filter(m => m.recipient_id === me && !m.is_read).length;
        return { peerId, items: sorted, last, unread };
      })
      .sort((a, b) => String(b.last.created_at).localeCompare(String(a.last.created_at)));
  }

  function updateUnreadBadge() {
    const me = myId();
    const unread = allMessages.filter(m => m.recipient_id === me && !m.is_read).length;
    const badge = getEl('msgUnreadBadge');
    if (!badge) return;
    badge.textContent = String(unread);
    badge.hidden = unread === 0;
  }

  function renderMessageThreads() {
    const body = getEl('msgThreadsBody');
    const empty = getEl('msgThreadsEmpty');
    if (!body) return;

    const threads = threadList();

    if (!threads.length) {
      body.innerHTML = '';
      if (empty) empty.classList.remove('hidden');
      return;
    }

    if (empty) empty.classList.add('hidden');

    body.innerHTML = threads.map(thread => {
      // A student question carries a topic; a staff reply carries none.
      // Fall back to the subject, then to a role-appropriate label rather
      // than showing a blank cell.
      const topic = topicLabel(thread.last.topic);
      const subject = topic
        || thread.last.subject
        || (thread.last.sender_id === myId()
              ? 'Sent to student'
              : 'Question from student');
      const preview = (thread.last.body || '').replace(/\s+/g, ' ').slice(0, 90);
      const status = thread.unread > 0
        ? html`<span class="pill-unread">${thread.unread} unread</span>`
        : html`<span class="pill-read">Read</span>`;

      return html`
        <tr class="${thread.unread > 0 ? 'msg-row-unread' : ''}">
          <td>
            <button type="button" class="msg-suggest-item" data-peer="${thread.peerId}">
              ${peerName(thread.peerId)}
              <small>${peerFor(thread.peerId).student_no || peerFor(thread.peerId).id_number || peerFor(thread.peerId).email || ''}</small>
            </button>
          </td>
          <td>${subject}</td>
          <td>
            <span class="msg-preview">${preview}</span>
            <small class="muted-note">${fmtMessageStamp(thread.last.created_at)}</small>
          </td>
          <td>${raw(status)}</td>
        </tr>`;
    }).join('');
  }

  function openThread(peerId) {
    const me = myId();
    openThreadPeerId = peerId;

    const panel = getEl('msgThreadPanel');
    if (panel) panel.classList.remove('hidden');

    setText(getEl('msgPeerName'), peerName(peerId));
    const peer = peerFor(peerId);
    setText(getEl('msgPeerMeta'),
      [peer.email, peer.student_no || peer.id_number, peer.program]
        .filter(Boolean).join(' · ') || ' ');

    const items = allMessages
      .filter(m => (m.sender_id === me && m.recipient_id === peerId)
                 || (m.sender_id === peerId && m.recipient_id === me))
      .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));

    getEl('msgHistory').innerHTML = items.map(m => {
      const mine = m.sender_id === me;
      const topic = topicLabel(m.topic);
      return html`
        <article class="msg-item ${mine ? 'mine' : ''}">
          <div class="msg-item-head">
            <span>${mine ? 'You' : peerName(peerId)}</span>
            <span>${fmtMessageStamp(m.created_at)}</span>
          </div>
          ${topic ? html`<div class="msg-item-subject">${topic}</div>` : ''}
          <div class="msg-item-body">${m.body || ''}</div>
        </article>`;
    }).join('');

    markThreadRead(peerId);
  }

  async function markThreadRead(peerId) {
    const me = myId();
    const unread = allMessages.filter(m =>
      m.sender_id === peerId && m.recipient_id === me && !m.is_read);
    if (!unread.length) return;

    // Only is_read / read_at are writable. Phase 0b narrows the column
    // grant for exactly this reason: a recipient must not be able to edit
    // the body of an official registrar message.
    const { error } = await supabaseClient
      .from(MESSAGES_TABLE)
      .update({ is_read: true, read_at: new Date().toISOString() })
      .in('id', unread.map(m => m.id));

    if (error) {
      console.warn('[messages] could not mark read:', error);
      return;
    }

    unread.forEach(m => { m.is_read = true; m.read_at = new Date().toISOString(); });
    renderMessageThreads();
    updateUnreadBadge();
  }

  async function sendMessage(recipientId, subject, body, topic) {
    const me = myId();
    if (!me || !recipientId) throw new Error('No recipient selected');

    const { data, error } = await supabaseClient
      .from(MESSAGES_TABLE)
      .insert({
        sender_id: me,
        recipient_id: recipientId,
        subject: subject || null,
        topic: topic || null,
        body
      })
      .select('id, sender_id, recipient_id, subject, topic, body, is_read, read_at, created_at')
      .single();

    if (error) throw error;

    allMessages.unshift(data);
    if (!messagePeers.has(recipientId)) {
      messagePeers.set(recipientId, peerFor(recipientId));
    }
    renderMessageThreads();
    updateUnreadBadge();
    return data;
  }

  // ── Recipient search ────────────────────────────────────────────────
  function searchStudents(term) {
    const needle = term.trim().toLowerCase();
    if (needle.length < 2) return [];
    return allStudents
      .filter(s => [s.full_name, s.email, s.student_no, s.id_number, s.program]
        .some(field => String(field || '').toLowerCase().includes(needle)))
      .slice(0, 8);
  }

  function renderSuggestions(term) {
    const list = getEl('msgRecipientList');
    const search = getEl('msgRecipientSearch');
    if (!list) return;

    const matches = searchStudents(term);

    if (!matches.length) {
      list.classList.add('hidden');
      list.innerHTML = '';
      // aria-expanded is the only thing that tells a screen reader the listbox
      // opened. Leaving it on "false" made the suggestions invisible to
      // assistive tech even though they were on screen.
      if (search) search.setAttribute('aria-expanded', 'false');
      activeSuggestion = -1;
      if (search) search.removeAttribute('aria-activedescendant');
      return;
    }

    list.classList.remove('hidden');
    if (search) search.setAttribute('aria-expanded', 'true');
    list.innerHTML = matches.map((s, i) => html`
      <button type="button" class="msg-suggest-item" role="option" id="msgSuggest${i}"
          aria-selected="false" data-id="${s.id}">
        ${s.full_name || s.email || 'Unnamed'}
        <small>${[s.student_no || s.id_number, s.email, s.program].filter(Boolean).join(' · ')}</small>
      </button>`).join('');
    activeSuggestion = -1;
    if (search) search.removeAttribute('aria-activedescendant');
  }

  // Index of the highlighted option, or -1. Kept as state rather than derived
  // from the DOM so the arrow keys have something to move relative to.
  let activeSuggestion = -1;

  function moveSuggestion(step) {
    const list = getEl('msgRecipientList');
    const search = getEl('msgRecipientSearch');
    if (!list || list.classList.contains('hidden')) return;
    const options = list.querySelectorAll('[role="option"]');
    if (!options.length) return;

    activeSuggestion = (activeSuggestion + step + options.length) % options.length;
    options.forEach((option, i) => {
      const on = i === activeSuggestion;
      option.setAttribute('aria-selected', on ? 'true' : 'false');
      if (on) option.scrollIntoView({ block: 'nearest' });
    });
    if (search && options[activeSuggestion]) {
      search.setAttribute('aria-activedescendant', options[activeSuggestion].id);
    }
  }

  function chooseActiveSuggestion() {
    const list = getEl('msgRecipientList');
    if (!list || activeSuggestion < 0) return false;
    const option = list.querySelectorAll('[role="option"]')[activeSuggestion];
    if (!option) return false;
    getEl('msgRecipient').value = option.dataset.id;
    getEl('msgRecipientSearch').value = peerName(option.dataset.id);
    closeSuggestions();
    return true;
  }

  function closeSuggestions() {
    const list = getEl('msgRecipientList');
    const search = getEl('msgRecipientSearch');
    if (list) {
      list.classList.add('hidden');
      list.innerHTML = '';
    }
    if (search) {
      search.setAttribute('aria-expanded', 'false');
      search.removeAttribute('aria-activedescendant');
    }
    activeSuggestion = -1;
  }

  function wireMessaging() {
    on(document, 'click', '#msgThreadsBody [data-peer]', (event, node) => {
      openThread(node.dataset.peer);
    });

    on(getEl('btnCloseThread'), 'click', () => {
      openThreadPeerId = null;
      const panel = getEl('msgThreadPanel');
      if (panel) panel.classList.add('hidden');
    });

    on(getEl('msgReplyForm'), 'submit', async (event, form) => {
      event.preventDefault();
      const field = getEl('msgReplyBody');
      const body = field.value.trim();
      if (!body || !openThreadPeerId) return;

      const button = getEl('btnSendReply');
      await withBusy(button, 'Sending…', async () => {
        try {
          // No subject on a reply: the student's topic already labels the
          // thread, and a second free-text label only drifts out of sync.
          await sendMessage(openThreadPeerId, null, body);
          field.value = '';
          openThread(openThreadPeerId);
          toast('Reply sent.', { type: 'success' });
        } catch (err) {
          toast('Could not send the reply.', { type: 'error' });
          console.error('[messages] send failed:', err);
        }
      });
    });

    on(getEl('btnNewMessage'), 'click', () => {
      const modal = getEl('msgComposeModal');
      if (modal) modal.classList.remove('hidden');
      const error = getEl('msgComposeError');
      if (error) error.hidden = true;
      getEl('msgRecipientSearch')?.focus();
    });

    on(getEl('btnCancelCompose'), 'click', () => {
      const modal = getEl('msgComposeModal');
      if (modal) modal.classList.add('hidden');
    });

    on(getEl('msgRecipientSearch'), 'input', (event) => {
      // Clear the hidden id as soon as the text changes, otherwise a
      // previously picked recipient is sent to while a different name is
      // on screen.
      getEl('msgRecipient').value = '';
      renderSuggestions(event.target.value);
    });

    // Combobox keyboard support. Without this the listbox could only be
    // reached by Tab, which walks off the field and past the Send button
    // before reaching the first suggestion.
    on(getEl('msgRecipientSearch'), 'keydown', (event) => {
      const list = getEl('msgRecipientList');
      const isOpen = list && !list.classList.contains('hidden');

      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault();
          if (!isOpen) renderSuggestions(event.target.value);
          moveSuggestion(1);
          break;
        case 'ArrowUp':
          event.preventDefault();
          moveSuggestion(-1);
          break;
        case 'Enter':
          // Only swallow Enter when a suggestion is highlighted, otherwise it
          // would stop the form submitting.
          if (isOpen && activeSuggestion >= 0) {
            event.preventDefault();
            chooseActiveSuggestion();
          }
          break;
        case 'Escape':
          if (isOpen) {
            event.preventDefault();
            closeSuggestions();
          }
          break;
        case 'Tab':
          if (isOpen) closeSuggestions();
          break;
        default:
          break;
      }
    });

    on(getEl('msgRecipientList'), 'click', (event, node) => {
      if (!node.dataset.id) return;
      getEl('msgRecipient').value = node.dataset.id;
      getEl('msgRecipientSearch').value = peerName(node.dataset.id);
      closeSuggestions();
    });

    on(document, 'click', (event) => {
      const list = getEl('msgRecipientList');
      if (!list || list.classList.contains('hidden')) return;
      if (!list.contains(event.target) && event.target !== getEl('msgRecipientSearch')) {
        closeSuggestions();
      }
    });

    on(getEl('msgComposeForm'), 'submit', async (event, form) => {
      event.preventDefault();
      const error = getEl('msgComposeError');
      if (error) error.hidden = true;

      const recipientId = getEl('msgRecipient').value;
      const subject = getEl('msgSubject').value.trim();
      const body = getEl('msgBody').value.trim();

      if (!recipientId) {
        if (error) {
          error.textContent = 'Choose a student from the list first.';
          error.hidden = false;
        }
        return;
      }
      if (!body) {
        if (error) {
          error.textContent = 'Write a message before sending.';
          error.hidden = false;
        }
        return;
      }

      const button = getEl('btnSendMessage');
      await withBusy(button, 'Sending…', async () => {
        try {
          await sendMessage(recipientId, subject, body);
          form.reset();
          // closeSuggestions, not a bare classList.add: it also resets
          // aria-expanded, so reopening the composer does not announce an
          // already-expanded listbox with stale options.
          closeSuggestions();
          getEl('msgComposeModal').classList.add('hidden');
          toast('Message sent.', { type: 'success' });
          openThread(recipientId);
        } catch (err) {
          if (error) {
            error.textContent = 'Could not send the message. Please try again.';
            error.hidden = false;
          }
          console.error('[messages] compose failed:', err);
        }
      });
    });
  }

  // ── Event wiring ────────────────────────────────────────────────────
  function wire() {
    on(document, 'click', '.nav-item[data-view]', (event, button) => goTo(button.dataset.view));
    on(document, 'click', '[data-goto]', (event, node) => {
      if (node.dataset.cat) setCategoryFilter(node.dataset.cat);
      goTo(node.dataset.goto);
    });
    on(document, 'click', '#prospectusFilters .chip', (event, chip) => setCategoryFilter(chip.dataset.cat));
    on(document, 'click', '#menuToggle', toggleMobileNav);
    on(document, 'click', '#sidebarCloseBtn', closeMobileNav);
    on(document, 'click', '#sidebarOverlay', closeMobileNav);
    on(document, 'click', '#btnCancelOffer', closeOfferModal);
    on(document, 'click', '#btnAddOffer', openOfferModal);
    on(document, 'click', '[data-remove-offer]', (event, button) => removeOffer(button.dataset.removeOffer, button));
    on(document, 'click', '#btnConfirmOffer', (event, button) => confirmOffer(button));

    // Student rows are buttons in behaviour, not markup.
    on(document, 'click', '[data-student-id]', (event, row) => selectStudent(row.dataset.studentId));
    on(document, 'keydown', '[data-student-id]', (event, row) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        selectStudent(row.dataset.studentId);
      }
    });

    const search = getEl('prospectusSearch');
    if (search) search.addEventListener('input', renderProspectus);
    const studentSearch = getEl('studentSearch');
    if (studentSearch) studentSearch.addEventListener('input', renderStudents);
    const offerCategory = getEl('offerCategory');
    if (offerCategory) offerCategory.addEventListener('change', populateOfferSubjects);

    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') closeMobileNav();
    });
    window.addEventListener('resize', () => {
      if (window.innerWidth >= 1024) closeMobileNav();
    });
  }

  // ── Init ────────────────────────────────────────────────────────────
  // ── Appointments ───────────────────────────────────────────────────
  // Consultation requests raised by students from the Help page. The student
  // states a preference; staff confirm. Nothing here invents availability,
  // because the schema records no office hours to draw from.
  let appointments = [];
  let openApptId = null;

  const APPT_TOPICS = {
    enrollment: 'Enrollment',
    grades: 'Grades & Evaluation',
    billing: 'Billing & Payment',
    clearance: 'Online Clearance',
    schedule: 'Class Schedule',
    registration: 'Registration',
    other: 'Other'
  };

  const APPT_STATUS = {
    pending: 'Awaiting confirmation',
    confirmed: 'Confirmed',
    declined: 'Declined',
    completed: 'Completed',
    cancelled: 'Cancelled',
    no_show: 'No show'
  };

  function apptTopicLabel(topic) {
    return APPT_TOPICS[topic] || 'Other';
  }

  function apptStatusPill(status) {
    const cls = {
      pending: 'pill-unread',
      confirmed: 'pill-read',
      declined: 'pill-read',
      completed: 'pill-read',
      no_show: 'pill-read',
      cancelled: 'pill-read'
    }[status] || 'pill-read';
    return html`<span class="${cls}">${APPT_STATUS[status] || status}</span>`;
  }

  /**
   * Render an appointment instant for staff.
   *
   * Always Manila, and always labelled as Manila. Staff work the queue from
   * other time zones and other institutions, and a bare "3 Jun, 09:00" on a
   * screen is read in the viewer's head as their own clock.
   */
  function apptWhen(value) {
    if (!value) return '—';
    return SCHOOLTIME.formatSchoolDateTime(value);
  }

  /**
   * Split an instant back into the two inputs the confirm form uses.
   *
   * The inputs are Manila wall-clock fields, so the instant has to be read
   * back in Manila before being written into them. Reusing toISOString() here
   * would shift the confirmed time by the difference between UTC and Manila
   * and quietly book students eight hours off.
   */
  function apptLocalParts(value) {
    if (!value) return { date: '', time: '' };
    const p = SCHOOLTIME.zonedParts(new Date(value));
    return {
      date: [
        String(p.year).padStart(4, '0'),
        String(p.month).padStart(2, '0'),
        String(p.day).padStart(2, '0')
      ].join('-'),
      time: String(p.hour).padStart(2, '0') + ':' + String(p.minute).padStart(2, '0')
    };
  }

  function updateApptBadge() {
    const pending = appointments.filter(a => a.status === 'pending').length;
    const badge = getEl('apptPendingBadge');
    if (!badge) return;
    badge.textContent = String(pending);
    badge.hidden = pending === 0;
  }

  function renderAppointments() {
    const body = getEl('apptBody');
    const empty = getEl('apptEmpty');
    if (!body) return;

    // Requests needing action first, then by how soon the student wants to
    // meet. Staff work the queue top-down.
    const order = { pending: 0, confirmed: 1, declined: 2, completed: 3, no_show: 4, cancelled: 5 };
    const rows = [...appointments].sort((a, b) =>
      (order[a.status] ?? 9) - (order[b.status] ?? 9)
      || String(a.preferred_at).localeCompare(String(b.preferred_at)));

    if (!rows.length) {
      body.innerHTML = '';
      if (empty) empty.hidden = false;
      updateApptBadge();
      return;
    }
    if (empty) empty.hidden = true;

    body.innerHTML = rows.map(appt => {
      const when = appt.scheduled_at || appt.preferred_at;
      const isFinal = Boolean(appt.scheduled_at);
      const status = apptStatusPill(appt.status);

      return html`
        <tr>
          <th scope="row">${appt.student_name || 'Unknown student'}
            <small class="muted-note">${appt.student_identifier || ''}</small>
          </th>
          <td>${apptTopicLabel(appt.topic)}</td>
          <td>
            <span class="${isFinal ? 'appt-final' : 'muted-note'}">
              ${apptWhen(when)}
            </span>
            ${isFinal ? html`<small class="muted-note">confirmed</small>` : ''}
          </td>
          <td>${String(appt.mode || '').replace('_', ' ')}</td>
          <td>${raw(status)}</td>
          <td>
            <button class="btn" type="button" data-appt-open="${appt.id}">Open</button>
          </td>
        </tr>`;
    }).join('');

    updateApptBadge();
  }

  async function loadAppointments() {
    const { data, error } = await supabaseClient
      .from('appointments')
      .select('id, student_id, topic, question, preferred_at, scheduled_at, '
            + 'mode, notes, staff_note, status, '
            + 'assigned_to, created_at')
      .order('created_at', { ascending: false })
      .limit(200);

    if (error) throw new Error(error.message);

    appointments = data || [];

    // Resolve student names in one pass rather than a query per row.
    const ids = [...new Set(appointments.map(a => a.student_id).filter(Boolean))];
    const people = new Map();
    if (ids.length) {
      const { data: profiles } = await supabaseClient
        .from('profiles')
        .select('id, full_name, student_no, id_number, email')
        .in('id', ids);
      (profiles || []).forEach(p => people.set(p.id, p));
    }

    appointments = appointments.map(appt => {
      const person = people.get(appt.student_id);
      return {
        ...appt,
        student_name: person ? (person.full_name || person.email) : null,
        student_identifier: person
          ? (person.student_no || person.id_number || person.email || '')
          : ''
      };
    });

    renderAppointments();
  }

  function openApptDetail(id) {
    const appt = appointments.find(a => a.id === id);
    if (!appt) return;
    openApptId = id;

    const card = getEl('apptDetailCard');
    if (card) {
      card.classList.remove('hidden');
      card.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    setText(getEl('apptDetailTitle'),
      apptTopicLabel(appt.topic) + ' — ' + (appt.student_name || 'Unknown student'));

    const detail = getEl('apptDetail');
    if (detail) {
      const rows = [
        ['Student', appt.student_name || 'Unknown'],
        ['Identifier', appt.student_identifier || 'Not recorded'],
        ['Topic', apptTopicLabel(appt.topic)],
        ['Preferred', apptWhen(appt.preferred_at)],
        ['Confirmed', apptWhen(appt.scheduled_at)],
        ['Mode', String(appt.mode || '').replace('_', ' ')],
        ['Status', APPT_STATUS[appt.status] || appt.status],
        ['Asked the assistant', appt.question || 'Not recorded'],
        ['Student notes', appt.notes || 'None'],
        ['Requested', fmtMessageStamp(appt.created_at)]
      ];
      detail.innerHTML = rows.map(([label, value]) => html`
        <div class="appt-detail-row">
          <dt>${label}</dt>
          <dd>${value}</dd>
        </div>`).join('');
    }

    const statusField = getEl('apptStatus');
    if (statusField) statusField.value = appt.status;
    // Prefill from the confirmed slot if there is one, otherwise from what the
    // student asked for, so confirming is usually a single click.
    const parts = apptLocalParts(appt.scheduled_at || appt.preferred_at);
    const dateField = getEl('apptDate');
    if (dateField) dateField.value = parts.date;
    const timeField = getEl('apptTime');
    if (timeField) timeField.value = parts.time;
    const noteField = getEl('apptNote');
    if (noteField) noteField.value = appt.staff_note || '';

    const timeNote = getEl('apptTimeNote');
    if (timeNote) {
      timeNote.textContent = appt.scheduled_at
        ? 'Currently confirmed for ' + apptWhen(appt.scheduled_at) + '.'
        : 'Not yet confirmed. Entering a time above and setting the status to '
          + 'Confirmed will confirm ' + apptWhen(
            SCHOOLTIME.schoolLocalToIso(parts.date, parts.time)
          ) + '.';
    }

    const saveNote = getEl('apptSaveNote');
    if (saveNote) {
      // The schema has no notification for appointments, so this has to be
      // stated or staff will assume confirming tells the student.
      saveNote.textContent =
        'Saving does not message the student. Use “Message student” so they receive '
        + 'the confirmed time.';
    }
  }

  function closeApptDetail() {
    openApptId = null;
    getEl('apptDetailCard')?.classList.add('hidden');
  }

  async function saveApptDetail(event) {
    event.preventDefault();
    if (!openApptId) return;

    const button = getEl('btnApptSave');
    button.disabled = true;
    const label = button.textContent;
    button.textContent = 'Saving…';

    try {
      const status = getEl('apptStatus')?.value || 'pending';
      const date = getEl('apptDate')?.value || '';
      const time = getEl('apptTime')?.value || '';
      const note = getEl('apptNote')?.value.trim() || null;
      const me = myId();

      // Only write scheduled_at when actually confirming, so declining does
      // not leave a confirmed-looking time attached to a declined request.
      const patch = {
        status,
        staff_note: note,
        assigned_to: me
      };

      if (status === 'confirmed') {
        if (!date || !time) {
          toast('Enter a confirmed date and time, or pick a different status.', {
            type: 'error'
          });
          return;
        }
        const scheduledAt = SCHOOLTIME.schoolLocalToIso(date, time);
        if (!scheduledAt) {
          toast('That date and time could not be read.', { type: 'error' });
          return;
        }
        // Caught here for a readable message; the trigger repeats the check
        // so a hand-written or stale client cannot book a slot in the past.
        if (SCHOOLTIME.isPast(scheduledAt)) {
          toast('That time has already passed. Confirm a future time.', {
            type: 'error'
          });
          return;
        }
        patch.scheduled_at = scheduledAt;
      } else {
        patch.scheduled_at = null;
      }

      const { error } = await supabaseClient
        .from('appointments')
        .update(patch)
        .eq('id', openApptId);

      if (error) throw error;

      toast('Request updated.', { type: 'success' });
      await loadAppointments();
      openApptDetail(openApptId);
      announce('Request updated. Message the student to confirm the time.');
    } catch (err) {
      console.error('[appointments] save failed:', err);
      toast('Could not update the request.', { type: 'error' });
    } finally {
      button.disabled = false;
      button.textContent = label;
    }
  }

  function wireAppointments() {
    on(document, 'click', '[data-appt-open]', (event, button) =>
      openApptDetail(button.dataset.apptOpen));
    on(document, 'click', '#btnCloseApptDetail', closeApptDetail);
    on(document, 'click', '#btnRefreshAppt', () => {
      loadAppointments().catch(err => {
        console.warn('[appointments] refresh failed:', err);
        toast('Could not refresh', { type: 'error' });
      });
    });
    on(document, 'submit', '#apptActionForm', (event) => saveApptDetail(event));

    // Jump straight into the conversation the booking trigger created, so
    // staff can confirm without hunting for the student.
    on(document, 'click', '#btnApptMessage', () => {
      const appt = appointments.find(a => a.id === openApptId);
      if (!appt) return;
      goTo('messages');
      if (typeof openThread === 'function') openThread(appt.student_id);
    });
  }

  async function init() {
    if (!window.supabaseClient) {
      toast('The portal could not reach the server.', { type: 'error' });
      return;
    }

    // 'registrar' was missing from this list, so a real registrar was
    // redirected away from the registrar portal.
    const auth = await initAuthGuard(['registrar', 'admin', 'staff', 'dean']);
    if (!auth) return;

    currentUserId = auth.user.id;

    const name = auth.profile.full_name || 'Registrar';
    setText(getEl('userName'), name);
    setText(getEl('welcomeName'), name);

    wireMessaging();
    wireAppointments();
    wire();
    await loadAll();
    if (window.imccHidePreloader) window.imccHidePreloader();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
