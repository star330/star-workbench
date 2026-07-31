(function () {
  var STORE_KEY = "xingguang-workbench-v1";
  var today = new Date().toISOString().slice(0, 10);

  var sections = ["常识", "言语", "数量", "判断", "资料", "政治理论"];
  var taxonomy = {
    "常识": ["法律常识", "行政执法常识", "科技人文", "经济管理", "广东省情"],
    "言语": ["逻辑填空", "片段阅读", "语句排序", "语句衔接", "中心理解"],
    "数量": ["工程问题", "行程问题", "利润问题", "排列组合", "几何问题"],
    "判断": ["图形推理", "定义判断", "类比推理", "加强削弱", "逻辑推理一拖五"],
    "资料": ["增长率", "增长量", "比重", "平均数", "倍数", "综合分析"],
    "政治理论": ["二十大精神", "新思想", "依法治国", "基层治理", "高质量发展"]
  };

  var state = loadState();
  var radarChart = null;
  var deferredInstallPrompt = null;

  document.addEventListener("DOMContentLoaded", function () {
    bindTabs();
    bindForms();
    bindPwa();
    fillSelects();
    ensureDailyHotspots();
    renderAll();
    registerServiceWorker();
  });

  function defaultState() {
    return {
      lastHotspotDate: "",
      hotspots: [],
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
      return Object.assign(defaultState(), parsed);
    } catch (error) {
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
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function bindTabs() {
    document.querySelectorAll(".tab-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        openTab(btn.dataset.tab);
      });
    });

    document.querySelectorAll("[data-tab-target]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        openTab(btn.dataset.tabTarget);
      });
    });
  }

  function openTab(tabId) {
    document.querySelectorAll(".tab-btn").forEach(function (btn) {
      btn.classList.toggle("active", btn.dataset.tab === tabId);
    });
    document.querySelectorAll(".tab-panel").forEach(function (panel) {
      panel.classList.toggle("active", panel.id === tabId);
    });
    if (tabId === "dashboard") setTimeout(renderRadar, 80);
  }

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
      if (confirm("确认恢复示例数据？这会覆盖当前本地保存的内容。")) {
        state = defaultState();
        ensureDailyHotspots(true);
        saveState();
        renderAll();
      }
    });

    document.getElementById("hotspotForm").addEventListener("submit", function (event) {
      event.preventDefault();
      var data = formData(event.target);
      state.hotspots.unshift({
        id: uid("hot"),
        date: today,
        auto: false,
        title: data.title,
        source: data.source,
        stem: data.stem,
        logic: data.logic,
        vocab: splitTags(data.vocab),
        analysis: data.analysis,
        quote: data.quote,
        countermeasure: data.countermeasure
      });
      event.target.reset();
      saveState();
      renderAll();
    });

    document.getElementById("questionForm").addEventListener("submit", function (event) {
      event.preventDefault();
      var data = formData(event.target);
      state.questions.unshift({
        id: uid("q"),
        section: data.section,
        type: data.type,
        source: data.source,
        stem: data.stem,
        options: { A: data.a, B: data.b, C: data.c, D: data.d },
        answer: data.answer,
        fastTip: data.fastTip,
        explain: data.explain
      });
      event.target.reset();
      fillSelects();
      saveState();
      renderAll();
    });

    document.getElementById("essayForm").addEventListener("submit", function (event) {
      event.preventDefault();
      var data = formData(event.target);
      state.essays.unshift(Object.assign({ id: uid("essay") }, data));
      event.target.reset();
      saveState();
      renderAll();
    });

    document.getElementById("mistakeForm").addEventListener("submit", function (event) {
      event.preventDefault();
      var data = formData(event.target);
      state.mistakes.unshift(Object.assign({ id: uid("mistake"), date: today, auto: false }, data));
      event.target.reset();
      saveState();
      renderAll();
    });

    document.getElementById("knowledgeForm").addEventListener("submit", function (event) {
      event.preventDefault();
      var form = event.target;
      var data = formData(form);
      var file = document.getElementById("knowledgeFile").files[0];

      function addKnowledge(fileText) {
        state.knowledge.unshift({
          id: uid("know"),
          date: today,
          title: data.title,
          section: data.section,
          fileName: file ? file.name : "",
          summary: [data.summary, fileText].filter(Boolean).join("\n\n")
        });
        form.reset();
        saveState();
        renderAll();
      }

      if (file) {
        var reader = new FileReader();
        reader.onload = function () {
          addKnowledge(String(reader.result || "").slice(0, 12000));
        };
        reader.readAsText(file, "utf-8");
      } else {
        addKnowledge("");
      }
    });

    document.getElementById("startPracticeBtn").addEventListener("click", startPractice);
    document.getElementById("practiceSectionFilter").addEventListener("change", updateTypeFilter);
  }

  function bindPwa() {
    window.addEventListener("beforeinstallprompt", function (event) {
      event.preventDefault();
      deferredInstallPrompt = event;
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

  function fillSelects() {
    fillSectionSelect("questionSection");
    fillSectionSelect("mistakeSection");
    fillSectionSelect("knowledgeSection");
    fillSectionSelect("practiceSectionFilter", "全部板块");
    updateTypeFilter();
  }

  function fillSectionSelect(id, allLabel) {
    var select = document.getElementById(id);
    if (!select) return;
    select.innerHTML = "";
    if (allLabel) {
      var all = document.createElement("option");
      all.value = "";
      all.textContent = allLabel;
      select.appendChild(all);
    }
    sections.forEach(function (section) {
      var option = document.createElement("option");
      option.value = section;
      option.textContent = section;
      select.appendChild(option);
    });
  }

  function updateTypeFilter() {
    var section = document.getElementById("practiceSectionFilter").value;
    var select = document.getElementById("practiceTypeFilter");
    var types = unique(state.questions
      .filter(function (q) { return !section || q.section === section; })
      .map(function (q) { return q.type; }));

    select.innerHTML = '<option value="">全部题型</option>' + types.map(function (type) {
      return '<option value="' + escapeHtml(type) + '">' + escapeHtml(type) + '</option>';
    }).join("");
  }

  function formData(form) {
    var data = {};
    new FormData(form).forEach(function (value, key) {
      data[key] = String(value).trim();
    });
    return data;
  }

  function splitTags(value) {
    return String(value || "").split(/[，,、\s]+/).map(function (item) {
      return item.trim();
    }).filter(Boolean);
  }

  function unique(arr) {
    return Array.from(new Set(arr.filter(Boolean)));
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

  function renderAll() {
    renderMetrics();
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

  function renderMetrics() {
    document.getElementById("metricHotspots").textContent = state.hotspots.length;
    document.getElementById("metricQuestions").textContent = state.questions.length;
    document.getElementById("metricMistakes").textContent = state.mistakes.length;
    document.getElementById("metricKnowledge").textContent = state.knowledge.length;
  }

  function renderHotspots() {
    var box = document.getElementById("hotspotList");
    box.innerHTML = state.hotspots.map(function (item) {
      return '<article class="content-card">' +
        '<header><div><h3>' + escapeHtml(item.title) + '</h3><span class="meta">' + escapeHtml(item.date) + ' · ' + escapeHtml(item.source || "待补充原文出处") + '</span></div>' +
        '<button class="danger-btn" data-delete="hotspots" data-id="' + item.id + '" type="button">删除</button></header>' +
        '<div class="tag-row"><span class="tag">逻辑关系：' + escapeHtml(item.logic || "待判断") + '</span>' + (item.auto ? '<span class="tag">今日自动示例</span>' : '') + renderTags(item.vocab) + '</div>' +
        '<div class="analysis-grid">' +
        '<div class="analysis-box"><strong>逻辑填空题干出处</strong><p>' + escapeHtml(item.stem || "请补充原文或题干。") + '</p></div>' +
        '<div class="analysis-box"><strong>逻辑考点分析</strong><p>' + escapeHtml(item.analysis || "建议标注提示词、关联词、语义轻重、感情色彩和搭配对象。") + '</p></div>' +
        '<div class="analysis-box"><strong>申论金句</strong><p>' + escapeHtml(item.quote || "请从热点中提炼一句可迁移表达。") + '</p></div>' +
        '<div class="analysis-box"><strong>对策建议</strong><p>' + escapeHtml(item.countermeasure || "请从主体、制度、技术、监督、服务等角度提炼。") + '</p></div>' +
        '</div></article>';
    }).join("");
    bindDeleteButtons();
  }

  function renderTags(tags) {
    return (tags || []).map(function (tag) {
      return '<span class="tag">' + escapeHtml(tag) + '</span>';
    }).join("");
  }

  function renderTaxonomy() {
    var box = document.getElementById("taxonomyGrid");
    box.innerHTML = sections.map(function (section) {
      var mastery = getMastery(section);
      return '<article class="taxonomy-item"><h4>' + section + '</h4>' +
        '<p class="meta">掌握度：' + mastery.percent + '% <span class="stars">' + mastery.stars + '</span></p>' +
        '<div class="tag-row">' + taxonomy[section].map(function (type) {
          return '<span class="tag">' + type + '</span>';
        }).join("") + '</div></article>';
    }).join("");
  }

  function renderQuestionBank() {
    var box = document.getElementById("questionBank");
    box.innerHTML = state.questions.map(function (q) {
      return '<article class="content-card">' +
        '<header><div><h3>' + escapeHtml(q.section) + ' · ' + escapeHtml(q.type) + '</h3><span class="meta">' + escapeHtml(q.source || "题源待补充") + '</span></div>' +
        '<button class="danger-btn" data-delete="questions" data-id="' + q.id + '" type="button">删除</button></header>' +
        '<p>' + escapeHtml(q.stem) + '</p>' +
        '<div class="tag-row"><span class="tag">答案：' + escapeHtml(q.answer) + '</span><span class="tag">考场提示：' + escapeHtml(q.fastTip || "先抓题干限定，再排除干扰") + '</span></div>' +
        '<div class="analysis-box"><strong>解析</strong><p>' + escapeHtml(q.explain || "请补充考场视角解析和完整推导。") + '</p></div>' +
        '</article>';
    }).join("");
    bindDeleteButtons();
  }

  function renderEssays() {
    var box = document.getElementById("essayList");
    box.innerHTML = state.essays.map(function (item) {
      return '<article class="content-card">' +
        '<header><div><h3>' + escapeHtml(item.type) + ' · ' + escapeHtml(item.source || "题源待补充") + '</h3><span class="meta">' + escapeHtml(item.prompt || "题干待补充") + '</span></div>' +
        '<button class="danger-btn" data-delete="essays" data-id="' + item.id + '" type="button">删除</button></header>' +
        '<div class="analysis-grid">' +
        '<div class="analysis-box"><strong>材料定位</strong><p>' + escapeHtml(item.paragraph || "段落待标注") + '；' + escapeHtml(item.sentence || "句子待标注") + '</p></div>' +
        '<div class="analysis-box"><strong>关键词</strong><p>' + escapeHtml(item.keyword || "关键词待标注") + '</p></div>' +
        '<div class="analysis-box"><strong>入选原因</strong><p>' + escapeHtml(item.reason || "说明它为什么对应题干。") + '</p></div>' +
        '<div class="analysis-box"><strong>规范答案点</strong><p>' + escapeHtml(item.answer || "答案点待完善") + '</p></div>' +
        '</div></article>';
    }).join("");
    bindDeleteButtons();
  }

  function renderMistakes() {
    var box = document.getElementById("mistakeList");
    box.innerHTML = state.mistakes.map(function (item) {
      return '<article class="content-card">' +
        '<header><div><h3>' + escapeHtml(item.section) + ' · ' + escapeHtml(item.type || "未分类") + '</h3><span class="meta">' + escapeHtml(item.date || today) + ' · 错因：' + escapeHtml(item.reason || "待归因") + '</span></div>' +
        '<button class="danger-btn" data-delete="mistakes" data-id="' + item.id + '" type="button">删除</button></header>' +
        '<p>' + escapeHtml(item.stem || "错题简述待补充") + '</p>' +
        '<div class="analysis-grid">' +
        '<div class="analysis-box"><strong>下次避坑点</strong><p>' + escapeHtml(item.pitfall || "请写清楚下次遇到同类题必须先检查什么。") + '</p></div>' +
        '<div class="analysis-box"><strong>正确解题路径</strong><p>' + escapeHtml(item.correctPath || "请写出纠正后的审题、定位、计算或推理流程。") + '</p></div>' +
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
        '<p>' + escapeHtml(item.summary || "暂无摘要。") + '</p>' +
        '<div class="analysis-box"><strong>拔高预测提示</strong><p>结合近三到五年趋势，可重点检查：是否从单一公式转向综合判断、是否从记忆考点转向情境应用、是否出现行政执法或基层治理场景化表达。</p></div>' +
        '</article>';
    }).join("");
    bindDeleteButtons();
  }

  function renderTips() {
    var weak = sections.map(function (section) {
      return { section: section, mastery: getMastery(section).percent };
    }).sort(function (a, b) { return a.mastery - b.mastery; }).slice(0, 3);

    var tips = weak.map(function (item) {
      return item.section + "当前掌握度 " + item.mastery + "%，建议优先用 5 题一组做限时训练，错题必须补“避坑点”。";
    });
    if (state.mistakes.length > 0) {
      tips.push("错题复盘已有 " + state.mistakes.length + " 条，建议每晚只重看同一错因的 3 条，避免泛泛浏览。");
    }
    document.getElementById("reviewTips").innerHTML = tips.map(function (tip) {
      return "<li>" + escapeHtml(tip) + "</li>";
    }).join("");
  }

  function renderRadar() {
    var el = document.getElementById("radarChart");
    if (!el || typeof echarts === "undefined") return;
    if (!radarChart) radarChart = echarts.init(el, null, { renderer: "svg" });

    var style = getComputedStyle(document.documentElement);
    var accent = style.getPropertyValue("--accent").trim();
    var accent2 = style.getPropertyValue("--accent2").trim();
    var ink = style.getPropertyValue("--ink").trim();
    var muted = style.getPropertyValue("--muted").trim();

    radarChart.setOption({
      animation: false,
      color: [accent],
      tooltip: { appendToBody: true },
      radar: {
        radius: "66%",
        indicator: sections.map(function (section) {
          return { name: section, max: 100 };
        }),
        axisName: { color: muted, fontWeight: 700 },
        splitLine: { lineStyle: { color: "rgba(37, 99, 235, 0.16)" } },
        splitArea: { areaStyle: { color: ["rgba(37, 99, 235, 0.03)", "rgba(56, 189, 248, 0.05)"] } },
        axisLine: { lineStyle: { color: "rgba(37, 99, 235, 0.16)" } }
      },
      series: [{
        type: "radar",
        data: [{
          name: "掌握度",
          value: sections.map(function (section) { return getMastery(section).percent; }),
          areaStyle: { color: "rgba(37, 99, 235, 0.18)" },
          lineStyle: { color: accent, width: 3 },
          itemStyle: { color: accent2 }
        }],
        label: { show: true, color: ink, formatter: "{c}%" }
      }]
    });
    window.addEventListener("resize", function () { radarChart.resize(); }, { once: true });
  }

  function getMastery(section) {
    var item = state.mastery[section] || { total: 0, correct: 0 };
    var percent = item.total ? Math.round((item.correct / item.total) * 100) : 20;
    var starCount = Math.max(1, Math.min(5, Math.ceil(percent / 20)));
    return {
      percent: percent,
      stars: "★★★★★".slice(0, starCount) + "☆☆☆☆☆".slice(0, 5 - starCount)
    };
  }

  function bindDeleteButtons() {
    document.querySelectorAll("[data-delete]").forEach(function (btn) {
      btn.onclick = function () {
        var key = btn.dataset.delete;
        var id = btn.dataset.id;
        state[key] = state[key].filter(function (item) { return item.id !== id; });
        saveState();
        renderAll();
      };
    });
  }

  function startPractice() {
    var section = document.getElementById("practiceSectionFilter").value;
    var type = document.getElementById("practiceTypeFilter").value;
    var pool = state.questions.filter(function (q) {
      return (!section || q.section === section) && (!type || q.type === type);
    });
    var selected = shuffle(pool).slice(0, 5);
    var box = document.getElementById("practiceBox");

    if (selected.length === 0) {
      box.innerHTML = '<div class="result-box">当前筛选条件下暂无题目，请先新增题目或切换题型。</div>';
      return;
    }

    box.innerHTML = '<form id="practiceForm" class="form-card"><h3>本组训练：' + selected.length + ' 题</h3>' +
      selected.map(function (q, index) {
        return '<article class="question-card">' +
          '<p><strong>第 ' + (index + 1) + ' 题｜' + escapeHtml(q.section) + ' · ' + escapeHtml(q.type) + '</strong></p>' +
          '<p>' + escapeHtml(q.stem) + '</p>' +
          '<div class="option-list">' + ["A", "B", "C", "D"].map(function (letter) {
            return '<label><input type="radio" name="' + q.id + '" value="' + letter + '" required /> ' + letter + '. ' + escapeHtml(q.options[letter]) + '</label>';
          }).join("") + '</div>' +
          '</article>';
      }).join("") +
      '<button class="primary-btn" type="submit">提交本组答案并查看解析</button></form>';

    document.getElementById("practiceForm").addEventListener("submit", function (event) {
      event.preventDefault();
      submitPractice(selected, new FormData(event.target));
    });
  }

  function submitPractice(questions, answers) {
    var resultHtml = [];
    var correctCount = 0;

    questions.forEach(function (q, index) {
      var userAnswer = answers.get(q.id);
      var correct = userAnswer === q.answer;
      if (correct) correctCount += 1;
      if (!state.mastery[q.section]) state.mastery[q.section] = { total: 0, correct: 0 };
      state.mastery[q.section].total += 1;
      if (correct) state.mastery[q.section].correct += 1;

      if (!correct) {
        state.mistakes.unshift({
          id: uid("mistake"),
          date: today,
          auto: true,
          section: q.section,
          type: q.type,
          stem: q.stem,
          reason: inferReason(q.section, q.type),
          pitfall: "下次先识别题型限定与核心提示，不要被相似选项、无关数字或材料细节带偏。",
          correctPath: q.fastTip + "；再按解析完成完整推导。"
        });
      }

      resultHtml.push('<article class="question-card">' +
        '<p><strong>第 ' + (index + 1) + ' 题：' + (correct ? "答对" : "答错") + '</strong></p>' +
        '<div class="tag-row"><span class="tag">你的答案：' + escapeHtml(userAnswer) + '</span><span class="tag">正确答案：' + escapeHtml(q.answer) + '</span><span class="tag">考场提示：' + escapeHtml(q.fastTip) + '</span></div>' +
        '<div class="result-box"><strong>解析</strong><p>' + escapeHtml(q.explain) + '</p></div>' +
        '</article>');
    });

    saveState();
    document.getElementById("practiceBox").innerHTML = '<div class="form-card"><h3>本组得分：' + correctCount + '/' + questions.length + '</h3>' + resultHtml.join("") + '</div>';
    renderMetrics();
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

  function shuffle(arr) {
    return arr.slice().sort(function () { return Math.random() - 0.5; });
  }

  function seedHotspots(date) {
    return [
      {
        id: uid("hot"),
        date: date,
        auto: true,
        title: "基层治理从“被动响应”走向“主动服务”",
        source: "示例来源：请替换为当天权威媒体或政府公开信息链接",
        stem: "基层治理不能停留在问题出现后的被动处置，而要通过数据共享、网格协同与群众参与，把服务做在诉求形成之前。",
        logic: "转折",
        vocab: ["被动响应", "主动服务", "协同治理", "诉求前置"],
        analysis: "“不能……而要……”构成反向转折，前半句否定滞后处置，后半句强调主动前置。逻辑填空应优先选择能体现治理方式升级、服务关口前移的词。",
        quote: "治理的温度，往往体现在问题尚未扩大之前的及时抵达。",
        countermeasure: "完善基层数据共享机制，推动网格、社区、执法和公共服务力量协同下沉，形成早发现、早研判、早处置闭环。"
      },
      {
        id: uid("hot"),
        date: date,
        auto: true,
        title: "行政执法更重规范化、透明化与柔性治理",
        source: "示例来源：请替换为当天法治政府建设相关信息",
        stem: "执法既要有力度，也要有尺度和温度；只有把程序规范、裁量基准和释法说理贯穿全过程，才能让群众感受到公平正义。",
        logic: "并列",
        vocab: ["规范执法", "柔性治理", "裁量基准", "释法说理"],
        analysis: "“力度、尺度、温度”是并列递进式表达，后文“只有……才能……”强调必要条件。选词时要同时兼顾依法、规范、服务三个语义面。",
        quote: "执法的公信力，不只来自结果正确，也来自过程可见、尺度可感。",
        countermeasure: "细化行政裁量基准，强化全过程记录和释法说理，推动严格规范公正文明执法。"
      },
      {
        id: uid("hot"),
        date: date,
        auto: true,
        title: "数字化能力成为公共服务提质的重要支点",
        source: "示例来源：请替换为当天数字政府或公共服务报道",
        stem: "数字技术不是简单把线下流程搬到线上，而是要以群众需求为中心，重塑流程、压缩环节、提升体验。",
        logic: "递进",
        vocab: ["数字政府", "流程再造", "群众需求", "服务体验"],
        analysis: "“不是……而是……”先排除表层线上化，再推进到流程再造。空格若考查中心词，应选择比“搬运、复制”更高阶的“重塑、再造、优化”。",
        quote: "数字化的价值，不在于多一个入口，而在于少一道门槛。",
        countermeasure: "以高频事项为牵引推进流程再造，减少重复填报和多头办理，提升跨部门协同效率。"
      }
    ];
  }

  function seedQuestions() {
    return [
      q("言语", "逻辑填空-转折", "原创示例｜参照国省考命题风格", "公共服务不能只追求速度，____忽视公平；数字化改革要让更多群体共享便利，而不是制造新的门槛。", ["更不能", "却可以", "甚至要", "也无需"], "A", "先看“不能只……____忽视”，空处应承接更强否定。", "空前否定单一追求速度，空后否定忽视公平，构成递进否定，A项“更不能”最能体现语义加重。"),
      q("判断", "逻辑推理一拖五", "原创示例｜行政执法场景", "某执法队检查甲乙丙丁四类场所，已知：若检查甲则检查乙；检查丙则不检查乙；丁和甲至少检查一个。若乙未检查，以下必然为真的是？", ["甲检查", "丙不检查", "丁检查", "甲和丁都检查"], "C", "乙未检查先逆否：检查甲→检查乙，所以甲不检查；再由丁和甲至少一个推出丁检查。", "由“甲→乙”和“乙未检查”可得甲未检查；又因丁或甲至少一个，甲未检查则丁检查。"),
      q("资料", "增长率", "原创示例｜资料分析公式", "某市2025年行政服务办件量为132万件，比2024年增加12万件。2025年同比增长率约为？", ["8.3%", "9.1%", "10.0%", "12.0%"], "C", "增长率=增长量/基期量，基期=132-12=120，12/120=10%。", "资料分析先找基期量，2024年为120万件，增长率为12÷120=10%。"),
      q("资料", "比重变化", "原创示例｜资料分析公式", "某地区线上办理量增长20%，总办理量增长10%。若去年线上办理占比为30%，今年线上办理占比变化趋势为？", ["上升", "下降", "不变", "无法判断"], "A", "部分增长率大于整体增长率，比重上升。", "判断比重变化只比较部分增长率与整体增长率。20%＞10%，所以线上办理占比上升。"),
      q("常识", "行政法常识", "原创示例｜行政执法", "行政机关作出影响相对人权益的行政处罚前，通常应保障相对人的哪项程序性权利？", ["知情与陈述申辩", "无限期复议", "自行变更处罚", "拒绝履行所有决定"], "A", "行政执法题先抓“程序性权利”，常见为告知、陈述、申辩、听证。", "行政处罚前应依法告知事实、理由、依据，并保障陈述申辩等程序性权利。"),
      q("政治理论", "依法治国", "原创示例｜政治理论", "推进法治政府建设，关键是把政府活动全面纳入什么轨道？", ["法治", "经验", "运动式治理", "单一效率"], "A", "政治理论题抓关键词“法治政府”，核心搭配是政府活动全面纳入法治轨道。", "法治政府建设强调依法行政，把政府活动全面纳入法治轨道。"),
      q("数量", "工程问题", "原创示例｜数量关系", "甲单独完成一项工作需12天，乙需18天。两人合作3天后，剩余工作量为？", ["1/2", "7/12", "1/3", "1/4"], "B", "效率相加：1/12+1/18=5/36，3天完成5/12，剩余7/12。", "两人合作效率为5/36，3天完成15/36=5/12，剩余工作量为7/12。"),
      q("判断", "定义判断", "原创示例｜判断推理", "“包容审慎监管”指对新业态在守住安全底线前提下给予合理试错空间。下列最符合的是？", ["对轻微首次违规教育提醒并限期改正", "对所有违规一律顶格处罚", "不再监管新业态", "只监管传统行业"], "A", "定义判断先圈核心：新业态、安全底线、合理试错。", "A项既保留监管底线，又体现教育提醒和改正空间，符合定义。")
    ];
  }

  function q(section, type, source, stem, options, answer, fastTip, explain) {
    return {
      id: uid("q"),
      section: section,
      type: type,
      source: source,
      stem: stem,
      options: { A: options[0], B: options[1], C: options[2], D: options[3] },
      answer: answer,
      fastTip: fastTip,
      explain: explain
    };
  }

  function seedEssays() {
    return [
      {
        id: uid("essay"),
        type: "归纳概括",
        source: "原创示例｜行政执法卷训练模板",
        prompt: "概括基层执法服务中存在的问题。",
        paragraph: "材料一第2段",
        sentence: "群众反映窗口多头跑、材料重复交、办理进度不透明。",
        keyword: "多头跑、重复交、不透明",
        reason: "三个词分别对应流程繁、材料重、信息不公开，是问题类答案的直接得分点。",
        answer: "办事流程不够集成，材料重复提交，办理进度公开不足。"
      },
      {
        id: uid("essay"),
        type: "提出对策",
        source: "原创示例｜行政执法卷训练模板",
        prompt: "就提升基层政务服务水平提出建议。",
        paragraph: "材料二第4段",
        sentence: "部分事项需跨部门核验，但系统尚未完全打通。",
        keyword: "跨部门核验、系统未打通",
        reason: "问题指向部门协同和数据共享不足，可反推对策。",
        answer: "推进跨部门数据共享和业务协同，打通高频事项核验链路，减少群众重复提交。"
      }
    ];
  }

  function seedKnowledge() {
    return [
      {
        id: uid("know"),
        date: today,
        title: "资料分析核心公式速查",
        section: "资料",
        fileName: "内置示例",
        summary: "增长率=增长量/基期量；增长量=现期量-基期量；基期量=现期量/(1+增长率)；比重=部分/整体；比重变化比较部分增长率与整体增长率；平均数=总量/份数。"
      }
    ];
  }
})();
