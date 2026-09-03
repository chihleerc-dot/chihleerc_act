const GAS_API_URL = 'https://script.google.com/macros/s/AKfycbwcGcSGodBzE5EjYHvNoVjxAsWnyB5D53cB-JGc7IFoT8zmmosdenW9BsOSdCbHMS6vRg/exec';

        let state = {
            isTeacherLoggedIn: false, currentUserRole: null, currentUserName: null, currentFilter: '全部',
            selectedEventIds: [], currentAdminEventId: null, currentRemarkStudent: null,
            tempTags: [], tempSessions: [], adminCurrentPage: 1, editingRegId: null,
            events: [], eventStats: {}, counselors: [], registrations: [], admins: [], logs: [], adminCreds: null, adminAddTempStudent: null, myRegistrations: [],
            lineUsage: { month: '', used: 0, limit: 200, remaining: 200 }, dataQualityReport: null, archivePreview: null,
            studentIdentity: null, registeredEventIds: [],
            eventCounts: new Map()
        };

        let isFormDirty = false;
        const modalFocusHistory = new Map();
        function markDirty() { isFormDirty = true; }
        function resetDirty() { isFormDirty = false; }
        window.addEventListener('beforeunload', function (e) { if (isFormDirty) { e.preventDefault(); e.returnValue = ''; } });

        function enhanceAccessibility() {
            document.querySelectorAll('[id^="modal-"]').forEach(modal => {
                modal.setAttribute('role', 'dialog');
                modal.setAttribute('aria-modal', 'true');
                modal.setAttribute('aria-hidden', modal.classList.contains('hidden') ? 'true' : 'false');
                const heading = modal.querySelector('h2, h3, h4');
                if (heading) {
                    if (!heading.id) heading.id = `${modal.id}-title`;
                    modal.setAttribute('aria-labelledby', heading.id);
                }
                modal.querySelectorAll('button').forEach(button => {
                    if (!button.getAttribute('aria-label') && button.querySelector('.fa-xmark')) {
                        button.setAttribute('aria-label', '關閉視窗');
                    }
                });
            });
            document.querySelectorAll('i[class*="fa-"]').forEach(icon => icon.setAttribute('aria-hidden', 'true'));
        }

        document.addEventListener('keydown', event => {
            const openModals = [...document.querySelectorAll('[id^="modal-"]:not(.hidden)')];
            const modal = openModals.at(-1);
            if (!modal) return;

            if (event.key === 'Escape') {
                if (modal.id === 'modal-edit-event') safeCloseEditEvent();
                else if (modal.id === 'modal-remark') safeCloseRemark();
                else closeModal(modal.id);
                return;
            }

            if (event.key === 'Tab') {
                const focusable = [...modal.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [href], [tabindex]:not([tabindex="-1"])')]
                    .filter(element => element.offsetParent !== null);
                if (!focusable.length) return;
                const first = focusable[0];
                const last = focusable[focusable.length - 1];
                if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
                else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
            }
        });

        function handleAdminAddSessionChange_(input) {
            const index = Number(input.dataset.index);
            const isOneOnOne = input.dataset.oneOnOne === 'true';
            if (input.dataset.locked === 'true') {
                input.checked = false;
                return;
            }
            if (isOneOnOne) {
                document.querySelectorAll('.admin-add-meal-sel').forEach(select => {
                    select.disabled = true;
                    select.value = '不用餐';
                });
                if (input.checked) {
                    for (let i = 0; i < Number(input.dataset.sessionCount || 0); i++) {
                        if (i === index) continue;
                        const checkbox = document.getElementById(`admin-add-attend-${i}`);
                        if (checkbox && !checkbox.disabled) checkbox.checked = false;
                    }
                }
            }
            const mealSelect = document.getElementById(`admin-add-meal-${index}`);
            if (mealSelect) {
                mealSelect.disabled = !input.checked;
                if (!input.checked) mealSelect.value = '不用餐';
            }
        }

        function handleRemarkSessionChange_(input) {
            const index = Number(input.dataset.index);
            if (input.dataset.locked === 'true') {
                input.checked = false;
                return;
            }
            markDirty();
            const isOneOnOne = input.dataset.oneOnOne === 'true';
            if (isOneOnOne) {
                document.querySelectorAll('.remark-meal-sel').forEach(select => {
                    select.disabled = true;
                    select.value = '不用餐';
                });
                if (input.checked) {
                    for (let i = 0; i < Number(input.dataset.sessionCount || 0); i++) {
                        if (i === index) continue;
                        const checkbox = document.getElementById(`remark-attend-${i}`);
                        if (checkbox && !checkbox.disabled) checkbox.checked = false;
                    }
                }
            }
            const mealSelect = document.getElementById(`remark-meal-${index}`);
            if (mealSelect) {
                mealSelect.disabled = !input.checked;
                if (!input.checked) mealSelect.value = '不用餐';
            }
        }

        document.addEventListener('click', event => {
            const target = event.target.closest('[data-action]');
            if (!target || target.disabled) return;
            const action = target.dataset.action;
            const eventId = target.dataset.eventId || '';
            const registrationId = target.dataset.registrationId || '';
            const actions = {
                'switch-view': () => switchView(target.dataset.view),
                'open-query': () => openQueryModal(),
                'logout': () => logoutTeacher(),
                'clear-student-data': () => clearStudentData(),
                'filter-events': () => filterEvents(target.dataset.category),
                'open-register': () => openRegisterModal(),
                'switch-admin-tab': () => switchAdminTab(target.dataset.tab),
                'reload-data': () => reloadDataSilently('手動更新資料...'),
                'open-edit-event': () => openEditEventModal(eventId || undefined),
                'close-modal': () => closeModal(target.dataset.modal),
                'close-query': () => closeQueryModalSafe(),
                'execute-student-query': () => executeStudentQuery(),
                'safe-close-edit-event': () => safeCloseEditEvent(),
                'add-tag': () => { addTempTag(); markDirty(); },
                'add-session': () => { addSessionField(); markDirty(); },
                'refresh-participants': () => refreshParticipantsModal(),
                'open-admin-add-participant': () => openAdminAddParticipantModal(),
                'load-data-quality': () => loadDataQualityReport(),
                'load-archive-preview': () => loadArchivePreview(),
                'archive-year': () => archiveSelectedYear(),
                'verify-admin-student': () => verifyStudentForAdminAdd(),
                'submit-admin-add': () => submitAdminAddParticipant(),
                'safe-close-remark': () => safeCloseRemark(),
                'save-admin-remark': () => saveAdminRemark(),
                'save-line-draft': () => saveLineDraft(),
                'clear-line-draft': () => clearLineDraft(),
                'toggle-all-notify': () => toggleAllNotify(target),
                'confirm-send-line': () => confirmSendLine(),
                'delete-event': () => deleteAdminEvent(eventId),
                'toggle-published': () => toggleEventPublished(eventId, target.dataset.published === 'true'),
                'open-participants': () => window.openParticipantsModal(eventId),
                'open-notify': () => openNotifyModal(eventId),
                'dashboard-page': () => renderTeacherDashboard(Number(target.dataset.page) || 1),
                'remove-temp-tag': () => { removeTempTag(Number(target.dataset.index)); markDirty(); },
                'remove-temp-session': () => { removeTempSession(Number(target.dataset.index)); markDirty(); },
                'open-admin-remark': () => openAdminRemarkModal(registrationId, target.dataset.studentName || ''),
                'delete-participant': () => deleteParticipantAdmin(registrationId)
            };
            if (actions[action]) actions[action]();
        });

        document.addEventListener('submit', event => {
            const form = event.target.closest('[data-submit-action]');
            if (!form) return;
            const action = form.dataset.submitAction;
            if (action === 'login') handleLogin(event);
            else if (action === 'registration') submitRegistration(event);
            else if (action === 'event-edit') submitEventEdit(event);
        });

        document.addEventListener('input', event => {
            const target = event.target.closest('[data-input-action]');
            if (!target) return;
            if (target.dataset.inputAction === 'render-dashboard') renderTeacherDashboard(1);
            if (target.dataset.inputAction === 'mark-dirty') markDirty();
        });

        document.addEventListener('change', event => {
            const target = event.target.closest('[data-change-action]');
            if (!target) return;
            const action = target.dataset.changeAction;
            if (action === 'render-dashboard') renderTeacherDashboard(1);
            else if (action === 'mark-dirty') markDirty();
            else if (action === 'activity-type') { handleActivityTypeChange(); markDirty(); }
            else if (action === 'line-template') changeLineTemplate();
            else if (action === 'toggle-event-selection') toggleEventSelection(target.dataset.eventId, target.checked);
            else if (action === 'registration-session') handleRegSessionChange(target.dataset.eventId, Number(target.dataset.index), target.dataset.oneOnOne === 'true', target);
            else if (action === 'admin-add-session') handleAdminAddSessionChange_(target);
            else if (action === 'remark-session') handleRemarkSessionChange_(target);
            else if (action === 'update-select-all') updateSelectAllState();
            else if (action === 'archive-year') {
                state.archivePreview = null;
                renderArchivePreview(null);
            }
        });

        document.addEventListener('blur', event => {
            const target = event.target.closest('[data-blur-action="format-session-time"]');
            if (!target) return;
            formatTimeRange(target);
            syncTempSessions();
        }, true);

        document.addEventListener('keydown', event => {
            const target = event.target.closest('[data-keydown-action="add-tag"]');
            if (target && event.key === 'Enter') {
                event.preventDefault();
                addTempTag();
                markDirty();
            }
        });

        function formatSafeDate(dateInput) {
            if (!dateInput) return '';
            const d = new Date(dateInput);
            if (isNaN(d.getTime())) return String(dateInput);
            const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
                timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit',
                hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
            }).formatToParts(d).filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
            return `${parts.year}/${parts.month}/${parts.day} ${parts.hour}:${parts.minute}`;
        }

        const escapeHTML = (str) => {
            if (str === null || str === undefined) return '';
            return String(str).replace(/[&<>'"]/g, tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag));
        };

        function getCategoryBadgeClass(category) {
            if (category === '人際') return 'category-pill category-pill-inter';
            if (category === '課業') return 'category-pill category-pill-academic';
            if (category === '職涯') return 'category-pill category-pill-career';
            return 'category-pill category-pill-neutral';
        }

        function getCategoryAccentClass(category) {
            if (category === '人際') return 'bg-cat-inter-bg';
            if (category === '課業') return 'bg-cat-academic-bg';
            if (category === '職涯') return 'bg-cat-career-bg';
            return 'bg-gray-100';
        }

        function normalizeRegistrations(regs) {
            if (!regs || !Array.isArray(regs)) return [];
            return regs.map(r => {
                let realSessions = r.sessionsData;
                let realRemark = r.adminRemark;
                if (realRemark && typeof realRemark === 'object' && Array.isArray(realRemark)) {
                    realSessions = realRemark;
                    realRemark = typeof r.sessionsData === 'string' ? r.sessionsData : '';
                } else if (typeof realSessions === 'string') {
                    try { realSessions = JSON.parse(realSessions); } catch(e) { realSessions = []; }
                }
                if (!Array.isArray(realSessions)) realSessions = [];
                if (typeof realRemark !== 'string') realRemark = realRemark != null ? String(realRemark) : '';
                if (realRemark === '[object Object]') realRemark = '';
                r.sessionsData = realSessions;
                r.adminRemark = realRemark;
                return r;
            });
        }

        function updateEventCounts() {
            state.eventCounts.clear();
            if (state.isTeacherLoggedIn) {
                (Array.isArray(state.registrations) ? state.registrations : []).forEach(registration => {
                    const hasAttendance = (Array.isArray(registration.sessionsData) ? registration.sessionsData : [])
                        .some(session => session && session.attend === true);
                    if (!hasAttendance) return;
                    const eventId = String(registration.eventId);
                    state.eventCounts.set(eventId, (state.eventCounts.get(eventId) || 0) + 1);
                });
                return;
            }
            Object.entries(state.eventStats || {}).forEach(([eventId, stats]) => {
                const count = Number(stats && stats.registrationCount);
                state.eventCounts.set(String(eventId), Number.isFinite(count) && count >= 0 ? count : 0);
            });
        }

        function syncRegisteredEventIds() {
            const validEventIds = new Set(state.events.map(event => String(event.id)));
            state.registeredEventIds = (Array.isArray(state.registeredEventIds) ? state.registeredEventIds : [])
                .map(String)
                .filter(eventId => validEventIds.has(eventId));
            return state.registeredEventIds;
        }

        function renderCounselorOptions() {
            const counselors = Array.isArray(state.counselors) ? state.counselors : [];
            ['reg-counselor', 'query-counselor'].forEach(id => {
                const select = document.getElementById(id);
                if (!select) return;
                const previous = select.value;
                select.replaceChildren();
                const placeholder = document.createElement('option');
                placeholder.value = '';
                placeholder.textContent = counselors.length ? '請選擇個管老師' : '目前無可選個管老師';
                select.appendChild(placeholder);
                counselors.forEach(name => {
                    const option = document.createElement('option');
                    option.value = String(name);
                    option.textContent = String(name);
                    select.appendChild(option);
                });
                if (counselors.includes(previous)) select.value = previous;
            });
        }

        function clearStudentData() {
            state.studentIdentity = null;
            state.registeredEventIds = [];
            state.myRegistrations = [];
            state.selectedEventIds = [];
            document.getElementById('student-identity-bar').classList.add('hidden');
            showToast('本次頁面的學生資料已清除', 'success');
            renderStudentEvents();
            loadSavedStudentInfo();
        }

        function safeCloseEditEvent() { if (isFormDirty) { customConfirm('您有尚未儲存的變更，確定要放棄並離開嗎？', () => { resetDirty(); closeModal('modal-edit-event'); }); } else closeModal('modal-edit-event'); }
        function safeCloseRemark() { if (isFormDirty) { customConfirm('您有尚未儲存的變更，確定要放棄並離開嗎？', () => { resetDirty(); closeModal('modal-remark'); }); } else closeModal('modal-remark'); }

        function copyText(text, label) {
            navigator.clipboard.writeText(text).then(() => { showToast(`已複製 ${label}：${text}`, 'success'); }).catch(() => {
                const textArea = document.createElement("textarea"); textArea.value = text;
                document.body.appendChild(textArea); textArea.select(); document.execCommand('copy'); document.body.removeChild(textArea);
                showToast(`已複製 ${label}：${text}`, 'success');
            });
        }

        function showGlobalLoading(show, text = '處理中...') {
            const loader = document.getElementById('global-loader'); document.getElementById('loader-text').innerText = text;
            loader.setAttribute('aria-hidden', show ? 'false' : 'true');
            if (show) loader.classList.remove('hidden'); else loader.classList.add('hidden');
        }

        function showSkeletonLoading(show) {
            if (show) {
                document.getElementById('skeleton-student').classList.remove('hidden'); document.getElementById('student-main-content').classList.add('hidden');
                if(state.isTeacherLoggedIn) { document.getElementById('skeleton-admin').classList.remove('hidden'); document.getElementById('adminActivitySection').classList.add('hidden'); }
            } else {
                document.getElementById('skeleton-student').classList.add('hidden'); document.getElementById('student-main-content').classList.remove('hidden');
                if(state.isTeacherLoggedIn) { document.getElementById('skeleton-admin').classList.add('hidden'); document.getElementById('adminActivitySection').classList.remove('hidden'); }
            }
        }

        // 固定記錄這一版完成修改的時間，不會因登入、重新整理或查詢資料而改變。
        const VERSION_LABEL = 'V11.13';
        const VERSION_UPDATED_AT = '2026/09/03 11:25';
        const VERSION_UPDATED_AT_ISO = '2026-09-03T11:25:00+08:00';
        const API_TIMEOUT_MS = 20000;

        function isPlainObject(value) {
            return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
        }

        function validateEventArray(events, label) {
            if (!Array.isArray(events)) throw new Error(`${label}活動資料格式不正確`);
            events.forEach(event => {
                if (!isPlainObject(event) || !Array.isArray(event.sessions)) throw new Error(`${label}活動場次格式不正確`);
                if (event.tags !== undefined && !Array.isArray(event.tags)) throw new Error(`${label}活動標籤格式不正確`);
            });
        }

        function validateApiResponseShape(response, action) {
            if (!isPlainObject(response) || typeof response.success !== 'boolean') {
                throw new Error('後端回傳格式不正確');
            }
            if (!response.success) return response;

            const data = response.data;
            if (action === 'getPublicData' && !isPlainObject(data)) throw new Error('公開資料格式不正確');
            if (action === 'getAdminData' && (!isPlainObject(data) || !isPlainObject(data.fullData))) throw new Error('後台資料格式不正確');
            if (action === 'login' && (
                !isPlainObject(data) || typeof data.token !== 'string' || !data.token ||
                typeof data.name !== 'string' || !['admin', 'staff'].includes(data.role) || !isPlainObject(data.fullData)
            )) throw new Error('登入資料格式不正確');
            if (action === 'queryStudent' && !Array.isArray(data)) throw new Error('查詢結果格式不正確');
            if (action === 'lookupStudentForAdminRegistration' && (
                !isPlainObject(data) || typeof data.id !== 'string' || typeof data.name !== 'string'
            )) throw new Error('學生資料格式不正確');
            if (action === 'sendLineNotification' && (
                typeof response.successCount !== 'number' || typeof response.failCount !== 'number' || !Array.isArray(response.failedStudents) ||
                !isPlainObject(response.lineUsage)
            )) throw new Error('LINE 發送結果格式不正確');
            if (action === 'getDataQualityReport' && (
                !isPlainObject(data) || !isPlainObject(data.summary) || !Array.isArray(data.issues)
            )) throw new Error('資料檢查報告格式不正確');
            if (action === 'getArchivePreview' && (
                !isPlainObject(data) || typeof data.year !== 'number' || typeof data.eventCount !== 'number' ||
                typeof data.registrationCount !== 'number' || typeof data.logCount !== 'number'
            )) throw new Error('歸檔預覽格式不正確');
            if (action === 'archiveYearData' && (!isPlainObject(data) || data.success !== true)) {
                throw new Error('年度歸檔結果格式不正確');
            }
            if (isPlainObject(data) && data.events !== undefined) {
                validateEventArray(data.events, '公開');
                if (!isPlainObject(data.eventStats) || !Array.isArray(data.counselors)) throw new Error('公開資料格式不正確');
            }
            if (isPlainObject(data) && data.fullData !== undefined) {
                const fullData = data.fullData;
                if (!isPlainObject(fullData)) throw new Error('後台資料格式不正確');
                validateEventArray(fullData.events, '後台');
                if (!Array.isArray(fullData.registrations) || !Array.isArray(fullData.logs) || !Array.isArray(fullData.admins)) {
                    throw new Error('後台清單格式不正確');
                }
                if (
                    !isPlainObject(fullData.lineUsage) || typeof fullData.lineUsage.used !== 'number' ||
                    typeof fullData.lineUsage.limit !== 'number' || typeof fullData.lineUsage.remaining !== 'number'
                ) throw new Error('LINE 用量格式不正確');
                fullData.registrations.forEach(registration => {
                    if (!isPlainObject(registration) || !Array.isArray(registration.sessionsData)) throw new Error('報名場次格式不正確');
                });
            }
            if (Array.isArray(data)) {
                data.forEach(registration => {
                    if (!isPlainObject(registration) || !Array.isArray(registration.sessionsData)) throw new Error('查詢結果格式不正確');
                    if (registration.eventSummary && !Array.isArray(registration.eventSummary.sessions)) throw new Error('活動摘要格式不正確');
                });
            }
            return response;
        }

        async function apiRequest(payload, timeoutMs = API_TIMEOUT_MS) {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
            try {
                const response = await fetch(GAS_API_URL, {
                    method: 'POST',
                    redirect: 'follow',
                    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                    body: JSON.stringify(payload),
                    signal: controller.signal
                });
                if (!response.ok) throw new Error(`連線失敗（HTTP ${response.status}）`);
                const text = await response.text();
                let parsed;
                try {
                    parsed = JSON.parse(text);
                } catch (error) {
                    const invalidResponseError = new Error('後端未回傳正確資料');
                    invalidResponseError.code = 'INVALID_RESPONSE';
                    throw invalidResponseError;
                }
                return validateApiResponseShape(parsed, String(payload && payload.action || ''));
            } catch (error) {
                if (error && error.name === 'AbortError') {
                    const timeoutError = new Error('連線逾時，請重新操作');
                    timeoutError.code = 'REQUEST_TIMEOUT';
                    throw timeoutError;
                }
                throw error;
            } finally {
                clearTimeout(timeoutId);
            }
        }

        function getRequestErrorMessage(error, fallback = '網路連線異常') {
            return error && error.message ? error.message : fallback;
        }

        function pruneSelectedEventIds(publicEvents) {
            const validEventIds = new Set((Array.isArray(publicEvents) ? publicEvents : []).map(event => String(event.id)));
            state.selectedEventIds = state.selectedEventIds.filter(eventId => validEventIds.has(String(eventId)));
            updateBulkActionBar();
        }

        function updateVersionTime() {
            const el = document.getElementById('version-display');
            if (el) {
                el.setAttribute('title', `版本：${VERSION_LABEL}｜更新時間：${VERSION_UPDATED_AT}`);
                el.innerHTML = `<i class="fa-solid fa-code-commit mr-1" aria-hidden="true"></i><span class="sr-only">版本：</span><strong>${VERSION_LABEL}</strong><span aria-hidden="true">｜</span><span class="sr-only">更新時間：</span><time datetime="${VERSION_UPDATED_AT_ISO}">${VERSION_UPDATED_AT}</time>`;
            }
        }

        function showToast(message, type = 'info') {
            const container = document.getElementById('toast-container'); const toast = document.createElement('div');
            let bgColor = type === 'success' ? 'bg-green-600' : type === 'error' ? 'bg-red-600' : 'bg-gray-800';
            let icon = type === 'success' ? '<i class="fa-solid fa-circle-check mr-2 text-lg"></i>' : type === 'error' ? '<i class="fa-solid fa-circle-exclamation mr-2 text-lg"></i>' : '<i class="fa-solid fa-circle-info mr-2 text-lg"></i>';
            toast.setAttribute('role', type === 'error' ? 'alert' : 'status');
            toast.className = `${bgColor} text-white px-4 md:px-5 py-3 rounded-lg shadow-xl flex items-center font-bold text-sm toast-enter pointer-events-auto mb-2`;
            toast.innerHTML = icon;
            const messageSpan = document.createElement('span');
            messageSpan.textContent = String(message == null ? '' : message);
            toast.appendChild(messageSpan);
            container.appendChild(toast); setTimeout(() => { toast.classList.add('toast-exit'); setTimeout(() => toast.remove(), 300); }, 3000);
        }

        function openModal(id) {
            const modal = document.getElementById(id);
            if (!modal || !modal.classList.contains('hidden')) return;
            modalFocusHistory.set(id, document.activeElement);
            modal.classList.remove('hidden');
            modal.setAttribute('aria-hidden', 'false');
            document.body.classList.add('overflow-hidden');
            requestAnimationFrame(() => {
                const focusTarget = modal.querySelector('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [href], [tabindex]:not([tabindex="-1"])');
                if (focusTarget) focusTarget.focus();
            });
        }
        function closeModal(id) {
            const modal = document.getElementById(id);
            if (!modal) return;
            modal.classList.add('hidden');
            modal.setAttribute('aria-hidden', 'true');
            const stillHasOpenModal = document.querySelector('[id^="modal-"]:not(.hidden)');
            document.body.classList.toggle('overflow-hidden', Boolean(stillHasOpenModal));
            const focusTarget = modalFocusHistory.get(id);
            modalFocusHistory.delete(id);
            if (focusTarget && document.contains(focusTarget)) focusTarget.focus();
        }

        function checkTokenExpiration(res) {
            if (res && res.success === false && (res.code === 'TOKEN_EXPIRED' || (res.error && res.error.includes('憑證已失效或過期')))) {
                showToast('系統閒置過久或權限失效，請重新登入', 'error');
                logoutTeacher();
                return true;
            }
            return false;
        }

        async function fetchInitialData() {
            showSkeletonLoading(true);
            try {
                const res = await apiRequest({ action: 'getPublicData' });
                if (res.success) {
                    state.events = res.data.events;
                    state.eventStats = res.data.eventStats;
                    state.counselors = res.data.counselors;
                    pruneSelectedEventIds(res.data.events);
                    renderCounselorOptions();
                    if (!state.isTeacherLoggedIn) {
                        state.registrations = [];
                        state.admins = [];
                        state.logs = [];
                        updateEventCounts();
                        syncRegisteredEventIds();
                        renderStudentEvents();
                    }
                    updateVersionTime();
                } else {
                    showToast('資料庫讀取失敗：' + (res.error || '系統處理失敗'), 'error');
                }
            } catch (error) {
                if (error && error.code === 'INVALID_RESPONSE') {
                    const errorHtml = `
                        <div class="flex items-center text-[#da292e] font-bold text-base mb-4">
                            <i class="fa-solid fa-circle-minus text-xl mr-2"></i>系統連線遭 Google 阻擋！
                        </div>
                        <p class="text-gray-600 mb-6 text-sm">請通知系統管理員回到 GAS 編輯器執行以下步驟：</p>
                        <ol class="text-gray-700 text-sm space-y-2.5 pl-1 font-medium text-left">
                            <li>1. 點擊「部署」➔「管理部署」</li>
                            <li>2. 編輯目前的部署</li>
                            <li>3. 執行身分設為「我(Me)」</li>
                            <li>4. 誰可以存取設為「所有人(Anyone)」</li>
                            <li>5. 儲存部署。</li>
                        </ol>
                    `;
                    customConfirm(errorHtml, () => {}, 'API 權限設定錯誤');
                } else {
                    showToast(getRequestErrorMessage(error, '網路連線異常，無法取得資料'), 'error');
                }
            } finally {
                showSkeletonLoading(false);
            }
        }

        window.onload = async () => {
            enhanceAccessibility();
            updateVersionTime();
            await fetchInitialData();
            renderStudentEvents();
            loadSavedStudentInfo();
            switchView('student');
        };

        async function reloadDataSilently(loadingText = '同步最新資料中...') {
            showGlobalLoading(true, loadingText);
            const syncErrors = [];
            try {
                const publicRequest = apiRequest({ action: 'getPublicData' });
                const adminRequest = state.isTeacherLoggedIn && state.adminCreds
                    ? apiRequest({ action: 'getAdminData', adminAcc: state.adminCreds.acc, adminToken: state.adminCreds.token })
                    : Promise.resolve(null);
                const [publicResult, adminResult] = await Promise.allSettled([publicRequest, adminRequest]);

                if (publicResult.status === 'fulfilled') {
                    const pubData = publicResult.value;
                    if (pubData.success) {
                        // 公開資料刻意沒有承辦人；登入後不得用它覆蓋完整活動資料。
                        if (!state.isTeacherLoggedIn) state.events = pubData.data.events;
                        state.eventStats = pubData.data.eventStats;
                        state.counselors = pubData.data.counselors;
                        pruneSelectedEventIds(pubData.data.events);
                        renderCounselorOptions();
                        if (!state.isTeacherLoggedIn) {
                            state.registrations = [];
                            updateEventCounts();
                            syncRegisteredEventIds();
                            renderStudentEvents();
                        }
                    } else syncErrors.push(pubData.error || '公開資料同步失敗');
                } else {
                    syncErrors.push(getRequestErrorMessage(publicResult.reason, '公開資料同步失敗'));
                }

                if (adminResult.status === 'fulfilled' && adminResult.value) {
                        const authData = adminResult.value;
                        if (authData.success) {
                            state.events = authData.data.fullData.events;
                            state.registrations = normalizeRegistrations(authData.data.fullData.registrations);
                            state.logs = authData.data.fullData.logs;
                            state.admins = authData.data.fullData.admins;
                            state.lineUsage = authData.data.fullData.lineUsage;
                            updateEventCounts();
                            renderTeacherDashboard();
                        } else if (checkTokenExpiration(authData)) {
                            return false;
                        } else syncErrors.push(authData.error || '後台資料同步失敗');
                } else if (adminResult.status === 'rejected') {
                    syncErrors.push(getRequestErrorMessage(adminResult.reason, '後台資料同步失敗'));
                }
                updateVersionTime();
                if (syncErrors.length > 0) showToast(`背景同步未完成：${syncErrors[0]}`, 'error');
                return syncErrors.length === 0;
            } finally {
                showGlobalLoading(false);
            }
        }

        async function refreshParticipantsModal() {
            const eventId = state.currentAdminEventId;
            if (!eventId) return;
            const refreshed = await reloadDataSilently('同步最新報名狀態...');
            if (refreshed) openParticipantsModal(eventId);
        }

        function getEventRegistrationCount(eventId) {
            return state.eventCounts.get(String(eventId)) || 0;
        }

        function splitLocationLabels(value) {
            return String(value || '').split('、').map(location => location.trim()).filter(Boolean);
        }

        function renderLocationBadges(value) {
            const locations = splitLocationLabels(value);
            if (locations.length === 0) return '<span class="text-gray-400">未設定</span>';
            return locations.map(location => `<span class="inline-flex items-center max-w-full px-2 py-0.5 rounded-full border border-gray-300 bg-white text-gray-600 whitespace-normal break-words">${escapeHTML(location)}</span>`).join('');
        }

        function getDayOfWeek(dateString) {
            const match = String(dateString || '').match(/^(\d{4})[-/](\d{2})[-/](\d{2})$/);
            if (!match) return '';
            const dayIndex = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))).getUTCDay();
            const days = ['日', '一', '二', '三', '四', '五', '六'];
            return `(${days[dayIndex]})`;
        }
        function parseTaiwanDateTime(dateValue, timeValue = '00:00') {
            const dateMatch = String(dateValue || '').trim().match(/^(\d{4})[-/](\d{2})[-/](\d{2})$/);
            const timeMatch = String(timeValue || '00:00').trim().match(/^(\d{1,2}):(\d{2})$/);
            if (!dateMatch || !timeMatch) return null;
            const value = new Date(`${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}T${String(timeMatch[1]).padStart(2, '0')}:${timeMatch[2]}:00+08:00`);
            return isNaN(value.getTime()) ? null : value;
        }
        function getTaiwanDateParts(date = new Date()) {
            return Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
                timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit'
            }).formatToParts(date).filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
        }
        function getTodayStart() {
            const parts = getTaiwanDateParts();
            return parseTaiwanDateTime(`${parts.year}/${parts.month}/${parts.day}`);
        }
        function getSessionStartDate(session) {
            if (!session || !session.date) return null;
            const startTime = String(session.time || '').split('-')[0].trim();
            return parseTaiwanDateTime(session.date, startTime || '00:00');
        }
        function isSessionExpired(session, now = new Date()) {
            const start = getSessionStartDate(session);
            return start ? start < now : true;
        }
        function getNextUpcomingSessionDate(event, now = new Date()) {
            const dates = (event && Array.isArray(event.sessions) ? event.sessions : [])
                .map(getSessionStartDate)
                .filter(date => date && date >= now)
                .sort((left, right) => left - right);
            return dates[0] || null;
        }
        function formatTimeRange(input) { let val = String(input.value).trim(); let match = val.match(/^(\d{1,2})(\d{2})-(\d{1,2})(\d{2})$/); if (match) input.value = `${match[1].padStart(2, '0')}:${match[2]}-${match[3].padStart(2, '0')}:${match[4]}`; }

        function checkTimeConflict(time1, time2) {
            if (!time1 || !time2) return false;
            try {
                const parseM = (t) => {
                    let clean = String(t).replace(/:/g, '');
                    if (clean.length === 3) clean = '0' + clean;
                    if (clean.length >= 4) return parseInt(clean.substring(0, 2), 10) * 60 + parseInt(clean.substring(2, 4), 10);
                    return 0;
                };
                const norm1 = String(time1).replace(/[~～－—]/g, '-');
                const norm2 = String(time2).replace(/[~～－—]/g, '-');
                if (!norm1.includes('-') || !norm2.includes('-')) return false;

                const [s1Str, e1Str] = norm1.split('-');
                const [s2Str, e2Str] = norm2.split('-');
                const s1 = parseM(s1Str), e1 = parseM(e1Str);
                const s2 = parseM(s2Str), e2 = parseM(e2Str);
                if (isNaN(s1) || isNaN(e1) || isNaN(s2) || isNaN(e2)) return false;

                return (s1 < e2) && (s2 < e1);
            } catch(e) { return false; }
        }

        function findHistoricalRegistrationConflict(payloads, registrations) {
            const eventMap = new Map(state.events.map(event => [String(event.id), event]));
            for (const payload of payloads) {
                const requestedSessions = (payload.sessionsData || []).filter(session => session && session.attend === true);
                for (const registration of (Array.isArray(registrations) ? registrations : [])) {
                    const existingEvent = eventMap.get(String(registration.eventId)) || registration.eventSummary;
                    const existingSessions = (registration.sessionsData || []).filter(session => session && session.attend === true);
                    for (const requested of requestedSessions) {
                        const conflict = existingSessions.find(existing =>
                            String(existing.date || '') === String(requested.date || '') &&
                            checkTimeConflict(existing.time, requested.time)
                        );
                        if (conflict) {
                            return {
                                title: existingEvent ? existingEvent.title : '已報名活動',
                                date: String(conflict.date || ''),
                                time: String(conflict.time || '')
                            };
                        }
                    }
                }
            }
            return null;
        }

        function customConfirm(message, onConfirm, title = '確認操作') {
            document.getElementById('confirm-title').innerText = title;
            document.getElementById('confirm-msg-text').innerHTML = message;
            const modal = document.getElementById('modal-confirm');
            openModal('modal-confirm');

            document.getElementById('btn-confirm-cancel').onclick = () => {
                closeModal('modal-confirm');
            };

            document.getElementById('btn-confirm-ok').onclick = () => {
                closeModal('modal-confirm');
                onConfirm();
            };
        }

        function switchView(viewName) {
            document.getElementById('view-student').classList.add('hidden'); document.getElementById('view-teacher-login').classList.add('hidden');
            document.getElementById('view-teacher-dashboard').classList.add('hidden'); document.getElementById('bulk-action-bar').classList.add('hidden');

            const btnClassNormal = "px-2 md:px-3 py-1.5 md:py-2 rounded-md text-xs md:text-sm font-medium text-gray-300 hover:text-white hover:bg-chihlee-blue transition whitespace-nowrap shrink-0";
            document.getElementById('nav-student-btn').className = btnClassNormal;
            document.getElementById('nav-teacher-btn').className = btnClassNormal;
            document.getElementById('nav-student-btn').removeAttribute('aria-current');
            document.getElementById('nav-teacher-btn').removeAttribute('aria-current');

            if (viewName === 'student') {
                document.getElementById('view-student').classList.remove('hidden');
                document.getElementById('nav-student-btn').className = "px-2 md:px-3 py-1.5 md:py-2 rounded-md text-xs md:text-sm font-medium bg-chihlee-gold text-white shadow transition whitespace-nowrap shrink-0";
                document.getElementById('nav-student-btn').setAttribute('aria-current', 'page');
                updateBulkActionBar();
            } else if (viewName === 'teacherLogin' || viewName === 'teacherDashboard') {
                if (state.isTeacherLoggedIn) { document.getElementById('view-teacher-dashboard').classList.remove('hidden'); switchAdminTab('list'); renderTeacherDashboard(); }
                else document.getElementById('view-teacher-login').classList.remove('hidden');
                document.getElementById('nav-teacher-btn').className = "px-2 md:px-3 py-1.5 md:py-2 rounded-md text-xs md:text-sm font-medium bg-chihlee-red text-white shadow transition whitespace-nowrap shrink-0";
                document.getElementById('nav-teacher-btn').setAttribute('aria-current', 'page');
            }

            document.getElementById('nav-logout-btn').classList.toggle('hidden', !state.isTeacherLoggedIn);
            document.getElementById('nav-admin-badge').classList.toggle('hidden', state.currentUserRole !== 'admin');
            document.getElementById('nav-staff-badge').classList.toggle('hidden', state.currentUserRole !== 'staff');
            const archivePanel = document.getElementById('annual-archive-panel');
            if (archivePanel) archivePanel.classList.toggle('hidden', state.currentUserRole !== 'admin');

            if (state.isTeacherLoggedIn && state.currentUserRole === 'staff') {
                document.getElementById('nav-staff-badge').innerHTML = `<i class="fa-solid fa-user-shield mr-1"></i><span class="hidden sm:inline">${escapeHTML(state.currentUserName)}</span>`;
            }

        }

        async function handleLogin(e) {
            if (e && e.preventDefault) e.preventDefault();
            let acc, pwd;
            if (e && e.target && e.target.tagName === 'FORM') { acc = document.getElementById('admin-account').value.trim(); pwd = document.getElementById('admin-password').value; }
            else return;

            const errorMsgEl = document.getElementById('login-error-msg');
            const loginBtn = document.getElementById('login-submit-btn');
            if (errorMsgEl) errorMsgEl.classList.add('hidden');

            if (loginBtn) {
                loginBtn.disabled = true;
                loginBtn.classList.add('opacity-50', 'cursor-not-allowed');
                loginBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin mr-2"></i>登入中...';
            }
            showGlobalLoading(true, '安全連線驗證中...');

            try {
                const res = await apiRequest({ action: 'login', account: acc, password: pwd });
                if (res.success) {
                    const user = res.data;
                    let refreshedPublicData = null;
                    try {
                        const pubData = await apiRequest({ action: 'getPublicData' }, 8000);
                        if (pubData.success) refreshedPublicData = pubData.data;
                        else showToast(`登入成功，但公開資料同步失敗：${pubData.error || '系統處理失敗'}`, 'info');
                    } catch (publicError) {
                        showToast(`登入成功，但公開資料同步失敗：${getRequestErrorMessage(publicError)}`, 'info');
                    }

                    // 所有登入必要資料確認完成後才一次寫入狀態，避免畫面顯示失敗但記憶體已登入。
                    state.adminCreds = { acc, token: user.token };
                    state.isTeacherLoggedIn = true;
                    state.currentUserRole = user.role;
                    state.currentUserName = user.name;
                    state.events = user.fullData.events;
                    state.registrations = normalizeRegistrations(user.fullData.registrations);
                    state.logs = user.fullData.logs;
                    state.admins = user.fullData.admins;
                    state.lineUsage = user.fullData.lineUsage;
                    if (refreshedPublicData) {
                        state.eventStats = refreshedPublicData.eventStats;
                        state.counselors = refreshedPublicData.counselors;
                        pruneSelectedEventIds(refreshedPublicData.events);
                        renderCounselorOptions();
                    }
                    document.getElementById('admin-account').value = '';
                    document.getElementById('admin-password').value = '';

                    updateEventCounts();

                    document.getElementById('teacher-search-input').value = '';
                    document.getElementById('teacher-year-filter').innerHTML = '';
                    document.getElementById('teacher-category-filter').value = 'all';
                    document.getElementById('teacher-name-filter').innerHTML = '';

                    if (e && e.target && e.target.tagName === 'FORM') showToast(`${user.name} 登入成功！`, 'success');
                    updateVersionTime(); switchView('teacherDashboard');
                } else {
                    if (errorMsgEl) { errorMsgEl.innerText = res.error || '帳號或密碼錯誤，請重新確認'; errorMsgEl.classList.remove('hidden'); }
                    showToast(res.error || '帳號或密碼錯誤', 'error');
                    if (!e || !(e.target && e.target.tagName === 'FORM')) logoutTeacher();
                }
            } catch (err) {
                const message = getRequestErrorMessage(err, '登入連線失敗，請檢查網路');
                if (errorMsgEl) { errorMsgEl.innerText = message; errorMsgEl.classList.remove('hidden'); }
                showToast(message, 'error');
            } finally {
                if (loginBtn) {
                    loginBtn.disabled = false;
                    loginBtn.classList.remove('opacity-50', 'cursor-not-allowed');
                    loginBtn.innerHTML = '登入';
                }
                showGlobalLoading(false);
            }
        }

        async function logoutTeacher() {
            const credentials = state.adminCreds;
            if (credentials && credentials.acc && credentials.token) {
                try {
                    await apiRequest({ action: 'logout', adminAcc: credentials.acc, adminToken: credentials.token }, 8000);
                } catch (error) {
                    // 即使網路中斷也先清除瀏覽器記憶體中的登入狀態；token 最遲仍會依後端 TTL 到期。
                }
            }
            state.adminCreds = null; state.isTeacherLoggedIn = false; state.currentUserRole = null; state.currentUserName = null;
            state.logs = []; state.admins = [];
            showToast('已安全登出', 'info'); switchView('student');
            await fetchInitialData(); renderStudentEvents();
        }

        function filterEvents(category) {
            state.currentFilter = category;
            document.querySelectorAll('#category-filters button').forEach(btn => {
                const cat = btn.getAttribute('data-category');
                btn.setAttribute('aria-pressed', cat === category ? 'true' : 'false');
                if(cat === category) {
                    btn.className = "filter-btn active px-3 py-1.5 md:px-4 md:py-2 rounded-full border border-chihlee-blue bg-chihlee-blue text-white text-xs md:text-sm font-medium transition shadow-sm";
                } else {
                    let hover = 'hover:border-chihlee-gold hover:text-chihlee-gold';
                    if(cat === '人際') hover = 'hover:border-cat-inter-text hover:text-cat-inter-text';
                    if(cat === '課業') hover = 'hover:border-cat-academic-text hover:text-cat-academic-text';
                    if(cat === '職涯') hover = 'hover:border-cat-career-text hover:text-cat-career-text';
                    btn.className = `filter-btn px-3 py-1.5 md:px-4 md:py-2 rounded-full border border-gray-300 bg-white text-gray-700 ${hover} text-xs md:text-sm font-medium transition`;
                }
            });
            renderStudentEvents();
        }

        function updateBulkActionBar() {
            const bar = document.getElementById('bulk-action-bar'); document.getElementById('selected-count').innerText = state.selectedEventIds.length;
            if (state.selectedEventIds.length > 0) bar.classList.remove('hidden'); else bar.classList.add('hidden');
        }

        function toggleEventSelection(eventId, isChecked) {
            const safeId = String(eventId);
            if (isChecked) {
                if (!state.selectedEventIds.includes(safeId)) state.selectedEventIds.push(safeId);
            } else {
                state.selectedEventIds = state.selectedEventIds.filter(id => String(id) !== safeId);
            }

            const labelEl = document.getElementById(`event-card-${safeId}`);
            if (labelEl) {
                if (isChecked) {
                    labelEl.classList.remove('hover:bg-yellow-50/50', 'bg-yellow-50/20', 'border-transparent', 'hover:bg-gray-50');
                    labelEl.classList.add('bg-blue-50/30', 'border-chihlee-blue', 'hover:bg-blue-50/50');
                } else {
                    labelEl.classList.remove('bg-blue-50/30', 'border-chihlee-blue', 'hover:bg-blue-50/50');
                    const ev = state.events.find(e => String(e.id) === safeId);
                    if (ev) {
                        const now = new Date();
                        const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
                        let activeSession = ev.sessions.find(s => {
                            const sDateTime = getSessionStartDate(s);
                            return sDateTime ? sDateTime >= now : false;
                        }) || ev.sessions[0];

                        const activeSessionDateTime = getSessionStartDate(activeSession);
                        const isWithinOneMonth = activeSessionDateTime && activeSessionDateTime <= thirtyDaysFromNow;

                        if (isWithinOneMonth) {
                            labelEl.classList.add('hover:bg-yellow-50/50', 'bg-yellow-50/20', 'border-chihlee-gold');
                        } else {
                            labelEl.classList.add('hover:bg-gray-50', 'border-transparent');
                        }
                    }
                }
            }
            updateBulkActionBar();
        }

        function renderStudentEvents() {
            const container = document.getElementById('student-events-container'); container.innerHTML = '';

            const savedSid = state.studentIdentity ? state.studentIdentity.sid : '';
            const mySavedEvents = syncRegisteredEventIds();

            const idBar = document.getElementById('student-identity-bar');
            if (idBar) {
                if (savedSid && !state.isTeacherLoggedIn) {
                    document.getElementById('current-sid-display').innerText = savedSid;
                    idBar.classList.remove('hidden');
                } else {
                    idBar.classList.add('hidden');
                }
            }

            const now = new Date();
            const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

            const validEvents = state.events.filter(ev => Boolean(getNextUpcomingSessionDate(ev, now)));

            const allCount = validEvents.length;
            const interCount = validEvents.filter(e => e.category === '人際').length;
            const acadCount = validEvents.filter(e => e.category === '課業').length;
            const careerCount = validEvents.filter(e => e.category === '職涯').length;

            const btnAll = document.getElementById('filter-btn-all'); if(btnAll) btnAll.innerHTML = `全部 <span class="ml-1 text-[10px] md:text-xs opacity-80">(${allCount})</span>`;
            const btnInter = document.getElementById('filter-btn-inter'); if(btnInter) btnInter.innerHTML = `人際 <span class="ml-1 text-[10px] md:text-xs opacity-80">(${interCount})</span>`;
            const btnAcad = document.getElementById('filter-btn-academic'); if(btnAcad) btnAcad.innerHTML = `課業 <span class="ml-1 text-[10px] md:text-xs opacity-80">(${acadCount})</span>`;
            const btnCareer = document.getElementById('filter-btn-career'); if(btnCareer) btnCareer.innerHTML = `職涯 <span class="ml-1 text-[10px] md:text-xs opacity-80">(${careerCount})</span>`;

            const visibleEvents = validEvents.filter(ev => state.currentFilter === '全部' || ev.category === state.currentFilter);

            if (visibleEvents.length === 0) {
                document.getElementById('no-events-msg').classList.remove('hidden'); container.parentElement.classList.add('hidden');
                updateBulkActionBar(); return;
            }
            document.getElementById('no-events-msg').classList.add('hidden'); container.parentElement.classList.remove('hidden');
            visibleEvents.sort((a, b) => getNextUpcomingSessionDate(a, now) - getNextUpcomingSessionDate(b, now));

            visibleEvents.forEach(ev => {
                const categoryBadgeClass = getCategoryBadgeClass(ev.category);

                const safeEvId = String(ev.id);
                const currentCount = getEventRegistrationCount(ev.id);
                const isFull = ev.capacity && currentCount >= ev.capacity;
                const isAlreadyRegistered = mySavedEvents.some(id => String(id) === safeEvId);
                let isChecked = state.selectedEventIds.includes(safeEvId);
                const isOoo = ev.isOneOnOne === true;
                const isSeries = ev.isSeries === true;

                let activeSession = ev.sessions.find(s => !isSessionExpired(s, now)) || ev.sessions[0];

                const activeSessionDateTime = getSessionStartDate(activeSession);
                const isWithinOneMonth = activeSessionDateTime && activeSessionDateTime <= thirtyDaysFromNow;

                let mealTags = []; if(ev.hasMeal) mealTags.push('附餐'); if(ev.hasSnack) mealTags.push('附點心');
                const mealStr = mealTags.length > 0 ? `<span class="px-2 py-0.5 text-[10px] md:text-xs font-semibold rounded bg-orange-100 text-orange-700 border border-orange-200">${mealTags.join('+')}</span>` : `<span class="px-2 py-0.5 text-[10px] md:text-xs font-semibold rounded bg-gray-100 text-gray-600 border border-gray-200">無供餐</span>`;
                const hashtags = (ev.tags || []).map(t => `<span class="inline-block text-[10px] md:text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full mr-1.5 mb-1">${escapeHTML(t)}</span>`).join('');

                const sessionsHTML = ev.sessions.map((s, i) => {
                    const prefix = isSeries ? `<span class="inline-block w-12 text-right mr-1.5 flex-shrink-0 text-gray-400">第${i+1}場:</span>` : '';
                    const expired = isSessionExpired(s, now);
                    return `<div class="flex flex-col mb-2 last:mb-0 tabular-nums ${expired ? 'opacity-55' : ''}"><div class="flex items-center ${expired ? 'text-gray-400 line-through' : 'text-chihlee-gold'} font-medium text-xs md:text-sm whitespace-nowrap"><i class="fa-regular fa-calendar w-5 text-center mr-1 flex-shrink-0"></i>${prefix}<span>${escapeHTML(s.date)} ${getDayOfWeek(s.date)}</span><span class="ml-2 w-20 text-center inline-block font-bold ${expired ? 'text-gray-400' : 'text-gray-600'}">${escapeHTML(s.time)}</span>${expired ? '<span class="ml-2 no-underline text-[10px] font-bold bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded">已過期</span>' : ''}</div><div class="text-[10px] md:text-xs text-gray-500 mt-1 ml-6 pl-1 flex items-start gap-1"><i class="fa-solid fa-location-dot mt-1 flex-shrink-0"></i><span class="flex flex-wrap gap-1 min-w-0">${renderLocationBadges(s.location || ev.location)}</span></div></div>`;
                }).join('');

                const label = document.createElement('label');
                label.id = `event-card-${safeEvId}`;
                label.dataset.category = ev.category || '';
                let checkboxHTML = '';

                let borderClass = 'border-transparent';
                let bgClass = 'hover:bg-gray-50';
                if (isChecked) { borderClass = 'border-chihlee-blue'; bgClass = 'bg-blue-50/30 hover:bg-blue-50/50'; }
                else if (isWithinOneMonth && !isAlreadyRegistered && !isFull) { borderClass = 'border-chihlee-gold'; bgClass = 'bg-yellow-50/20 hover:bg-yellow-50/50'; }

                if (isAlreadyRegistered) {
                    checkboxHTML = `<i class="fa-solid fa-circle-check text-green-500 text-xl" title="您已報名"></i>`;
                    label.className = `flex items-start p-3 md:p-5 bg-green-50/30 border-l-4 border-l-green-400 group transition w-full cursor-not-allowed opacity-80`;
                } else if (isFull) {
                    checkboxHTML = `<input type="checkbox" disabled class="w-5 h-5 text-gray-300 border-gray-300 rounded cursor-not-allowed">`;
                    label.className = `flex items-start p-3 md:p-5 hover:bg-gray-50 bg-gray-50/50 border-l-4 border-l-gray-300 group transition w-full cursor-not-allowed opacity-75`;
                } else {
                    checkboxHTML = `<input type="checkbox" id="chk-evt-${safeEvId}" value="${safeEvId}" aria-label="選擇活動：${escapeHTML(ev.title)}" data-change-action="toggle-event-selection" data-event-id="${escapeHTML(safeEvId)}" class="w-5 h-5 text-chihlee-blue border-gray-300 rounded focus:ring-chihlee-blue cursor-pointer" ${isChecked ? 'checked' : ''}>`;
                    label.className = `flex items-start p-3 md:p-5 ${bgClass} group transition duration-150 w-full cursor-pointer border-l-4 ${borderClass}`;
                }

                label.innerHTML = `
                    <div class="flex-shrink-0 mr-3 md:mr-4 mt-1">${checkboxHTML}</div>
                    <div class="flex-grow flex flex-col md:flex-row gap-3 md:gap-4 w-full justify-between overflow-hidden">
                        <div class="flex-grow min-w-0">
                            <div class="flex flex-wrap items-center gap-1.5 mb-1.5">
                                <span class="${categoryBadgeClass}">${escapeHTML(ev.category)}</span>
                                ${isOoo ? `<span class="px-2 py-0.5 text-[10px] md:text-xs font-bold rounded bg-red-100 text-red-700 border border-red-300 whitespace-nowrap"><i class="fa-solid fa-user mr-1"></i>預約</span>` : ''}
                                ${isSeries ? `<span class="px-2 py-0.5 text-[10px] md:text-xs font-bold rounded bg-purple-100 text-purple-700 border border-purple-200 whitespace-nowrap">共 ${ev.sessions.length} 場</span>` : ''}
                                ${mealStr}
                                ${isAlreadyRegistered ? `<span class="px-2 py-0.5 text-[10px] md:text-xs font-bold rounded bg-green-100 text-green-700 border border-green-200 shadow-sm whitespace-nowrap">✅ 您已報名</span>` : ''}
                                ${(isFull && !isAlreadyRegistered) ? `<span class="px-2 py-0.5 text-[10px] md:text-xs font-bold rounded bg-red-400 text-white shadow-sm whitespace-nowrap">已額滿</span>` : (!isAlreadyRegistered ? `<span class="px-2 py-0.5 text-[10px] md:text-xs font-medium rounded bg-gray-100 text-gray-500 border border-gray-200 whitespace-nowrap">剩 ${ev.capacity - currentCount} 名額</span>` : '')}
                            </div>
                            <h3 class="text-lg md:text-xl font-bold text-gray-800 group-hover:text-chihlee-blue transition leading-tight break-words">${escapeHTML(ev.title)}</h3>
                            <p class="text-xs md:text-sm text-gray-500 mt-1.5 mb-2 line-clamp-3">${escapeHTML(ev.description)}</p>
                            ${hashtags ? `<div class="flex flex-wrap mt-1">${hashtags}</div>` : ''}
                        </div>
                        <div class="flex-shrink-0 flex flex-col w-full md:w-auto text-sm text-gray-600 md:items-end md:min-w-[200px] bg-gray-50 p-3 rounded-lg border border-gray-100">
                            ${sessionsHTML}
                        </div>
                    </div>
                `;
                container.appendChild(label);
            });
            updateBulkActionBar();
        }

        function loadSavedStudentInfo() {
            const identity = state.studentIdentity || {};
            document.getElementById('reg-student-id').value = identity.sid || '';
            document.getElementById('reg-name').value = identity.name || '';
            document.getElementById('reg-counselor').value = identity.counselor || '';
        }

        function normalizeMealChoice(value) {
            const meal = String(value || '').trim();
            if (meal.includes('素')) return '素';
            if (meal.includes('葷')) return '葷';
            return '不用餐';
        }

        function getMealBadgeClass(value) {
            const meal = normalizeMealChoice(value);
            if (meal === '葷') return 'meal-badge meal-badge-meat';
            if (meal === '素') return 'meal-badge meal-badge-vegetarian';
            return 'meal-badge meal-badge-none';
        }

        function getMealOptionsHtml(event, selectedValue = '不用餐') {
            const selected = normalizeMealChoice(selectedValue);
            const choices = event && (event.hasMeal || event.hasSnack) ? ['葷', '素', '不用餐'] : ['不用餐'];
            return choices.map(choice => `<option value="${choice}" ${choice === selected ? 'selected' : ''}>${choice}</option>`).join('');
        }

        function handleRegSessionChange(eventId, idx, isOoo, checkboxElem) {
            const ev = state.events.find(e => String(e.id) === String(eventId));

            if (checkboxElem && checkboxElem.checked && ev) {
                const currentSess = ev.sessions[idx];
                let hasConflict = false;
                let conflictTitle = '';

                const allCheckboxes = document.querySelectorAll('input[id^="reg-chk-"]:checked');
                for (let cb of allCheckboxes) {
                    if (cb.id === checkboxElem.id) continue;
                    const match = cb.id.match(/^reg-chk-(.+)-(\d+)$/);
                    if (match) {
                        const otherEvId = match[1];
                        const otherIdx = parseInt(match[2]);
                        const otherEv = state.events.find(e => String(e.id) === String(otherEvId));
                        if (otherEv && otherEv.sessions[otherIdx]) {
                            const otherSess = otherEv.sessions[otherIdx];
                            if (currentSess.date === otherSess.date && checkTimeConflict(currentSess.time, otherSess.time)) {
                                hasConflict = true;
                                conflictTitle = otherEv.title;
                                break;
                            }
                        }
                    }
                }

                if (!hasConflict) {
                    const sidInput = document.getElementById('reg-student-id');
                    const currentSid = (sidInput && sidInput.value.trim()) ? sidInput.value.trim() : (state.studentIdentity ? state.studentIdentity.sid : '');

                    if (currentSid) {
                        const myConflictSessions = [];
                        const historicalRegs = Array.isArray(state.myRegistrations) ? state.myRegistrations : [];
                        for (const r of historicalRegs) {
                            const rEv = state.events.find(e => String(e.id) === String(r.eventId));
                            if (!rEv) continue;
                            const rSessData = Array.isArray(r.sessionsData) ? r.sessionsData : [];
                            for (const rSd of rSessData) {
                                if (rSd.attend) {
                                    const rSess = rEv.sessions.find(s => s.date === rSd.date && (s.time === rSd.time || !rSd.time));
                                    if (rSess) myConflictSessions.push({ date: rSess.date, time: rSess.time, title: rEv.title + ' (已報名)' });
                                }
                            }
                        }

                        for (const c of myConflictSessions) {
                            if (c.date === currentSess.date && checkTimeConflict(currentSess.time, c.time)) {
                                hasConflict = true;
                                conflictTitle = c.title;
                                break;
                            }
                        }
                    }
                }

                if (hasConflict) {
                    showToast(`時段衝突！此場次與「${conflictTitle}」時間重疊，請擇一。`, 'error');
                    checkboxElem.checked = false;
                    const sel = document.getElementById(`reg-meal-${eventId}-${idx}`);
                    if (sel) { sel.disabled = true; sel.value = '不用餐'; }
                    return;
                }
            }

            if (isOoo && ev) {
                ev.sessions.forEach((s, i) => {
                    const sel = document.getElementById(`reg-meal-${eventId}-${i}`);
                    if (sel) { sel.disabled = true; sel.value = '不用餐'; }
                });
            }
            const sel = document.getElementById(`reg-meal-${eventId}-${idx}`);
            if (checkboxElem && sel && ev && (ev.hasMeal || ev.hasSnack)) {
                if (checkboxElem.checked) {
                    sel.disabled = false;
                } else {
                    sel.disabled = true;
                    sel.value = '不用餐';
                }
            } else if (!checkboxElem && sel) {
                sel.disabled = true;
                sel.value = '不用餐';
            }
        }

        function openRegisterModal() {
            if (state.isTeacherLoggedIn) {
                return showToast('您目前為登入狀態！若需協助學生報名，請至後台「報名名單」使用【個管老師新增】功能。', 'error');
            }

            if (state.selectedEventIds.length === 0) return showToast('請先勾選活動！', 'error');
            let hasFullError = false; let finalValidIds = [];
            state.selectedEventIds.forEach(eventId => {
                const ev = state.events.find(e => String(e.id) === String(eventId));
                if (!ev) return;
                const currentCount = getEventRegistrationCount(ev.id);
                if (ev.capacity && currentCount >= ev.capacity) { hasFullError = true; showToast(`「${ev.title}」剛剛已額滿，已為您取消勾選。`, 'error'); }
                else finalValidIds.push(eventId);
            });

            state.selectedEventIds = finalValidIds; if (hasFullError) renderStudentEvents(); if (state.selectedEventIds.length === 0) return;

            const mealSection = document.getElementById('dynamic-meal-section'); mealSection.innerHTML = '';
            state.selectedEventIds.forEach(eventId => {
                const ev = state.events.find(e => String(e.id) === String(eventId));
                if (!ev) return;
                const opts = getMealOptionsHtml(ev);
                const isOoo = ev.isOneOnOne === true;
                const isSeries = ev.isSeries === true;

                let takenSessions = [];
                if (isOoo) {
                    const stats = state.eventStats && state.eventStats[String(ev.id)];
                    takenSessions = (stats && Array.isArray(stats.occupiedSessions) ? stats.occupiedSessions : [])
                        .map(slot => String(slot.date || '') + '_' + String(slot.time || ''));
                }

                let seriesHintHtml = '';
                if (isSeries) {
                    seriesHintHtml = `<div class="mb-3 px-3 py-2 bg-purple-50 border border-purple-200 rounded text-xs md:text-sm text-purple-700 font-medium leading-relaxed"><i class="fa-solid fa-circle-info mr-1"></i>此為系列活動，系統已預設勾選所有場次，建議全程參與。若有無法出席的場次可手動取消。</div>`;
                }

                let sessionsHtml = ev.sessions.map((s, idx) => {
                    const isTaken = isOoo && takenSessions.includes(s.date + '_' + (s.time || ''));

                    const sDateTime = getSessionStartDate(s);
                    const isPastSession = !sDateTime || sDateTime < new Date();

                    const isUnavailable = isTaken || isPastSession;
                    const inputType = isOoo ? 'radio' : 'checkbox';
                    const inputName = isOoo ? `name="reg-ooo-${ev.id}"` : '';
                    const defaultChecked = (!isUnavailable && isSeries) ? 'checked' : '';
                    const disabledStr = isUnavailable ? 'disabled' : '';

                    let tagHtml = '';
                    if (isTaken) tagHtml = '<span class="text-red-500 text-xs ml-2 font-bold bg-red-100 px-1 rounded">(已被預約)</span>';
                    else if (isPastSession) tagHtml = '<span class="text-gray-500 text-[10px] md:text-xs ml-2 font-bold bg-gray-200 px-1 rounded">(已過期)</span>';

                    return `
                    <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between py-2 sm:py-2.5 border-b border-gray-200 last:border-0 gap-2 ${isUnavailable ? 'opacity-50' : ''}">
                        <label class="flex items-center space-x-2 ${isUnavailable ? 'cursor-not-allowed' : 'cursor-pointer'} flex-1 w-full">
                            <input type="${inputType}" ${inputName} id="reg-chk-${ev.id}-${idx}" value="${escapeHTML(s.date)}" class="w-4 h-4 text-chihlee-blue focus:ring-chihlee-blue flex-shrink-0" ${defaultChecked} ${disabledStr} data-change-action="registration-session" data-event-id="${escapeHTML(ev.id)}" data-index="${idx}" data-one-on-one="${isOoo}">
                            <span class="text-sm font-medium text-gray-700 tabular-nums flex-1">${escapeHTML(s.date)} <span class="hidden md:inline">${getDayOfWeek(s.date)}</span> <span class="text-blue-600 font-bold mx-1">${escapeHTML(s.time)}</span> ${tagHtml}</span>
                        </label>
                        <select id="reg-meal-${ev.id}-${idx}" aria-label="${escapeHTML(s.date)} 用餐情形" class="w-full sm:w-36 border border-gray-300 rounded px-2 py-1.5 text-sm bg-gray-50 focus:ring-chihlee-blue outline-none ${!ev.hasMeal && !ev.hasSnack ? 'hidden' : ''}" ${isUnavailable || !defaultChecked ? 'disabled' : ''}>${opts}</select>
                        ${!ev.hasMeal && !ev.hasSnack ? '<span class="text-xs text-gray-500 hidden sm:block">無供餐</span>' : ''}
                    </div>`;
                }).join('');

                const block = document.createElement('div'); block.className = 'bg-white border border-gray-200 rounded-lg p-3 md:p-4 shadow-sm';
                block.innerHTML = `<h5 class="font-bold text-chihlee-blue mb-2 text-base md:text-lg border-l-4 border-chihlee-blue pl-2 leading-tight">${escapeHTML(ev.title)}</h5>${seriesHintHtml}<div class="bg-gray-50/50 rounded px-2 md:px-3 py-1 border border-gray-100">${sessionsHtml}</div>`;
                mealSection.appendChild(block);
            });
            openModal('modal-register');
        }

        async function submitRegistration(e) {
            e.preventDefault();

            const submitBtn = document.getElementById('btn-submit-registration');
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin mr-2"></i>處理中...';
            }

            const toHalfWidth = (str) => String(str).replace(/[\uff01-\uff5e]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xfee0)).replace(/\u3000/g, ' ');
            let sid = toHalfWidth(document.getElementById('reg-student-id').value.trim()).replace(/\s+/g, '');
            const sname = document.getElementById('reg-name').value.trim();
            const counselor = document.getElementById('reg-counselor').value.trim();

            if (!/^\d{8}$/.test(sid)) {
                if(submitBtn) { submitBtn.disabled = false; submitBtn.innerText = '確認送出'; }
                return showToast('學號格式錯誤，請輸入 8 碼數字', 'error');
            }
            if (!sname || !counselor) {
                if(submitBtn) { submitBtn.disabled = false; submitBtn.innerText = '確認送出'; }
                return showToast('請完整填寫學號、姓名與個管老師', 'error');
            }

            let duplicateEventTitles = [];
            const locallyRegisteredEvents = syncRegisteredEventIds();
            state.selectedEventIds.forEach(eventId => {
                const isDup = locallyRegisteredEvents.some(savedEventId => String(savedEventId) === String(eventId));
                if (isDup) {
                    const ev = state.events.find(e => String(e.id) === String(eventId));
                    if (ev && !duplicateEventTitles.includes(ev.title)) duplicateEventTitles.push(ev.title);
                }
            });

            if (duplicateEventTitles.length > 0) {
                if (submitBtn) { submitBtn.disabled = false; submitBtn.innerText = '確認送出'; }
                return showToast(`已報名過：${duplicateEventTitles.join('、')}，請勿重複報名`, 'error');
            }

            let hasAnyAttend = false; let allCheckedSessions = []; let payloads = []; let droppedEvents = [];
            state.selectedEventIds.forEach(eventId => {
                const ev = state.events.find(e => String(e.id) === String(eventId)); let sessData = []; let hasAttendThisEvent = false;
                if(!ev) return;
                ev.sessions.forEach((s, idx) => {
                    const chk = document.getElementById(`reg-chk-${eventId}-${idx}`); const mealSel = document.getElementById(`reg-meal-${eventId}-${idx}`);
                    if(chk && chk.checked) {
                        sessData.push({ date: s.date, time: s.time, meal: (ev.hasMeal || ev.hasSnack) ? mealSel.value : '不用餐', attend: true });
                        allCheckedSessions.push({ event: ev, sessionDate: s.date, sessionTime: s.time, sessionLoc: s.location || ev.location }); hasAttendThisEvent = true; hasAnyAttend = true;
                    } else sessData.push({ date: s.date, time: s.time, meal: '不用餐', attend: false });
                });

                if (hasAttendThisEvent) payloads.push({ eventId, studentId: sid, name: sname, counselor, sessionsData: sessData });
                else droppedEvents.push(ev.title);
            });

            if(!hasAnyAttend) {
                if(submitBtn) { submitBtn.disabled = false; submitBtn.innerText = '確認送出'; }
                return showToast('您尚未勾選任何預約場次！', 'error');
            }

            // 系列活動取消超過一半場次時只提醒，不強制阻擋報名。
            let seriesWarningMsg = '';
            for (const payload of payloads) {
                const event = state.events.find(item => String(item.id) === String(payload.eventId));
                if (!event || event.isSeries !== true) continue;
                const selectableKeys = new Set(event.sessions.filter(session => !isSessionExpired(session)).map(session => `${session.date}_${session.time || ''}`));
                const selectableCount = selectableKeys.size;
                const attendCount = payload.sessionsData.filter(session => session.attend === true && selectableKeys.has(`${session.date}_${session.time || ''}`)).length;
                if (selectableCount > 0 && attendCount > 0 && attendCount < (selectableCount / 2)) {
                    seriesWarningMsg = `<div class="text-left text-purple-700">您在<span class="font-bold">「${escapeHTML(event.title)}」</span>取消了過多場次。<br><br>為確保活動成效，建議盡量全程參與。確定只報名您勾選的場次嗎？</div>`;
                    break;
                }
            }

            const proceedSubmit = async () => {
                state.studentIdentity = { sid, name: sname, counselor };
                showGlobalLoading(true, '安全驗證與資料處理中...');

                // 先以三項身分資料查詢本人既有報名，讓前端能在真正寫入前立即提示衝堂；
                // 後端仍會在 ScriptLock 內再次檢查，避免修改 API 請求或同時送出時繞過。
                try {
                    const queryResult = await apiRequest({ action: 'queryStudent', sid, sname, counselor }, 8000);
                    if (queryResult.success) {
                        state.myRegistrations = queryResult.data;
                        state.registeredEventIds = [...new Set(state.myRegistrations.map(registration => String(registration.eventId)))];

                        const duplicate = payloads.find(payload => state.registeredEventIds.includes(String(payload.eventId)));
                        if (duplicate) {
                            const event = state.events.find(item => String(item.id) === String(duplicate.eventId));
                            showGlobalLoading(false);
                            if (submitBtn) { submitBtn.disabled = false; submitBtn.innerText = '確認送出'; }
                            return showToast(`已報名過：${event ? event.title : '此活動'}，請勿重複報名`, 'error');
                        }

                        const conflict = findHistoricalRegistrationConflict(payloads, state.myRegistrations);
                        if (conflict) {
                            const when = [conflict.date, conflict.time].filter(Boolean).join(' ');
                            showGlobalLoading(false);
                            if (submitBtn) { submitBtn.disabled = false; submitBtn.innerText = '確認送出'; }
                            return showToast(`該時段您已報名「${conflict.title}」${when ? `（${when}）` : ''}，如仍要報名請聯絡個管老師取消原報名`, 'error');
                        }
                    }
                } catch (error) {
                    // 首次報名或查詢暫時失敗時仍交由後端做最終身分、重複報名與衝堂檢查。
                    showToast(`既有報名預檢未完成：${getRequestErrorMessage(error)}；送出時仍會由後端檢查`, 'info');
                }

                try {
                    const pubData = await apiRequest({ action: 'getPublicData' }, 8000);
                    if (pubData.success) {
                        state.events = pubData.data.events;
                        state.eventStats = pubData.data.eventStats;
                        state.counselors = pubData.data.counselors;
                        pruneSelectedEventIds(pubData.data.events);
                        renderCounselorOptions();
                        updateEventCounts();
                    }
                } catch(error) {
                    showToast(`最新名額同步失敗：${getRequestErrorMessage(error)}；後端仍會做最終檢查`, 'info');
                }

                let isCapacityExceeded = false;
                let exceededEventName = '';
                for (let p of payloads) {
                    const ev = state.events.find(e => String(e.id) === String(p.eventId));
                    if (ev && ev.capacity) {
                        const currentCount = getEventRegistrationCount(p.eventId);
                        if (currentCount >= ev.capacity) {
                            isCapacityExceeded = true;
                            exceededEventName = ev.title;
                            break;
                        }
                    }
                }

                if (isCapacityExceeded) {
                    if(submitBtn) { submitBtn.disabled = false; submitBtn.innerText = '確認送出'; }
                    showGlobalLoading(false);
                    return showToast(`抱歉！「${exceededEventName}」剛剛已被搶先額滿，請重整畫面。`, 'error');
                }

                try {
                    const res = await apiRequest({ action: 'submitRegistration', data: payloads });

                    if (res.success) {
                        payloads.forEach(p => {
                            if (!state.registeredEventIds.some(eventId => String(eventId) === String(p.eventId))) state.registeredEventIds.push(String(p.eventId));
                            state.myRegistrations.push({ eventId: p.eventId, sessionsData: p.sessionsData });
                        });

                        closeModal('modal-register');
                        showSuccessAndCalendar(allCheckedSessions);
                        state.selectedEventIds = [];

                        if (droppedEvents.length > 0) {
                            setTimeout(() => showToast(`已放棄未勾選的活動：${droppedEvents.join('、')}`, 'info'), 600);
                        }
                        await reloadDataSilently('同步資料中...');
                    } else {
                        showToast(res.error || '報名失敗，請確認資料是否正確', 'error');
                    }
                } catch (err) {
                    showToast(getRequestErrorMessage(err), 'error');
                } finally {
                    if (submitBtn) { submitBtn.disabled = false; submitBtn.innerText = '確認送出'; }
                    showGlobalLoading(false);
                }
            };

            if (seriesWarningMsg) {
                if (submitBtn) { submitBtn.disabled = false; submitBtn.innerText = '確認送出'; }
                customConfirm(seriesWarningMsg, () => {
                    if (submitBtn) {
                        submitBtn.disabled = true;
                        submitBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin mr-2"></i>處理中...';
                    }
                    proceedSubmit();
                }, '⚠️ 系列活動報名提醒');
            } else {
                proceedSubmit();
            }
        }

        function closeQueryModalSafe() { closeModal('modal-query'); }

        function openQueryModal() {
            switchView('student');
            const identity = state.studentIdentity || {};
            const savedSid = identity.sid || '';
            const savedName = identity.name || '';
            const savedCounselor = identity.counselor || '';
            document.getElementById('query-student-id').value = savedSid || '';
            document.getElementById('query-name').value = savedName || '';
            document.getElementById('query-counselor').value = savedCounselor || '';
            document.getElementById('query-result-container').innerHTML = '<div class="text-center text-gray-500 py-12"><i class="fa-solid fa-shield-halved text-4xl mb-3 text-gray-300"></i><br>請輸入驗證資料以查詢您的報名</div>';
            openModal('modal-query'); setTimeout(() => document.getElementById('query-student-id').focus(), 100);
        }

        async function executeStudentQuery() {
            const sid = document.getElementById('query-student-id').value.trim();
            const sname = document.getElementById('query-name').value.trim();
            const counselor = document.getElementById('query-counselor').value.trim();

            if(!sid || !sname || !counselor) return showToast('請完整填寫學號、姓名與個管老師', 'error');

            const container = document.getElementById('query-result-container');
            container.innerHTML = '<div class="text-center text-gray-500 py-12"><i class="fa-solid fa-circle-notch fa-spin text-4xl mb-3 text-chihlee-blue"></i><br><span class="font-bold tracking-widest">安全連線查詢中...</span></div>';
            try {
                const res = await apiRequest({ action: 'queryStudent', sid, sname, counselor });
                if (res.success) {
                    state.myRegistrations = res.data;

                    const eventMap = new Map();
                    state.events.forEach(e => eventMap.set(String(e.id), e));

                    let mySavedEvents = [];
                    res.data.forEach(r => {
                        const ev = eventMap.get(String(r.eventId)) || r.eventSummary;
                        if(!ev) return;
                        const validKeys = ev.sessions.map(s => s.date + '_' + (s.time || ''));
                        const hasAttend = Array.isArray(r.sessionsData) && r.sessionsData.some(sd => sd.attend && validKeys.includes(sd.date + '_' + (sd.time || '')));
                        if (hasAttend && !mySavedEvents.includes(String(r.eventId))) mySavedEvents.push(String(r.eventId));
                    });

                    state.studentIdentity = { sid, name: sname, counselor };
                    state.registeredEventIds = mySavedEvents;

                    const idBar = document.getElementById('student-identity-bar');
                    if(idBar && !state.isTeacherLoggedIn) {
                        document.getElementById('current-sid-display').innerText = sid;
                        idBar.classList.remove('hidden');
                    }

                    renderQueryResults();
                }
                else container.innerHTML = `<div class="text-center text-red-500 py-8 font-bold">${escapeHTML(res.error || '查詢發生錯誤')}</div>`;
            } catch (err) { container.innerHTML = `<div class="text-center text-red-500 py-8">${escapeHTML(getRequestErrorMessage(err))}</div>`; }
        }

        function renderQueryResults() {
            const container = document.getElementById('query-result-container');
            if(state.myRegistrations.length === 0) { container.innerHTML = '<div class="text-center text-red-500 py-8"><i class="fa-regular fa-folder-open mb-2 text-3xl"></i><br>找不到您的報名紀錄。</div>'; return; }
            container.innerHTML = '';

            const eventMap = new Map();
            state.events.forEach(e => eventMap.set(String(e.id), e));

            let sortedRegs = state.myRegistrations.filter(r => {
                const ev = eventMap.get(String(r.eventId)) || r.eventSummary; return ev && ev.sessions && ev.sessions.length > 0;
            }).sort((a, b) => {
                const evA = eventMap.get(String(a.eventId)) || a.eventSummary; const evB = eventMap.get(String(b.eventId)) || b.eventSummary;
                return (parseTaiwanDateTime(evA.sessions[0].date) || new Date(0)) - (parseTaiwanDateTime(evB.sessions[0].date) || new Date(0));
            });

            sortedRegs.forEach(reg => {
                const ev = eventMap.get(String(reg.eventId)) || reg.eventSummary;
                const categoryBadgeClass = getCategoryBadgeClass(ev.category);
                const categoryAccentClass = getCategoryAccentClass(ev.category);

                const sessHtml = reg.sessionsData.map((sd, idx) => {
                    const session = ev.sessions.find(s => s.date === sd.date && (s.time === sd.time || !sd.time)) || ev.sessions[idx];
                    if (!session) return '';

                    let timeStart = String(session.time).split('-')[0].trim() || '00:00';
                    let timeStartClean = timeStart.replace(':', '') + '00';
                    const dateStr = String(session.date).replace(/\//g, '');

                    let timeEndStr = '';
                    if (String(session.time).includes('-') && String(session.time).split('-')[1]) {
                        timeEndStr = String(session.time).split('-')[1].trim().replace(':', '') + '00';
                    } else {
                        let h = parseInt(timeStart.split(':')[0], 10);
                        let m = timeStart.split(':')[1] || '00';
                        h += 1;
                        if (isNaN(h)) { timeStartClean = '000000'; timeEndStr = '235900'; }
                        else if (h >= 24) { timeEndStr = '235900'; }
                        else { timeEndStr = String(h).padStart(2, '0') + m + '00'; }
                    }

                    const isoStart = `${dateStr}T${timeStartClean}`; const isoEnd = `${dateStr}T${timeEndStr}`; const loc = session.location || ev.location;
                    const calUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(ev.title)}&dates=${isoStart}/${isoEnd}&location=${encodeURIComponent(loc)}`;
                    let statusHtml = sd.attend ? `<span class="font-bold text-blue-700 text-xs md:text-sm bg-blue-50 px-2 py-1 rounded border border-blue-100 flex-shrink-0">${escapeHTML(normalizeMealChoice(sd.meal))}</span>` : `<span class="text-gray-400 text-xs bg-gray-100 px-2 py-1 rounded flex-shrink-0">未參加</span>`;
                    return `<div class="flex flex-col sm:flex-row sm:justify-between sm:items-center text-sm py-3 border-b border-gray-100 last:border-0 gap-2 px-1"><div class="flex flex-col tabular-nums"><div class="flex items-center flex-wrap"><span class="${sd.attend ? 'text-gray-800' : 'text-gray-400 line-through'} font-medium mr-1">${escapeHTML(session.date)} <span class="hidden sm:inline">${getDayOfWeek(session.date)}</span> <span class="text-gray-500 text-xs ml-1 font-bold">${escapeHTML(session.time)}</span></span>${sd.attend ? `<a href="${escapeHTML(calUrl)}" target="_blank" rel="noopener noreferrer" title="將 ${escapeHTML(ev.title)}｜${escapeHTML(session.date)} ${escapeHTML(session.time)} 加入行事曆" aria-label="將 ${escapeHTML(ev.title)} ${escapeHTML(session.date)} ${escapeHTML(session.time)} 加入行事曆" class="ml-1 text-blue-500 hover:text-blue-700 transition text-lg drop-shadow-sm"><i class="fa-regular fa-calendar-plus"></i></a>` : ''}</div><span class="text-[10px] md:text-xs text-gray-500 mt-1 sm:mt-0.5 break-words"><i class="fa-solid fa-location-dot mr-1"></i>${escapeHTML(loc)}</span></div><div class="flex items-center justify-end sm:justify-start">${statusHtml}</div></div>`;
                }).join('');
                container.innerHTML += `<div class="bg-white p-4 md:p-5 rounded-xl border border-gray-200 shadow-sm relative overflow-hidden transition-all duration-200"><div class="absolute top-0 left-0 w-1.5 h-full ${categoryAccentClass}"></div><div class="mb-3 pl-3 flex justify-between items-start"><div><div class="flex items-center gap-2 mb-1.5"><span class="${categoryBadgeClass}">${escapeHTML(ev.category)}</span>${ev.isOneOnOne ? `<span class="px-2 py-0.5 text-[10px] md:text-xs font-bold rounded bg-red-100 text-red-700 border border-red-300">預約</span>` : ''}</div><h4 class="font-bold text-gray-800 text-lg md:text-xl leading-tight mb-0 break-words">${escapeHTML(ev.title)}</h4></div></div><div class="bg-gray-50 p-2 sm:p-4 rounded-lg border border-gray-100 ml-1.5">${sessHtml}</div></div>`;
            });
        }

        function showSuccessAndCalendar(sessionsList) {
            const container = document.getElementById('success-events-list');
            container.innerHTML = sessionsList.map(item => {
                const dateStr = String(item.sessionDate).replace(/\//g, '');
                let timeStart = String(item.sessionTime).split('-')[0].trim() || '00:00';
                let timeStartClean = timeStart.replace(':', '') + '00';
                let timeEndStr = '';

                if (String(item.sessionTime).includes('-') && String(item.sessionTime).split('-')[1]) {
                    timeEndStr = String(item.sessionTime).split('-')[1].trim().replace(':', '') + '00';
                } else {
                    let h = parseInt(timeStart.split(':')[0], 10);
                    let m = timeStart.split(':')[1] || '00';
                    h += 1;
                    if (isNaN(h)) {
                        timeStartClean = '000000';
                        timeEndStr = '235900';
                    } else if (h >= 24) {
                        timeEndStr = '235900';
                    } else {
                        timeEndStr = String(h).padStart(2, '0') + m + '00';
                    }
                }

                const isoStart = `${dateStr}T${timeStartClean}`; const isoEnd = `${dateStr}T${timeEndStr}`; const loc = item.sessionLoc || item.event.location;
                const url = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(item.event.title)}&dates=${isoStart}/${isoEnd}&location=${encodeURIComponent(loc)}`;
                const summary = `${item.event.title}｜${item.sessionDate} ${item.sessionTime}`;
                return `<div class="flex items-center justify-between gap-3 py-3 border-b border-gray-100 last:border-0"><div class="min-w-0 text-left"><div class="font-bold text-gray-800 break-words">${escapeHTML(item.event.title)}</div><div class="text-sm text-gray-600 tabular-nums">${escapeHTML(item.sessionDate)} ${getDayOfWeek(item.sessionDate)}　${escapeHTML(item.sessionTime)}</div></div><a href="${escapeHTML(url)}" target="_blank" rel="noopener noreferrer" title="將 ${escapeHTML(summary)} 加入行事曆" aria-label="將 ${escapeHTML(summary)} 加入行事曆" class="flex-shrink-0 inline-flex items-center justify-center w-11 h-11 text-chihlee-blue bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100 transition text-xl"><i class="fa-regular fa-calendar-plus"></i></a></div>`;
            }).join('');
            openModal('modal-success');
        }

        function switchAdminTab(tab) {
            document.getElementById('adminActivitySection').classList.toggle('hidden', tab !== 'list');
            document.getElementById('adminLogSection').classList.toggle('hidden', tab !== 'log');
            document.getElementById('adminDataQualitySection').classList.toggle('hidden', tab !== 'quality');

            const activeTabClass = 'font-bold text-gray-800 border-b-2 border-chihlee-blue pb-1 px-2 transition whitespace-nowrap text-sm md:text-base';
            const defaultTabClass = 'text-gray-500 hover:text-gray-800 pb-1 px-2 transition whitespace-nowrap text-sm md:text-base';

            document.getElementById('tabActivityList').className = tab === 'list' ? activeTabClass : defaultTabClass;
            document.getElementById('tabActivityLog').className = tab === 'log' ? activeTabClass : defaultTabClass;
            document.getElementById('tabDataQuality').className = tab === 'quality' ? activeTabClass : defaultTabClass;
            if (tab === 'log') renderLogs();
            if (tab === 'quality') {
                initializeArchivePanel();
                if (state.dataQualityReport) renderDataQualityReport(state.dataQualityReport);
            }
        }

        function renderLineUsageSummary() {
            const container = document.getElementById('line-usage-summary');
            if (!container) return;
            const usage = state.lineUsage && typeof state.lineUsage === 'object'
                ? state.lineUsage
                : { month: '', used: 0, limit: 200, remaining: 200 };
            const used = Math.max(0, Number(usage.used) || 0);
            const limit = Math.max(1, Number(usage.limit) || 200);
            const remaining = Math.max(0, Number(usage.remaining) || 0);
            const statusClass = remaining <= 20 ? 'text-red-700' : remaining <= 60 ? 'text-orange-700' : 'text-green-800';
            container.innerHTML = `<span class="${statusClass}"><i class="fa-solid fa-chart-simple mr-1"></i>本系統 ${escapeHTML(usage.month || '本月')} 已成功發送 ${used}／${limit} 則</span><span class="${statusClass}">剩餘 ${remaining} 則</span><span class="text-gray-500 font-medium">僅統計成功發送，不含失敗訊息</span>`;
        }

        function initializeArchivePanel() {
            const panel = document.getElementById('annual-archive-panel');
            const select = document.getElementById('archive-year-select');
            if (!panel || !select) return;
            panel.classList.toggle('hidden', state.currentUserRole !== 'admin');
            if (state.currentUserRole !== 'admin' || select.options.length) return;
            const parts = new Intl.DateTimeFormat('en', { timeZone: 'Asia/Taipei', year: 'numeric' }).formatToParts(new Date());
            const currentYear = Number(parts.find(part => part.type === 'year')?.value || new Date().getFullYear());
            for (let year = currentYear - 1; year >= currentYear - 10; year--) {
                const option = document.createElement('option');
                option.value = String(year);
                option.textContent = `${year} 年`;
                select.appendChild(option);
            }
        }

        function renderArchivePreview(preview) {
            const container = document.getElementById('archive-preview-summary');
            const button = document.getElementById('btn-archive-year');
            if (!container || !button) return;
            if (!preview) {
                container.textContent = '請先選擇年度並計算筆數。';
                button.disabled = true;
                return;
            }
            const total = preview.eventCount + preview.registrationCount + preview.logCount;
            container.innerHTML = `<div class="font-bold text-gray-800 mb-2">${escapeHTML(preview.year)} 年待歸檔資料</div><div class="flex flex-wrap gap-2"><span class="bg-blue-100 text-blue-800 px-2 py-1 rounded">活動 ${preview.eventCount} 筆</span><span class="bg-green-100 text-green-800 px-2 py-1 rounded">報名 ${preview.registrationCount} 筆</span><span class="bg-gray-200 text-gray-800 px-2 py-1 rounded">紀錄 ${preview.logCount} 筆</span><span class="bg-amber-100 text-amber-900 px-2 py-1 rounded font-bold">合計 ${total} 筆</span></div><p class="mt-2 text-xs text-gray-600">${escapeHTML(preview.note || '')}</p>`;
            button.disabled = !preview.canArchive;
        }

        async function loadArchivePreview() {
            if (state.currentUserRole !== 'admin' || !state.adminCreds) return showToast('只有系統管理員可以執行年度歸檔', 'error');
            const year = Number(document.getElementById('archive-year-select')?.value);
            showGlobalLoading(true, '計算待歸檔筆數...');
            try {
                const response = await apiRequest({
                    action: 'getArchivePreview', year,
                    adminAcc: state.adminCreds.acc, adminToken: state.adminCreds.token
                }, 30000);
                if (checkTokenExpiration(response)) return;
                if (!response.success) return showToast(response.error || '歸檔預覽失敗', 'error');
                state.archivePreview = response.data;
                renderArchivePreview(response.data);
            } catch (error) {
                showToast(getRequestErrorMessage(error, '歸檔預覽失敗'), 'error');
            } finally {
                showGlobalLoading(false);
            }
        }

        async function archiveSelectedYear() {
            const preview = state.archivePreview;
            if (!preview || !preview.canArchive) return showToast('請先計算待歸檔筆數', 'error');
            const year = Number(document.getElementById('archive-year-select')?.value);
            if (year !== preview.year) return showToast('年度已變更，請重新計算筆數', 'error');
            const total = preview.eventCount + preview.registrationCount + preview.logCount;
            if (!window.confirm(`確定歸檔 ${year} 年共 ${total} 筆資料？\n\n系統會先複製並驗證，再從日常工作表移出；資料不會永久刪除。`)) return;

            showGlobalLoading(true, `正在歸檔 ${year} 年資料，請勿關閉頁面...`);
            try {
                const response = await apiRequest({
                    action: 'archiveYearData', year,
                    adminAcc: state.adminCreds.acc, adminToken: state.adminCreds.token
                }, 120000);
                if (checkTokenExpiration(response)) return;
                if (!response.success) return showToast(response.error || '年度歸檔失敗', 'error');
                const result = response.data;
                state.archivePreview = null;
                renderArchivePreview(null);
                showToast(`${year} 年歸檔完成：活動 ${result.eventCount}、報名 ${result.registrationCount}、紀錄 ${result.logCount} 筆`, 'success');
                await reloadDataSilently('更新歸檔後資料...');
                await loadDataQualityReport();
            } catch (error) {
                showToast(getRequestErrorMessage(error, '年度歸檔失敗；原資料會保留'), 'error');
            } finally {
                showGlobalLoading(false);
            }
        }

        async function loadDataQualityReport() {
            if (!state.isTeacherLoggedIn || !state.adminCreds) return showToast('請先登入後台', 'error');
            const button = document.getElementById('btn-run-data-quality');
            if (button) {
                button.disabled = true;
                button.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin mr-2"></i>檢查中';
            }
            showGlobalLoading(true, '檢查試算表資料...');
            try {
                const response = await apiRequest({
                    action: 'getDataQualityReport',
                    adminAcc: state.adminCreds.acc,
                    adminToken: state.adminCreds.token
                });
                if (checkTokenExpiration(response)) return;
                if (!response.success) return showToast(response.error || '資料檢查失敗', 'error');
                state.dataQualityReport = response.data;
                renderDataQualityReport(response.data);
                const total = Number(response.data.summary.totalIssues) || 0;
                showToast(total === 0 ? '資料檢查完成，未發現異常' : `資料檢查完成，共發現 ${total} 項問題`, total === 0 ? 'success' : 'info');
            } catch (error) {
                showToast(getRequestErrorMessage(error, '資料檢查失敗'), 'error');
            } finally {
                if (button) {
                    button.disabled = false;
                    button.innerHTML = '<i class="fa-solid fa-shield-halved mr-2"></i>重新檢查';
                }
                showGlobalLoading(false);
            }
        }

        function renderDataQualityReport(report) {
            if (!report || !report.summary || !Array.isArray(report.issues)) return;
            const summary = report.summary;
            const summaryContainer = document.getElementById('data-quality-summary');
            const volumeContainer = document.getElementById('data-quality-volume');
            const tbody = document.getElementById('data-quality-tbody');
            const cards = [
                ['檢查資料列', Number(summary.checkedRows) || 0, 'text-chihlee-blue', 'bg-blue-50 border-blue-200'],
                ['錯誤', Number(summary.errorCount) || 0, 'text-red-700', 'bg-red-50 border-red-200'],
                ['提醒', Number(summary.warningCount) || 0, 'text-orange-700', 'bg-orange-50 border-orange-200'],
                ['檢查時間', formatSafeDate(report.checkedAt) || '-', 'text-gray-700', 'bg-gray-50 border-gray-200']
            ];
            summaryContainer.innerHTML = cards.map(([label, value, textClass, boxClass]) => `<div class="${boxClass} border rounded-lg p-3 min-w-0"><div class="text-xs text-gray-600 font-bold">${escapeHTML(label)}</div><div class="${textClass} font-bold text-base md:text-lg break-words">${escapeHTML(value)}</div></div>`).join('');
            summaryContainer.classList.remove('hidden');
            if (volumeContainer) {
                const counts = isPlainObject(summary.rowCounts) ? summary.rowCounts : {};
                const durationMs = Math.max(0, Number(summary.durationMs) || 0);
                const activeCount = ['Events', 'Registrations', 'Students', 'Logs'].reduce((sum, key) => sum + (Number(counts[key]) || 0), 0);
                const speedLabel = durationMs < 3000 ? '目前檢查速度正常' : durationMs < 10000 ? '檢查開始變慢，建議完成年度歸檔' : '檢查耗時較長，建議儘快歸檔已結束資料';
                volumeContainer.innerHTML = `<div class="border border-blue-200 bg-white rounded-lg p-4"><div class="font-bold text-chihlee-blue mb-2">目前日常工作表資料量</div><div class="flex flex-wrap gap-2 text-sm"><span class="bg-blue-50 px-2 py-1 rounded">活動 ${Number(counts.Events) || 0} 筆</span><span class="bg-green-50 px-2 py-1 rounded">報名 ${Number(counts.Registrations) || 0} 筆</span><span class="bg-purple-50 px-2 py-1 rounded">學生 ${Number(counts.Students) || 0} 筆</span><span class="bg-gray-100 px-2 py-1 rounded">紀錄 ${Number(counts.Logs) || 0} 筆</span><span class="bg-amber-50 px-2 py-1 rounded font-bold">合計 ${activeCount} 筆</span></div><p class="mt-2 text-xs text-gray-600">本次後端檢查耗時 ${durationMs.toLocaleString()} 毫秒；${escapeHTML(speedLabel)}。此數字比固定筆數門檻更能反映你的實際運算負擔。</p></div>`;
                volumeContainer.classList.remove('hidden');
            }

            if (report.issues.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" class="px-4 py-10 text-center text-green-700 font-bold whitespace-normal"><i class="fa-solid fa-circle-check mr-2"></i>目前未發現資料結構或格式異常</td></tr>';
                return;
            }
            tbody.innerHTML = report.issues.map(issue => {
                const isError = issue.severity === 'error';
                const badge = isError
                    ? '<span class="inline-flex px-2 py-1 rounded bg-red-100 text-red-700 font-bold">錯誤</span>'
                    : '<span class="inline-flex px-2 py-1 rounded bg-orange-100 text-orange-700 font-bold">提醒</span>';
                return `<tr class="hover:bg-blue-50"><td class="px-4 py-3">${badge}</td><td class="px-4 py-3 font-bold">${escapeHTML(issue.sheet)}</td><td class="px-4 py-3 tabular-nums">${escapeHTML(issue.row)}</td><td class="px-4 py-3">${escapeHTML(issue.field)}</td><td class="px-4 py-3 whitespace-normal min-w-[260px]">${escapeHTML(issue.message)}</td></tr>`;
            }).join('');
            if (summary.truncated) {
                tbody.insertAdjacentHTML('beforeend', '<tr><td colspan="5" class="px-4 py-3 text-center text-orange-700 font-bold whitespace-normal">問題過多，畫面只顯示前 300 項；請先修正後重新檢查。</td></tr>');
            }
        }

        function renderTeacherDashboard(page = null) {
            if (page !== null) state.adminCurrentPage = page;
            const searchInput = document.getElementById('teacher-search-input').value.trim().toLowerCase();
            const yearSelect = document.getElementById('teacher-year-filter'); const categorySelect = document.getElementById('teacher-category-filter'); const teacherSelect = document.getElementById('teacher-name-filter');

            if(yearSelect.options.length === 0) {
                let years = [...new Set(state.events.filter(e => e.sessions && e.sessions.length > 0).map(ev => String(ev.sessions[0].date).split('/')[0]))].sort((a,b)=>b-a);
                const currentY = String(getTaiwanDateParts().year);
                yearSelect.innerHTML = `<option value="all">全部年度</option>` + years.map(y => `<option value="${escapeHTML(y)}">${escapeHTML(y)}</option>`).join('');
                if (years.includes(currentY)) yearSelect.value = currentY; else if(years.length > 0) yearSelect.value = years[0];
            }
            const currentTeacherVal = teacherSelect.value || 'all'; const teachers = [...new Set(state.events.map(ev => ev.teacher).filter(t => t))].sort();
            teacherSelect.innerHTML = `<option value="all">承辦人(全部)</option>` + teachers.map(t => `<option value="${escapeHTML(t)}" ${t===currentTeacherVal?'selected':''}>${escapeHTML(t)}</option>`).join('');

            const currentYear = yearSelect.value || 'all'; const currentCat = categorySelect.value || 'all'; const currentTeacher = teacherSelect.value || 'all';
            const tbody = document.getElementById('teacher-events-tbody'); tbody.innerHTML = '';
            const today = getTodayStart();

            const isEventFullyExpired = (ev, refDate) => ev.sessions.every(s => {
                const date = parseTaiwanDateTime(s.date);
                return !date || date < refDate;
            });
            const getActiveSessionDate = (ev, refDate) => {
                let active = ev.sessions.find(s => {
                    const date = parseTaiwanDateTime(s.date);
                    return date && date >= refDate;
                });
                return active ? parseTaiwanDateTime(active.date) : (parseTaiwanDateTime(ev.sessions[ev.sessions.length - 1].date) || new Date(0));
            };

            const mappedEvents = state.events.map(ev => ({
                ev: ev,
                isPast: (!ev.sessions || ev.sessions.length === 0) ? true : isEventFullyExpired(ev, today),
                activeDate: (!ev.sessions || ev.sessions.length === 0) ? new Date(0) : getActiveSessionDate(ev, today)
            }));

            mappedEvents.sort((a, b) => {
                if(!a.ev.sessions || a.ev.sessions.length === 0) return 1; if(!b.ev.sessions || b.ev.sessions.length === 0) return -1;
                if (a.isPast && !b.isPast) return 1; if (!a.isPast && b.isPast) return -1;
                return a.activeDate - b.activeDate;
            });
            const sortedEvents = mappedEvents.map(item => item.ev);

            let filteredEvents = sortedEvents.filter(ev => {
                if(!ev.sessions || ev.sessions.length === 0) return false;
                if(currentYear !== 'all' && String(ev.sessions[0].date).split('/')[0] !== currentYear) return false;
                if(currentCat !== 'all' && ev.category !== currentCat) return false;
                if(currentTeacher !== 'all' && ev.teacher !== currentTeacher) return false;
                if(searchInput && !String(ev.title).toLowerCase().includes(searchInput)) return false; return true;
            });

            const itemsPerPage = 10; const totalPages = Math.ceil(filteredEvents.length / itemsPerPage) || 1;
            if (state.adminCurrentPage > totalPages) state.adminCurrentPage = totalPages;
            const startIndex = (state.adminCurrentPage - 1) * itemsPerPage; const paginatedEvents = filteredEvents.slice(startIndex, startIndex + itemsPerPage);

            paginatedEvents.forEach(ev => {
                if(!ev.sessions || ev.sessions.length === 0) return;
                const isPast = isEventFullyExpired(ev, today);
                const isSeries = ev.isSeries === true;
                const pCount = getEventRegistrationCount(ev.id);
                const isFull = ev.capacity && pCount >= ev.capacity;
                const categoryBadgeClass = getCategoryBadgeClass(ev.category);
                const mainLocationBadges = splitLocationLabels(ev.location).length > 1
                    ? `<div class="mt-2 flex items-start gap-1 text-[10px] md:text-xs"><i class="fa-solid fa-location-dot text-gray-400 mt-1 flex-shrink-0"></i><span class="flex flex-wrap gap-1 min-w-0">${renderLocationBadges(ev.location)}</span></div>`
                    : '';
                const publicationStatusHtml = ev.isPublished
                    ? '<span class="publication-status-published inline-flex items-center px-2 py-0.5 rounded-md text-[10px] md:text-xs font-bold whitespace-nowrap"><i class="fa-solid fa-eye mr-1"></i>已公開</span>'
                    : '<span class="publication-status-unpublished inline-flex items-center px-2 py-0.5 rounded-md text-[10px] md:text-xs font-bold whitespace-nowrap"><i class="fa-solid fa-eye-slash mr-1"></i>未公開</span>';

                const datesHTML = ev.sessions.map((s, idx) => {
                    const numHtml = ev.sessions.length > 1 ? `<span class="inline-block w-4 text-right mr-1.5 text-gray-500 font-medium">${idx+1}.</span>` : '';
                    const sDateTime = getSessionStartDate(s);
                    const isSessionPast = !sDateTime || sDateTime < new Date();

                    const dateTextColor = isSessionPast ? 'text-gray-400 line-through decoration-gray-300' : 'text-gray-800';
                    const timeTextColor = isSessionPast ? 'text-gray-400' : 'text-chihlee-blue';
                    const borderColor = isSessionPast ? 'border-gray-200' : 'border-blue-300';

                    return `<div class="flex flex-col mb-2 last:mb-0 tabular-nums border-l-2 ${borderColor} pl-2 ml-1 ${isSessionPast ? 'opacity-60' : ''}">
                                <div class="flex flex-wrap items-center whitespace-normal break-words mb-0.5">
                                    ${numHtml}<span class="font-medium ${dateTextColor}">${escapeHTML(s.date)}</span><span class="hidden md:inline font-medium ${dateTextColor} ml-1">${getDayOfWeek(s.date)}</span> <span class="${timeTextColor} mx-1 inline-block font-bold">${escapeHTML(s.time)}</span>
                                </div>
                                <div class="text-gray-500 text-[10px] md:text-xs ml-4 mt-1 flex items-start gap-1 min-w-0"><i class="fa-solid fa-location-dot mt-1 flex-shrink-0"></i><span class="flex flex-wrap gap-1 min-w-0">${renderLocationBadges(s.location || ev.location)}</span></div>
                            </div>`;
                }).join('');

                const deleteBtnHtml = `<button data-action="delete-event" data-event-id="${escapeHTML(ev.id)}" title="刪除活動" class="text-red-500 hover:bg-red-50 px-2 py-1.5 rounded transition text-lg mt-1 md:mt-0"><i class="fa-solid fa-trash"></i></button>`;
                const publishBtnHtml = ev.isPublished
                    ? `<button data-action="toggle-published" data-event-id="${escapeHTML(ev.id)}" data-published="false" title="取消公開" aria-label="取消公開 ${escapeHTML(ev.title)}" class="text-orange-600 hover:bg-orange-50 px-2 py-1.5 rounded transition text-lg mb-1 md:mb-0"><i class="fa-solid fa-eye-slash"></i></button>`
                    : `<button data-action="toggle-published" data-event-id="${escapeHTML(ev.id)}" data-published="true" title="公開活動" aria-label="公開 ${escapeHTML(ev.title)}" class="text-green-600 hover:bg-green-50 px-2 py-1.5 rounded transition text-lg mb-1 md:mb-0"><i class="fa-solid fa-eye"></i></button>`;

                const tr = document.createElement('tr');
                tr.className = `border-b border-gray-100 transition hover:bg-blue-50 even:bg-slate-50 odd:bg-white group`;
                tr.innerHTML = `
                    <td class="px-4 md:px-6 py-4 align-top sticky left-0 z-10 bg-inherit shadow-[2px_0_5px_rgba(0,0,0,0.02)] border-r border-gray-100">
                        <span class="${categoryBadgeClass}">${escapeHTML(ev.category)}</span>
                        ${ev.isOneOnOne ? '<br><span class="inline-block px-2 py-0.5 mt-1 rounded-md text-[10px] md:text-xs font-bold bg-red-100 text-red-700 border border-red-300 whitespace-nowrap">一對一</span>' : ''}
                        ${isSeries ? '<br><span class="inline-block px-2 py-0.5 mt-1 rounded text-[10px] md:text-xs font-bold bg-purple-100 text-purple-700 whitespace-nowrap">系列</span>' : ''}
                    </td>
                    <td class="px-4 md:px-6 py-4 align-top font-medium ${isPast ? 'text-gray-500' : 'text-gray-900'} md:sticky md:left-[110px] md:z-10 bg-inherit shadow-none md:shadow-[2px_0_5px_rgba(0,0,0,0.02)] border-r border-gray-100">
                        <div class="whitespace-normal leading-relaxed"><span class="admin-event-title min-w-0 break-words">${escapeHTML(ev.title)}</span></div>
                        <span class="text-xs text-gray-500 block mt-2 whitespace-nowrap"><i class="fa-solid fa-user-tie mr-1"></i>${escapeHTML(ev.teacher || '未設定')}</span>
                        ${mainLocationBadges}
                    </td>
                    <td class="px-4 md:px-6 py-4 text-xs md:text-sm leading-relaxed align-top">${datesHTML}</td>
                    <td class="px-4 md:px-6 py-4 text-center align-middle">
                        <div class="inline-flex flex-col items-center justify-center gap-2">
                            ${publicationStatusHtml}
                            <span class="inline-flex items-center justify-center ${isFull ? 'bg-red-100 text-red-800' : 'bg-blue-100 text-blue-800'} rounded-full h-6 px-3 font-semibold text-xs whitespace-nowrap" title="已報名 ${pCount} 人／容量 ${ev.capacity} 人">${pCount}/${ev.capacity}</span>
                        </div>
                    </td>
                    <td class="px-4 md:px-6 py-4 text-right whitespace-nowrap sticky right-0 z-10 bg-inherit shadow-[-4px_0_10px_rgba(0,0,0,0.02)] align-middle flex flex-col md:flex-row justify-end items-center border-l border-gray-100">
                        <button data-action="open-participants" data-event-id="${escapeHTML(ev.id)}" title="報名名單" class="text-chihlee-blue hover:bg-blue-50 px-2 py-1.5 rounded transition text-lg mb-1 md:mb-0"><i class="fa-solid fa-users"></i></button>
                        <button data-action="open-notify" data-event-id="${escapeHTML(ev.id)}" title="發送通知" class="text-green-600 hover:bg-green-50 px-2 py-1.5 rounded transition text-lg mb-1 md:mb-0 md:mx-1"><i class="fa-solid fa-comment-dots"></i></button>
                        ${publishBtnHtml}
                        <button data-action="open-edit-event" data-event-id="${escapeHTML(ev.id)}" title="編輯活動" class="text-gray-600 hover:bg-gray-100 px-2 py-1.5 rounded transition text-lg mb-1 md:mb-0"><i class="fa-solid fa-pen-to-square"></i></button>
                        ${deleteBtnHtml}
                    </td>
                `;
                tbody.appendChild(tr);
            });

            const paginationContainer = document.getElementById('admin-pagination-container');
            if(filteredEvents.length > 0) {
                paginationContainer.classList.remove('hidden');
                paginationContainer.innerHTML = `
                    <div class="text-sm text-gray-600">顯示 ${startIndex + 1} - ${Math.min(startIndex + itemsPerPage, filteredEvents.length)} / 共 <span class="font-bold text-chihlee-blue">${filteredEvents.length}</span></div>
                    <div class="flex space-x-2 mt-2 sm:mt-0">
                        <button data-action="dashboard-page" data-page="${state.adminCurrentPage - 1}" ${state.adminCurrentPage === 1 ? 'disabled class="px-3 py-1.5 rounded-md border border-gray-200 text-gray-400 bg-gray-50 cursor-not-allowed"' : 'class="px-3 py-1.5 rounded-md border border-gray-300 text-gray-700 bg-white hover:bg-gray-50 transition"'}><i class="fa-solid fa-chevron-left text-xs mr-1"></i>上一頁</button>
                        <span class="px-3 md:px-4 py-1.5 rounded-md bg-chihlee-blue text-white text-sm font-medium shadow-sm">${state.adminCurrentPage} / ${totalPages}</span>
                        <button data-action="dashboard-page" data-page="${state.adminCurrentPage + 1}" ${state.adminCurrentPage === totalPages ? 'disabled class="px-3 py-1.5 rounded-md border border-gray-200 text-gray-400 bg-gray-50 cursor-not-allowed"' : 'class="px-3 py-1.5 rounded-md border border-gray-300 text-gray-700 bg-white hover:bg-gray-50 transition"'}>下一頁<i class="fa-solid fa-chevron-right text-xs ml-1"></i></button>
                    </div>
                `;
            } else { paginationContainer.classList.add('hidden'); tbody.innerHTML = '<tr><td colspan="5" class="px-6 py-10 text-center text-gray-500"><i class="fa-regular fa-folder-open text-3xl mb-2 text-gray-300 block"></i>找不到符合條件的活動</td></tr>'; }
        }

        function renderLogs() {
            const tbody = document.getElementById('admin-logs-tbody'); if (!tbody) return;
            if (state.logs.length === 0) { tbody.innerHTML = '<tr><td colspan="2" class="text-center py-4 text-gray-500">目前尚無動態紀錄</td></tr>'; return; }
            tbody.innerHTML = state.logs.map(log => `<tr class="border-b border-gray-100 even:bg-slate-50 odd:bg-white hover:bg-blue-50 transition-colors"><td class="py-3 px-4 text-gray-500 whitespace-nowrap font-mono text-[10px] md:text-xs align-top">${escapeHTML(formatSafeDate(log.time))}</td><td class="py-3 px-4 text-gray-800 leading-relaxed text-xs md:text-sm whitespace-normal break-words align-top">${escapeHTML(log.message)}</td></tr>`).join('');
        }

        function renderTempTags() { document.getElementById('edit-tags-container').innerHTML = state.tempTags.map((t, idx) => `<span class="bg-blue-100 text-blue-700 px-2 py-1 rounded text-xs md:text-sm font-bold flex items-center">${escapeHTML(t)} <button type="button" data-action="remove-temp-tag" data-index="${idx}" class="ml-1 text-blue-500 hover:text-red-500 w-5 h-5 flex items-center justify-center rounded-full hover:bg-blue-200 transition">✕</button></span>`).join(''); }
        function addTempTag() { const input = document.getElementById('edit-tag-input'); let val = input.value.trim(); if(!val) return; if(!val.startsWith('#')) val = '#' + val; if(val.length > 10) return showToast('每個標籤含 # 最多 10 個字！', 'error'); if(state.tempTags.length >= 3) return showToast('最多 3 個標籤！', 'error'); if(!state.tempTags.includes(val)) { state.tempTags.push(val); input.value = ''; renderTempTags(); } }
        function removeTempTag(idx) { state.tempTags.splice(idx, 1); renderTempTags(); }

        function handleActivityTypeChange() {
            const type = document.querySelector('input[name="edit-activity-type"]:checked').value;
            const capInput = document.getElementById('edit-capacity');
            if (type === 'ooo') {
                capInput.value = state.tempSessions.length;
                capInput.readOnly = true;
                capInput.classList.add('bg-gray-100', 'text-gray-500');
            } else {
                if (capInput.readOnly) { capInput.value = ''; }
                capInput.readOnly = false;
                capInput.classList.remove('bg-gray-100', 'text-gray-500');
            }
        }

        function configureActivityTypeEditing(isExistingEvent) {
            const lockedForStaff = Boolean(isExistingEvent) && state.currentUserRole !== 'admin';
            const note = document.getElementById('edit-activity-type-note');
            document.querySelectorAll('input[name="edit-activity-type"]').forEach(radio => {
                radio.disabled = lockedForStaff;
                const label = radio.closest('label');
                if (label) {
                    label.classList.toggle('opacity-60', lockedForStaff);
                    label.classList.toggle('cursor-not-allowed', lockedForStaff);
                    label.classList.toggle('cursor-pointer', !lockedForStaff);
                }
            });
            if (!note) return;
            if (lockedForStaff) {
                note.textContent = '活動建立後，staff 不可更改活動形式；如需調整請由管理員處理。';
                note.className = 'mt-2 text-xs font-medium leading-relaxed text-red-700';
            } else if (isExistingEvent && state.currentUserRole === 'admin') {
                note.textContent = '管理員可調整活動形式；系列活動至少需 2 場，一對一活動若已有報名則不可轉換。';
                note.className = 'mt-2 text-xs font-medium leading-relaxed text-purple-700';
            } else {
                note.textContent = '';
                note.className = 'hidden mt-2 text-xs font-medium leading-relaxed';
            }
        }

        function syncTempSessions() {
            for(let i = 0; i < state.tempSessions.length; i++) {
                const dateEl = document.getElementById(`sesDate_${i}`); const timeEl = document.getElementById(`sesTime_${i}`); const locEl = document.getElementById(`sesLoc_${i}`);
                if (dateEl && dateEl.value) state.tempSessions[i].date = dateEl.value.replace(/-/g, '/');
                if (timeEl) state.tempSessions[i].time = timeEl.value; if (locEl) state.tempSessions[i].location = locEl.value;
            }
        }

        function renderTempSessions() {
            document.getElementById('edit-sessions-container').innerHTML = state.tempSessions.map((s, idx) => `
                <div class="session-edit-row bg-white p-2.5 rounded-md border border-gray-200">
                    <input type="date" id="sesDate_${idx}" value="${String(s.date).replace(/\//g, '-')}" data-change-action="mark-dirty" class="px-3 py-2 border border-gray-300 rounded-md focus:ring-chihlee-blue outline-none text-sm">
                    <input type="text" id="sesTime_${idx}" value="${escapeHTML(s.time)}" data-input-action="mark-dirty" data-blur-action="format-session-time" class="px-3 py-2 border border-gray-300 rounded-md focus:ring-chihlee-blue outline-none text-sm" placeholder="如 18:00-20:00">
                    <input type="text" id="sesLoc_${idx}" value="${escapeHTML(s.location || '')}" maxlength="20" data-input-action="mark-dirty" class="px-3 py-2 border border-gray-300 rounded-md focus:ring-chihlee-blue outline-none text-sm bg-yellow-50 placeholder-gray-400" placeholder="本場地點（未填沿用主地點）">
                    <button type="button" aria-label="刪除第 ${idx + 1} 場" data-action="remove-temp-session" data-index="${idx}" class="session-delete-button text-red-600 bg-red-50 hover:bg-red-100 hover:text-red-800 rounded-md transition text-sm font-bold shadow-sm"><i class="fa-solid fa-trash"></i><span class="session-delete-label">刪除</span></button>
                </div>`).join('');
        }
        function addSessionField() { syncTempSessions(); state.tempSessions.push({date:'', time:'', location:''}); renderTempSessions(); handleActivityTypeChange(); }
        function removeTempSession(idx) { if(state.tempSessions.length <= 1) return showToast('至少需保留一場！', 'error'); syncTempSessions(); state.tempSessions.splice(idx, 1); renderTempSessions(); handleActivityTypeChange(); }

        function openEditEventModal(eventId = null) {
            resetDirty();
            document.getElementById('edit-event-form').reset(); document.querySelectorAll('input[name="edit-loc-quick"]').forEach(cb => cb.checked = false);
            const teacherSelect = document.getElementById('edit-teacher'); teacherSelect.innerHTML = '<option value="">請選擇承辦人...</option>';

            let adminList = [];
            if (state.admins && state.admins.length > 0) {
                adminList = state.admins;
                adminList.forEach(a => { if (a.name) teacherSelect.innerHTML += `<option value="${escapeHTML(a.name)}">${escapeHTML(a.name)}</option>`; });
            } else {
                showToast('無法取得系統承辦人名單，請重新整理網頁！', 'error');
                teacherSelect.innerHTML += `<option value="" disabled>(系統異常，無承辦人資料)</option>`;
            }

            if (eventId) {
                document.getElementById('edit-modal-title').innerText = '編輯活動'; const ev = state.events.find(e => String(e.id) === String(eventId));
                document.getElementById('edit-id').value = ev.id;
                document.getElementById('edit-title').value = ev.title;

                const currentCount = getEventRegistrationCount(eventId);
                const warningEl = document.getElementById('edit-time-warning');
                if (warningEl) {
                    if (currentCount > 0) warningEl.classList.remove('hidden');
                    else warningEl.classList.add('hidden');
                }

                document.getElementById('edit-category').value = ev.category;
                document.getElementById('edit-teacher').value = ev.teacher; document.getElementById('edit-capacity').value = ev.capacity; document.getElementById('edit-description').value = ev.description;
                document.getElementById('edit-meal-main').checked = ev.hasMeal; document.getElementById('edit-meal-snack').checked = ev.hasSnack;

                if (ev.isOneOnOne) {
                    document.querySelector('input[name="edit-activity-type"][value="ooo"]').checked = true;
                } else if (ev.isSeries) {
                    document.querySelector('input[name="edit-activity-type"][value="series"]').checked = true;
                } else {
                    document.querySelector('input[name="edit-activity-type"][value="normal"]').checked = true;
                }

                state.tempTags = [...(ev.tags || [])]; state.tempSessions = JSON.parse(JSON.stringify(ev.sessions));
                let customLocs = []; String(ev.location).split('、').forEach(l => { let matched = false; document.querySelectorAll('input[name="edit-loc-quick"]').forEach(cb => { if(cb.value === l) { cb.checked = true; matched = true; }}); if(!matched) customLocs.push(l); });
                document.getElementById('edit-loc-custom').value = customLocs.join('、');
            } else {
                document.getElementById('edit-modal-title').innerText = '新增活動'; document.getElementById('edit-id').value = ''; state.tempTags = []; state.tempSessions = [{date: '', time: '', location: ''}];
                document.querySelector('input[name="edit-activity-type"][value="normal"]').checked = true;
            }
            renderTempTags(); renderTempSessions(); configureActivityTypeEditing(Boolean(eventId)); handleActivityTypeChange(); openModal('modal-edit-event');
        }

        async function submitEventEdit(e) {
            e.preventDefault(); const id = document.getElementById('edit-id').value;
            let mainLocs = []; document.querySelectorAll('input[name="edit-loc-quick"]:checked').forEach(cb => mainLocs.push(cb.value));
            const customLoc = document.getElementById('edit-loc-custom').value.trim(); if(customLoc) mainLocs.push(customLoc); const mainLocationString = mainLocs.join('、');
            if(mainLocs.length === 0) return showToast('請選擇或填寫活動主地點', 'error');

            let finalSessions = [];
            const timeRegex = /^\d{2}:\d{2}-\d{2}:\d{2}$/;
            for(let i=0; i<state.tempSessions.length; i++){
                const dateEl = document.getElementById(`sesDate_${i}`);
                const t = document.getElementById(`sesTime_${i}`).value.trim();
                const locEl = document.getElementById(`sesLoc_${i}`);

                if(dateEl && dateEl.value) {
                    if(!t) return showToast(`第 ${i+1} 場請填寫時間`, 'error');
                    if(!timeRegex.test(t)) {
                        return showToast(`第 ${i+1} 場時間格式錯誤！請依照 HH:MM-HH:MM (如: 09:30-12:00)`, 'error');
                    }
                    const sessionLocation = (locEl && locEl.value.trim()) ? locEl.value.trim() : '';
                    if (mainLocs.length > 1 && !sessionLocation) {
                        return showToast(`已選擇多個主地點，第 ${i+1} 場請填寫本場實際地點`, 'error');
                    }
                    finalSessions.push({
                        date: dateEl.value.replace(/-/g, '/'),
                        time: t,
                        location: sessionLocation || mainLocationString
                    });
                } else {
                    if (t || (locEl && locEl.value.trim())) {
                        return showToast(`第 ${i+1} 場請務必補上日期！`, 'error');
                    }
                }
            }
            if(finalSessions.length === 0) return showToast('請完整填寫日期與時間', 'error');

            const teacher = document.getElementById('edit-teacher').value.trim();
            if (!teacher || teacher.length > 5) return showToast('承辦人必須為 1 至 5 個字', 'error');
            if (state.tempTags.length > 3 || state.tempTags.some(tag => typeof tag !== 'string' || !tag.trim() || tag.trim().length > 10)) {
                return showToast('活動標籤最多 3 個，每個含 # 最多 10 個字', 'error');
            }
            const invalidSessionLocationIndex = finalSessions.findIndex(session => !session.location || session.location.length > 20);
            if (invalidSessionLocationIndex !== -1) {
                return showToast(`第 ${invalidSessionLocationIndex + 1} 場地點必須為 1 至 20 個字`, 'error');
            }

            for (let i = 0; i < finalSessions.length; i++) {
                for (let j = i + 1; j < finalSessions.length; j++) {
                    if (finalSessions[i].date === finalSessions[j].date) {
                        if (checkTimeConflict(finalSessions[i].time, finalSessions[j].time)) {
                            if (finalSessions[i].time === finalSessions[j].time) {
                                return showToast(`第 ${i+1} 場與第 ${j+1} 場時間完全相同，請刪除。`, 'error');
                            } else {
                                return showToast(`第 ${i+1} 場與第 ${j+1} 場時間重疊，請修正。`, 'error');
                            }
                        }
                    }
                }
            }

            const activityType = document.querySelector('input[name="edit-activity-type"]:checked').value;
            const isOoo = activityType === 'ooo';
            const isSeriesEvent = activityType === 'series';
            if (isSeriesEvent && finalSessions.length < 2) {
                return showToast('系列活動至少需要設定 2 個場次', 'error');
            }
            const finalCapacity = isOoo ? finalSessions.length : parseInt(document.getElementById('edit-capacity').value);

            const submitBtn = document.getElementById('btn-submit-edit-event');
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.classList.add('opacity-70', 'cursor-not-allowed');
                submitBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin mr-2"></i>處理中...';
            }

            const restoreSubmitBtn = () => {
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.classList.remove('opacity-70', 'cursor-not-allowed');
                    submitBtn.innerHTML = '儲存';
                }
            };

            if (id) {
                const currentCount = getEventRegistrationCount(id);
                const existingEvent = state.events.find(event => String(event.id) === String(id));
                const oldType = existingEvent && existingEvent.isOneOnOne ? 'ooo' : (existingEvent && existingEvent.isSeries ? 'series' : 'normal');
                const typeChanged = oldType !== activityType;
                if (typeChanged && state.currentUserRole !== 'admin') {
                    restoreSubmitBtn();
                    return showToast('只有管理員可以更改既有活動的活動形式', 'error');
                }
                if (typeChanged && currentCount > 0 && (oldType === 'ooo' || activityType === 'ooo')) {
                    restoreSubmitBtn();
                    return showToast('一對一活動已有報名資料，無法轉換活動形式', 'error');
                }

                const warnings = [];
                if (finalCapacity < currentCount) {
                    warnings.push(`人數上限 (${finalCapacity}) 小於已報名人數 (${currentCount})。`);
                }
                if (typeChanged && currentCount > 0) {
                    warnings.push('此活動已有報名資料。更改活動形式後，既有學生只保留原本報名場次；新增場次不會自動替學生報名。');
                }
                if (warnings.length > 0) {
                    restoreSubmitBtn();
                    customConfirm(`${warnings.join('<br><br>')}<br><br>確定要繼續儲存嗎？`, () => {
                        if(submitBtn) { submitBtn.disabled = true; submitBtn.classList.add('opacity-70', 'cursor-not-allowed'); submitBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin mr-2"></i>處理中...'; }
                        proceedSubmitEventEdit(id, mainLocationString, finalSessions, isOoo, isSeriesEvent, finalCapacity, restoreSubmitBtn);
                    }, '⚠️ 活動修改提醒');
                    return;
                }
            }

            proceedSubmitEventEdit(id, mainLocationString, finalSessions, isOoo, isSeriesEvent, finalCapacity, restoreSubmitBtn);
        }

        async function proceedSubmitEventEdit(id, mainLocationString, finalSessions, isOoo, isSeriesEvent, finalCapacity, restoreBtnCallback) {
            const eventData = {
                title: document.getElementById('edit-title').value.trim(),
                category: document.getElementById('edit-category').value,
                tags: [...state.tempTags],
                location: mainLocationString,
                teacher: document.getElementById('edit-teacher').value.trim(),
                capacity: finalCapacity,
                description: document.getElementById('edit-description').value.trim(),
                hasMeal: document.getElementById('edit-meal-main').checked,
                hasSnack: document.getElementById('edit-meal-snack').checked,
                isOneOnOne: isOoo,
                isSeries: isSeriesEvent,
                sessions: finalSessions
            };

            showGlobalLoading(true, '儲存活動中...');
            try {
                const res = await apiRequest({
                    action: id ? 'updateEvent' : 'addEvent',
                    data: eventData,
                    eventId: id || null,
                    adminName: state.currentUserName,
                    adminAcc: state.adminCreds.acc,
                    adminToken: state.adminCreds.token
                });
                if (checkTokenExpiration(res)) return;
                if (res.success) {
                    resetDirty();
                    showToast(id ? '活動儲存成功！' : '活動已建立為未公開草稿！', 'success');
                    closeModal('modal-edit-event');
                    await reloadDataSilently('同步活動資料...');
                }
                else showToast('儲存失敗：' + res.error, 'error');
            } catch (err) { showToast(getRequestErrorMessage(err), 'error'); }
            finally {
                if (restoreBtnCallback) restoreBtnCallback();
                showGlobalLoading(false);
            }
        }

        async function toggleEventPublished(eventId, isPublished) {
            const ev = state.events.find(event => String(event.id) === String(eventId));
            if (!ev) return showToast('找不到活動', 'error');
            const actionText = isPublished ? '公開' : '取消公開';
            const detail = isPublished
                ? '公開後，學生報名頁面會立即顯示此活動。'
                : '取消公開後，學生不能再新增報名；既有報名資料不會刪除。';
            customConfirm(`確定要${actionText}「${escapeHTML(ev.title)}」？<br><span class="text-sm text-gray-600">${detail}</span>`, async () => {
                showGlobalLoading(true, `${actionText}活動中...`);
                try {
                    const res = await apiRequest({
                        action: 'setEventPublished',
                        eventId: eventId,
                        isPublished: isPublished,
                        adminAcc: state.adminCreds.acc,
                        adminToken: state.adminCreds.token
                    });
                    if (checkTokenExpiration(res)) return;
                    if (!res.success) return showToast(`${actionText}失敗：${res.error || '系統處理失敗'}`, 'error');
                    await reloadDataSilently('同步活動公開狀態...');
                    showToast(`活動已${actionText}`, 'success');
                } catch (error) {
                    showToast(`${actionText}失敗：${getRequestErrorMessage(error)}`, 'error');
                } finally {
                    showGlobalLoading(false);
                }
            }, `${actionText}活動`);
        }

        async function deleteAdminEvent(eventId) {
            const ev = state.events.find(e => String(e.id) === String(eventId)); if (!ev) return;
            customConfirm(`確定徹底刪除「${escapeHTML(ev.title)}」？\n(報名紀錄也會一併移除)`, async () => {
                showGlobalLoading(true, '刪除中...');
                try {
                    const res = await apiRequest({
                        action: 'deleteEvent',
                        eventId: eventId,
                        adminName: state.currentUserName,
                        adminAcc: state.adminCreds.acc,
                        adminToken: state.adminCreds.token
                    });
                    if (checkTokenExpiration(res)) return;
                    if (res.success) {
                        showToast('活動已刪除', 'success');
                        await reloadDataSilently('同步中...');
                    } else showToast('刪除失敗', 'error');
                } catch(e) { showToast(getRequestErrorMessage(e), 'error'); }
                finally { showGlobalLoading(false); }
            });
        }

        async function deleteParticipantAdmin(regId) {
            const reg = state.registrations.find(r => String(r.id) === String(regId));
            if (!reg) return showToast('找不到報名資料', 'error');

            customConfirm(`確定刪除 <b>${escapeHTML(reg.name)}</b> 的報名？<br><span class="text-sm text-red-600 font-bold">⚠️ 名額將直接釋放。</span>`, async () => {
                showGlobalLoading(true, '刪除中...');
                try {
                    const res = await apiRequest({
                        action: 'deleteRegistration',
                        regId: regId,
                        adminAcc: state.adminCreds.acc,
                        adminToken: state.adminCreds.token
                    });
                    if (checkTokenExpiration(res)) return;
                    if (res.success) {
                        showToast('已刪除，名額釋放', 'success');
                        await reloadDataSilently('同步中...');
                        if (!document.getElementById('modal-participants').classList.contains('hidden')) {
                            openParticipantsModal(state.currentAdminEventId);
                        }
                    } else {
                        showToast('刪除失敗', 'error');
                    }
                } catch(e) {
                    showToast(getRequestErrorMessage(e), 'error');
                } finally {
                    showGlobalLoading(false);
                }
            }, '確認刪除');
        }

        function openAdminAddParticipantModal() {
            document.getElementById('admin-add-sid').value = '';

            const infoBox = document.getElementById('admin-add-student-info');
            infoBox.innerHTML = '';
            infoBox.classList.remove('bg-blue-50', 'bg-red-50', 'border-blue-100', 'border-red-100');
            infoBox.classList.add('hidden');

            document.getElementById('admin-add-meals-container').classList.add('hidden');
            document.getElementById('admin-add-meals').innerHTML = '';

            const submitBtn = document.getElementById('btn-admin-submit-add');
            submitBtn.disabled = true;
            submitBtn.classList.add('opacity-50', 'cursor-not-allowed');

            state.adminAddTempStudent = null;
            openModal('modal-admin-add-participant');
        }

        async function verifyStudentForAdminAdd() {
            const sid = document.getElementById('admin-add-sid').value.trim();
            if (!sid || !/^\d{8}$/.test(sid)) return showToast('請輸入 8 碼學號', 'error');

            const infoBox = document.getElementById('admin-add-student-info');
            const verifyButton = document.getElementById('btn-verify-admin-student');
            let student = null;

            verifyButton.disabled = true;
            verifyButton.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin mr-1"></i>驗證中';
            try {
                const result = await apiRequest({
                    action: 'lookupStudentForAdminRegistration',
                    sid,
                    adminAcc: state.adminCreds.acc,
                    adminToken: state.adminCreds.token
                });
                if (checkTokenExpiration(result)) return;
                if (result.success) student = result.data;
                else if (result.code !== 'STUDENT_NOT_FOUND') showToast('驗證失敗：' + result.error, 'error');
            } catch (error) {
                showToast(`學生資料驗證失敗：${getRequestErrorMessage(error)}`, 'error');
            } finally {
                verifyButton.disabled = false;
                verifyButton.innerText = '驗證';
            }

            if (student) {
                const isAlreadyRegistered = state.registrations.some(r => String(r.eventId) === String(state.currentAdminEventId) && String(r.studentId) === sid);
                if (isAlreadyRegistered) {
                    infoBox.innerHTML = `<i class="fa-solid fa-triangle-exclamation text-red-500 mr-1"></i> <span class="font-bold text-red-600">${escapeHTML(student.name)}</span> 已經在報名名單中了！`;
                    infoBox.classList.remove('hidden', 'bg-blue-50', 'border-blue-100'); infoBox.classList.add('bg-red-50', 'border-red-100');
                    document.getElementById('admin-add-meals-container').classList.add('hidden');
                    document.getElementById('btn-admin-submit-add').disabled = true; document.getElementById('btn-admin-submit-add').classList.add('opacity-50', 'cursor-not-allowed');
                    return;
                }

                state.adminAddTempStudent = student;
                infoBox.innerHTML = `<i class="fa-solid fa-check-circle text-green-500 mr-1"></i> 找到學生：<span class="font-bold text-gray-800">${escapeHTML(student.name)}</span> (${escapeHTML(student.eduSystem || '')}${escapeHTML(student.className || '')})`;
                infoBox.classList.remove('hidden', 'bg-red-50', 'border-red-100'); infoBox.classList.add('bg-blue-50', 'border-blue-100');

                const ev = state.events.find(e => String(e.id) === state.currentAdminEventId); const opts = getMealOptionsHtml(ev);

                const inputType = 'checkbox';
                const inputName = '';

                const eventMapForConflicts = new Map();
                state.events.forEach(e => eventMapForConflicts.set(String(e.id), e));

                const precompiledConflicts = [];
                const studentOtherRegs = state.registrations.filter(r => String(r.studentId) === sid);
                for (const otherReg of studentOtherRegs) {
                    const otherEv = eventMapForConflicts.get(String(otherReg.eventId));
                    if (!otherEv) continue;
                    const otherAttended = (Array.isArray(otherReg.sessionsData) ? otherReg.sessionsData : []).filter(osd => osd.attend);
                    for (const osd of otherAttended) {
                        const otherSessionDetails = otherEv.sessions.find(s => s.date === osd.date && (s.time === osd.time || !osd.time));
                        if (otherSessionDetails && otherSessionDetails.time) precompiledConflicts.push({ date: otherSessionDetails.date, time: otherSessionDetails.time, title: otherEv.title });
                    }
                }

                document.getElementById('admin-add-meals').innerHTML = ev.sessions.map((sess, idx) => {
                    let hasTimeConflict = false;
                    let conflictEvTitle = '';

                    for (const c of precompiledConflicts) {
                        if (c.date === sess.date && checkTimeConflict(sess.time, c.time)) {
                            hasTimeConflict = true;
                            conflictEvTitle = c.title;
                            break;
                        }
                    }

                    const disableAttr = hasTimeConflict ? 'disabled' : (!ev.isOneOnOne ? 'checked' : '');
                    const bgClass = hasTimeConflict ? 'bg-red-50 border-red-200 opacity-75' : 'bg-gray-50 border-gray-100';
                    const cursorClass = hasTimeConflict ? 'cursor-not-allowed' : 'cursor-pointer';
                    const warningHtml = hasTimeConflict ? `<span class="text-xs text-red-500 font-bold ml-1 break-words">(與「${escapeHTML(conflictEvTitle)}」衝堂)</span>` : '';

                    return `
                    <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-2 p-3 rounded border ${bgClass} gap-2">
                        <label class="flex items-center space-x-2 ${cursorClass} flex-1 w-full">
                            <input type="${inputType}" ${inputName} id="admin-add-attend-${idx}" class="text-chihlee-blue rounded focus:ring-chihlee-blue flex-shrink-0" ${disableAttr} data-change-action="admin-add-session" data-index="${idx}" data-one-on-one="${ev.isOneOnOne}" data-locked="${hasTimeConflict}" data-session-count="${ev.sessions.length}">
                            <span class="text-sm font-medium ${hasTimeConflict ? 'text-gray-400' : 'text-gray-700'} leading-tight">${escapeHTML(sess.date)} ${warningHtml}</span>
                        </label>
                        <select id="admin-add-meal-${idx}" class="admin-add-meal-sel border border-gray-300 rounded px-2 py-1.5 text-sm outline-none focus:ring-chihlee-blue w-full sm:w-auto ${!ev.hasMeal && !ev.hasSnack ? 'hidden' : ''}" ${hasTimeConflict || ev.isOneOnOne ? 'disabled' : ''}>
                            ${opts}
                        </select>
                        ${!ev.hasMeal && !ev.hasSnack ? '<span class="text-xs text-gray-500 hidden sm:block">無供餐</span>' : ''}
                    </div>`;
                }).join('');

                document.getElementById('admin-add-meals-container').classList.remove('hidden');
                document.getElementById('btn-admin-submit-add').disabled = false; document.getElementById('btn-admin-submit-add').classList.remove('opacity-50', 'cursor-not-allowed');

            } else {
                state.adminAddTempStudent = null;
                infoBox.innerHTML = `<i class="fa-solid fa-circle-xmark text-red-500 mr-1"></i> 查無此學號，請先在 Google 試算表 Students 分頁建檔。`;
                infoBox.classList.remove('hidden', 'bg-blue-50', 'border-blue-100'); infoBox.classList.add('bg-red-50', 'border-red-100');
                document.getElementById('admin-add-meals-container').classList.add('hidden');
                document.getElementById('btn-admin-submit-add').disabled = true; document.getElementById('btn-admin-submit-add').classList.add('opacity-50', 'cursor-not-allowed');
            }
        }

        async function submitAdminAddParticipant() {
            if (!state.adminAddTempStudent) return;
            const student = state.adminAddTempStudent;
            const ev = state.events.find(e => String(e.id) === state.currentAdminEventId);
            let sessData = []; let hasAnyAttend = false;

            ev.sessions.forEach((s, idx) => {
                const chk = document.getElementById(`admin-add-attend-${idx}`); const mealSel = document.getElementById(`admin-add-meal-${idx}`);
                if(chk && chk.checked) { sessData.push({ date: s.date, time: s.time, meal: (ev.hasMeal || ev.hasSnack) ? mealSel.value : '不用餐', attend: true }); hasAnyAttend = true; }
                else sessData.push({ date: s.date, time: s.time, meal: '不用餐', attend: false });
            });
            if(!hasAnyAttend) return showToast('請至少選擇一個場次', 'error');

            const currentCount = getEventRegistrationCount(ev.id);
            if (ev.capacity && currentCount >= ev.capacity) {
                customConfirm(`【警告】此活動已達人數上限 (${ev.capacity}人)！<br><br>確定要強制超額新增嗎？`, () => {
                    proceedAdminAddParticipant(ev.id, student, sessData);
                }, '⚠️ 人數上限警告');
            } else {
                proceedAdminAddParticipant(ev.id, student, sessData);
            }
        }

        async function proceedAdminAddParticipant(eventId, student, sessData) {
            const payload = [{ eventId: eventId, studentId: student.id, name: student.name, sessionsData: sessData }];
            showGlobalLoading(true, '新增報名資料中...');
            try {
                const res = await apiRequest({
                    action: 'adminSubmitRegistration',
                    data: payload,
                    adminName: state.currentUserName,
                    adminAcc: state.adminCreds.acc,
                    adminToken: state.adminCreds.token
                });
                if (checkTokenExpiration(res)) return;
                if (res.success) {
                    closeModal('modal-admin-add-participant');
                    await reloadDataSilently('同步報名資料...');
                    if (!document.getElementById('modal-participants').classList.contains('hidden')) {
                        openParticipantsModal(state.currentAdminEventId);
                    }
                    showToast('新增成功！', 'success');
                }
                else showToast('新增失敗：' + res.error, 'error');
            } catch (err) { showToast(getRequestErrorMessage(err), 'error'); }
            finally { showGlobalLoading(false); }
        }

        function openAdminRemarkModal(regId, studentName) {
            resetDirty(); state.currentRemarkStudent = String(regId);
            const reg = state.registrations.find(r => String(r.id) === state.currentRemarkStudent);
            if (!reg) return showToast('找不到資料', 'error');
            const ev = state.events.find(e => String(e.id) === String(reg.eventId));
            if (!ev) return showToast('找不到活動', 'error');

            document.getElementById('remark-student-info').innerText = `正在編輯: ${studentName}`; document.getElementById('admin-remark-input').value = reg.adminRemark || '';
            const sData = Array.isArray(reg.sessionsData) ? reg.sessionsData : [];

            const eventMapForConflicts = new Map();
            state.events.forEach(e => eventMapForConflicts.set(String(e.id), e));

            const precompiledConflicts = [];
            const studentOtherRegs = state.registrations.filter(r => String(r.studentId) === String(reg.studentId) && String(r.id) !== String(reg.id));
            for (const otherReg of studentOtherRegs) {
                const otherEv = eventMapForConflicts.get(String(otherReg.eventId));
                if (!otherEv) continue;
                const otherAttended = (Array.isArray(otherReg.sessionsData) ? otherReg.sessionsData : []).filter(osd => osd.attend);
                for (const osd of otherAttended) {
                    const otherSessionDetails = otherEv.sessions.find(s => s.date === osd.date && (s.time === osd.time || !osd.time));
                    if (otherSessionDetails && otherSessionDetails.time) precompiledConflicts.push({ date: otherSessionDetails.date, time: otherSessionDetails.time, title: otherEv.title });
                }
            }

            let takenOooSessions = [];
            if (ev.isOneOnOne) {
                state.registrations.forEach(r => {
                    if (String(r.eventId) === String(ev.id) && String(r.id) !== String(reg.id)) {
                        (Array.isArray(r.sessionsData) ? r.sessionsData : []).forEach(sd => {
                            if (sd.attend) takenOooSessions.push(sd.date + '_' + (sd.time || ''));
                        });
                    }
                });
            }

            let htmlStr = '<label class="block text-sm font-bold text-gray-700 mb-1">場次參與與餐點修正</label>';
            htmlStr += ev.sessions.map((sess, idx) => {
                const d = sData.find(x => x.date === sess.date && (x.time === sess.time || !x.time)) || { date: sess.date, time: sess.time, attend: false, meal: '不用餐' };

                const isTakenByOthers = ev.isOneOnOne && takenOooSessions.includes(d.date + '_' + (d.time || '')) && !d.attend;

                let hasTimeConflict = false;
                let conflictEvTitle = '';
                for (const c of precompiledConflicts) {
                    if (c.date === sess.date && checkTimeConflict(sess.time, c.time)) {
                        hasTimeConflict = true;
                        conflictEvTitle = c.title;
                        break;
                    }
                }

                const isLocked = isTakenByOthers || hasTimeConflict;
                const disableStr = isLocked ? 'disabled' : '';
                let warningTag = '';
                if (isTakenByOthers) warningTag = '<span class="text-xs text-red-500 ml-1 font-bold break-words">(已被約走)</span>';
                else if (hasTimeConflict) warningTag = `<span class="text-xs text-red-500 ml-1 font-bold break-words">(衝堂: ${escapeHTML(conflictEvTitle)})</span>`;

                return `<div class="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-2 bg-gray-50 p-3 rounded border border-gray-100 gap-2 ${isLocked ? 'opacity-60 bg-red-50' : ''}">
                    <label class="flex items-center space-x-2 ${isLocked ? 'cursor-not-allowed' : 'cursor-pointer'} flex-1 w-full">
                        <input type="checkbox" id="remark-attend-${idx}" class="text-chihlee-blue rounded focus:ring-chihlee-blue flex-shrink-0" ${d.attend && !hasTimeConflict ? 'checked' : ''} ${disableStr} data-change-action="remark-session" data-index="${idx}" data-one-on-one="${ev.isOneOnOne}" data-locked="${isLocked}" data-session-count="${ev.sessions.length}">
                        <span class="text-sm font-medium text-gray-700 leading-tight">${escapeHTML(d.date)}${warningTag}</span>
                    </label>
                    <select id="remark-meal-${idx}" class="remark-meal-sel border border-gray-300 rounded px-2 py-1.5 text-sm outline-none focus:ring-chihlee-blue w-full sm:w-auto ${!ev.hasMeal && !ev.hasSnack ? 'hidden' : ''}" ${!d.attend || isLocked ? 'disabled' : ''}>${getMealOptionsHtml(ev, d.meal)}</select>
                    ${!ev.hasMeal && !ev.hasSnack ? '<span class="text-xs text-gray-500 hidden sm:block">無供餐</span>' : ''}
                </div>`;
            }).join('');

            const currentSessionKeys = ev.sessions.map(s => s.date + '_' + (s.time || ''));
            let ghostCount = 0;
            sData.forEach((sd, ghostIdx) => {
                if (sd.attend && !currentSessionKeys.includes(sd.date + '_' + (sd.time || ''))) {
                    ghostCount++;
                    const ghostMealStr = (!ev.hasMeal && !ev.hasSnack) ? '<span class="text-xs text-gray-500 hidden sm:block">無供餐</span>' : `<span class="text-sm text-gray-500 font-bold">${escapeHTML(normalizeMealChoice(sd.meal))}</span>`;
                    htmlStr += `<div class="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-2 bg-red-50 p-3 rounded border border-red-200 gap-2">
                        <label class="flex items-center space-x-2 cursor-pointer flex-1 w-full">
                            <input type="checkbox" id="remark-ghost-${ghostIdx}" class="text-red-600 rounded focus:ring-red-500 flex-shrink-0" checked data-change-action="mark-dirty">
                            <span class="text-sm font-medium text-red-700 line-through opacity-80 leading-tight">${escapeHTML(sd.date)}</span>
                            <span class="text-[10px] md:text-xs text-red-600 font-bold ml-1 break-words">(已過期或被刪除)</span>
                        </label>
                        ${ghostMealStr}
                    </div>`;
                }
            });

            document.getElementById('admin-remark-meals').innerHTML = htmlStr;
            openModal('modal-remark');
        }

        async function saveAdminRemark() {
            const reg = state.registrations.find(r => String(r.id) === state.currentRemarkStudent);
            if (!reg) return showToast('找不到資料', 'error');

            const ev = state.events.find(e => String(e.id) === String(reg.eventId));
            if (!ev) return showToast('找不到活動', 'error');

            const newRemark = document.getElementById('admin-remark-input').value.trim();
            let newSessionsData = Array.isArray(reg.sessionsData) ? JSON.parse(JSON.stringify(reg.sessionsData)) : [];

            ev.sessions.forEach((sess, idx) => {
                const chk = document.getElementById(`remark-attend-${idx}`);
                const sel = document.getElementById(`remark-meal-${idx}`);

                let isAttending = chk ? chk.checked : false;
                let mealChoice = '不用餐';
                if (isAttending && sel && !sel.disabled && !sel.classList.contains('hidden')) {
                    mealChoice = sel.value;
                }

                const existingIdx = newSessionsData.findIndex(d => d.date === sess.date && (d.time === sess.time || !d.time));
                if (existingIdx >= 0) {
                    newSessionsData[existingIdx].attend = isAttending;
                    newSessionsData[existingIdx].meal = mealChoice;
                    newSessionsData[existingIdx].time = sess.time;
                } else {
                    newSessionsData.push({ date: sess.date, time: sess.time, attend: isAttending, meal: mealChoice });
                }
            });

            const currentSessionKeys = ev.sessions.map(s => s.date + '_' + (s.time || ''));
            Array.isArray(reg.sessionsData) && reg.sessionsData.forEach((sd, ghostIdx) => {
                if (sd.attend && !currentSessionKeys.includes(sd.date + '_' + (sd.time || ''))) {
                    const ghostChk = document.getElementById(`remark-ghost-${ghostIdx}`);
                    if (ghostChk && !ghostChk.checked) {
                        const targetIdx = newSessionsData.findIndex(d => d.date === sd.date && (d.time === sd.time || !d.time));
                        if (targetIdx >= 0) newSessionsData[targetIdx].attend = false;
                    }
                }
            });

            if (ev.isSeries) {
                const selectableKeys = new Set(ev.sessions.filter(session => !isSessionExpired(session)).map(session => `${session.date}_${session.time || ''}`));
                const attendCount = newSessionsData.filter(sd => sd.attend && selectableKeys.has(`${sd.date}_${sd.time || ''}`)).length;
                if (selectableKeys.size > 0 && attendCount < (selectableKeys.size / 2)) {
                    customConfirm(`<div class="text-left text-purple-700">此為<span class="font-bold">「系列活動」</span>！<br><br>您為學生取消了超過一半的場次。確定要儲存變更嗎？</div>`, () => {
                        proceedSaveAdminRemark(reg, newRemark, newSessionsData);
                    }, '⚠️ 修改警告');
                    return;
                }
            }

            proceedSaveAdminRemark(reg, newRemark, newSessionsData);
        }

        async function proceedSaveAdminRemark(reg, newRemark, newSessionsData) {
            const saveBtn = document.getElementById('btn-save-admin-remark');
            if (saveBtn) { saveBtn.disabled = true; saveBtn.classList.add('opacity-70', 'cursor-not-allowed'); saveBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin mr-2"></i>儲存中...'; }

            showGlobalLoading(true, '更新備註中...');
            try {
                const res = await apiRequest({
                    action: 'updateRegistration',
                    regId: reg.id,
                    remark: newRemark,
                    sessionsData: newSessionsData,
                    adminAcc: state.adminCreds.acc,
                    adminToken: state.adminCreds.token
                });
                if (checkTokenExpiration(res)) return;
                if (res.success) {
                    resetDirty();
                    reg.adminRemark = newRemark; reg.sessionsData = newSessionsData;
                    closeModal('modal-remark');
                    showToast('資料已更新', 'success');
                    await reloadDataSilently('同步資料狀態...');
                    if (!document.getElementById('modal-participants').classList.contains('hidden')) {
                        openParticipantsModal(state.currentAdminEventId);
                    }
                }
                else showToast(res.error || '更新失敗', 'error');
            } catch (err) { showToast(getRequestErrorMessage(err), 'error'); }
            finally {
                if (saveBtn) { saveBtn.disabled = false; saveBtn.classList.remove('opacity-70', 'cursor-not-allowed'); saveBtn.innerHTML = '儲存'; }
                showGlobalLoading(false);
            }
        }

        function toggleAllNotify(source) {
            document.querySelectorAll('.notify-checkbox:not([disabled])').forEach(cb => cb.checked = source.checked);
            updateSelectAllState();
        }

        function updateSelectAllState() {
            const allEnabled = document.querySelectorAll('.notify-checkbox:not([disabled])');
            const checkedBoxes = document.querySelectorAll('.notify-checkbox:checked');
            document.getElementById('selectAllNotify').checked = (allEnabled.length > 0 && allEnabled.length === checkedBoxes.length);
            document.getElementById('line-recipient-count').innerText = `即將發送: ${checkedBoxes.length} 人`;
        }

        const LINE_SESSION_PLACEHOLDER = '{{活動場次}}';

        function normalizeLinePreviewField(value) {
            return String(value == null ? '' : value).replace(/[\u0000-\u001F\u007F]+/g, ' ').replace(/\s+/g, ' ').trim();
        }

        function formatLinePreviewDate(dateValue) {
            const date = normalizeLinePreviewField(dateValue);
            const match = date.match(/^(\d{4})[-/](\d{2})[-/](\d{2})$/);
            if (!match) return date;
            return `${match[1]}/${match[2]}/${match[3]}${getDayOfWeek(`${match[1]}-${match[2]}-${match[3]}`).replace('(', '（').replace(')', '）')}`;
        }

        function buildEventLineSessionBlock(ev) {
            const sessions = Array.isArray(ev && ev.sessions) ? ev.sessions : [];
            const showIndex = Boolean(ev && ev.isSeries) || sessions.length > 1;
            return sessions.map((session, index) => {
                const prefix = showIndex ? `第${index + 1}場：` : '';
                const indent = showIndex ? '　　　' : '';
                const location = normalizeLinePreviewField(session.location || ev.location) || '地點待確認';
                return `${prefix}${formatLinePreviewDate(session.date)} ${normalizeLinePreviewField(session.time)}\n${indent}地點：${location}`;
            }).join('\n');
        }

        function requiresPersonalizedLineSessions(ev, type) {
            return type === 'pre_event' && Boolean(ev && (ev.isOneOnOne || ev.isSeries));
        }

        function ensureLineSessionPlaceholder(message) {
            const safeMessage = String(message || '').trim();
            if (safeMessage.includes(LINE_SESSION_PLACEHOLDER)) return safeMessage;
            return `${safeMessage}\n\n📅 活動場次：\n${LINE_SESSION_PLACEHOLDER}`.trim();
        }

        window.openNotifyModal = function(eventId) {
            try {
                const safeEventId = String(eventId);
                state.currentAdminEventId = safeEventId;
                const ev = state.events.find(e => String(e.id) === safeEventId);
                if (!ev) { showToast('找不到活動', 'error'); return; }

                document.getElementById('notify-event-subtitle').innerText = ev.title || '未命名活動';
                renderLineUsageSummary();
                document.getElementById('selectAllNotify').checked = false;

                const templateSelect = document.getElementById('line-template-select');
                if (templateSelect) templateSelect.value = 'pre_event';
                changeLineTemplate();

                const parts = state.registrations.filter(r => String(r.eventId) === safeEventId);
                const tbody = document.getElementById('notify-tbody');
                let hasValidUsers = false;

                if(parts.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="4" class="text-center py-10 text-gray-500 bg-gray-50"><i class="fa-solid fa-user-xmark text-3xl mb-2 text-gray-300 block"></i>目前尚無報名<br><span class="text-xs">您可先編輯暫存文案</span></td></tr>';
                } else {
                    tbody.innerHTML = parts.map(p => {
                        const safeName = p.name != null ? String(p.name).trim() : '未知名稱';
                        const hasLine = p.lineBound === true;
                        if (hasLine) hasValidUsers = true;

                        const preEventTime = p.lineNotifiedAt ? `<span class="text-green-600 text-[10px] md:text-xs font-bold bg-green-100 px-2 py-1 rounded shadow-sm whitespace-nowrap"><i class="fa-solid fa-check mr-1 hidden sm:inline"></i>${escapeHTML(formatSafeDate(p.lineNotifiedAt))}</span>` : `<span class="text-gray-400 text-xs">未發送</span>`;
                        const surveyTime = p.surveyNotifiedAt ? `<span class="text-blue-600 text-[10px] md:text-xs font-bold bg-blue-100 px-2 py-1 rounded shadow-sm whitespace-nowrap"><i class="fa-solid fa-check mr-1 hidden sm:inline"></i>${escapeHTML(formatSafeDate(p.surveyNotifiedAt))}</span>` : `<span class="text-gray-400 text-xs">未發送</span>`;

                        return `<tr class="hover:bg-green-50 even:bg-slate-50 odd:bg-white transition border-b border-gray-100 last:border-0">
                            <td class="px-3 md:px-4 py-3 text-center sticky left-0 bg-inherit shadow-[2px_0_5px_rgba(0,0,0,0.02)] border-r border-gray-200">
                                <input type="checkbox" data-change-action="update-select-all" class="notify-checkbox w-4 h-4 cursor-pointer rounded text-green-600 focus:ring-green-600 border-gray-300" value="${escapeHTML(p.id)}" ${hasLine ? '' : 'disabled'}>
                            </td>
                            <td class="px-3 md:px-4 py-3 font-medium text-gray-900 flex items-center whitespace-normal break-words min-w-[120px]">${escapeHTML(safeName)} ${hasLine ? '<i class="fa-brands fa-line text-green-500 text-lg ml-2 drop-shadow-sm flex-shrink-0" title="已綁定"></i>' : '<i class="fa-brands fa-line text-gray-300 text-lg ml-2 flex-shrink-0" title="未綁定"></i>'}</td>
                            <td class="px-3 md:px-4 py-3 whitespace-nowrap align-middle">${preEventTime}</td>
                            <td class="px-3 md:px-4 py-3 whitespace-nowrap align-middle">${surveyTime}</td>
                        </tr>`;
                    }).join('');
                }

                document.getElementById('selectAllNotify').disabled = !hasValidUsers;
                updateSelectAllState();
                openModal('modal-notify');

            } catch(e) {
                showToast('開啟視窗失敗', 'error');
            }
        };

        function changeLineTemplate() {
            const type = document.getElementById('line-template-select').value;
            const ev = state.events.find(e => String(e.id) === String(state.currentAdminEventId));
            if (!ev) return;

            const textarea = document.getElementById('line-preview-text');
            const clearBtn = document.getElementById('btn-clear-line-draft');
            const personalizationHint = document.getElementById('line-personalization-hint');
            const sessionsStr = buildEventLineSessionBlock(ev);
            const isPersonalizedPreEvent = requiresPersonalizedLineSessions(ev, type);

            if (personalizationHint) {
                if (isPersonalizedPreEvent) {
                    const activityTypeName = ev.isOneOnOne ? '個別預約／一對一' : '系列活動／長期團體';
                    personalizationHint.innerHTML = `<i class="fa-solid fa-user-check mr-1" aria-hidden="true"></i><strong>${activityTypeName}：</strong>發送時，系統會依每位學生實際參加的場次，將 <code class="font-bold bg-white px-1 rounded">${LINE_SESSION_PLACEHOLDER}</code> 自動替換成日期、時間與地點。可修改其他文字，但請保留此代入位置。`;
                    personalizationHint.classList.remove('hidden');
                } else {
                    personalizationHint.textContent = '';
                    personalizationHint.classList.add('hidden');
                }
            }

            const savedDraft = sessionStorage.getItem(`chihlee_line_draft_${ev.id}_${type}`);

            if (savedDraft) {
                textarea.value = isPersonalizedPreEvent ? ensureLineSessionPlaceholder(savedDraft) : savedDraft;
                clearBtn.classList.remove('hidden');
                clearBtn.classList.add('flex');
                document.getElementById('line-draft-warning').classList.remove('hidden');
                document.getElementById('line-draft-hint').classList.add('hidden');
            } else {
                clearBtn.classList.remove('flex');
                clearBtn.classList.add('hidden');
                document.getElementById('line-draft-warning').classList.add('hidden');
                document.getElementById('line-draft-hint').classList.remove('hidden');

                if (type === 'pre_event') {
                    if (isPersonalizedPreEvent) {
                        const sessionLabel = ev.isOneOnOne ? '預約時間與地點' : '參與場次';
                        textarea.value = `【致理科大資源教室 活動提醒】\n同學您好！提醒您有報名以下活動：\n\n📌 活動名稱：${ev.title}\n📅 ${sessionLabel}：\n${LINE_SESSION_PLACEHOLDER}\n\n💡 小提醒：若需更改時間或臨時不克前來，請直接聯繫個管老師喔！期待您的參與！`;
                    } else {
                        textarea.value = `【致理科大資源教室 活動提醒】\n同學您好！提醒您有報名以下活動：\n\n📌 活動名稱：${ev.title}\n📅 活動時間與地點：\n${sessionsStr}\n\n💡 小提醒：請留意當天是否有供餐，若有用餐需求變更或臨時不克前來，請直接聯繫個管老師喔！期待您的參與！`;
                    }
                } else if (type === 'feedback') {
                    textarea.value = `【致理科大資源教室 滿意度調查】\n同學您好！感謝您參與「${ev.title}」。\n\n為了提供更好的活動品質，邀請您花 1 分鐘填寫回饋問卷：\n👉 [請貼上問卷網址]\n\n您的寶貴意見是我們進步的動力，謝謝您！`;
                } else if (type === 'custom') {
                    textarea.value = `【致理科大資源教室 通知】\n同學您好：\n\n（請在此輸入內容）`;
                }
            }
        }

        function saveLineDraft() {
            if (!state.currentAdminEventId) return;
            const type = document.getElementById('line-template-select').value;
            const ev = state.events.find(e => String(e.id) === String(state.currentAdminEventId));
            const rawText = document.getElementById('line-preview-text').value;
            const text = requiresPersonalizedLineSessions(ev, type) ? ensureLineSessionPlaceholder(rawText) : rawText;
            document.getElementById('line-preview-text').value = text;
            sessionStorage.setItem(`chihlee_line_draft_${state.currentAdminEventId}_${type}`, text);
            const typeName = document.getElementById('line-template-select').options[document.getElementById('line-template-select').selectedIndex].text;
            showToast(`已暫存「${typeName.replace('📝 ', '').replace('⭐ ', '').replace('✏️ ', '')}」！`, 'success');
            changeLineTemplate();
        }

        function clearLineDraft() {
            if (!state.currentAdminEventId) return;
            const type = document.getElementById('line-template-select').value;
            sessionStorage.removeItem(`chihlee_line_draft_${state.currentAdminEventId}_${type}`);
            showToast('已清除暫存，恢復預設', 'info');
            changeLineTemplate();
        }

        function confirmSendLine() {
            const selectedCount = document.querySelectorAll('.notify-checkbox:checked').length;
            const message = document.getElementById('line-preview-text').value.trim();
            const notifyType = document.getElementById('line-template-select').value;
            const ev = state.events.find(e => String(e.id) === String(state.currentAdminEventId));
            if (selectedCount === 0) return showToast('請勾選要發送的學生！', 'error');
            if (!message) return showToast('推播文案不可為空！', 'error');
            if (requiresPersonalizedLineSessions(ev, notifyType) && !message.includes(LINE_SESSION_PLACEHOLDER)) {
                return showToast(`請保留 ${LINE_SESSION_PLACEHOLDER}，系統才能帶入每位學生的日期、時間與地點。`, 'error');
            }

            const usage = state.lineUsage || { used: 0, limit: 200, remaining: 200, month: '本月' };
            const used = Math.max(0, Number(usage.used) || 0);
            const limit = Math.max(1, Number(usage.limit) || 200);
            const remaining = Math.max(0, Number(usage.remaining) || 0);
            const projectedUsed = used + selectedCount;
            const projectedRemaining = Math.max(0, limit - projectedUsed);
            const quotaWarning = selectedCount > remaining
                ? '<p class="font-bold text-red-700">⚠️ 本次人數超過系統目前記錄的剩餘額度，LINE 可能拒絕部分或全部訊息。</p>'
                : `<p>若全部成功，預估本月累計 <strong>${projectedUsed}／${limit}</strong> 則，剩餘 <strong>${projectedRemaining}</strong> 則。</p>`;
            const personalizationNotice = requiresPersonalizedLineSessions(ev, notifyType)
                ? '<p class="font-bold text-blue-700">系統會依每位學生實際參加的場次，分別帶入日期、時間與地點。</p>'
                : '';

            customConfirm(
                `<div class="text-left space-y-3"><p class="font-bold text-red-700">LINE 官方帳號每月免費推播額度只有 200 則，請妥善運用。</p><p>${escapeHTML(usage.month || '本月')}目前已成功發送 <strong>${used}／${limit}</strong> 則；本次預計發送 <strong>${selectedCount}</strong> 則。</p>${personalizationNotice}${quotaWarning}<p class="text-sm text-gray-600">系統只累計成功發送的訊息。按「取消」不會發送，按「確定」才會送出。</p></div>`,
                sendLineNotificationNow,
                'LINE 推播額度提醒'
            );
        }

        async function sendLineNotificationNow() {
            const checkboxes = document.querySelectorAll('.notify-checkbox:checked');
            const msg = document.getElementById('line-preview-text').value.trim();
            const notifyType = document.getElementById('line-template-select').value;

            if (checkboxes.length === 0) return showToast('請勾選要發送的學生！', 'error');
            if (!msg) return showToast('推播文案不可為空！', 'error');

            const sendBtn = document.getElementById('btn-confirm-send-line');
            if (sendBtn) {
                sendBtn.disabled = true;
                sendBtn.classList.add('opacity-70', 'cursor-not-allowed');
                sendBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin mr-2"></i>發送中...';
            }

            let targetRegIds = [];
            checkboxes.forEach(cb => targetRegIds.push(cb.value));

            showGlobalLoading(true, `發送給 ${targetRegIds.length} 位學生中...`);
            try {
                const res = await apiRequest({
                    action: 'sendLineNotification',
                    regIds: targetRegIds,
                    message: msg,
                    notifyType: notifyType,
                    adminAcc: state.adminCreds.acc,
                    adminToken: state.adminCreds.token
                });
                if (checkTokenExpiration(res)) return;
                if (res.success) {
                    state.lineUsage = res.lineUsage;
                    renderLineUsageSummary();
                    if (res.failCount > 0 && res.failedStudents && res.failedStudents.length > 0) {
                        customConfirm(`✅ 成功: ${res.successCount} 人<br>❌ 失敗: ${res.failCount} 人<br><br>【發送失敗名單】(未綁定或異常):<br><div class="text-sm text-red-600 mt-2 max-h-32 overflow-y-auto text-left bg-red-50 p-2 rounded border border-red-100">${res.failedStudents.map(escapeHTML).join('<br>')}</div>`, () => {}, '發送結果與清單');
                    } else if (res.successCount > 0) {
                        showToast(`發送完畢！成功 ${res.successCount} 人，失敗 ${res.failCount} 人`, 'success');
                    } else {
                        showToast(`發送失敗！(請檢查 LINE ID)`, 'error');
                    }
                    await reloadDataSilently('更新通知狀態...');
                    openNotifyModal(state.currentAdminEventId);
                } else showToast('發送失敗：' + res.error, 'error');
            } catch(e) { showToast(getRequestErrorMessage(e), 'error'); }
            finally {
                if (sendBtn) {
                    sendBtn.disabled = false;
                    sendBtn.classList.remove('opacity-70', 'cursor-not-allowed');
                    sendBtn.innerHTML = '<i class="fa-solid fa-paper-plane mr-2"></i>發送推播';
                }
                showGlobalLoading(false);
            }
        }

        window.openParticipantsModal = function(eventId) {
            state.currentAdminEventId = String(eventId);
            const ev = state.events.find(e => String(e.id) === state.currentAdminEventId);
            if (!ev) return showToast('找不到活動', 'error');

            const titleEl = document.getElementById('part-modal-title');
            if (titleEl) titleEl.innerHTML = `<i class="fa-solid fa-users text-chihlee-blue mr-2"></i><span>${escapeHTML(ev.title)}</span>`;

            const parts = state.registrations.filter(r => String(r.eventId) === state.currentAdminEventId);
            const tbody = document.getElementById('participants-tbody');
            const noMsg = document.getElementById('no-participants-msg');
            const statsContainer = document.getElementById('part-modal-stats-container');

            let totalAttend = 0;
            const mealCounts = { '葷': 0, '素': 0, '不用餐': 0 };

            if (parts.length === 0) {
                tbody.innerHTML = '';
                noMsg.classList.remove('hidden');
            } else {
                noMsg.classList.add('hidden');
                tbody.innerHTML = parts.map(p => {
                    const safeName = p.name || '未知名稱';
                    const displayClass = `${escapeHTML(p.eduSystem || '')}${escapeHTML(p.className || '')}` || '-';
                    const hasLine = p.lineBound === true;

                    let sData = Array.isArray(p.sessionsData) ? p.sessionsData : [];
                    let hasAttend = false;
                    let sessionDetailsHtml = sData.map(sd => {
                        if (sd.attend) {
                            hasAttend = true;
                            totalAttend++;
                            const meal = normalizeMealChoice(sd.meal);
                            mealCounts[meal]++;
                            const session = (Array.isArray(ev.sessions) ? ev.sessions : []).find(item => item.date === sd.date && (item.time === sd.time || !sd.time));
                            const time = sd.time || (session && session.time) || '';
                            return `<div class="text-xs mb-1.5 tabular-nums flex flex-col sm:flex-row sm:items-center sm:gap-2"><span class="font-bold text-gray-700 break-words">${escapeHTML(sd.date)} ${escapeHTML(time)}</span><span class="${getMealBadgeClass(meal)}">${escapeHTML(meal)}</span></div>`;
                        }
                        return '';
                    }).join('');

                    if (!hasAttend) sessionDetailsHtml = `<span class="text-xs text-gray-400">已取消所有場次</span>`;

                    const remarkHtml = p.adminRemark ? `<div class="text-[10px] md:text-xs text-red-600 font-bold bg-red-50 p-1.5 rounded mt-1 whitespace-normal min-w-[120px] max-w-xs md:max-w-sm leading-relaxed border border-red-100 break-words">${escapeHTML(p.adminRemark).replace(/\n/g, '<br>')}</div>` : `<span class="text-gray-400 text-xs">無</span>`;

                    return `<tr class="hover:bg-blue-50 even:bg-slate-50 odd:bg-white transition border-b border-gray-100 group">
                        <td class="px-4 md:px-6 py-3 sticky left-0 z-10 bg-inherit shadow-[2px_0_5px_rgba(0,0,0,0.02)] border-r border-gray-100">
                            <div class="font-bold text-gray-900 text-xs md:text-sm whitespace-normal break-words">${escapeHTML(displayClass)}</div>
                            <div class="text-xs md:text-sm text-gray-600 my-0.5 whitespace-normal break-all">${escapeHTML(p.studentId)}</div>
                            <div class="text-xs md:text-sm font-bold text-chihlee-blue flex items-center whitespace-normal break-words min-w-[80px]">${escapeHTML(safeName)} ${hasLine ? '<i class="fa-brands fa-line text-green-500 ml-1.5 text-lg drop-shadow-sm flex-shrink-0" title="已綁定 LINE" aria-hidden="true"></i><span class="sr-only">已綁定 LINE</span>' : '<i class="fa-brands fa-line text-gray-300 ml-1.5 text-lg flex-shrink-0" title="未綁定 LINE" aria-hidden="true"></i><span class="sr-only">未綁定 LINE</span>'}</div>
                        </td>
                        <td class="px-4 md:px-6 py-3 align-top bg-inherit min-w-[120px]">${sessionDetailsHtml}</td>
                        <td class="px-4 md:px-6 py-3 align-top bg-inherit min-w-[150px]">${remarkHtml}</td>
                        <td class="px-4 md:px-6 py-3 text-right md:sticky md:right-0 bg-inherit md:shadow-[-4px_0_10px_rgba(0,0,0,0.02)] align-middle border-l border-gray-100 flex flex-col sm:flex-row justify-end items-center">
                            <button data-action="open-admin-remark" data-registration-id="${escapeHTML(p.id)}" data-student-name="${escapeHTML(safeName)}" class="text-chihlee-blue bg-blue-50 hover:bg-blue-100 border border-blue-200 px-3 py-1.5 rounded text-[10px] md:text-xs transition font-bold mb-1 sm:mb-0 sm:mr-2 whitespace-nowrap"><i class="fa-solid fa-pen mr-1"></i>備註</button>
                            <button data-action="delete-participant" data-registration-id="${escapeHTML(p.id)}" class="text-red-500 bg-red-50 hover:bg-red-100 border border-red-200 px-3 py-1.5 rounded text-[10px] md:text-xs transition font-bold whitespace-nowrap"><i class="fa-solid fa-trash mr-1"></i>刪除</button>
                        </td>
                    </tr>`;
                }).join('');

            }

            // 統計固定顯示於活動名稱下方；即使尚無報名，也清楚呈現全部為 0。
            let statsHtml = `<div class="bg-blue-50 text-chihlee-blue px-2 md:px-3 py-1 md:py-1.5 rounded-md font-bold text-xs md:text-sm border border-blue-100 shadow-sm whitespace-nowrap"><i class="fa-solid fa-users mr-1"></i>報名人數：${parts.length}</div>`;
            if (ev.isSeries) statsHtml += `<div class="bg-sky-50 text-blue-700 px-2 md:px-3 py-1 md:py-1.5 rounded-md font-bold text-xs md:text-sm border border-blue-100 shadow-sm whitespace-nowrap">出席人次：${totalAttend}</div>`;
            statsHtml += `<div class="w-full text-xs font-bold text-gray-600 mt-1"><i class="fa-solid fa-utensils mr-1"></i>用餐統計（依勾選場次計算）</div>`;
            statsHtml += Object.entries(mealCounts).map(([m, c]) => `<div class="${getMealBadgeClass(m)}">${escapeHTML(m)}：${c}</div>`).join('');
            statsContainer.innerHTML = statsHtml;

            openModal('modal-participants');
        }
