// أداة تسجيل تصحيح الأخطاء المباشرة على الصفحة
function debugLog(text) {
  console.log(text);
  const debugDiv = document.getElementById('debug-log-console') || document.createElement('div');
  debugDiv.id = 'debug-log-console';
  debugDiv.style.position = 'fixed';
  debugDiv.style.bottom = '15px';
  debugDiv.style.right = '15px';
  debugDiv.style.background = 'rgba(11, 15, 25, 0.9)';
  debugDiv.style.color = '#10b981';
  debugDiv.style.padding = '12px';
  debugDiv.style.maxHeight = '200px';
  debugDiv.style.width = '320px';
  debugDiv.style.overflowY = 'auto';
  debugDiv.style.zIndex = '99999';
  debugDiv.style.fontSize = '12px';
  debugDiv.style.fontFamily = 'monospace';
  debugDiv.style.borderRadius = '12px';
  debugDiv.style.border = '1px solid rgba(255, 255, 255, 0.1)';
  debugDiv.style.boxShadow = '0 10px 25px rgba(0,0,0,0.5)';
  debugDiv.style.direction = 'ltr';
  debugDiv.style.textAlign = 'left';
  debugDiv.innerHTML += '<div style="margin-bottom: 4px; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 2px;">• ' + text + '</div>';
  document.body.appendChild(debugDiv);
  debugDiv.scrollTop = debugDiv.scrollHeight;
}

debugLog("بدء تشغيل الملف app.js...");

// التحقق من وجود الإعدادات
if (typeof CONFIG === 'undefined') {
  debugLog("خطأ: CONFIG غير معرّف!");
  alert('خطأ: لم يتم العثور على ملف الإعدادات config.js');
} else {
  debugLog("تم العثور على CONFIG بنجاح.");
}

// تهيئة عميل Supabase
const supabaseUrl = CONFIG.SUPABASE_URL;
const supabaseKey = CONFIG.SUPABASE_KEY;
debugLog("جاري تهيئة عميل Supabase...");
const supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey);
debugLog("تمت تهيئة عميل Supabase بنجاح.");

// المتغيرات العامة
let allMessages = [];
let filteredMessages = [];
let urgencyChart = null;
let sentimentChart = null;
let activeMessageId = null;

// عناصر واجهة المستخدم
const messagesList = document.getElementById('messages-list');
const resultsCount = document.getElementById('results-count');
const searchInput = document.getElementById('search-input');
const filterUrgency = document.getElementById('filter-urgency');
const filterCategory = document.getElementById('filter-category');
const filterStatus = document.getElementById('filter-status');

// أزرار السيرفر والتحديث
const btnCollect = document.getElementById('btn-collect');
const btnAnalyze = document.getElementById('btn-analyze');
const btnRefresh = document.getElementById('btn-refresh');

// المودال والنصوص الخاصة بالسكربتات
const syncModal = document.getElementById('sync-modal');
const modalTitle = document.getElementById('modal-title');
const modalStatusText = document.getElementById('modal-status-text');
const consoleOutput = document.getElementById('console-output');
const closeModalBtn = document.getElementById('close-modal-btn');

// لوحة التفاصيل الجانبية (Drawer)
const detailsDrawer = document.getElementById('details-drawer');
const drawerOverlay = document.getElementById('drawer-overlay');
const drawerBody = document.getElementById('drawer-body');
const closeDrawerBtn = document.getElementById('close-drawer-btn');

// تهيئة التطبيق عند تحميل الصفحة
document.addEventListener('DOMContentLoaded', () => {
  debugLog("حدث DOMContentLoaded: بدء تهيئة الصفحة...");
  fetchData();
  setupEventListeners();
  setupRealtimeSubscription();
  debugLog("تم استدعاء مهام التهيئة.");
});

// جلب البيانات من Supabase
async function fetchData() {
  debugLog("fetchData: جاري تعيين حالة التحميل...");
  setLoadingState(true);
  try {
    debugLog("fetchData: جاري إرسال طلب SELECT إلى Supabase...");
    const { data, error } = await supabaseClient
      .from('support_messages')
      .select('*')
      .order('sent_at', { ascending: false });

    if (error) {
      debugLog("fetchData: رجع الاستعلام بخطأ من Supabase!");
      throw error;
    }

    debugLog(`fetchData: تم جلب ${data ? data.length : 0} صف من قاعدة البيانات بنجاح.`);
    allMessages = data || [];
    debugLog("fetchData: جاري تطبيق الفلاتر...");
    applyFilters();
    debugLog("fetchData: جاري تحديث الـ KPIs...");
    updateKPIs();
    debugLog("fetchData: جاري رسم المخططات البيانية...");
    renderCharts();
    debugLog("fetchData: اكتملت جميع خطوات جلب البيانات وعرضها.");
  } catch (err) {
    debugLog("fetchData: حدث استثناء (Exception): " + err.message);
    console.error('Error fetching data:', err);
    messagesList.innerHTML = `
      <div class="empty-state">
        <i class="fa-solid fa-triangle-exclamation text-danger"></i>
        <p>فشل جلب البيانات من Supabase. يرجى التأكد من الجدول والاتصال.</p>
        <small>${err.message}</small>
      </div>
    `;
  } finally {
    setLoadingState(false);
    debugLog("fetchData: إيقاف حالة التحميل.");
  }
}

let realtimeDebounceTimer = null;

// إعداد مراقب التحديث التلقائي (Supabase Realtime)
function setupRealtimeSubscription() {
  supabaseClient
    .channel('schema-db-changes')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'support_messages' },
      (payload) => {
        console.log('Realtime change detected:', payload);
        
        // استخدام Debounce لمنع تجميد الصفحة عند استقبال دفعات تحديث متتالية
        clearTimeout(realtimeDebounceTimer);
        realtimeDebounceTimer = setTimeout(() => {
          debugLog("تحديث البيانات تلقائياً لتوافق التغيير اللحظي...");
          fetchData();
        }, 500);
      }
    )
    .subscribe();
}

// حالة التحميل
function setLoadingState(isLoading) {
  if (isLoading && allMessages.length === 0) {
    messagesList.innerHTML = `
      <div class="loading-state">
        <i class="fa-solid fa-spinner fa-spin"></i>
        <p>جاري جلب البيانات من Supabase...</p>
      </div>
    `;
  }
}

// إعداد أحداث المستمعين (Event Listeners)
function setupEventListeners() {
  // تصفية وبحث
  searchInput.addEventListener('input', applyFilters);
  filterUrgency.addEventListener('change', applyFilters);
  filterCategory.addEventListener('change', applyFilters);
  filterStatus.addEventListener('change', applyFilters);

  // تحديث يدوي
  btnRefresh.addEventListener('click', fetchData);

  // أزرار تشغيل السكربتات عبر السيرفر
  btnCollect.addEventListener('click', () => runScript('/api/collect', 'جلب رسائل تيليجرام'));
  btnAnalyze.addEventListener('click', () => runScript('/api/analyze', 'تقييم المحادثات بالذكاء الاصطناعي'));

  // إغلاق المودال والـ Drawer
  closeModalBtn.addEventListener('click', () => syncModal.classList.remove('open'));
  closeDrawerBtn.addEventListener('click', closeDrawer);
  drawerOverlay.addEventListener('click', closeDrawer);
}

// تشغيل سكربت بايثون عبر السيرفر المحلي المدمج
async function runScript(endpoint, title) {
  const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.protocol === 'file:';
  
  if (!isLocal) {
    modalTitle.textContent = title;
    modalStatusText.textContent = 'تنبيه: الاستضافة السحابية نشطة';
    modalStatusText.className = 'text-warning';
    consoleOutput.textContent = `أنت الآن تستعرض لوحة التحكم من خلال استضافة GitHub Pages.\n\n• يتم جلب وتحليل الرسائل بشكل تلقائي دوري كل ساعة عبر GitHub Actions.\n• لتشغيل الفحص الفوري يدوياً، يرجى الانتقال إلى صفحة مستودع GitHub الخاص بك وتشغيل الـ Workflow يدوياً عبر زر "Run workflow" في تبويب Actions.`;
    const spinner = syncModal.querySelector('.status-spinner');
    if (spinner) spinner.style.display = 'none';
    syncModal.classList.add('open');
    return;
  }

  modalTitle.textContent = title;
  modalStatusText.textContent = 'جاري التشغيل والتنفيذ... قد يستغرق ذلك بضع ثوانٍ.';
  consoleOutput.textContent = 'منفذ الأوامر النشط:\n';
  syncModal.classList.add('open');
  
  // تدوير أيقونة التحميل داخل المودال
  const spinner = syncModal.querySelector('.status-spinner');
  if (spinner) spinner.style.display = 'inline-block';

  try {
    const baseUrl = window.location.protocol === 'file:' ? 'http://localhost:8000' : '';
    const response = await fetch(`${baseUrl}${endpoint}`, {
      method: 'POST'
    });
    
    const data = await response.json();
    
    if (data.success) {
      modalStatusText.textContent = 'اكتمل التشغيل بنجاح!';
      modalStatusText.className = 'text-success';
    } else {
      modalStatusText.textContent = 'فشل تشغيل السكربت أو حدث خطأ أثناء التنفيذ.';
      modalStatusText.className = 'text-danger';
    }
    
    // طباعة السجلات في وحدة التحكم الوهمية
    consoleOutput.textContent += `[المخرجات القياسية - STDOUT]:\n${data.stdout || 'لا توجد مخرجات'}\n\n`;
    if (data.stderr) {
      consoleOutput.textContent += `[سجل الأخطاء - STDERR]:\n${data.stderr}\n`;
    }
    
    // تحديث لوحة البيانات
    fetchData();

  } catch (err) {
    console.error('Script run error:', err);
    modalStatusText.textContent = 'فشل الاتصال بسيرفر التطوير المحلي. تأكد من تشغيل server.py';
    modalStatusText.className = 'text-danger';
    consoleOutput.textContent += `خطأ الاتصال: ${err.message}\nتأكد من تشغيل الأمر التالي في سطر الأوامر:\npython server.py`;
  } finally {
    spinner.style.display = 'none';
  }
}

// تطبيق التصفية والبحث
function applyFilters() {
  const query = searchInput.value.toLowerCase().trim();
  const urgency = filterUrgency.value;
  const category = filterCategory.value;
  const status = filterStatus.value;

  filteredMessages = allMessages.filter(msg => {
    // فلتر البحث بالرسالة أو اسم المحادثة أو المرسل
    const matchesSearch = 
      (msg.message && msg.message.toLowerCase().includes(query)) ||
      (msg.chat_name && msg.chat_name.toLowerCase().includes(query)) ||
      (msg.sender && msg.sender.includes(query));

    // فلاتر القوائم المنسدلة
    const matchesUrgency = urgency === 'all' || msg.urgency === urgency;
    const matchesCategory = category === 'all' || msg.category === category;
    const matchesStatus = status === 'all' || msg.status === status;

    return matchesSearch && matchesUrgency && matchesCategory && matchesStatus;
  });

  resultsCount.textContent = `تم العثور على ${filteredMessages.length} رسالة`;
  renderMessages();
}

// عرض الرسائل في القائمة
function renderMessages() {
  if (filteredMessages.length === 0) {
    messagesList.innerHTML = `
      <div class="empty-state">
        <i class="fa-regular fa-folder-open"></i>
        <p>لم يتم العثور على أي رسائل مطابقة لخيارات البحث والتصفية.</p>
      </div>
    `;
    return;
  }

  messagesList.innerHTML = filteredMessages.map(msg => {
    const dateStr = new Date(msg.sent_at).toLocaleString('ar-SA', {
      hour: '2-digit',
      minute: '2-digit',
      day: 'numeric',
      month: 'short'
    });
    
    const senderInitial = msg.chat_name ? msg.chat_name.charAt(0) : '?';
    const hasAIAnalysis = msg.status !== 'pending';

    // النجوم للتقييم
    let starsHtml = '';
    if (hasAIAnalysis && msg.rating) {
      for (let i = 1; i <= 5; i++) {
        starsHtml += `<i class="fa-${i <= msg.rating ? 'solid' : 'regular'} fa-star"></i>`;
      }
    }

    const urgencyBadge = msg.urgency ? `<span class="badge badge-${msg.urgency}">${translateUrgency(msg.urgency)}</span>` : '';
    const categoryBadge = msg.category ? `<span class="badge glass">${translateCategory(msg.category)}</span>` : '';

    // المشاعر (إيجابي / سلبي / محايد)
    let sentimentBadge = '';
    if (msg.sentiment) {
      const isPositive = msg.sentiment === 'positive';
      const isNegative = msg.sentiment === 'negative';
      const sentimentClass = isPositive ? 'resolved' : (isNegative ? 'high' : 'pending');
      const sentimentIcon = isPositive ? 'fa-face-smile' : (isNegative ? 'fa-face-frown' : 'fa-face-meh');
      const sentimentText = isPositive ? 'إيجابي' : (isNegative ? 'سلبي' : 'محايد');
      sentimentBadge = `<span class="badge badge-${sentimentClass}"><i class="fa-solid ${sentimentIcon}"></i> المشاعر: ${sentimentText}</span>`;
    }

    // حالة حل مشكلة العميل
    const isResolved = msg.status === 'resolved';
    const resolutionBadge = isResolved 
      ? `<span class="badge badge-resolved"><i class="fa-solid fa-circle-check"></i> تم حل المشكلة</span>` 
      : `<span class="badge badge-high"><i class="fa-solid fa-circle-xmark"></i> لم تُحل المشكلة بعد</span>`;

    return `
      <div class="message-card glass" onclick="openDrawer(${msg.id})">
        <div class="msg-header">
          <div class="msg-sender-info">
            <div class="sender-avatar">${senderInitial}</div>
            <div class="sender-name-details">
              <h4>${msg.chat_name || 'محادثة غير معروفة'}</h4>
              <span>مُرسل: ${msg.sender} • ${dateStr}</span>
            </div>
          </div>
          <div class="msg-badges">
            ${urgencyBadge}
            ${categoryBadge}
            ${sentimentBadge}
            ${resolutionBadge}
          </div>
        </div>
        
        <div class="msg-body">
          ${msg.message}
        </div>
        
        <div class="msg-footer">
          <div class="ai-summary-excerpt">
            <i class="fa-solid fa-brain"></i>
            <span>${msg.evaluation_summary || (hasAIAnalysis ? 'تم التحليل يدوياً' : 'بانتظار تقييم الذكاء الاصطناعي...')}</span>
          </div>
          
          <div style="display: flex; align-items: center; gap: 1rem;">
            ${starsHtml ? `<div class="stars">${starsHtml}</div>` : ''}
            <div style="display: flex; gap: 0.5rem;">
              <button onclick="event.stopPropagation(); analyzeSingle('${msg.tg_message_id}', this)" class="action-btn header-btn" style="padding: 0.4rem 0.85rem; font-size: 0.8rem; background-color: #8b5cf6; border-color: #8b5cf6; border-radius: 8px; color: white;">
                <i class="fa-solid fa-wand-magic-sparkles"></i> تحليل ذكي
              </button>
              ${msg.tg_link ? `<a href="${msg.tg_link}" target="_blank" onclick="event.stopPropagation();" class="action-btn header-btn" style="text-decoration: none; padding: 0.4rem 0.85rem; font-size: 0.8rem; background-color: #0088cc; border-color: #0088cc; border-radius: 8px; color: white;"><i class="fa-brands fa-telegram"></i> دخول المحادثة</a>` : ''}
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// ترجمة الحالات للعربية
function translateUrgency(val) {
  const mapping = { 'high': 'مرتفع جداً', 'medium': 'متوسط', 'low': 'منخفض' };
  return mapping[val] || val;
}

function translateCategory(val) {
  const mapping = {
    'billing': 'فواتير ودفع',
    'technical': 'دعم فني وأعطال',
    'sales': 'مبيعات وطلبات',
    'general': 'استفسار عام',
    'complaint': 'شكاوى'
  };
  return mapping[val] || val;
}

function translateStatus(val) {
  const mapping = { 'pending': 'قيد الانتظار', 'analyzed': 'تم التحليل', 'resolved': 'تم الحل' };
  return mapping[val] || val;
}

// تحديث مؤشرات الأداء الرئيسية (KPIs)
function updateKPIs() {
  const total = allMessages.length;
  const pending = allMessages.filter(m => m.status === 'pending').length;
  const analyzed = allMessages.filter(m => m.status !== 'pending').length;
  const highUrgency = allMessages.filter(m => m.urgency === 'high').length;
  
  // الرسائل الإيجابية
  const positive = allMessages.filter(m => m.sentiment === 'positive').length;
  
  // حساب متوسط التقييم للرسائل التي تم تحليلها ولها تقييم
  const ratedMessages = allMessages.filter(m => m.rating > 0);
  const avgRating = ratedMessages.length > 0
    ? (ratedMessages.reduce((sum, m) => sum + m.rating, 0) / ratedMessages.length).toFixed(1)
    : '0.0';

  // تحديث القيم في الواجهة
  document.getElementById('stat-total').textContent = total;
  document.getElementById('stat-pending').textContent = pending;
  document.getElementById('stat-analyzed').textContent = analyzed;
  document.getElementById('kpi-urgent-count').textContent = highUrgency;
  document.getElementById('kpi-positive-count').textContent = positive;
  document.getElementById('kpi-avg-rating').textContent = avgRating;
}

// رسم الرسوم البيانية التفاعلية
function renderCharts() {
  // 1. حساب بيانات الرسم البياني للاستعجال
  const urgencyCounts = { high: 0, medium: 0, low: 0 };
  allMessages.forEach(m => {
    if (m.urgency in urgencyCounts) {
      urgencyCounts[m.urgency]++;
    }
  });

  const ctxUrgency = document.getElementById('urgencyChart').getContext('2d');
  if (urgencyChart) urgencyChart.destroy();
  
  urgencyChart = new Chart(ctxUrgency, {
    type: 'doughnut',
    data: {
      labels: ['مرتفع', 'متوسط', 'منخفض'],
      datasets: [{
        data: [urgencyCounts.high, urgencyCounts.medium, urgencyCounts.low],
        backgroundColor: ['#ef4444', '#f59e0b', '#94a3b8'],
        borderWidth: 0,
        hoverOffset: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'right',
          labels: { color: '#94a3b8', font: { family: 'Tajawal' } }
        }
      }
    }
  });

  // 2. حساب بيانات الرسم البياني للمشاعر والرضا
  const sentimentCounts = { positive: 0, neutral: 0, negative: 0 };
  allMessages.forEach(m => {
    if (m.sentiment in sentimentCounts) {
      sentimentCounts[m.sentiment]++;
    }
  });

  const ctxSentiment = document.getElementById('sentimentChart').getContext('2d');
  if (sentimentChart) sentimentChart.destroy();

  sentimentChart = new Chart(ctxSentiment, {
    type: 'bar',
    data: {
      labels: ['إيجابي', 'محايد', 'سلبي'],
      datasets: [{
        label: 'عدد المحادثات',
        data: [sentimentCounts.positive, sentimentCounts.neutral, sentimentCounts.negative],
        backgroundColor: ['#10b981', '#06b6d4', '#ef4444'],
        borderRadius: 8
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,0.05)' } },
        x: { ticks: { color: '#94a3b8' }, grid: { display: false } }
      },
      plugins: {
        legend: { display: false }
      }
    }
  });
}

// فتح لوحة التفاصيل والتقييم الجانبية (Drawer)
async function openDrawer(messageId) {
  const msg = allMessages.find(m => m.id === messageId);
  if (!msg) return;

  activeMessageId = messageId;
  
  // استخراج معرف المحادثة (chat_id) من حقل tg_message_id (صيغته chat_id:message_id)
  const tgIdStr = msg.tg_message_id || "";
  const chatId = tgIdStr.includes(":") ? tgIdStr.split(":")[0] : null;

  // إظهار اللوحة الجانبية مع مؤشر تحميل مؤقت لشريط المحادثة
  drawerOverlay.style.display = 'block';
  detailsDrawer.classList.add('open');

  // بناء الهيكل الأساسي للوحة الجانبية مع شريط تحميل للمحادثات
  drawerBody.innerHTML = `
    <!-- نص الرسالة الأصلي ورابط الدخول للمحادثة -->
    <div class="detail-section">
      <h4 id="thread-header-title">سير المحادثة بالكامل:</h4>
      <div id="drawer-chat-thread" style="background: rgba(15, 23, 42, 0.6); border: 1px solid var(--card-border); border-radius: 12px; padding: 1.5rem; display: flex; flex-direction: column; gap: 0.75rem; min-height: 150px; max-height: 350px; overflow-y: auto; align-items: center; justify-content: center; direction: ltr;">
        <i class="fa-solid fa-spinner fa-spin" style="font-size: 1.5rem; color: var(--primary);"></i>
        <p style="margin-top: 0.5rem; font-size: 0.9rem; color: var(--text-muted); text-align: center;">جاري تحميل كامل المحادثة من قاعدة البيانات...</p>
      </div>
      ${msg.tg_link ? `<a href="${msg.tg_link}" target="_blank" class="action-btn" style="text-decoration: none; display: inline-flex; align-items: center; justify-content: center; width: 100%; background-color: #0088cc; border-color: #0088cc; font-size: 0.9rem; margin-top: 10px;"><i class="fa-brands fa-telegram"></i> الانتقال للمحادثة في تيليجرام</a>` : ''}
    </div>

    <!-- معلومات المصدر والوقت -->
    <div class="detail-meta-grid">
      <div class="detail-section">
        <h4>المحادثة:</h4>
        <div class="detail-content-box">${msg.chat_name || 'غير معروف'}</div>
      </div>
      <div class="detail-section">
        <h4>مُرسل الرسالة:</h4>
        <div class="detail-content-box">${msg.sender}</div>
      </div>
    </div>

    <!-- ملخص تقييم الذكاء الاصطناعي -->
    <div class="detail-section">
      <h4>ملخص تقييم الذكاء الاصطناعي:</h4>
      <textarea id="edit-summary" rows="3" class="detail-content-box" style="width: 100%; resize: vertical;">${msg.evaluation_summary || ''}</textarea>
    </div>

    <!-- حقول التعديل والتقييم -->
    <div class="detail-meta-grid">
      <div class="edit-form-group">
        <label>القسم والتصنيف:</label>
        <select id="edit-category">
          <option value="general" ${msg.category === 'general' ? 'selected' : ''}>استفسار عام</option>
          <option value="billing" ${msg.category === 'billing' ? 'selected' : ''}>فواتير ودفع</option>
          <option value="technical" ${msg.category === 'technical' ? 'selected' : ''}>دعم فني وأعطال</option>
          <option value="sales" ${msg.category === 'sales' ? 'selected' : ''}>مبيعات وطلبات</option>
          <option value="complaint" ${msg.category === 'complaint' ? 'selected' : ''}>شكاوى</option>
        </select>
      </div>

      <div class="edit-form-group">
        <label>مدى الاستعجال:</label>
        <select id="edit-urgency">
          <option value="low" ${msg.urgency === 'low' ? 'selected' : ''}>منخفض</option>
          <option value="medium" ${msg.urgency === 'medium' ? 'selected' : ''}>متوسط</option>
          <option value="high" ${msg.urgency === 'high' ? 'selected' : ''}>مرتفع</option>
        </select>
      </div>
    </div>

    <div class="detail-meta-grid">
      <div class="edit-form-group">
        <label>حالة المتابعة والحل:</label>
        <select id="edit-status">
          <option value="pending" ${msg.status === 'pending' ? 'selected' : ''}>قيد الانتظار</option>
          <option value="analyzed" ${msg.status === 'analyzed' ? 'selected' : ''}>تم التحليل</option>
          <option value="resolved" ${msg.status === 'resolved' ? 'selected' : ''}>تم حل المشكلة</option>
        </select>
      </div>

      <div class="edit-form-group">
        <label>مشاعر العميل:</label>
        <select id="edit-sentiment">
          <option value="neutral" ${msg.sentiment === 'neutral' ? 'selected' : ''}>محايد</option>
          <option value="positive" ${msg.sentiment === 'positive' ? 'selected' : ''}>إيجابي</option>
          <option value="negative" ${msg.sentiment === 'negative' ? 'selected' : ''}>سلبي</option>
        </select>
      </div>
    </div>

    <div class="edit-form-group">
      <label>التقييم الفعلي (1 - 5 نجوم):</label>
      <input type="number" id="edit-rating" min="1" max="5" value="${msg.rating || 3}">
    </div>

    <button onclick="saveEvaluation()" class="save-btn">
      <i class="fa-solid fa-floppy-disk"></i>
      <span>حفظ التقييم والتعديلات</span>
    </button>
  `;

  // جلب المحادثة بالكامل مباشرة من قاعدة البيانات لتفادي قيود التخزين المؤقت في الواجهة
  try {
    let query = supabaseClient.from('support_messages').select('*');
    if (chatId) {
      query = query.like('tg_message_id', `${chatId}:%`);
    } else {
      query = query.eq('chat_name', msg.chat_name);
    }
    
    const { data: chatMessages, error } = await query.order('sent_at', { ascending: true });
    
    if (error) throw error;
    
    const threadContainer = document.getElementById('drawer-chat-thread');
    if (!chatMessages || chatMessages.length === 0) {
      threadContainer.innerHTML = `<p style="color: var(--text-muted);">لا توجد رسائل أخرى في هذه المحادثة.</p>`;
      return;
    }
    
    // تحديث عنوان شريط المحادثة بعدد الرسائل الفعلي
    const headerTitle = document.getElementById('thread-header-title');
    if (headerTitle) {
      headerTitle.textContent = `سير المحادثة بالكامل (${chatMessages.length} رسائل):`;
    }
    
    // ملء شريط المحادثة بالفقاعات
    threadContainer.style.justifyContent = 'flex-start';
    threadContainer.style.alignItems = 'stretch';
    threadContainer.innerHTML = chatMessages.map(m => {
      const isSelected = m.id === messageId;
      const msgDate = new Date(m.sent_at).toLocaleString('ar-SA', { hour: '2-digit', minute: '2-digit' });
      
      // تحديد ما إذا كانت الرسالة من الدعم الفني
      const isSupport = (m.sender === "7668280954" || 
                         (m.message && (m.message.startsWith("🟦") || m.message.startsWith("🟩"))) ||
                         (m.sender && (m.sender.toLowerCase().includes("support") || m.sender.toLowerCase().includes("admin") || m.sender === "system")));
      
      const alignStyle = isSupport ? 'align-self: flex-end; align-items: flex-end;' : 'align-self: flex-start; align-items: flex-start;';
      const bubbleBg = isSelected 
        ? 'rgba(139, 92, 246, 0.25)' 
        : (isSupport ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255, 255, 255, 0.05)');
      const bubbleBorder = isSelected 
        ? 'rgba(139, 92, 246, 0.5)' 
        : (isSupport ? 'rgba(16, 185, 129, 0.3)' : 'rgba(255, 255, 255, 0.1)');
      
      return `
        <div class="chat-bubble-wrapper" style="display: flex; flex-direction: column; max-width: 85%; ${alignStyle}">
          <div style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 2px; direction: rtl;">
            <strong>${isSupport ? 'الدعم الفني' : (m.sender || 'عميل')}</strong> • ${msgDate}
          </div>
          <div class="chat-bubble" style="background: ${bubbleBg}; border: 1px solid ${bubbleBorder}; padding: 0.75rem 1rem; border-radius: 12px; line-height: 1.5; font-size: 0.9rem; color: var(--text-main); text-align: right; direction: rtl; white-space: pre-wrap;">
            ${m.message}
          </div>
        </div>
      `;
    }).join('');
    
    // سكرول لأسفل شريط المحادثة تلقائياً
    threadContainer.scrollTop = threadContainer.scrollHeight;
    
  } catch (err) {
    console.error("Error loading chat history:", err);
    document.getElementById('drawer-chat-thread').innerHTML = `
      <p style="color: var(--color-danger); text-align: center;"><i class="fa-solid fa-triangle-exclamation"></i> فشل تحميل المحادثة: ${err.message}</p>
    `;
  }
}

// إغلاق اللوحة الجانبية
function closeDrawer() {
  detailsDrawer.classList.remove('open');
  drawerOverlay.style.display = 'none';
  activeMessageId = null;
}

// حفظ التعديلات والتقييم في قاعدة البيانات
async function saveEvaluation() {
  if (!activeMessageId) return;

  const updatedData = {
    evaluation_summary: document.getElementById('edit-summary').value,
    category: document.getElementById('edit-category').value,
    urgency: document.getElementById('edit-urgency').value,
    status: document.getElementById('edit-status').value,
    sentiment: document.getElementById('edit-sentiment').value,
    rating: parseInt(document.getElementById('edit-rating').value) || 3
  };

  try {
    const { error } = await supabaseClient
      .from('support_messages')
      .update(updatedData)
      .eq('id', activeMessageId);

    if (error) throw error;

    closeDrawer();
    fetchData(); // تحديث فوري
    
    // عرض تنبيه نجاح صغير
    console.log('Saved successfully!');
  } catch (err) {
    console.error('Error saving data:', err);
    alert('فشل في حفظ التعديلات لقاعدة البيانات: ' + err.message);
  }
}

// دالة تحليل محادثة واحدة بالذكاء الاصطناعي
async function analyzeSingle(tgMessageId, btn) {
  if (!tgMessageId) return;
  
  // حفظ المحتوى الأصلي وتعيين حالة التحميل على الزر
  const originalHtml = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> جاري التحليل...`;
  
  try {
    const baseUrl = window.location.protocol === 'file:' ? 'http://localhost:8000' : '';
    const response = await fetch(`${baseUrl}/api/analyze-single`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ tg_message_id: tgMessageId })
    });
    
    const data = await response.json();
    if (data.success) {
      debugLog(`تم تحليل الرسالة ${tgMessageId} بنجاح.`);
      // تحديث البيانات لعرض النتيجة الفورية
      fetchData();
    } else {
      alert(`فشل التحليل: ${data.message}`);
    }
  } catch (err) {
    console.error('Single analysis error:', err);
    alert(`خطأ في الاتصال بالسيرفر: ${err.message}`);
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalHtml;
  }
}
