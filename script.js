(function () {
  const STORAGE_KEY = "weeklyPlannerState";
  const WEEK_LENGTH = 7;
  const MAX_TEXT_LENGTH = 255;
  const VALID_TIME_BLOCKS = ["morning", "afternoon", "evening"];
  const MOBILE_QUERY = "(max-width: 767px)";
  const DESKTOP_QUERY = "(min-width: 768px)";
  const MAX_DAY_SUMMARY_LENGTH = 150;
  const MOOD_OPTIONS = [
    { value: "joy", label: "Радость", emoji: "😀" },
    { value: "calm", label: "Спокойствие", emoji: "🙂" },
    { value: "neutral", label: "Нейтрально", emoji: "😐" },
    { value: "anxiety", label: "Тревога", emoji: "😟" },
    { value: "tired", label: "Усталость", emoji: "😫" },
    { value: "irritation", label: "Раздражение", emoji: "😡" },
  ];

  let appState = createEmptyState();
  let currentWeekStart = getStartOfWeek(new Date());
  let draggedTaskId = null;
  let activeMobileTab = "plan";
  let selectedMobileDayIndex = 0;
  let lastCheckedDateKey = formatDateKey(new Date());

  const dayTitleFormatter = new Intl.DateTimeFormat("ru-RU", {
    weekday: "long",
  });

  const dayDateFormatter = new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
  });

  const rangeFormatter = new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
  });

  const monthNameFormatter = new Intl.DateTimeFormat("ru-RU", {
    month: "long",
  });

  function createEmptyState() {
    return {
      monthGoals: [],
      tasks: [],
      dayMetrics: {},
    };
  }

  function createTask({
    text = "",
    status = "pending",
    date = null,
    timeBlock = "inbox",
    priority = "normal",
    category = "",
    deadline = null,
    isTransferred = false,
  } = {}) {
    return {
      id: createId(),
      text,
      status: normalizeStatus(status),
      date,
      timeBlock,
      priority: normalizePriority(priority),
      category,
      deadline,
      isTransferred,
    };
  }

  function createGoal(text) {
    return {
      id: createId(),
      text,
    };
  }

  function createId() {
    if (window.crypto?.randomUUID) {
      return window.crypto.randomUUID();
    }

    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function normalizeState(candidateState) {
    const baseState = createEmptyState();

    if (!candidateState || typeof candidateState !== "object") {
      return baseState;
    }

    return {
      monthGoals: Array.isArray(candidateState.monthGoals)
        ? candidateState.monthGoals.map(normalizeGoal)
        : baseState.monthGoals,
      tasks: Array.isArray(candidateState.tasks)
        ? candidateState.tasks.map(normalizeTask)
        : baseState.tasks,
      dayMetrics: normalizeDayMetrics(candidateState.dayMetrics),
    };
  }

  function normalizeDayMetrics(dayMetrics) {
    if (!dayMetrics || typeof dayMetrics !== "object") {
      return {};
    }

    return Object.entries(dayMetrics).reduce((metrics, [dateKey, metric]) => {
      metrics[dateKey] = normalizeDayMetric(metric);
      return metrics;
    }, {});
  }

  function normalizeDayMetric(metric) {
    const energy = Number(metric?.energy ?? 0);
    const stress = Number(metric?.stress ?? 0);
    const mood = MOOD_OPTIONS.some((option) => option.value === metric?.mood) ? metric.mood : "";
    const summary = String(metric?.summary || "").slice(0, MAX_DAY_SUMMARY_LENGTH);

    return {
      energy: clampMetricValue(energy),
      stress: clampMetricValue(stress),
      mood,
      summary,
    };
  }

  function normalizeGoal(goal) {
    if (typeof goal === "string") {
      return createGoal(goal);
    }

    return {
      id: goal?.id || createId(),
      text: goal?.text || "",
    };
  }

  function normalizeTask(task) {
    const timeBlock = task?.timeBlock === "day" ? "afternoon" : task?.timeBlock;
    const date = task?.date || null;

    return {
      id: task?.id || createId(),
      text: task?.text || "",
      status: normalizeStatus(task?.status),
      date,
      timeBlock: date ? normalizeTimeBlock(timeBlock) : "inbox",
      priority: normalizePriority(task?.priority),
      category: task?.category || "",
      deadline: task?.deadline || null,
      isTransferred: Boolean(task?.isTransferred),
    };
  }

  function saveState() {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(appState));
  }

  function loadState() {
    const savedState = window.localStorage.getItem(STORAGE_KEY);

    if (!savedState) {
      appState = createEmptyState();
      exposeState();
      saveState();
      return appState;
    }

    try {
      appState = normalizeState(JSON.parse(savedState));
    } catch (error) {
      console.warn("Не удалось прочитать состояние из LocalStorage. Создана пустая структура.", error);
      appState = createEmptyState();
      saveState();
    }

    exposeState();
    return appState;
  }

  function exposeState() {
    window.appState = appState;
  }

  function getStartOfWeek(date) {
    const normalizedDate = new Date(date);
    normalizedDate.setHours(0, 0, 0, 0);

    const dayOfWeek = normalizedDate.getDay();
    const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;

    normalizedDate.setDate(normalizedDate.getDate() + diffToMonday);
    return normalizedDate;
  }

  function getWeekDates(weekStart) {
    return Array.from({ length: WEEK_LENGTH }, (_, index) => {
      const date = new Date(weekStart);
      date.setDate(weekStart.getDate() + index);
      return date;
    });
  }

  function addDays(date, daysCount) {
    const nextDate = new Date(date);
    nextDate.setDate(nextDate.getDate() + daysCount);
    return nextDate;
  }

  function formatDateKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
  }

  function capitalize(text) {
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  function isDesktopViewport() {
    return window.matchMedia(DESKTOP_QUERY).matches;
  }

  function isMobileViewport() {
    return window.matchMedia(MOBILE_QUERY).matches;
  }

  function normalizeTaskText(text) {
    const trimmedText = text.trim();

    if (trimmedText.length <= MAX_TEXT_LENGTH) {
      return {
        text: trimmedText,
        wasTrimmed: false,
      };
    }

    return {
      text: trimmedText.slice(0, MAX_TEXT_LENGTH),
      wasTrimmed: true,
    };
  }

  function getSelectedTimeBlock(rawTimeBlock) {
    if (VALID_TIME_BLOCKS.includes(rawTimeBlock)) {
      return rawTimeBlock;
    }

    return "morning";
  }

  function normalizeTimeBlock(rawTimeBlock) {
    if (rawTimeBlock === "inbox") {
      return "inbox";
    }

    return getSelectedTimeBlock(rawTimeBlock);
  }

  function normalizeStatus(rawStatus) {
    if (rawStatus === "completed") {
      return "completed";
    }

    return "pending";
  }

  function normalizePriority(rawPriority) {
    if (rawPriority === "high" || rawPriority === true) {
      return "high";
    }

    return "normal";
  }

  function clampMetricValue(value) {
    if (!Number.isFinite(value)) {
      return 0;
    }

    return Math.min(7, Math.max(0, Math.round(value)));
  }

  function getProgressForDate(date) {
    const dateKey = formatDateKey(date);
    const dayTasks = getTasksForDate(dateKey);

    if (!dayTasks.length) {
      return "0%";
    }

    const completedTasks = dayTasks.filter((task) => task.status === "completed");
    const progress = Math.round((completedTasks.length / dayTasks.length) * 100);

    return `${progress}%`;
  }

  function getTasksForDate(dateKey) {
    return appState.tasks.filter(
      (task) => task.date === dateKey && VALID_TIME_BLOCKS.includes(task.timeBlock),
    );
  }

  function getCurrentWeekDateKeys() {
    return getWeekDates(currentWeekStart).map(formatDateKey);
  }

  function getPendingTasksForCurrentWeek() {
    const weekDateKeys = new Set(getCurrentWeekDateKeys());

    return appState.tasks.filter(
      (task) => task.status === "pending" && task.date && weekDateKeys.has(task.date),
    );
  }

  function renderWeekHeaders() {
    const weekDates = getWeekDates(currentWeekStart);
    const dayColumns = document.querySelectorAll("[data-day-index]");

    dayColumns.forEach((column, index) => {
      const date = weekDates[index];
      const titleElement = column.querySelector("[data-day-title]");
      const dateElement = column.querySelector("[data-day-date]");
      const progressElement = column.querySelector("[data-day-progress]");

      column.dataset.date = formatDateKey(date);
      column.classList.toggle("today", formatDateKey(date) === formatDateKey(new Date()));
      column.classList.toggle("weekend", index >= 5);

      if (titleElement) {
        titleElement.textContent = `${capitalize(dayTitleFormatter.format(date))},`;
      }

      if (dateElement) {
        dateElement.textContent = dayDateFormatter.format(date);
      }

      if (progressElement) {
        progressElement.textContent = getProgressForDate(date);
      }
    });

    renderWeekRange(weekDates);
  }

  function renderWeekRange(weekDates) {
    const rangeElement = document.querySelector("#week-range");

    if (!rangeElement) {
      return;
    }

    const firstDate = weekDates[0];
    const lastDate = weekDates[weekDates.length - 1];

    rangeElement.textContent = `${rangeFormatter.format(firstDate)} - ${rangeFormatter.format(lastDate)}`;
  }

  function renderMobileDaySlider() {
    const plannerPanel = document.querySelector(".planner-panel");
    const weekGrid = document.querySelector("#week-grid");

    if (!plannerPanel || !weekGrid) {
      return;
    }

    let slider = plannerPanel.querySelector(".mobile-day-slider");

    if (!slider) {
      slider = document.createElement("nav");
      slider.className = "mobile-day-slider";
      slider.setAttribute("aria-label", "Выбор дня недели");
      plannerPanel.insertBefore(slider, weekGrid);
    }

    const weekDates = getWeekDates(currentWeekStart);
    slider.textContent = "";

    weekDates.forEach((date, index) => {
      const button = document.createElement("button");

      button.type = "button";
      button.dataset.mobileDayIndex = String(index);
      button.className = index === selectedMobileDayIndex ? "active" : "";
      button.textContent = `${capitalize(dayTitleFormatter.format(date)).slice(0, 2)} ${date.getDate()}`;
      button.setAttribute("aria-label", `${capitalize(dayTitleFormatter.format(date))}, ${dayDateFormatter.format(date)}`);
      button.addEventListener("click", () => {
        selectedMobileDayIndex = index;
        renderMobileDaySlider();
        updateMobileDayVisibility();
      });

      slider.append(button);
    });

    updateMobileDayVisibility();
  }

  function updateMobileDayVisibility() {
    document.querySelectorAll("[data-day-index]").forEach((column) => {
      column.classList.toggle(
        "mobile-active-day",
        Number(column.dataset.dayIndex) === selectedMobileDayIndex,
      );
    });
  }

  function setDefaultMobileDayForCurrentWeek() {
    const todayKey = formatDateKey(new Date());
    const weekDates = getWeekDates(currentWeekStart).map(formatDateKey);
    const todayIndex = weekDates.indexOf(todayKey);

    selectedMobileDayIndex = todayIndex >= 0 ? todayIndex : 0;
  }

  function renderMonthGoals() {
    const goalsList = document.querySelector("#month-goals-list");
    const goalsCount = document.querySelector("#goals-count");

    if (!goalsList) {
      return;
    }

    goalsList.textContent = "";

    appState.monthGoals.forEach((goal) => {
      const goalItem = document.createElement("li");
      const goalDot = document.createElement("span");
      const goalText = document.createElement("span");
      const deleteButton = document.createElement("button");

      goalDot.className = "goal-dot";
      goalText.textContent = goal.text;
      deleteButton.type = "button";
      deleteButton.textContent = "×";
      deleteButton.setAttribute("aria-label", `Удалить цель: ${goal.text}`);
      deleteButton.addEventListener("click", () => deleteMonthGoal(goal.id));

      goalItem.append(goalDot, goalText, deleteButton);
      goalsList.append(goalItem);
    });

    if (goalsCount) {
      goalsCount.textContent = String(appState.monthGoals.length);
    }
  }

  function renderInboxTasks() {
    const inboxList = document.querySelector("#inbox-list");
    const inboxCount = document.querySelector("#inbox-count");
    const clearInboxButton = document.querySelector("#clear-inbox-button");

    if (!inboxList) {
      return;
    }

    const inboxTasks = appState.tasks.filter((task) => task.timeBlock === "inbox");
    inboxList.textContent = "";

    inboxTasks.forEach((task) => {
      inboxList.append(createTaskCard(task, "inbox-card"));
    });

    if (inboxCount) {
      inboxCount.textContent = String(inboxTasks.length);
    }

    if (clearInboxButton) {
      clearInboxButton.disabled = inboxTasks.length === 0;
    }
  }

  function renderWeekTasks() {
    const dayColumns = document.querySelectorAll("[data-day-index]");

    dayColumns.forEach((column) => {
      const date = column.dataset.date;
      const taskLists = column.querySelectorAll(".task-list");

      taskLists.forEach((taskList) => {
        taskList.textContent = "";
      });

      getTasksForDate(date).forEach((task) => {
        const timeBlock = column.querySelector(`[data-time-block="${task.timeBlock}"] .task-list`);

        if (!timeBlock) {
          return;
        }

        timeBlock.append(createTaskCard(task, "task-item"));
      });
    });
  }

  function renderDayMetricForms() {
    document.querySelectorAll("[data-day-index]").forEach((column) => {
      const dateKey = column.dataset.date;
      const moodSlot = column.querySelector(".mood-slot");

      if (!dateKey || !moodSlot) {
        return;
      }

      const metric = normalizeDayMetric(appState.dayMetrics[dateKey]);
      moodSlot.textContent = "";
      moodSlot.append(createDayMetricForm(dateKey, metric));
    });
  }

  function createDayMetricForm(dateKey, metric) {
    const form = document.createElement("form");
    form.className = "day-metric-form";
    form.dataset.metricDate = dateKey;

    form.innerHTML = `
      <label>
        <span>Энергия</span>
        <input name="energy" type="number" min="0" max="7" value="${metric.energy}" aria-label="Энергия от 0 до 7">
      </label>
      <label>
        <span>Стресс</span>
        <input name="stress" type="number" min="0" max="7" value="${metric.stress}" aria-label="Стресс от 0 до 7">
      </label>
      <label>
        <span>Настроение</span>
        <select name="mood" aria-label="Настроение дня">
          <option value="">Нет данных</option>
          ${MOOD_OPTIONS.map((option) => `
            <option value="${option.value}" ${option.value === metric.mood ? "selected" : ""}>
              ${option.emoji} ${option.label}
            </option>
          `).join("")}
        </select>
      </label>
      <label>
        <span>Итог</span>
        <input name="summary" type="text" maxlength="${MAX_DAY_SUMMARY_LENGTH}" value="${escapeAttribute(metric.summary)}" placeholder="Короткий итог дня">
      </label>
    `;

    return form;
  }

  function escapeAttribute(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("\"", "&quot;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
  }

  function createTaskCard(task, baseClassName) {
    const taskItem = document.createElement("li");
    const taskCheck = document.createElement("button");
    const taskContent = document.createElement("div");
    const taskTitleRow = document.createElement("div");
    const taskText = document.createElement("p");
    const classes = [baseClassName];

    if (task.priority === "high") {
      classes.push("high", "task-priority-high");
    }

    if (task.status === "completed") {
      classes.push("completed");
    }

    taskItem.className = classes.join(" ");
    taskItem.dataset.taskId = task.id;
    taskItem.draggable = isDesktopViewport();
    taskCheck.type = "button";
    taskCheck.className = "task-check task-toggle";
    taskCheck.setAttribute("aria-label", getTaskToggleLabel(task));
    taskCheck.setAttribute("aria-pressed", String(task.status === "completed"));
    taskText.textContent = task.text;

    taskTitleRow.className = "task-title-row";

    if (task.isTransferred) {
      const transferIcon = document.createElement("span");
      transferIcon.className = "transfer-icon";
      transferIcon.textContent = "↗";
      transferIcon.setAttribute("aria-label", "Перенесенная задача");
      taskTitleRow.append(transferIcon);
    }

    taskTitleRow.append(taskText);
    taskContent.append(taskTitleRow);

    if (task.category) {
      const categoryTag = document.createElement("span");
      categoryTag.className = "task-category";
      categoryTag.textContent = task.category;
      taskContent.append(categoryTag);
    }

    if (task.priority === "high") {
      const priorityMarker = document.createElement("span");
      priorityMarker.className = "priority-marker";
      priorityMarker.textContent = "Высокий приоритет";
      taskContent.append(priorityMarker);
    }

    taskItem.append(taskCheck, taskContent);
    return taskItem;
  }

  function getTaskToggleLabel(task) {
    return task.status === "completed"
      ? `Вернуть задачу в работу: ${task.text}`
      : `Отметить задачу выполненной: ${task.text}`;
  }

  function renderApp() {
    renderWeekHeaders();
    renderMonthGoals();
    renderInboxTasks();
    renderWeekTasks();
    renderDayMetricForms();
    renderMobileDaySlider();
    updateTransferWeekButton();
    applyMobileTab(activeMobileTab);
    renderEmotionStatsViews();
  }

  function updateTransferWeekButton() {
    const transferButton = document.querySelector("#transfer-week-button");

    if (!transferButton) {
      return;
    }

    const pendingCount = getPendingTasksForCurrentWeek().length;
    transferButton.disabled = pendingCount === 0;
    transferButton.textContent =
      pendingCount > 0
        ? `Перенести невыполненные задачи на следующую неделю (${pendingCount})`
        : "Перенести невыполненные задачи на следующую неделю";
  }

  function addMonthGoal(text) {
    const normalizedText = text.trim().slice(0, MAX_TEXT_LENGTH);

    if (!normalizedText) {
      return;
    }

    appState.monthGoals.push(createGoal(normalizedText));
    exposeState();
    saveState();
    renderMonthGoals();
  }

  function deleteMonthGoal(goalId) {
    appState.monthGoals = appState.monthGoals.filter((goal) => goal.id !== goalId);
    exposeState();
    saveState();
    renderMonthGoals();
  }

  function clearInboxTasks() {
    appState.tasks = appState.tasks.filter((task) => task.timeBlock !== "inbox");
    exposeState();
    saveState();
    renderApp();
  }

  function toggleTaskStatus(taskId) {
    const task = appState.tasks.find((currentTask) => currentTask.id === taskId);

    if (!task) {
      return;
    }

    task.status = task.status === "completed" ? "pending" : "completed";
    exposeState();
    saveState();
    renderApp();
  }

  function moveTask(taskId, target) {
    const task = appState.tasks.find((currentTask) => currentTask.id === taskId);

    if (!task) {
      return;
    }

    task.date = target.date;
    task.timeBlock = target.timeBlock;
    exposeState();
    saveState();
    renderApp();
  }

  function autoTransferOverdueTasks() {
    const todayKey = formatDateKey(new Date());
    let hasTransferredTasks = false;

    appState.tasks.forEach((task) => {
      if (task.status === "pending" && task.date && task.date < todayKey) {
        task.date = todayKey;
        task.isTransferred = true;
        hasTransferredTasks = true;
      }
    });

    lastCheckedDateKey = todayKey;

    if (!hasTransferredTasks) {
      return;
    }

    if (!getCurrentWeekDateKeys().includes(todayKey)) {
      currentWeekStart = getStartOfWeek(new Date());
      setDefaultMobileDayForCurrentWeek();
    }
    exposeState();
    saveState();
    renderApp();
  }

  function startDateChangeWatcher() {
    autoTransferOverdueTasks();

    window.setInterval(() => {
      const todayKey = formatDateKey(new Date());

      if (todayKey !== lastCheckedDateKey) {
        autoTransferOverdueTasks();
      }
    }, 60 * 1000);
  }

  function transferPendingTasksToNextWeek() {
    const pendingTasks = getPendingTasksForCurrentWeek();

    if (!pendingTasks.length) {
      updateTransferWeekButton();
      return;
    }

    const nextWeekMonday = addDays(currentWeekStart, WEEK_LENGTH);
    const nextWeekMondayKey = formatDateKey(nextWeekMonday);

    pendingTasks.forEach((task) => {
      task.date = nextWeekMondayKey;
      task.timeBlock = "morning";
      task.isTransferred = true;
    });

    currentWeekStart = nextWeekMonday;
    selectedMobileDayIndex = 0;
    exposeState();
    saveState();
    renderApp();
    logCurrentWeekRange();
  }

  function getDropTargetData(element) {
    const timeBlock = element.closest("[data-time-block]");

    if (timeBlock) {
      const dayColumn = timeBlock.closest("[data-day-index]");

      if (!dayColumn?.dataset.date) {
        return null;
      }

      return {
        date: dayColumn.dataset.date,
        timeBlock: normalizeTimeBlock(timeBlock.dataset.timeBlock),
      };
    }

    if (element.closest(".inbox-panel") || element.closest("#inbox-list")) {
      return {
        date: null,
        timeBlock: "inbox",
      };
    }

    return null;
  }

  function bindDesktopDragAndDrop() {
    document.addEventListener("dragstart", (event) => {
      const taskCard = event.target.closest("[data-task-id]");

      if (!taskCard || !isDesktopViewport()) {
        event.preventDefault();
        return;
      }

      draggedTaskId = taskCard.dataset.taskId;
      taskCard.classList.add("dragging");
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", draggedTaskId);
    });

    document.addEventListener("dragend", (event) => {
      const taskCard = event.target.closest("[data-task-id]");

      taskCard?.classList.remove("dragging");
      draggedTaskId = null;
      clearDropZoneHighlights();
    });

    document.addEventListener("dragover", (event) => {
      const target = getDropTargetData(event.target);

      if (!target || !isDesktopViewport()) {
        return;
      }

      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      setDropZoneHighlight(event.target, true);
    });

    document.addEventListener("dragleave", (event) => {
      setDropZoneHighlight(event.target, false);
    });

    document.addEventListener("drop", (event) => {
      const target = getDropTargetData(event.target);

      if (!target || !isDesktopViewport()) {
        return;
      }

      event.preventDefault();

      const taskId = event.dataTransfer.getData("text/plain") || draggedTaskId;
      clearDropZoneHighlights();

      if (taskId) {
        moveTask(taskId, target);
      }
    });
  }

  function setDropZoneHighlight(element, shouldHighlight) {
    const dropZone = element.closest("[data-time-block], .inbox-panel");

    if (!dropZone) {
      return;
    }

    dropZone.classList.toggle("drop-zone-active", shouldHighlight);
  }

  function clearDropZoneHighlights() {
    document.querySelectorAll(".drop-zone-active").forEach((element) => {
      element.classList.remove("drop-zone-active");
    });
  }

  function addTaskFromQuickAdd(form) {
    const textInput = form.querySelector("#task-title");
    const dateInput = form.querySelector("#task-date");
    const timeSelect = form.querySelector("#task-time");
    const priorityInput = form.querySelector("#task-priority");
    const categoryInput = form.querySelector("#task-project");
    const warningElement = form.querySelector("#task-title-warning");
    const normalizedText = normalizeTaskText(textInput.value);

    hideTaskWarning(warningElement);

    if (!normalizedText.text) {
      showTaskWarning(warningElement, "Введите текст задачи.");
      textInput.focus();
      return;
    }

    if (normalizedText.wasTrimmed) {
      textInput.value = normalizedText.text;
      showTaskWarning(warningElement, `Текст задачи был обрезан до ${MAX_TEXT_LENGTH} символов.`);
    }

    const selectedDate = dateInput.value || null;
    const task = createTask({
      text: normalizedText.text,
      date: selectedDate,
      timeBlock: selectedDate ? getSelectedTimeBlock(timeSelect.value) : "inbox",
      priority: priorityInput.checked ? "high" : "normal",
      category: categoryInput.value.trim(),
    });

    appState.tasks.push(task);
    exposeState();
    saveState();
    renderApp();

    form.reset();

    if (normalizedText.wasTrimmed) {
      textInput.value = "";
      showTaskWarning(warningElement, `Текст задачи был обрезан до ${MAX_TEXT_LENGTH} символов и сохранен.`);
    }
  }

  function showTaskWarning(warningElement, message) {
    if (!warningElement) {
      return;
    }

    warningElement.textContent = message;
    warningElement.hidden = false;
  }

  function hideTaskWarning(warningElement) {
    if (!warningElement) {
      return;
    }

    warningElement.textContent = "";
    warningElement.hidden = true;
  }

  function logCurrentWeekRange() {
    const weekDates = getWeekDates(currentWeekStart);
    const firstDate = formatDateKey(weekDates[0]);
    const lastDate = formatDateKey(weekDates[weekDates.length - 1]);

    console.log(`Текущая просматриваемая неделя: ${firstDate} - ${lastDate}`);
  }

  function shiftWeek(direction) {
    currentWeekStart = addDays(currentWeekStart, direction * WEEK_LENGTH);
    setDefaultMobileDayForCurrentWeek();
    renderApp();
    logCurrentWeekRange();
  }

  function bindWeekNavigation() {
    const prevWeekButton = document.querySelector("#prev-week");
    const nextWeekButton = document.querySelector("#next-week");

    prevWeekButton?.addEventListener("click", () => shiftWeek(-1));
    nextWeekButton?.addEventListener("click", () => shiftWeek(1));
  }

  function bindTransferWeekButton() {
    const transferButton = document.querySelector("#transfer-week-button");

    transferButton?.addEventListener("click", transferPendingTasksToNextWeek);
  }

  function bindQuickAdd() {
    const quickAddForm = document.querySelector(".quick-add");

    quickAddForm?.addEventListener("submit", (event) => {
      event.preventDefault();
      addTaskFromQuickAdd(quickAddForm);
    });
  }

  function bindMonthGoals() {
    const goalForm = document.querySelector("#month-goal-form");
    const goalInput = document.querySelector("#month-goal-input");

    goalForm?.addEventListener("submit", (event) => {
      event.preventDefault();
      addMonthGoal(goalInput.value);
      goalForm.reset();
    });
  }

  function bindClearInbox() {
    const clearInboxButton = document.querySelector("#clear-inbox-button");

    clearInboxButton?.addEventListener("click", clearInboxTasks);
  }

  function bindDayMetricForms() {
    document.addEventListener("input", (event) => {
      const form = event.target.closest(".day-metric-form");

      if (!form) {
        return;
      }

      saveDayMetricForm(form);
    });

    document.addEventListener("change", (event) => {
      const form = event.target.closest(".day-metric-form");

      if (!form) {
        return;
      }

      saveDayMetricForm(form);
    });
  }

  function saveDayMetricForm(form) {
    const dateKey = form.dataset.metricDate;

    if (!dateKey) {
      return;
    }

    const summaryInput = form.elements.summary;
    const summary = String(summaryInput.value || "").slice(0, MAX_DAY_SUMMARY_LENGTH);

    if (summaryInput.value !== summary) {
      summaryInput.value = summary;
    }

    appState.dayMetrics[dateKey] = {
      energy: clampMetricValue(Number(form.elements.energy.value)),
      stress: clampMetricValue(Number(form.elements.stress.value)),
      mood: MOOD_OPTIONS.some((option) => option.value === form.elements.mood.value)
        ? form.elements.mood.value
        : "",
      summary,
    };

    exposeState();
    saveState();
    renderEmotionStatsViews();
  }

  function applyMobileTab(tabName) {
    activeMobileTab = tabName;
    document.body.dataset.mobileTab = tabName;

    document.querySelectorAll("[data-mobile-tab]").forEach((button) => {
      button.classList.toggle("active", button.dataset.mobileTab === tabName);
    });
  }

  function bindMobileTabs() {
    document.querySelectorAll("[data-mobile-tab]").forEach((button) => {
      button.addEventListener("click", () => {
        applyMobileTab(button.dataset.mobileTab);
        renderEmotionStatsViews();
      });
    });
  }

  function bindEmotionStats() {
    const statsButton = document.querySelector("#emotion-stats-button");

    statsButton?.addEventListener("click", openEmotionStats);
  }

  function bindMobileTaskMenu() {
    document.addEventListener("touchstart", (event) => {
      const taskCard = event.target.closest("[data-task-id]");

      if (taskCard && isMobileViewport()) {
        taskCard.draggable = false;
      }
    }, { passive: true });

    document.addEventListener("touchmove", (event) => {
      const taskCard = event.target.closest("[data-task-id]");

      if (taskCard && isMobileViewport()) {
        taskCard.draggable = false;
      }
    }, { passive: true });

    document.addEventListener("click", (event) => {
      const taskCard = event.target.closest("[data-task-id]");

      if (
        !taskCard ||
        !isMobileViewport() ||
        event.target.closest(".task-toggle") ||
        event.target.closest(".task-move-modal")
      ) {
        return;
      }

      openTaskMoveModal(taskCard.dataset.taskId);
    });
  }

  function openTaskMoveModal(taskId) {
    const task = appState.tasks.find((currentTask) => currentTask.id === taskId);

    if (!task) {
      return;
    }

    const modal = ensureTaskMoveModal();
    const form = modal.querySelector("#task-move-form");
    const targetSelect = modal.querySelector("#task-move-target");
    const timeSelect = modal.querySelector("#task-move-time");
    const title = modal.querySelector("#task-move-title");

    modal.dataset.taskId = taskId;
    title.textContent = task.text;
    renderMoveTargetOptions(targetSelect, task);
    timeSelect.value = VALID_TIME_BLOCKS.includes(task.timeBlock) ? task.timeBlock : "morning";
    timeSelect.disabled = task.timeBlock === "inbox";
    modal.hidden = false;
    targetSelect.focus();

    form.onsubmit = (event) => {
      event.preventDefault();
      const targetValue = targetSelect.value;
      const target =
        targetValue === "inbox"
          ? { date: null, timeBlock: "inbox" }
          : { date: targetValue, timeBlock: getSelectedTimeBlock(timeSelect.value) };

      moveTask(taskId, target);
      closeTaskMoveModal();
    };

    targetSelect.onchange = () => {
      timeSelect.disabled = targetSelect.value === "inbox";
    };
  }

  function ensureTaskMoveModal() {
    let modal = document.querySelector(".task-move-modal");

    if (modal) {
      return modal;
    }

    modal = document.createElement("div");
    modal.className = "task-move-modal";
    modal.hidden = true;
    modal.innerHTML = `
      <div class="task-move-dialog" role="dialog" aria-modal="true" aria-labelledby="task-move-heading">
        <div class="task-move-header">
          <div>
            <h2 id="task-move-heading">Переместить задачу</h2>
            <p id="task-move-title"></p>
          </div>
          <button class="task-move-close" type="button" aria-label="Закрыть">×</button>
        </div>
        <form id="task-move-form" class="task-move-form">
          <label for="task-move-target">Куда переместить</label>
          <select id="task-move-target"></select>
          <label for="task-move-time">Блок времени</label>
          <select id="task-move-time">
            <option value="morning">Утро</option>
            <option value="afternoon">День</option>
            <option value="evening">Вечер</option>
          </select>
          <button class="primary-button" type="submit">Переместить</button>
        </form>
      </div>
    `;

    modal.addEventListener("click", (event) => {
      if (event.target === modal || event.target.closest(".task-move-close")) {
        closeTaskMoveModal();
      }
    });

    document.body.append(modal);
    return modal;
  }

  function renderMoveTargetOptions(select, task) {
    const weekDates = getWeekDates(currentWeekStart);

    select.textContent = "";
    select.append(new Option("Входящие", "inbox", task.timeBlock === "inbox", task.timeBlock === "inbox"));

    weekDates.forEach((date) => {
      const dateKey = formatDateKey(date);
      const label = `${capitalize(dayTitleFormatter.format(date))}, ${dayDateFormatter.format(date)}`;
      select.append(new Option(label, dateKey, task.date === dateKey, task.date === dateKey));
    });
  }

  function openEmotionStats() {
    if (isMobileViewport()) {
      applyMobileTab("stats");
      renderEmotionStatsViews();
      return;
    }

    const modal = ensureEmotionStatsModal();
    renderEmotionStats(modal.querySelector(".emotion-stats-content"));
    modal.hidden = false;
  }

  function ensureEmotionStatsModal() {
    let modal = document.querySelector(".emotion-stats-modal");

    if (modal) {
      return modal;
    }

    modal = document.createElement("div");
    modal.className = "emotion-stats-modal";
    modal.hidden = true;
    modal.innerHTML = `
      <div class="emotion-stats-dialog" role="dialog" aria-modal="true" aria-labelledby="emotion-stats-heading">
        <div class="emotion-stats-header">
          <div>
            <h2 id="emotion-stats-heading">Статистика эмоций</h2>
            <p>Годовая матрица настроения</p>
          </div>
          <button class="emotion-stats-close" type="button" aria-label="Закрыть">×</button>
        </div>
        <div class="emotion-stats-content"></div>
      </div>
    `;

    modal.addEventListener("click", (event) => {
      if (event.target === modal || event.target.closest(".emotion-stats-close")) {
        modal.hidden = true;
      }
    });

    document.body.append(modal);
    return modal;
  }

  function renderEmotionStatsViews() {
    const mobileStatsPanel = document.querySelector(".mobile-stats-panel");

    if (mobileStatsPanel) {
      let content = mobileStatsPanel.querySelector(".emotion-stats-content");

      if (!content) {
        content = document.createElement("div");
        content.className = "emotion-stats-content";
        mobileStatsPanel.append(content);
      }

      renderEmotionStats(content);
    }

    const openedModalContent = document.querySelector(".emotion-stats-modal:not([hidden]) .emotion-stats-content");

    if (openedModalContent) {
      renderEmotionStats(openedModalContent);
    }
  }

  function renderEmotionStats(container) {
    if (!container) {
      return;
    }

    const year = new Date().getFullYear();
    container.textContent = "";

    const statsTable = document.createElement("div");
    const header = document.createElement("div");
    const matrix = document.createElement("div");

    statsTable.className = "emotion-stats-table";
    header.className = "emotion-days-header";
    matrix.className = "emotion-matrix";

    header.append(createMonthLabelCell(""));

    for (let dayNumber = 1; dayNumber <= 31; dayNumber += 1) {
      const dayCell = document.createElement("span");
      dayCell.className = "emotion-day-number";
      dayCell.textContent = String(dayNumber);
      header.append(dayCell);
    }

    for (let monthIndex = 0; monthIndex < 12; monthIndex += 1) {
      const row = document.createElement("div");
      const daysInMonth = getDaysInMonth(year, monthIndex);

      row.className = "emotion-month-row";
      row.append(createMonthLabelCell(capitalize(monthNameFormatter.format(new Date(year, monthIndex, 1)))));

      for (let dayNumber = 1; dayNumber <= 31; dayNumber += 1) {
        row.append(
          dayNumber <= daysInMonth
            ? createEmotionCell(new Date(year, monthIndex, dayNumber))
            : createEmotionCell(null),
        );
      }

      matrix.append(row);
    }

    statsTable.append(header, matrix);
    container.append(statsTable);
  }

  function createMonthLabelCell(label) {
    const cell = document.createElement("span");
    cell.className = "emotion-month-label";
    cell.textContent = label;
    return cell;
  }

  function getDaysInMonth(year, monthIndex) {
    return new Date(year, monthIndex + 1, 0).getDate();
  }

  function createEmotionCell(date) {
    const cell = document.createElement("span");

    if (!date) {
      cell.className = "emotion-cell empty";
      return cell;
    }

    const dateKey = formatDateKey(date);
    const metric = appState.dayMetrics[dateKey];
    const mood = MOOD_OPTIONS.find((option) => option.value === metric?.mood);

    cell.className = mood ? "emotion-cell has-mood" : "emotion-cell no-data";
    cell.title = mood
      ? `${dateKey}: ${mood.label}`
      : `${dateKey}: нет данных`;
    cell.textContent = mood ? mood.emoji : "";

    return cell;
  }

  function closeTaskMoveModal() {
    const modal = document.querySelector(".task-move-modal");

    if (modal) {
      modal.hidden = true;
      delete modal.dataset.taskId;
    }
  }

  function bindTaskToggles() {
    document.addEventListener("click", (event) => {
      const toggleButton = event.target.closest(".task-toggle");

      if (!toggleButton) {
        return;
      }

      const taskCard = toggleButton.closest("[data-task-id]");

      if (!taskCard) {
        return;
      }

      toggleTaskStatus(taskCard.dataset.taskId);
    });
  }

  function bindViewportUpdates() {
    window.addEventListener("resize", () => {
      renderApp();

      if (!isMobileViewport()) {
        closeTaskMoveModal();
      }
    });
  }

  function initApp() {
    loadState();
    setDefaultMobileDayForCurrentWeek();
    bindWeekNavigation();
    bindTransferWeekButton();
    bindQuickAdd();
    bindMonthGoals();
    bindClearInbox();
    bindDesktopDragAndDrop();
    bindTaskToggles();
    bindMobileTabs();
    bindEmotionStats();
    bindMobileTaskMenu();
    bindDayMetricForms();
    bindViewportUpdates();
    startDateChangeWatcher();
    renderApp();
    logCurrentWeekRange();
  }

  window.saveState = saveState;
  window.loadState = loadState;
  window.createTask = createTask;
  window.addMonthGoal = addMonthGoal;
  window.deleteMonthGoal = deleteMonthGoal;
  window.clearInboxTasks = clearInboxTasks;
  window.toggleTaskStatus = toggleTaskStatus;
  window.moveTask = moveTask;

  document.addEventListener("DOMContentLoaded", initApp);
})();
