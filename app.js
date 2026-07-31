(function () {
  var STORE_KEY = "xingguang-workbench-v2";
  var QB_VERSION = "2026-07-31-v1"; /* 题库版本号，变更时自动刷新题库 */
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
    "essay": "申论点拨",
    "mistakes": "错题复盘",
    "knowledge": "知识导入"
  };

  var state = loadState();
  var radarChart = null;
  var deferredInstallPrompt = null;

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
      qbVersion: QB_VERSION,
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
      return {
        lastHotspotDate: parsed.lastHotspotDate || "",
        hotspots: parsed.hotspots || [],
        qbVersion: QB_VERSION,
        questions: needRefresh ? def.questions : ((parsed.questions && parsed.questions.length > 0) ? parsed.questions : def.questions),
        essays: (parsed.essays && parsed.essays.length > 0) ? parsed.essays : def.essays,
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
      openView("home");
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
  }

  /* ===== 表单绑定 ===== */
  function bindForms() {
    document.getElementById("generateDailyBtn").addEventListener("click", function () {
      state.hotspots = seedHotspots(today).concat(state.hotspots.filter(function (item) {
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
        vocab: splitTags(d.vocab), analysis: d.analysis, quote: d.quote, countermeasure: d.countermeasure
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
      state.essays.unshift(Object.assign({ id: uid("essay") }, d));
      e.target.reset(); saveState(); renderAll();
    });

    document.getElementById("mistakeForm").addEventListener("submit", function (e) {
      e.preventDefault();
      var d = formData(e.target);
      state.mistakes.unshift(Object.assign({ id: uid("mistake"), date: today, auto: false }, d));
      e.target.reset(); saveState(); renderAll();
    });

    document.getElementById("knowledgeForm").addEventListener("submit", function (e) {
      e.preventDefault();
      var form = e.target;
      var d = formData(form);
      var file = document.getElementById("knowledgeFile").files[0];

      function addKnowledge(fileText) {
        state.knowledge.unshift({
          id: uid("know"), date: today, title: d.title, section: d.section,
          fileName: file ? file.name : "",
          summary: [d.summary, fileText].filter(Boolean).join("\n\n")
        });
        form.reset(); saveState(); renderAll();
      }

      if (file) {
        var reader = new FileReader();
        reader.onload = function () { addKnowledge(String(reader.result || "").slice(0, 12000)); };
        reader.readAsText(file, "utf-8");
      } else {
        addKnowledge("");
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
      return '<article class="content-card">' +
        '<header><div><h3>' + escapeHtml(item.title) + '</h3><span class="meta">' + escapeHtml(item.date) + ' · ' + escapeHtml(item.source || "") + '</span></div>' +
        '<button class="danger-btn" data-delete="hotspots" data-id="' + item.id + '" type="button">删除</button></header>' +
        '<div class="tag-row"><span class="tag">' + escapeHtml(item.logic || "") + '</span>' + (item.auto ? '<span class="tag">今日推送</span>' : '') + renderTags(item.vocab) + '</div>' +
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
      return '<article class="content-card">' +
        '<header><div><h3>' + escapeHtml(item.type) + ' · ' + escapeHtml(item.source || "") + '</h3><span class="meta">' + escapeHtml(item.prompt || "") + '</span></div>' +
        '<button class="danger-btn" data-delete="essays" data-id="' + item.id + '" type="button">删除</button></header>' +
        '<div class="analysis-grid">' +
        '<div class="analysis-box"><strong>材料定位</strong><p>' + escapeHtml(item.paragraph || "") + '</p></div>' +
        '<div class="analysis-box"><strong>关键句</strong><p>' + escapeHtml(item.sentence || "") + '</p></div>' +
        '<div class="analysis-box"><strong>关键词</strong><p>' + escapeHtml(item.keyword || "") + '</p></div>' +
        '<div class="analysis-box"><strong>入选原因</strong><p>' + escapeHtml(item.reason || "") + '</p></div>' +
        '<div class="analysis-box" style="grid-column:1/-1"><strong>规范答案点</strong><p>' + escapeHtml(item.answer || "") + '</p></div>' +
        '</div></article>';
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

    if (selected.length === 0) {
      box.innerHTML = '<div class="result-box"><p>当前筛选条件下暂无题目，请切换板块或题型。</p></div>';
      return;
    }

    box.innerHTML = '<form id="practiceForm" class="form-card"><h3>本组训练：' + selected.length + '题</h3>' +
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
    document.getElementById("practiceBox").innerHTML = '<div class="form-card"><h3>本组得分：' + correctCount + "/" + questions.length + "</h3>" + html.join("") + "</div>";
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

  function seedHotspots(date) {
    return [
      {
        id: uid("hot"), date: date, auto: true,
        title: "促进团结奋斗 汇聚磅礴力量——习近平总书记对侨务工作作出重要指示",
        source: "人民日报评论员文章（2026年7月29日）",
        stem: "侨务工作是党和国家的一项长期性战略性工作。越是朝着强国建设、民族复兴的目标砥砺前行，越要把广大海外侨胞和归侨侨眷紧密团结起来、力量____起来。",
        logic: "递进",
        vocab: ["凝聚侨心", "磅礴力量", "团结奋斗", "血脉相连", "长期性战略性"],
        analysis: "“越是……越要……”构成递进关系，前后语义同向加重。空处需填入与“团结”语义一致、且能搭配“力量”的动词。“汇聚”比“集中”更强调由散到合的过程，比“聚集”更书面化，符合政论语体。",
        quote: "潮起海天阔，同心向复兴。新征程上，更好凝聚侨心侨力、促进海内外中华儿女团结奋斗，定能为以中国式现代化全面推进强国建设、民族复兴伟业汇聚磅礴力量。",
        countermeasure: "坚持为大局服务和为侨服务相统一；用好地缘、亲缘、文缘纽带；完善侨务政策法规，维护侨益；发挥侨胞在共建“一带一路”中的桥梁作用。"
      },
      {
        id: uid("hot"), date: date, auto: true,
        title: "莫把群众求助当作负面舆情——河南瓜农滞销事件的治理启示",
        source: "人民日报评论（2026年7月27日）",
        stem: "面对瓜农的求助信息，村工作人员的第一反应不是下地看烂了多少，不是联系商超找买家，____要求村民“撤回求助信”。不解忧，先堵嘴。不帮忙，反添乱。",
        logic: "转折",
        vocab: ["滞销", "舆情", "懒政", "制度托底", "产销对接"],
        analysis: "“不是……不是……____”构成反向并列后转折，前两个“不是”排除正常做法，空处应填入与预期相反的动作。“而是”最契合：本该帮忙却选择堵嘴，形成强烈转折。考生需注意“而是”与“而是”的辨析——此处强调行为反转而非因果。",
        quote: "把群众求助当“负面舆情”，本质上是懒政，怕麻烦、怕担责、怕出事。真正把民生疾苦放在心上，把群众诉求落到实处，才能让问题变得不再是问题。",
        countermeasure: "加快建设农产品监测预警系统，利用大数据完善产量预测模型；建立产销对接常态化机制；畅通群众诉求表达渠道，把求助信息作为治理信号而非负面舆情。"
      },
      {
        id: uid("hot"), date: date, auto: true,
        title: "把善心变成善治——杭州余量食物公益项目的制度启示",
        source: "人民日报纵论（2026年7月8日）",
        stem: "政企合作有针对性地弥补了短板，把善心变成善治，让善意拥有更长久的生命力。制度设计让捐助者能够“持续捐赠”，“盲盒+小程序”____让受助者“体面领取”。",
        logic: "并列",
        vocab: ["善治", "余量食物", "政企合作", "体面领取", "制度设计"],
        analysis: "“让捐助者……”“____让受助者……”构成并列结构，前后主语不同但句式对称。空处需填入连接手段，“则”表示并列中的对比关系，比“就”更正式，比“还”更强调两方面并重。考点：并列关联词的语体色彩与语义轻重。",
        quote: "慈善的细节里，藏着一座城市的细致与温度。保留食品原包装、监管部门定期抽检、“智能柜+小程序”打通全流程，让每一份食物的来源、去向可监控、可查实。",
        countermeasure: "推动政企合作弥补公共服务短板；用数字化手段打通资格核验、取餐、溯源全流程；注重受助者尊严保护；建立余量食物捐赠的制度化通道和监管机制。"
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
        id: uid("essay"),
        type: "归纳概括",
        source: "模拟题（参照2020-2026国考行政执法卷风格）",
        prompt: "根据给定材料，概括当前基层执法服务中存在的主要问题。",
        paragraph: "材料一第2段",
        sentence: "群众反映窗口多头跑、材料重复交、办理进度不透明，部分事项需跨部门核验但系统尚未打通。",
        keyword: "多头跑、重复交、不透明、系统未打通",
        reason: "题干要求概括“问题”，该句直接列举了四类问题表现，每个词对应一个独立的问题维度，是问题类答案的直接得分点。",
        answer: "1.办事流程不够集成，群众需多头跑动；2.材料重复提交，增加群众负担；3.办理进度公开不足，信息不透明；4.跨部门核验机制不健全，系统未完全打通。"
      },
      {
        id: uid("essay"),
        type: "提出对策",
        source: "模拟题（参照2020-2026国考行政执法卷风格）",
        prompt: "针对材料中反映的基层执法服务问题，提出改进建议。",
        paragraph: "材料二第3段、第5段",
        sentence: "部分基层执法人员服务意识不足，存在重处罚轻教育现象；同时数字化平台建设滞后，数据共享不畅。",
        keyword: "服务意识不足、重处罚轻教育、数字化滞后、数据共享不畅",
        reason: "问题反推对策：服务意识不足→加强培训教育；重处罚轻教育→推行柔性执法；数字化滞后→加快平台建设；数据共享不畅→打破信息壁垒。",
        answer: "1.加强执法队伍服务意识培训，树立执法为民理念；2.推行包容审慎监管和柔性执法，落实首违不罚；3.加快数字化平台建设，推进一网通办；4.建立跨部门数据共享机制，打通信息壁垒。"
      },
      {
        id: uid("essay"),
        type: "综合分析",
        source: "模拟题（参照2020-2026国考行政执法卷风格）",
        prompt: "请分析“执法既要有力度，也要有温度”这句话的内涵。",
        paragraph: "材料三第4段",
        sentence: "执法既要有力度，也要有尺度和温度；只有把程序规范、裁量基准和释法说理贯穿全过程，才能让群众感受到公平正义。",
        keyword: "力度、尺度、温度、程序规范、释法说理",
        reason: "分析题需拆解关键词并回扣材料。力度=依法严格执法；尺度=裁量基准规范；温度=教育提醒和人性化执法。三者构成递进关系。",
        answer: "“力度”指依法严格执法，维护法律权威；“尺度”指规范裁量权，做到过罚相当；“温度”指人性化执法，注重教育和疏导。三者统一于严格规范公正文明执法的全过程，程序规范是保障，释法说理是桥梁，最终让群众在每一起执法案件中感受到公平正义。"
      },
      {
        id: uid("essay"),
        type: "贯彻执行",
        source: "模拟题（参照2020-2026国考行政执法卷风格）",
        prompt: "假如你是某区执法局工作人员，请根据材料，撰写一份关于推进柔性执法的工作方案提纲。",
        paragraph: "材料四第1段至第3段",
        sentence: "上级要求各地推行包容审慎监管，建立免罚清单制度，加强执法全过程说理。",
        keyword: "包容审慎、免罚清单、全过程说理",
        reason: "贯彻执行题需明确文种（工作方案）、格式要素和正文结构。材料给出了核心措施：免罚清单、全过程说理，需在此基础上补充目标、步骤和保障。",
        answer: "关于推进柔性执法的工作方案提纲\n一、工作目标：推行包容审慎监管，优化营商环境，提升执法公信力。\n二、主要措施：1.制定并公布免罚清单，明确首违不罚情形；2.推行执法全过程释法说理；3.建立裁量基准动态调整机制；4.加强执法人员柔性执法培训。\n三、实施步骤：动员部署→清单制定→试点推行→全面推广。\n四、保障措施：加强组织领导，强化监督考核，定期评估完善。"
      },
      {
        id: uid("essay"),
        type: "文章写作",
        source: "模拟题（参照2020-2026国考行政执法卷风格）",
        prompt: "请结合给定材料，以“把善心变成善治”为主题，写一篇议论文。",
        paragraph: "材料五全文",
        sentence: "政企合作有针对性地弥补了短板，把善心变成善治，让善意拥有更长久的生命力。慈善的细节里，藏着一座城市的细致与温度。",
        keyword: "善心、善治、制度设计、政企合作、温度",
        reason: "大作文需从材料提炼立意：善心是出发点，善治是落脚点，制度设计是桥梁。论点应回扣材料主线，论证用案例+政策+对策三类支撑。",
        answer: "立意：把善心变成善治，制度设计是关键桥梁。\n分论点一：善心是治理的温度底色，需要被呵护和激发（材料案例：爱心企业捐赠余量食物）。\n分论点二：善治是善心的制度化升华，让善意可持续（材料案例：智能柜+小程序打通全流程，受助者体面领取）。\n分论点三：从善心到善治，需要政企协同和制度创新（对策：完善制度供给、数字化赋能、注重尊严保护）。\n金句：慈善的细节里，藏着一座城市的细致与温度；善治的制度里，蕴含着一个社会的智慧与担当。"
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
