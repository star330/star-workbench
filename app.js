(function () {
  var STORE_KEY = "xingguang-workbench-v2";
  var QB_VERSION = "2026-07-31-v1"; /* 题库版本号，变更时自动刷新题库 */
  var HOTSPOT_VERSION = "2026-07-31-v2"; /* 时政卡片版本号，变更时自动补充热点内容 */
  var ESSAY_VERSION = "2026-07-31-v1"; /* 申论库版本号，变更时自动刷新申论解析 */
  var today = new Date().toISOString().slice(0, 10);

  var sections = ["常识", "言语", "数量", "判断", "资料", "政治理论"];
  var taxonomy = {
    "常识": ["法律常识", "行政执法常识", "科技人文", "经济管理", "广东省情", "政治常识", "地理国情"],
    "言语": ["逻辑填空-递进", "逻辑填空-转折", "逻辑填空-并列", "逻辑填空-因果", "逻辑填空-解释", "逻辑填空-虚词辨析", "片段阅读-主旨概括", "片段阅读-意图判断", "片段阅读-细节理解", "片段阅读-标题填入", "语句排序", "语句衔接"],
    "数量": ["工程问题", "行程问题", "利润问题", "排列组合", "概率问题", "几何问题", "最值问题", "容斥问题", "浓度问题", "日期年龄问题", "数列问题", "鸡兔同笼/植树问题", "统筹推断", "抽屉原理"],
    "判断": ["图形推理", "定义判断", "类比推理", "加强削弱", "逻辑判断", "翻译推理", "真假推理", "分析推理", "逻辑推理一拖五"],
    "资料": ["增长率计算", "增长率比较", "增长量计算", "增长量比较", "基期量计算", "现期量计算", "比重计算", "比重变化判断", "平均数计算", "倍数计算", "综合分析", "综合分析判断", "速算技巧应用"],
    "政治理论": ["二十大精神", "新思想", "中特思想", "马克思主义理论", "马政经", "依法治国", "基层治理", "高质量发展"]
  };

  var viewTitles = {
    "home": "【星光不负赶路人】",
    "daily": "时政精析",
    "practice": "越做越行",
    "practice-session": "本组训练",
    "essay": "申论点拨",
    "mistakes": "错题复盘",
    "knowledge": "知识导入"
  };

  var state = loadState();
  var radarChart = null;
  var deferredInstallPrompt = null;
  var currentView = "home";

  document.addEventListener("DOMContentLoaded", function () {
    bindNavigation();
    bindForms();
    bindPwa();
    fillSelects();
    ensureDailyHotspots();
    renderAll();
    registerServiceWorker();
  });

  /* ===== 数据存取 ===== */
  function defaultState() {
    return {
      lastHotspotDate: "",
      hotspots: [],
      hotspotVersion: HOTSPOT_VERSION,
      hotspotBatchIndex: 0,
      qbVersion: QB_VERSION,
      essayVersion: ESSAY_VERSION,
      questions: seedQuestions(),
      essays: seedEssays(),
      mistakes: [],
      knowledge: seedKnowledge(),
      mastery: {
        "常识": { total: 0, correct: 0 },
        "言语": { total: 0, correct: 0 },
        "数量": { total: 0, correct: 0 },
        "判断": { total: 0, correct: 0 },
        "资料": { total: 0, correct: 0 },
        "政治理论": { total: 0, correct: 0 }
      }
    };
  }

  function loadState() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (!raw) return defaultState();
      var parsed = JSON.parse(raw);
      var def = defaultState();
      /* 题库版本变更时，自动刷新题库但保留用户练习数据和错题 */
      var needRefresh = parsed.qbVersion !== QB_VERSION;
      var needHotspotRefresh = parsed.hotspotVersion !== HOTSPOT_VERSION;
      var needEssayRefresh = parsed.essayVersion !== ESSAY_VERSION;
      var savedHotspots = parsed.hotspots || [];
      if (needHotspotRefresh) {
        savedHotspots = seedHotspots(today, 0).concat(savedHotspots.filter(function (item) { return !item.auto; }));
      }
      var savedEssays = parsed.essays || [];
      if (needEssayRefresh) {
        savedEssays = def.essays.concat(savedEssays.filter(function (item) { return !item.auto; }));
      }
      return {
        lastHotspotDate: parsed.lastHotspotDate || "",
        hotspots: savedHotspots,
        hotspotVersion: HOTSPOT_VERSION,
        hotspotBatchIndex: parsed.hotspotBatchIndex || 0,
        qbVersion: QB_VERSION,
        essayVersion: ESSAY_VERSION,
        questions: needRefresh ? def.questions : ((parsed.questions && parsed.questions.length > 0) ? parsed.questions : def.questions),
        essays: (savedEssays.length > 0) ? savedEssays : def.essays,
        mistakes: parsed.mistakes || [],
        knowledge: (parsed.knowledge && parsed.knowledge.length > 0) ? parsed.knowledge : def.knowledge,
        mastery: Object.assign(def.mastery, parsed.mastery || {})
      };
    } catch (e) {
      return defaultState();
    }
  }

  function saveState() {
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
  }

  function uid(prefix) {
    return prefix + "-" + Date.now() + "-" + Math.random().toString(16).slice(2);
  }

  function escapeHtml(text) {
    return String(text || "")
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }

  /* ===== 视图导航 ===== */
  function bindNavigation() {
    document.querySelectorAll(".nav-card").forEach(function (card) {
      card.addEventListener("click", function () {
        openView(card.dataset.nav);
      });
    });

    document.getElementById("backBtn").addEventListener("click", function () {
      if (currentView === "practice-session") {
        openView("practice");
      } else {
        openView("home");
      }
    });
  }

  function openView(viewId) {
    document.querySelectorAll(".view").forEach(function (v) {
      v.classList.toggle("active", v.id === "view-" + viewId);
    });

    var title = viewTitles[viewId] || viewTitles["home"];
    document.getElementById("pageTitle").textContent = title;

    var backBtn = document.getElementById("backBtn");
    if (viewId === "home") {
      backBtn.classList.add("hidden");
    } else {
      backBtn.classList.remove("hidden");
    }

    window.scrollTo(0, 0);
    if (viewId === "home") setTimeout(renderRadar, 60);
    currentView = viewId;
  }

  /* ===== 表单绑定 ===== */
  function bindForms() {
    document.getElementById("generateDailyBtn").addEventListener("click", function () {
      state.hotspotBatchIndex = (state.hotspotBatchIndex || 0) + 1;
      state.hotspots = seedHotspots(today, state.hotspotBatchIndex).concat(state.hotspots.filter(function (item) {
        return item.date !== today || !item.auto;
      }));
      state.lastHotspotDate = today;
      saveState();
      renderAll();
    });

    document.getElementById("resetDemoBtn").addEventListener("click", function () {
      if (confirm("确认恢复初始数据？这会覆盖当前本地保存的内容。")) {
        state = defaultState();
        ensureDailyHotspots(true);
        saveState();
        renderAll();
      }
    });

    document.getElementById("hotspotForm").addEventListener("submit", function (e) {
      e.preventDefault();
      var d = formData(e.target);
      state.hotspots.unshift({
        id: uid("hot"), date: today, auto: false,
        title: d.title, source: d.source, stem: d.stem, logic: d.logic,
        detail: d.detail, vocab: splitTags(d.vocab), analysis: d.analysis, quote: d.quote, countermeasure: d.countermeasure
      });
      e.target.reset();
      saveState(); renderAll();
    });

    document.getElementById("questionForm").addEventListener("submit", function (e) {
      e.preventDefault();
      var d = formData(e.target);
      state.questions.unshift({
        id: uid("q"), section: d.section, type: d.type, source: d.source,
        stem: d.stem, options: { A: d.a, B: d.b, C: d.c, D: d.d },
        answer: d.answer, fastTip: d.fastTip, explain: d.explain
      });
      e.target.reset(); fillSelects(); saveState(); renderAll();
    });

    document.getElementById("essayForm").addEventListener("submit", function (e) {
      e.preventDefault();
      var d = formData(e.target);
      state.essays.unshift(Object.assign({ id: uid("essay"), auto: false }, d));
      e.target.reset(); saveState(); renderAll();
    });

    document.getElementById("mistakeForm").addEventListener("submit", function (e) {
      e.preventDefault();
      var d = formData(e.target);
      state.mistakes.unshift(Object.assign({ id: uid("mistake"), date: today, auto: false }, d));
      e.target.reset(); saveState(); renderAll();
    });

    document.getElementById("knowledgeForm").addEventListener("submit", async function (e) {
      e.preventDefault();
      var form = e.target;
      var d = formData(form);
      var file = document.getElementById("knowledgeFile").files[0];
      var submitBtn = form.querySelector("button[type='submit']");
      var oldText = submitBtn ? submitBtn.textContent : "";

      function addKnowledge(fileText) {
        state.knowledge.unshift({
          id: uid("know"), date: today, title: d.title, section: d.section,
          fileName: file ? file.name : "",
          summary: [d.summary, fileText].filter(Boolean).join("\n\n")
        });
        form.reset(); saveState(); renderAll();
      }

      function isTextLike(fileName) {
        return /\.(txt|md|json|csv)$/i.test(fileName || "");
      }

      function isPdf(fileName) {
        return /\.pdf$/i.test(fileName || "");
      }

      try {
        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.textContent = file && isPdf(file.name) ? "正在解析PDF..." : "正在导入...";
        }

        if (file && isTextLike(file.name)) {
          var text = await readFileAsText(file);
          addKnowledge(String(text || "").slice(0, 12000));
        } else if (file && isPdf(file.name)) {
          var pdfText = await extractPdfText(file);
          addKnowledge(pdfText);
        } else if (file) {
          addKnowledge("【附件资料索引】已选择文件：" + file.name + "。当前版本暂不解析该格式正文，已保存文件名和你填写的摘要。");
        } else {
          addKnowledge("");
        }
      } catch (err) {
        addKnowledge("【PDF解析提示】文件已记录，但正文解析失败。可能原因：扫描版PDF没有文字层、文件过大、浏览器限制，或PDF加密。建议在摘要里补充关键页码和重点内容。\n错误信息：" + (err && err.message ? err.message : String(err)));
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = oldText;
        }
      }
    });

    document.getElementById("startPracticeBtn").addEventListener("click", startPractice);
    document.getElementById("practiceSectionFilter").addEventListener("change", updateTypeFilter);
  }

  /* ===== PWA ===== */
  function bindPwa() {
    window.addEventListener("beforeinstallprompt", function (e) {
      e.preventDefault();
      deferredInstallPrompt = e;
      document.getElementById("installBtn").classList.remove("hidden");
    });

    document.getElementById("installBtn").addEventListener("click", function () {
      if (!deferredInstallPrompt) return;
      deferredInstallPrompt.prompt();
      deferredInstallPrompt.userChoice.finally(function () {
        deferredInstallPrompt = null;
        document.getElementById("installBtn").classList.add("hidden");
      });
    });
  }

  function registerServiceWorker() {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("sw.js").catch(function () {});
    }
  }

  /* ===== 选择器填充 ===== */
  function fillSelects() {
    fillSectionSelect("questionSection");
    fillSectionSelect("mistakeSection");
    fillSectionSelect("knowledgeSection");
    fillSectionSelect("practiceSectionFilter", "全部板块");
    updateTypeFilter();
  }

  function fillSectionSelect(id, allLabel) {
    var sel = document.getElementById(id);
    if (!sel) return;
    sel.innerHTML = "";
    if (allLabel) {
      var all = document.createElement("option");
      all.value = ""; all.textContent = allLabel;
      sel.appendChild(all);
    }
    sections.forEach(function (s) {
      var opt = document.createElement("option");
      opt.value = s; opt.textContent = s;
      sel.appendChild(opt);
    });
  }

  function updateTypeFilter() {
    var section = document.getElementById("practiceSectionFilter").value;
    var sel = document.getElementById("practiceTypeFilter");
    var types = unique(state.questions
      .filter(function (q) { return !section || q.section === section; })
      .map(function (q) { return q.type; }));
    sel.innerHTML = '<option value="">全部题型</option>' + types.map(function (t) {
      return '<option value="' + escapeHtml(t) + '">' + escapeHtml(t) + '</option>';
    }).join("");
  }

  /* ===== 工具函数 ===== */
  function formData(form) {
    var d = {};
    new FormData(form).forEach(function (v, k) { d[k] = String(v).trim(); });
    return d;
  }

  function splitTags(v) {
    return String(v || "").split(/[，,、\s]+/).map(function (s) { return s.trim(); }).filter(Boolean);
  }

  function unique(arr) { return Array.from(new Set(arr.filter(Boolean))); }

  function readFileAsText(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(reader.result || ""); };
      reader.onerror = function () { reject(reader.error || new Error("文件读取失败")); };
      reader.readAsText(file, "utf-8");
    });
  }

  function readFileAsArrayBuffer(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(reader.result); };
      reader.onerror = function () { reject(reader.error || new Error("文件读取失败")); };
      reader.readAsArrayBuffer(file);
    });
  }

  async function extractPdfText(file) {
    if (!window.pdfjsLib) {
      throw new Error("PDF解析库未加载，请确认 _shared/js/pdf.min.js 已上传。");
    }
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = "./_shared/js/pdf.worker.min.js";

    var buffer = await readFileAsArrayBuffer(file);
    var pdf = await window.pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
    var maxPages = Math.min(pdf.numPages, 80);
    var chunks = [];

    for (var pageNum = 1; pageNum <= maxPages; pageNum++) {
      var page = await pdf.getPage(pageNum);
      var content = await page.getTextContent();
      var pageText = content.items.map(function (item) { return item.str || ""; }).join(" ").replace(/\s+/g, " ").trim();
      if (pageText) chunks.push("【第" + pageNum + "页】" + pageText);
      if (chunks.join("\n\n").length > 30000) break;
    }

    var text = chunks.join("\n\n").slice(0, 30000);
    if (!text) {
      return "【PDF解析结果】已读取文件：" + file.name + "，但没有提取到可复制文字。它可能是扫描版PDF或图片型PDF，建议在摘要里手动写重点页码和内容。";
    }
    return "【PDF解析结果】文件：" + file.name + "；页数：" + pdf.numPages + "页；已提取前" + maxPages + "页可复制文字（最多保留约3万字）。\n\n" + text;
  }

  function ensureDailyHotspots(force) {
    if (force || state.lastHotspotDate !== today || state.hotspots.length === 0) {
      state.hotspots = seedHotspots(today).concat(state.hotspots.filter(function (item) {
        return item.date !== today || !item.auto;
      }));
      state.lastHotspotDate = today;
      saveState();
    }
  }

  /* ===== 渲染 ===== */
  function renderAll() {
    renderBadges();
    renderHotspots();
    renderTaxonomy();
    renderQuestionBank();
    renderEssays();
    renderMistakes();
    renderKnowledge();
    renderTips();
    renderRadar();
    updateTypeFilter();
  }

  function renderBadges() {
    document.getElementById("badgeHotspots").textContent = state.hotspots.length;
    document.getElementById("badgeQuestions").textContent = state.questions.length;
    document.getElementById("badgeEssays").textContent = state.essays.length;
    document.getElementById("badgeMistakes").textContent = state.mistakes.length;
    document.getElementById("badgeKnowledge").textContent = state.knowledge.length;
    var qc = document.getElementById("questionCount");
    if (qc) qc.textContent = state.questions.length;
  }

  function renderHotspots() {
    var box = document.getElementById("hotspotList");
    box.innerHTML = state.hotspots.map(function (item) {
      var detail = item.detail || "这条热点需要补充具体内容。你可以点击下方“手动新增热点精析”，把新闻背景、核心事实和政策意义补充进来。";
      return '<article class="content-card">' +
        '<header><div><h3>' + escapeHtml(item.title) + '</h3><span class="meta">' + escapeHtml(item.date) + ' · ' + escapeHtml(item.source || "") + '</span></div>' +
        '<button class="danger-btn" data-delete="hotspots" data-id="' + item.id + '" type="button">删除</button></header>' +
        '<div class="tag-row"><span class="tag">' + escapeHtml(item.logic || "") + '</span>' + (item.auto ? '<span class="tag">今日推送</span>' : '') + renderTags(item.vocab) + '</div>' +
        '<div class="hotspot-detail"><strong>热点具体内容</strong><p>' + escapeHtml(detail) + '</p></div>' +
        '<div class="analysis-grid">' +
        '<div class="analysis-box"><strong>逻辑填空题干出处</strong><p>' + escapeHtml(item.stem || "") + '</p></div>' +
        '<div class="analysis-box"><strong>逻辑考点分析</strong><p>' + escapeHtml(item.analysis || "") + '</p></div>' +
        '<div class="analysis-box"><strong>申论金句</strong><p>' + escapeHtml(item.quote || "") + '</p></div>' +
        '<div class="analysis-box"><strong>对策建议</strong><p>' + escapeHtml(item.countermeasure || "") + '</p></div>' +
        '</div></article>';
    }).join("");
    bindDeleteButtons();
  }

  function renderTags(tags) {
    return (tags || []).map(function (t) { return '<span class="tag">' + escapeHtml(t) + '</span>'; }).join("");
  }

  function renderTaxonomy() {
    var box = document.getElementById("taxonomyGrid");
    box.innerHTML = sections.map(function (s) {
      var m = getMastery(s);
      return '<article class="taxonomy-item"><h4>' + s + '</h4>' +
        '<p class="meta">掌握度：' + m.percent + '% <span class="stars">' + m.stars + '</span>（' + m.correct + '/' + m.total + '）</p>' +
        '<div class="tag-row">' + taxonomy[s].map(function (t) { return '<span class="tag">' + t + '</span>'; }).join("") + '</div></article>';
    }).join("");
  }

  function renderQuestionBank() {
    var box = document.getElementById("questionBank");
    if (!box) return;
    box.innerHTML = state.questions.map(function (q) {
      return '<article class="content-card">' +
        '<header><div><h3>' + escapeHtml(q.section) + ' · ' + escapeHtml(q.type) + '</h3><span class="meta">' + escapeHtml(q.source || "") + '</span></div>' +
        '<button class="danger-btn" data-delete="questions" data-id="' + q.id + '" type="button">删除</button></header>' +
        '<p>' + escapeHtml(q.stem) + '</p>' +
        '<div class="tag-row"><span class="tag">答案：' + escapeHtml(q.answer) + '</span></div>' +
        '<div class="analysis-box"><strong>考场提示</strong><p>' + escapeHtml(q.fastTip || "") + '</p></div>' +
        '<div class="analysis-box"><strong>解析</strong><p>' + escapeHtml(q.explain || "") + '</p></div>' +
        '</article>';
    }).join("");
    bindDeleteButtons();
  }

  function renderEssays() {
    var box = document.getElementById("essayList");
    box.innerHTML = state.essays.map(function (item) {
      return '<article class="content-card essay-card">' +
        '<header><div><h3>' + escapeHtml(item.type) + ' \u00b7 ' + escapeHtml(item.source || "") + '</h3></div>' +
        '<button class="danger-btn" data-delete="essays" data-id="' + item.id + '" type="button">删除</button></header>' +
        '<div class="essay-prompt-box"><span class="essay-label">题干要求</span><p>' + escapeHtml(item.prompt || "") + '</p></div>' +
        (item.material ? '<div class="essay-material-box"><span class="essay-label">原文材料</span><div class="essay-material-text">' + escapeHtml(item.material) + '</div></div>' : '') +
        '<div class="essay-answer-flow">' +
        '<div class="essay-step"><span class="essay-step-num">1</span><strong>材料定位</strong><p>' + escapeHtml(item.paragraph || "") + '</p></div>' +
        '<div class="essay-step"><span class="essay-step-num">2</span><strong>关键句</strong><p>' + escapeHtml(item.sentence || "") + '</p></div>' +
        '<div class="essay-step"><span class="essay-step-num">3</span><strong>关键词</strong><p>' + escapeHtml(item.keyword || "") + '</p></div>' +
        '<div class="essay-step"><span class="essay-step-num">4</span><strong>入选原因</strong><p>' + escapeHtml(item.reason || "") + '</p></div>' +
        '</div>' +
        '<div class="essay-answer-box"><span class="essay-label essay-label-answer">规范答案</span><p>' + escapeHtml(item.answer || "") + '</p></div>' +
        '</article>';
    }).join("");
    bindDeleteButtons();
  }

  function renderMistakes() {
    var box = document.getElementById("mistakeList");
    box.innerHTML = state.mistakes.map(function (item) {
      return '<article class="content-card">' +
        '<header><div><h3>' + escapeHtml(item.section) + ' · ' + escapeHtml(item.type || "未分类") + '</h3><span class="meta">' + escapeHtml(item.date || today) + ' · 错因：' + escapeHtml(item.reason || "") + '</span></div>' +
        '<button class="danger-btn" data-delete="mistakes" data-id="' + item.id + '" type="button">删除</button></header>' +
        '<p>' + escapeHtml(item.stem || "") + '</p>' +
        '<div class="analysis-grid">' +
        '<div class="analysis-box"><strong>下次避坑点</strong><p>' + escapeHtml(item.pitfall || "") + '</p></div>' +
        '<div class="analysis-box"><strong>正确解题路径</strong><p>' + escapeHtml(item.correctPath || "") + '</p></div>' +
        '</div></article>';
    }).join("");
    bindDeleteButtons();
  }

  function renderKnowledge() {
    var box = document.getElementById("knowledgeList");
    box.innerHTML = state.knowledge.map(function (item) {
      return '<article class="content-card">' +
        '<header><div><h3>' + escapeHtml(item.title) + '</h3><span class="meta">' + escapeHtml(item.section) + ' · ' + escapeHtml(item.fileName || "手动录入") + '</span></div>' +
        '<button class="danger-btn" data-delete="knowledge" data-id="' + item.id + '" type="button">删除</button></header>' +
        '<p>' + escapeHtml(item.summary || "") + '</p>' +
        '<div class="analysis-box"><strong>趋势预测提示</strong><p>结合近三到五年趋势，重点检查：是否从单一公式转向综合判断、是否从记忆考点转向情境应用、是否出现行政执法或基层治理场景化表达。</p></div>' +
        '</article>';
    }).join("");
    bindDeleteButtons();
  }

  function renderTips() {
    var weak = sections.map(function (s) {
      return { section: s, mastery: getMastery(s).percent };
    }).sort(function (a, b) { return a.mastery - b.mastery; }).slice(0, 3);

    var tips = weak.map(function (w) {
      return w.section + "掌握度 " + w.mastery + "%，建议优先做5题一组限时训练，错题补避坑点。";
    });
    if (state.mistakes.length > 0) {
      tips.push("错题已有" + state.mistakes.length + "条，建议每晚只看同一错因的3条。");
    }
    tips.push("时政热点每天更新，建议每天至少精读一条并背诵金句。");
    document.getElementById("reviewTips").innerHTML = tips.map(function (t) {
      return "<li>" + escapeHtml(t) + "</li>";
    }).join("");
  }

  function renderRadar() {
    var el = document.getElementById("radarChart");
    if (!el || typeof echarts === "undefined") return;
    if (!radarChart) radarChart = echarts.init(el, null, { renderer: "svg" });

    var st = getComputedStyle(document.documentElement);
    var accent = st.getPropertyValue("--accent").trim();
    var accent2 = st.getPropertyValue("--accent2").trim();
    var muted = st.getPropertyValue("--muted").trim();

    radarChart.setOption({
      animation: false,
      tooltip: { appendToBody: true },
      radar: {
        radius: "62%",
        indicator: sections.map(function (s) { return { name: s, max: 100 }; }),
        axisName: { color: muted, fontSize: 12, fontWeight: 700 },
        splitLine: { lineStyle: { color: "rgba(37,99,235,0.15)" } },
        splitArea: { areaStyle: { color: ["rgba(37,99,235,0.03)", "rgba(56,189,248,0.05)"] } },
        axisLine: { lineStyle: { color: "rgba(37,99,235,0.15)" } }
      },
      series: [{
        type: "radar",
        data: [{
          value: sections.map(function (s) { return getMastery(s).percent; }),
          areaStyle: { color: "rgba(37,99,235,0.18)" },
          lineStyle: { color: accent, width: 3 },
          itemStyle: { color: accent2 }
        }],
        label: { show: true, fontSize: 11, formatter: "{c}%" }
      }]
    });
    window.addEventListener("resize", function () { if (radarChart) radarChart.resize(); }, { once: true });
  }

  function getMastery(section) {
    var m = state.mastery[section] || { total: 0, correct: 0 };
    var pct = m.total ? Math.round((m.correct / m.total) * 100) : 20;
    var stars = Math.max(1, Math.min(5, Math.ceil(pct / 20)));
    return {
      percent: pct, correct: m.correct, total: m.total,
      stars: "★".repeat(stars) + "☆".repeat(5 - stars)
    };
  }

  function bindDeleteButtons() {
    document.querySelectorAll("[data-delete]").forEach(function (btn) {
      btn.onclick = function () {
        var key = btn.dataset.delete;
        var id = btn.dataset.id;
        state[key] = state[key].filter(function (item) { return item.id !== id; });
        saveState(); renderAll();
      };
    });
  }

  /* ===== 训练 ===== */
  function startPractice() {
    var section = document.getElementById("practiceSectionFilter").value;
    var type = document.getElementById("practiceTypeFilter").value;
    var pool = state.questions.filter(function (q) {
      return (!section || q.section === section) && (!type || q.type === type);
    });
    var selected = shuffle(pool).slice(0, 5);
    var box = document.getElementById("practiceBox");
    var sessionBox = document.getElementById("practiceSessionBox");

    if (selected.length === 0) {
      box.innerHTML = '<div class="result-box"><p>当前筛选条件下暂无题目，请切换板块或题型。</p></div>';
      return;
    }

    box.innerHTML = "";
    sessionBox.innerHTML = '<form id="practiceForm" class="form-card practice-session-card"><h3>本组训练：' + selected.length + '题</h3>' +
      selected.map(function (q, i) {
        return '<article class="question-card">' +
          '<p><strong>第' + (i + 1) + "题｜" + escapeHtml(q.section) + " · " + escapeHtml(q.type) + "</strong></p>" +
          "<p>" + escapeHtml(q.stem) + "</p>" +
          '<div class="option-list">' + ["A", "B", "C", "D"].map(function (L) {
            return '<label><input type="radio" name="' + q.id + '" value="' + L + '" required /> ' + L + ". " + escapeHtml(q.options[L]) + "</label>";
          }).join("") + "</div></article>";
      }).join("") +
      '<button class="primary-btn full" type="submit">提交答案并查看解析</button></form>';

    document.getElementById("practiceForm").addEventListener("submit", function (e) {
      e.preventDefault();
      submitPractice(selected, new FormData(e.target));
    });
    openView("practice-session");
  }

  function submitPractice(questions, answers) {
    var html = [];
    var correctCount = 0;

    questions.forEach(function (q, i) {
      var ua = answers.get(q.id);
      var correct = ua === q.answer;
      if (correct) correctCount++;
      if (!state.mastery[q.section]) state.mastery[q.section] = { total: 0, correct: 0 };
      state.mastery[q.section].total++;
      if (correct) state.mastery[q.section].correct++;

      if (!correct) {
        state.mistakes.unshift({
          id: uid("mistake"), date: today, auto: true,
          section: q.section, type: q.type, stem: q.stem,
          reason: inferReason(q.section, q.type),
          pitfall: "下次先识别题型限定与核心提示，不要被相似选项或无关数字带偏。",
          correctPath: q.fastTip + "；再按解析完成推导。"
        });
      }

      html.push('<article class="question-card">' +
        "<p><strong>第" + (i + 1) + "题：" + (correct ? "✅ 答对" : "❌ 答错") + "</strong></p>" +
        '<div class="tag-row"><span class="tag">你的答案：' + escapeHtml(ua) + "</span><span class=\"tag\">正确答案：" + escapeHtml(q.answer) + "</span></div>" +
        '<div class="result-box"><strong>考场提示</strong><p>' + escapeHtml(q.fastTip) + "</p>" +
        "<strong>解析</strong><p>" + escapeHtml(q.explain) + "</p></div></article>");
    });

    saveState();
    document.getElementById("practiceSessionBox").innerHTML = '<div class="form-card practice-session-card"><h3>本组得分：' + correctCount + "/" + questions.length + "</h3>" + html.join("") + "</div>";
    renderBadges();
    renderMistakes();
    renderTaxonomy();
    renderTips();
    renderRadar();
  }

  function inferReason(section, type) {
    if (section === "资料") return "计算慢";
    if (section === "言语") return "语义关系误判";
    if (type && type.indexOf("定义") >= 0) return "概念混淆";
    return "审题遗漏";
  }

  function shuffle(arr) { return arr.slice().sort(function () { return Math.random() - 0.5; }); }

  /* ===== 预填充数据 ===== */

  function seedHotspots(date, batchIndex) {
    var pool = hotspotPool();
    var start = ((batchIndex || 0) * 3) % pool.length;
    return [0, 1, 2].map(function (offset) {
      var item = pool[(start + offset) % pool.length];
      return Object.assign({ id: uid("hot"), date: date, auto: true }, item);
    });
  }

  function hotspotPool() {
    return [
      {
        title: "促进团结奋斗 汇聚磅礴力量——侨务工作的战略意义",
        source: "人民日报评论员文章（模拟整理）",
        detail: "这条热点围绕新时代侨务工作展开，核心是把海外侨胞和归侨侨眷团结起来，服务强国建设、民族复兴大局。材料强调侨务工作不是临时性事务，而是党和国家一项长期性、战略性工作，既关系凝聚侨心侨力，也关系对外交流、民间交往和中国故事传播。",
        stem: "侨务工作是党和国家的一项长期性战略性工作。越是朝着强国建设、民族复兴的目标砥砺前行，越要把广大海外侨胞和归侨侨眷紧密团结起来、力量____起来。",
        logic: "递进",
        vocab: ["凝聚侨心", "磅礴力量", "团结奋斗", "血脉相连", "长期性战略性"],
        analysis: "“越是……越要……”构成递进关系，前后语义同向加重。空处需填入与“团结”语义一致、且能搭配“力量”的动词。“汇聚”比“集中”更强调由散到合的过程，比“聚集”更书面化，符合政论语体。",
        quote: "潮起海天阔，同心向复兴。更好凝聚侨心侨力，定能为强国建设、民族复兴伟业汇聚磅礴力量。",
        countermeasure: "坚持为大局服务和为侨服务相统一；完善侨务政策法规，维护侨益；发挥侨胞在国际交流、经贸合作、文化传播中的桥梁作用。"
      },
      {
        title: "莫把群众求助当作负面舆情——基层治理的回应能力",
        source: "人民日报评论（模拟整理）",
        detail: "这条热点由农产品滞销、群众求助被简单压制等基层治理案例引出。核心问题不是单个事件，而是部分基层工作人员把群众正常诉求误当成“负面舆情”，选择堵嘴而不是解决问题。它反映出基层治理中仍存在怕担责、怕麻烦、重形式轻服务的问题。",
        stem: "面对瓜农的求助信息，村工作人员的第一反应不是下地看烂了多少，不是联系商超找买家，____要求村民“撤回求助信”。不解忧，先堵嘴。不帮忙，反添乱。",
        logic: "转折",
        vocab: ["滞销", "舆情", "懒政", "制度托底", "产销对接"],
        analysis: "“不是……不是……____”构成反向并列后转折，前两个“不是”排除正常做法，空处应填入与预期相反的动作。“而是”最契合：本该帮忙却选择堵嘴，形成强烈转折。",
        quote: "把群众求助当“负面舆情”，本质上是懒政。真正把群众诉求落到实处，才能让问题变得不再是问题。",
        countermeasure: "畅通群众诉求表达渠道；建立农产品产销预警和对接机制；把求助信息视为治理信号，形成快速响应、协同处置、结果反馈闭环。"
      },
      {
        title: "把善心变成善治——余量食物公益项目的制度启示",
        source: "人民日报纵论（模拟整理）",
        detail: "这条热点关注余量食物捐赠、公益盲盒、智能柜领取等城市公益实践。它的重点不是单纯表扬好人好事，而是说明善意要可持续，必须依靠制度设计、数字化流程和监管机制。公益项目既要让捐赠者愿意持续参与，也要让受助者体面领取、安心使用。",
        stem: "政企合作有针对性地弥补了短板，把善心变成善治，让善意拥有更长久的生命力。制度设计让捐助者能够“持续捐赠”，“盲盒+小程序”____让受助者“体面领取”。",
        logic: "并列",
        vocab: ["善治", "余量食物", "政企合作", "体面领取", "制度设计"],
        analysis: "“让捐助者……”“____让受助者……”构成并列结构，前后主语不同但句式对称。空处需填入连接手段，“则”表示并列中的对比关系，比“就”更正式。",
        quote: "慈善的细节里，藏着一座城市的细致与温度；善治的制度里，蕴含着公共服务的智慧与担当。",
        countermeasure: "推动政企合作弥补公共服务短板；打通资格核验、取餐、溯源全流程；注重尊严保护；建立余量食物捐赠制度化通道。"
      },
      {
        title: "整治形式主义为基层减负——让干部把时间用在办实事上",
        source: "新华社评论（模拟整理）",
        detail: "这条热点聚焦基层减负，针对文山会海、过度留痕、层层加码考核等问题。核心是把基层干部从不必要的事务性负担中解放出来，让更多时间和精力回到走访群众、解决问题、推动落实上。它常与正确政绩观、基层治理能力现代化一起考。",
        stem: "基层减负不是降低工作标准，____把干部从无效事务中解放出来，让他们把更多精力用在服务群众、解决问题上。",
        logic: "转折",
        vocab: ["基层减负", "形式主义", "正确政绩观", "服务群众", "治理效能"],
        analysis: "前文先否定误解“不是降低标准”，后文给出真正含义，应填“而是”。这是典型“不是……而是……”纠偏结构。",
        quote: "减负不是减责任，而是减掉形式主义的束缚；松绑不是松劲，而是让基层干部轻装上阵、实干担当。",
        countermeasure: "精简会议文件和报表台账；规范督查考核；建立基层事项准入机制；用群众满意度和问题解决率检验工作成效。"
      },
      {
        title: "推进人工智能治理——在创新发展与安全底线之间求平衡",
        source: "时政综合材料（模拟整理）",
        detail: "这条热点围绕人工智能发展与治理展开。生成式人工智能、算法推荐、深度合成等技术快速发展，既能提高生产效率，也可能带来隐私泄露、信息茧房、虚假内容、算法歧视等风险。治理重点是促进创新和守住底线并重。",
        stem: "人工智能治理既不能因风险而裹足不前，____不能因追求速度而放松安全底线。",
        logic: "并列",
        vocab: ["人工智能治理", "算法安全", "包容审慎", "安全底线", "创新发展"],
        analysis: "“既不能……____不能……”是并列否定结构，空处应填“也”。两方面共同构成治理边界：既不因噎废食，也不放任风险。",
        quote: "技术越是向前发展，治理越要同步跟进；唯有让创新有边界、风险有约束，数字文明才能行稳致远。",
        countermeasure: "完善算法备案和安全评估；加强个人信息保护；建立生成内容标识制度；推动监管沙盒和包容审慎监管。"
      },
      {
        title: "发展新质生产力——从要素驱动转向创新驱动",
        source: "经济时政材料（模拟整理）",
        detail: "这条热点围绕新质生产力展开，重点是以科技创新推动产业创新，改造提升传统产业，培育壮大新兴产业和未来产业。它不是简单追求规模扩张，而是强调技术突破、产业升级、绿色转型和高质量发展。",
        stem: "发展新质生产力，关键不在于简单扩大投入，____在于以科技创新推动产业创新、塑造发展新动能。",
        logic: "转折",
        vocab: ["新质生产力", "科技创新", "产业升级", "高质量发展", "新动能"],
        analysis: "“不在于……____在于……”是典型否定纠正结构，空处用“而”或“而是”最合适，突出发展方式从量的扩张转向质的提升。",
        quote: "抓住科技创新这个核心变量，才能激活高质量发展的最大增量。",
        countermeasure: "强化关键核心技术攻关；推动产学研深度融合；加快传统产业数字化绿色化改造；优化创新人才和资本支持机制。"
      },
      {
        title: "城市更新重在以人为本——让老城区既有颜值也有温度",
        source: "城市治理材料（模拟整理）",
        detail: "这条热点关注老旧小区改造、城市更新、适老化设施、公共空间优化等内容。城市更新不是大拆大建，而是在尊重历史文脉、回应居民需求的基础上补齐设施短板，让城市更安全、更便利、更宜居。",
        stem: "城市更新不能只追求外观“焕新”，____要补齐公共服务短板、改善居民真实生活体验。",
        logic: "递进",
        vocab: ["城市更新", "以人为本", "适老化改造", "公共服务", "宜居城市"],
        analysis: "“不能只……____要……”强调由表层外观到深层治理的递进，空处宜填“更”。重点在“更要”之后。",
        quote: "城市更新的尺度，最终要落在人的感受上；街巷有烟火气，治理才有生命力。",
        countermeasure: "坚持微改造、渐进式更新；完善停车、养老、托育、无障碍设施；保护历史风貌；建立居民参与和反馈机制。"
      },
      {
        title: "守护粮食安全——把饭碗牢牢端在自己手中",
        source: "三农时政材料（模拟整理）",
        detail: "这条热点聚焦粮食安全和耕地保护。面对外部环境变化、极端天气和资源约束，粮食安全既要保数量，也要保质量、保产能。重点包括耕地红线、高标准农田、种业振兴、农业科技和农民种粮收益。",
        stem: "保障粮食安全，既要守住耕地红线，____要依靠科技提升单产和综合生产能力。",
        logic: "并列",
        vocab: ["粮食安全", "耕地红线", "种业振兴", "高标准农田", "农业科技"],
        analysis: "“既要……____要……”是并列结构，空处填“也”。耕地保护和科技增产是粮食安全的两个支撑点。",
        quote: "手中有粮，心中不慌；把饭碗牢牢端在自己手中，是应对风险挑战的底气所在。",
        countermeasure: "严守耕地保护红线；建设高标准农田；推进种业振兴；完善种粮补贴和价格支持；提升农业防灾减灾能力。"
      },
      {
        title: "基层执法既要有力度也要有温度——严格规范公正文明执法",
        source: "行政执法时政材料（模拟整理）",
        detail: "这条热点围绕行政执法方式转变展开，强调执法不能只看处罚结果，还要看程序是否规范、裁量是否合理、说理是否充分。尤其在市场监管、城管执法、生态环保等领域，要在维护法治权威的同时体现教育引导和服务意识。",
        stem: "行政执法既要维护法律权威，____要注重释法说理，让群众在执法过程中感受到公平正义。",
        logic: "并列",
        vocab: ["行政执法", "释法说理", "柔性执法", "裁量基准", "公平正义"],
        analysis: "“既要……____要……”是并列结构，空处填“也”。力度和温度不是对立关系，而是严格规范公正文明执法的两个侧面。",
        quote: "有力度的执法维护法治权威，有温度的执法赢得群众认同；二者统一，才能提升执法公信力。",
        countermeasure: "完善行政裁量基准；推行全过程释法说理；落实首违不罚和轻微免罚清单；加强执法监督和案卷评查。"
      }
    ];
  }

  function q(section, type, source, stem, options, answer, fastTip, explain) {
    return {
      id: uid("q"), section: section, type: type, source: source, stem: stem,
      options: { A: options[0], B: options[1], C: options[2], D: options[3] },
      answer: answer, fastTip: fastTip, explain: explain
    };
  }

  function seedQuestions() {
    /* 合并所有题库分卷文件（question-bank-1.js ~ question-bank-7.js）
       每个文件挂载到 window.QUESTION_BANK_PARTn 数组上 */
    var parts = [];
    for (var i = 1; i <= 7; i++) {
      var bank = window["QUESTION_BANK_PART" + i];
      if (Array.isArray(bank)) {
        bank.forEach(function (item) {
          parts.push({
            id: uid("q"),
            section: item.section,
            type: item.type,
            source: item.source,
            stem: item.stem,
            options: { A: item.options.A, B: item.options.B, C: item.options.C, D: item.options.D },
            answer: item.answer,
            fastTip: item.fastTip,
            explain: item.explain
          });
        });
      }
    }
    return parts;
  }

  function seedEssays() {
    return [
      {
        id: uid("essay"), auto: true,
        type: "归纳概括",
        source: "模拟题（参照2023国考行政执法卷风格）",
        material: "【材料一】\n近年来，随着“放管服”改革深入推进，基层执法服务水平有了明显提升，但群众办事仍面临不少堵点。某市市民王先生反映，他到区政务服务中心办理餐饮店营业执照时，被告知需要先到市场监管所预审，再到城管部门办理门头招牌审批，最后回到政务中心提交材料。“一个证跑了三个地方，同样的身份证复印件交了三份。”王先生无奈地说。\n\n记者走访发现，类似情况并非个例。不少群众反映，窗口服务存在“多头跑”现象，同一事项需要在不同部门之间来回奔波。部分事项要求重复提交材料，身份证、房产证等证件反复复印。此外，办理进度不够透明，群众提交材料后往往只能被动等待，无法实时查询审批进展。有的事项涉及跨部门核验，但由于系统尚未打通，信息只能在部门之间线下流转，进一步拖延了办理时间。\n\n某区政务服务局工作人员坦言：“我们也想让群众少跑路，但有些事项确实需要多部门协同，目前系统对接还不完善，数据共享存在壁垒，短期内很难完全解决。”",
        prompt: "根据给定资料，概括当前基层执法服务中存在的主要问题。（15分）\n要求：概括准确，条理清楚，语言精练，字数不超过200字。",
        paragraph: "材料一第2段",
        sentence: "群众反映窗口多头跑、材料重复交、办理进度不透明，部分事项需跨部门核验但系统尚未打通。",
        keyword: "多头跑、重复交、不透明、系统未打通",
        reason: "题干要求概括“问题”，定位到材料一第2段。该段密集列举了四类问题表现：“多头跑”对应流程不集成；“重复提交材料”对应负担加重；“办理进度不够透明”对应信息公开不足；“系统尚未打通”对应跨部门协同障碍。每个词都是独立的问题维度，是归纳概括题的直接得分点。",
        answer: "1.办事流程不够集成，群众需多头跑动，跨部门来回奔波；2.材料重复提交，身份证等证件反复复印，增加群众负担；3.办理进度公开不足，信息不透明，群众无法实时查询；4.跨部门核验机制不健全，系统未完全打通，数据共享存在壁垒。"
      },
      {
        id: uid("essay"), auto: true,
        type: "提出对策",
        source: "模拟题（参照2023国考行政执法卷风格）",
        material: "【材料二】\n在基层执法服务中，队伍建设是关键一环。据了解，部分基层执法人员服务意识不足，存在“重处罚、轻教育”的倾向。在一次执法检查中，某商户因招牌设置不规范被直接处以罚款，执法人员未事先告知整改期限，也未提供指导服务。商户反映：“罚单开得快，但怎么改没人说。”\n\n与此同时，数字化平台建设相对滞后。某区虽然建立了网上办事大厅，但功能有限，很多事项仍需线下办理。不同部门之间的数据共享机制不健全，“信息孤岛”现象依然存在。一位基层干部表示：“我们也有数字化的意愿，但资金和技术人才不足，系统升级进展缓慢。”\n\n今年初，国务院印发文件，要求各地深化“放管服”改革，推行包容审慎监管，建立免罚清单制度，对首次轻微违法行为以教育为主。同时要求加快政务服务数字化转型，推进“一网通办”，实现跨部门数据共享和业务协同。",
        prompt: "针对资料中反映的基层执法服务问题，提出改进建议。（20分）\n要求：建议具体可行，有针对性，条理清楚，字数不超过300字。",
        paragraph: "材料二第1段、第2段、第3段",
        sentence: "部分基层执法人员服务意识不足，存在重处罚轻教育现象；数字化平台建设滞后，数据共享不畅；国务院要求推行包容审慎监管和一网通办。",
        keyword: "服务意识不足、重处罚轻教育、数字化滞后、数据共享不畅、包容审慎监管、一网通办",
        reason: "提出对策题的得分逻辑是“问题反推对策”。第1段问题“服务意识不足、重处罚轻教育”→对策“加强培训+推行柔性执法”；第2段问题“数字化滞后、数据共享不畅”→对策“加快平台建设+打破信息壁垒”；第3段政策信号“包容审慎监管、一网通办”→直接转化为对策方向。每个对策都要有明确的对应问题来源。",
        answer: "1.加强执法队伍服务意识培训，定期开展执法为民理念教育和业务能力培训，树立服务型执法理念；2.推行包容审慎监管和柔性执法，落实首违不罚制度，建立免罚清单，对首次轻微违法以教育提醒为主；3.加快数字化平台建设，完善网上办事大厅功能，推进更多事项线上办理，实现“一网通办”；4.建立跨部门数据共享机制，打破信息孤岛，打通部门间系统壁垒，实现数据协同流转。"
      },
      {
        id: uid("essay"), auto: true,
        type: "综合分析",
        source: "模拟题（参照2023国考行政执法卷风格）",
        material: "【材料三】\n2024年，某市城管执法支队在查处一起占道经营案件时，既坚持了执法的“力度”，又展现了执法的“温度”。当事人李阿姨是一位下岗职工，在小区门口摆摊卖水果维持生计。执法队员发现后，没有简单处罚了事，而是耐心向她讲解了城市管理规定，帮助她申请了附近的便民摊位。李阿姨感动地说：“本以为要被罚款，没想到执法人员还帮我找了正规摊位。”\n\n该支队负责人表示：“执法既要有力度，也要有温度。力度体现在严格依法办事，对违法行为不能视而不见；温度体现在人性化执法，要考虑群众的实际困难。我们建立了裁量基准制度，对首次轻微违法以教育提醒为主，对屡教不改的才依法处罚。同时推行执法全过程说理，让当事人明白为什么罚、罚多少、怎么改。”\n\n专家指出，执法的力度和温度并不矛盾。力度是基础，维护法律权威和社会秩序；温度是升华，体现执法为民的本质。只有把程序规范、裁量基准和释法说理贯穿执法全过程，才能让群众在每一起执法案件中感受到公平正义。",
        prompt: "请结合给定资料，分析“执法既要有力度，也要有温度”这句话的内涵。（15分）\n要求：观点明确，分析透彻，条理清楚，字数不超过250字。",
        paragraph: "材料三第2段、第3段",
        sentence: "力度体现在严格依法办事，温度体现在人性化执法；力度是基础，温度是升华；程序规范、裁量基准和释法说理贯穿全过程。",
        keyword: "力度=严格执法、温度=人性化执法、程序规范、裁量基准、释法说理",
        reason: "综合分析题需拆解关键词并回扣材料。定位到材料三第2段和第3段，“力度”对应“严格依法办事，维护法律权威”；“温度”对应“人性化执法，考虑群众实际困难”；第3段专家观点给出了二者关系——“力度是基础，温度是升华”，并用“程序规范、裁量基准、释法说理”三个抓手说明如何统一。分析时需点明递进关系，不能只解释词义。",
        answer: "“力度”指依法严格执法，对违法行为敢于亮剑，维护法律权威和社会秩序，是执法的基础；“温度”指人性化执法，充分考虑群众实际困难，注重教育和疏导，是执法的升华。二者并不矛盾，而是辩证统一：力度是底线保障，温度是价值追求。实现二者的统一，需要把程序规范、裁量基准和释法说理贯穿执法全过程——以程序规范保障公正，以裁量基准实现过罚相当，以释法说理赢得理解，最终让群众在每一起案件中感受到公平正义。"
      },
      {
        id: uid("essay"), auto: true,
        type: "贯彻执行",
        source: "模拟题（参照2023国考行政执法卷风格）",
        material: "【材料四】\n近年来，各级政府高度重视优化营商环境工作。2024年3月，某市政府办公厅印发《关于推行包容审慎监管优化营商环境的实施意见》，要求各区执法部门建立免罚清单制度，对首次轻微违法行为实行“首违不罚”。\n\n意见明确提出：一要梳理编制免罚事项清单，向社会公开；二要推行行政执法全过程说理，在执法文书中说明认定事实、法律依据和裁量理由；三要建立裁量基准动态调整机制，根据执法实践及时优化；四要加强执法人员培训，提升柔性执法能力和水平。\n\n某区执法局李局长在传达会议精神时强调：“推行柔性执法不是放松监管，而是要更加精准、更加科学地执法。各科室要结合自身职责，制定具体实施方案，明确时间节点和责任分工。要先在部分领域开展试点，总结经验后再全面推广。”\n\n据悉，该区计划在食品安全、市容环境、市场监管三个领域先行试点，半年后评估效果，逐步扩展到全部执法领域。",
        prompt: "假如你是某区执法局工作人员，请根据给定资料，撰写一份关于推进柔性执法的工作方案提纲。（25分）\n要求：内容具体，格式规范，条理清楚，字数不超过400字。",
        paragraph: "材料四第1段至第4段",
        sentence: "意见要求建立免罚清单、推行全过程说理、建立裁量基准动态调整机制、加强培训；李局长要求制定实施方案、先试点后推广；试点领域为食品安全、市容环境、市场监管。",
        keyword: "免罚清单、全过程说理、裁量基准动态调整、培训、试点先行、三领域试点",
        reason: "贯彻执行题需明确文种（工作方案提纲）、格式要素和正文结构。材料四第2段给出四项核心措施（免罚清单、全过程说理、裁量基准、培训），第3段李局长讲话给出实施要求（制定方案、明确分工、先试点后推广），第4段给出具体试点领域（食品安全、市容环境、市场监管）。需将这些信息组织为“目标—措施—步骤—保障”的工作方案结构。",
        answer: "关于推进柔性执法的工作方案提纲\n\n一、工作目标：推行包容审慎监管，优化营商环境，提升执法公信力和群众满意度。\n\n二、主要措施：\n1.梳理编制免罚事项清单，明确首违不罚情形，向社会公开；\n2.推行执法全过程释法说理，在执法文书中说明事实、依据和裁量理由；\n3.建立裁量基准动态调整机制，根据执法实践及时优化完善；\n4.加强执法人员柔性执法培训，提升业务能力和服务水平。\n\n三、实施步骤：\n第一阶段：动员部署，制定具体实施方案，明确责任分工；\n第二阶段：在食品安全、市容环境、市场监管三领域先行试点；\n第三阶段：半年后评估试点效果，总结经验；\n第四阶段：逐步推广至全部执法领域。\n\n四、保障措施：加强组织领导，强化监督检查，定期评估完善。"
      },
      {
        id: uid("essay"), auto: true,
        type: "文章写作",
        source: "模拟题（参照2023国考行政执法卷风格）",
        material: "【材料五】\n在某市老城区，一家爱心企业每天将未售完的面包和糕点捐赠给社区“爱心食物柜”，供有需要的居民免费领取。起初，这项公益活动遇到了不少困难：捐赠食物的安全如何保障？领取者的隐私如何保护？如何避免浪费？\n\n后来，该市民政局牵头搭建了“政企合作+数字赋能”的公益平台。企业通过小程序登记捐赠信息，社区工作人员负责验收和分发，智能柜实现了24小时自助领取。平台还引入了食品安全溯源系统，每一份食物都有“身份证”，可以追溯到生产、运输、存储的全过程。\n\n一位经常来领取食物的外卖骑手说：“以前不好意思去领救助，现在用手机扫码就能取，不用和任何人打交道，很有尊严。”社区负责人介绍：“智能柜保护了领取者的隐私，让他们体面地接受帮助。运行一年来，已分发食物5000余份，惠及300多个家庭，没有发生一起食品安全问题。”\n\n该市还出台了《关于鼓励社会力量参与公益慈善的若干措施》，从税收优惠、场地支持、表彰激励等方面为爱心企业和个人提供政策保障。一位参与捐赠的企业负责人表示：“有了政府的支持和规范，我们做公益更有底气，也更有持续性。”\n\n政企合作有针对性地弥补了短板，把善心变成善治，让善意拥有更长久的生命力。慈善的细节里，藏着一座城市的细致与温度。",
        prompt: "请结合给定资料，以“把善心变成善治”为主题，写一篇议论文。（40分）\n要求：（1）自选角度，立意明确；（2）联系实际，不拘泥于资料；（3）思路清晰，语言流畅；（4）字数1000-1200字。",
        paragraph: "材料五全文（第1段问题引入、第2段政企合作方案、第3段受助者反馈、第4段政策保障、第5段总结升华）",
        sentence: "政企合作有针对性地弥补了短板，把善心变成善治，让善意拥有更长久的生命力。慈善的细节里，藏着一座城市的细致与温度。",
        keyword: "善心、善治、制度设计、政企合作、数字赋能、尊严保护、政策保障",
        reason: "大作文需从材料提炼立意。材料五第1段提出问题（善心如何落地），第2-4段给出路径（政企合作+数字赋能+政策保障），第5段点题“把善心变成善治”。立意应为：善心是出发点，善治是落脚点，制度设计是桥梁。分论点一从“善心需要被呵护”切入（材料案例：企业主动捐赠），分论点二从“善治让善意可持续”切入（材料案例：智能柜+溯源系统+尊严保护），分论点三从“制度创新是关键”切入（材料案例：政策保障措施）。论证用材料案例+政策+对策三类支撑。",
        answer: "【立意】把善心变成善治，制度设计是关键桥梁。\n\n【标题示例】以制度之笔，绘善治之美\n\n【分论点一】善心是治理的温度底色，需要被呵护和激发。材料中爱心企业主动捐赠余量食物，体现了社会的善意底色。但善心若缺乏引导，容易陷入“好心办坏事”的困境——食品安全无保障、领取者隐私被曝光。因此，善心需要被制度呵护，才能转化为有效供给。\n\n【分论点二】善治是善心的制度化升华，让善意可持续。材料中“政企合作+数字赋能”模式是善治的生动实践：小程序登记解决信息不对称，智能柜实现24小时自助领取，溯源系统保障食品安全，扫码领取保护受助者尊严。这些制度设计让善意拥有了可复制、可持续的载体。\n\n【分论点三】从善心到善治，需要政企协同和制度创新。材料中政府出台《若干措施》，从税收优惠、场地支持、表彰激励等方面提供政策保障，让企业“更有底气、更有持续性”。这启示我们：政府要当好“搭台者”，以制度供给激发社会力量参与治理的活力。\n\n【金句】慈善的细节里，藏着一座城市的细致与温度；善治的制度里，蕴含着一个社会的智慧与担当。把善心变成善治，让善意拥有更长久的生命力。"
      }
    ];
  }

  function seedKnowledge() {
    return [
      {
        id: uid("know"), date: today,
        title: "资料分析核心公式速查",
        section: "资料",
        fileName: "内置示例",
        summary: "增长率=增长量/基期量；增长量=现期量-基期量；基期量=现期量/(1+增长率)；比重=部分/整体；比重变化：部分增速>整体增速→比重上升；平均数=总量/份数；倍数=A/B。速算技巧：特殊分数转化（1/6≈16.7%，1/7≈14.3%，1/8=12.5%，1/9≈11.1%）。"
      },
      {
        id: uid("know"), date: today,
        title: "逻辑填空高频关联词体系",
        section: "言语",
        fileName: "内置示例",
        summary: "递进：不仅…而且…、甚至、更、尤其；转折：虽然…但是…、然而、可是、却；并列：既…也…、一方面…另一方面…、同时；因果：因为…所以…、因此、导致；解释说明：也就是说、即、换句话说。做题步骤：1.圈关联词→2.判断逻辑关系→3.找提示信息→4.排除干扰→5.对比剩余选项。"
      },
      {
        id: uid("know"), date: today,
        title: "行政执法卷申论能力框架",
        section: "政治理论",
        fileName: "内置示例",
        summary: "六大能力：依法办事能力、群众工作能力、基层治理能力、公共服务能力、问题解决能力、规范表达能力。五大题型：归纳概括（找要点，保留材料原词）、提出对策（问题反推，四维补足）、综合分析（亮观点，拆关键词）、贯彻执行（格式服从题干，按对象-问题-措施-效果）、文章写作（立意来自材料主线，论证用案例+政策+对策）。"
      }
    ];
  }
})();
