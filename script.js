(function () {
  const STORAGE_KEY = "weeklyPlannerState";
  const WEEK_LENGTH = 7;
  const MAX_TEXT_LENGTH = 255;
  const VALID_TIME_BLOCKS = ["morning", "afternoon", "evening"];

  let appState = createEmptyState();
  let currentWeekStart = getStartOfWeek(new Date());

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

  function createEmptyState() {
    return {
      monthGoals: [],
      tasks: [],
      dayMetrics: {},
    };
  }

  function createTask({
    text = "",
    status = "active",
    date = null,
    timeBlock = "inbox",
    priority = false,
    category = "",
    deadline = null,
    isTransferred = false,
  } = {}) {
    return {
      id: createId(),
      text,
      status,
      date,
      timeBlock,
      priority,
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
      dayMetrics:
        candidateState.dayMetrics && typeof candidateState.dayMetrics === "object"
          ? candidateState.dayMetrics
          : baseState.dayMetrics,
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
      status: task?.status || "active",
      date,
      timeBlock: date ? normalizeTimeBlock(timeBlock) : "inbox",
      priority: Boolean(task?.priority),
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

  function getProgressForDate(date) {
    const dateKey = formatDateKey(date);
    const metric = appState.dayMetrics[dateKey];

    if (typeof metric === "number") {
      return `${metric}%`;
    }

    if (metric && typeof metric.progress === "number") {
      return `${metric.progress}%`;
    }

    return "0%";
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

    if (!inboxList) {
      return;
    }

    const inboxTasks = appState.tasks.filter((task) => task.timeBlock === "inbox");
    inboxList.textContent = "";

    inboxTasks.forEach((task) => {
      const taskCard = document.createElement("li");
      const taskCheck = document.createElement("span");
      const taskContent = document.createElement("div");
      const taskText = document.createElement("p");

      taskCard.className = task.priority ? "inbox-card high" : "inbox-card";
      taskCheck.className = "task-check";
      taskCheck.setAttribute("aria-hidden", "true");
      taskText.textContent = task.text;

      taskContent.append(taskText);

      if (task.category) {
        const categoryTag = document.createElement("span");
        categoryTag.textContent = task.category;
        taskContent.append(categoryTag);
      }

      if (task.priority) {
        const priorityMarker = document.createElement("span");
        priorityMarker.className = "priority-marker";
        priorityMarker.textContent = "Высокий приоритет";
        taskContent.append(priorityMarker);
      }

      taskCard.append(taskCheck, taskContent);
      inboxList.append(taskCard);
    });

    if (inboxCount) {
      inboxCount.textContent = String(inboxTasks.length);
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

      appState.tasks
        .filter((task) => task.date === date && VALID_TIME_BLOCKS.includes(task.timeBlock))
        .forEach((task) => {
          const timeBlock = column.querySelector(`[data-time-block="${task.timeBlock}"] .task-list`);

          if (!timeBlock) {
            return;
          }

          timeBlock.append(createTaskListItem(task));
        });
    });
  }

  function createTaskListItem(task) {
    const taskItem = document.createElement("li");
    const taskCheck = document.createElement("span");
    const taskContent = document.createElement("div");
    const taskText = document.createElement("p");

    taskItem.className = task.priority ? "task-item high" : "task-item";
    taskCheck.className = "task-check";
    taskCheck.setAttribute("aria-hidden", "true");
    taskText.textContent = task.text;

    taskContent.append(taskText);

    if (task.category) {
      const categoryTag = document.createElement("span");
      categoryTag.textContent = task.category;
      taskContent.append(categoryTag);
    }

    if (task.priority) {
      const priorityMarker = document.createElement("span");
      priorityMarker.className = "priority-marker";
      priorityMarker.textContent = "Высокий приоритет";
      taskContent.append(priorityMarker);
    }

    taskItem.append(taskCheck, taskContent);
    return taskItem;
  }

  function renderApp() {
    renderWeekHeaders();
    renderMonthGoals();
    renderInboxTasks();
    renderWeekTasks();
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
      priority: Boolean(priorityInput.checked),
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
    renderWeekHeaders();
    renderWeekTasks();
    logCurrentWeekRange();
  }

  function bindWeekNavigation() {
    const prevWeekButton = document.querySelector("#prev-week");
    const nextWeekButton = document.querySelector("#next-week");

    prevWeekButton?.addEventListener("click", () => shiftWeek(-1));
    nextWeekButton?.addEventListener("click", () => shiftWeek(1));
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

  function initApp() {
    loadState();
    bindWeekNavigation();
    bindQuickAdd();
    bindMonthGoals();
    renderApp();
    logCurrentWeekRange();
  }

  window.saveState = saveState;
  window.loadState = loadState;
  window.createTask = createTask;
  window.addMonthGoal = addMonthGoal;
  window.deleteMonthGoal = deleteMonthGoal;

  document.addEventListener("DOMContentLoaded", initApp);
})();
