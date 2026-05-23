let workTimeData = {};
let workSettings = {
  coreStartTime: '08:00',
  coreEndTime: '17:30',
  lunchBreakStart: '12:00',
  lunchBreakEnd: '13:30',
  dinnerBreakStart: '17:30',
  dinnerBreakEnd: '18:00',
  enableFlexibleWork: true,
  shiftMode: 'flexibleF' // 'flexibleF' | 'standard'
};

// 班次预设
const shiftPresets = {
  flexibleF: {
    coreStartTime: '08:00',
    coreEndTime: '17:30',
    lunchBreakStart: '12:00',
    lunchBreakEnd: '13:30',
    dinnerBreakStart: '17:30',
    dinnerBreakEnd: '18:00'
  },
  standard: {
    coreStartTime: '09:00',
    coreEndTime: '18:00',
    lunchBreakStart: '12:00',
    lunchBreakEnd: '13:00',
    dinnerBreakStart: '17:30',
    dinnerBreakEnd: '18:00'
  }
};
let currentDisplayDate = new Date();
let currentlyEditingDate = null; // 用于跟踪正在编辑的日期

// DOM Elements for Modal
let modal, closeModal, saveTime, cancelEdit, modalDate, startTimeInput, endTimeInput;

// 加载存储的数据
async function loadData() {
  const result = await chrome.storage.local.get(['workTimeData', 'workSettings']);
  workTimeData = result.workTimeData || {};
  workSettings = { ...workSettings, ...(result.workSettings || {}) };
  await renderCalendar(currentDisplayDate);
}

// 保存数据
async function saveData() {
  await chrome.storage.local.set({
    workTimeData,
    workSettings
  });
}

// 获取今天的日期字符串 (YYYY-MM-DD)
function getTodayString() {
  return new Date().toISOString().split('T')[0];
}

// 创建全局点击星星效果
function createGlobalStarEffect(event) {
  // 确保获取正确的鼠标位置
  const centerX = event.clientX;
  const centerY = event.clientY;
  
  // 定义适合全局使用的emoji
  const globalEmojis = [
    '✨', '⭐', '🌟', '💫'
  ];
  
  // 创建3-4个emoji
  const emojiCount = 3;
  
  for (let i = 0; i < emojiCount; i++) {
    const emojiElement = document.createElement('div');
    emojiElement.className = 'star global-star';
    
    // 随机选择emoji
    const randomEmoji = globalEmojis[Math.floor(Math.random() * globalEmojis.length)];
    emojiElement.textContent = randomEmoji;
    
    // 随机方向和距离
    const angle = Math.random() * 360;
    const distance = 20 + Math.random() * 15;
    const dx = Math.cos(angle * Math.PI / 180) * distance;
    const dy = Math.sin(angle * Math.PI / 180) * distance;
    
    // 设置初始位置（使用fixed定位确保位置正确）
    emojiElement.style.position = 'fixed';
    emojiElement.style.left = centerX + 'px';
    emojiElement.style.top = centerY + 'px';
    emojiElement.style.setProperty('--dx', dx + 'px');
    emojiElement.style.setProperty('--dy', dy + 'px');
    emojiElement.style.pointerEvents = 'none';
    emojiElement.style.zIndex = '10000';
    
    document.body.appendChild(emojiElement);
    
    // 立即启动动画（减少延迟）
    setTimeout(() => {
      emojiElement.classList.add('animate');
    }, i * 20);
    
    // 动画结束后移除元素
    setTimeout(() => {
      if (emojiElement.parentNode) {
        emojiElement.parentNode.removeChild(emojiElement);
      }
    }, 800 + i * 20);
  }
}

// 将时间字符串转换为分钟数
function timeToMinutes(timeStr) {
  if (!timeStr) return 0;
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours * 60 + minutes;
}

// 将分钟数转换为时间字符串
function minutesToTime(minutes) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

// 计算核心工时（含午餐/晚餐扣除）
function calculateFlexibleWorkHours(firstClick, lastClick) {
  if (!firstClick || !lastClick) return 0;

  // 将时间戳转换为Date对象
  const firstDate = new Date(firstClick);
  const lastDate = new Date(lastClick);

  // 提取时间部分
  const firstTimeStr = `${String(firstDate.getHours()).padStart(2, '0')}:${String(firstDate.getMinutes()).padStart(2, '0')}`;
  const lastTimeStr = `${String(lastDate.getHours()).padStart(2, '0')}:${String(lastDate.getMinutes()).padStart(2, '0')}`;

  // 转换为分钟数
  const firstTimeMinutes = timeToMinutes(firstTimeStr);
  const lastTimeMinutes = timeToMinutes(lastTimeStr);

  // 核心工作时间（分钟）
  const coreStartMinutes = timeToMinutes(workSettings.coreStartTime);
  const coreEndMinutes = timeToMinutes(workSettings.coreEndTime);

  // 午休时间
  const lunchStartMinutes = timeToMinutes(workSettings.lunchBreakStart);
  const lunchEndMinutes = timeToMinutes(workSettings.lunchBreakEnd);

  // 晚餐时间
  const dinnerStartMinutes = timeToMinutes(workSettings.dinnerBreakStart);
  const dinnerEndMinutes = timeToMinutes(workSettings.dinnerBreakEnd);

  // 计算有效工作时间
  // 最早从核心上班时间开始（打卡早于08:00 → 从08:00算起）
  let effectiveStartTime = Math.max(firstTimeMinutes, coreStartMinutes);
  // 最晚到核心下班时间（不可早于17:30下班）
  let effectiveEndTime = Math.max(lastTimeMinutes, coreEndMinutes);

  // 处理晚餐时间（如果开始时间落在晚餐时段内，调整到晚餐结束）
  if (effectiveStartTime >= dinnerStartMinutes && effectiveStartTime < dinnerEndMinutes) {
    effectiveStartTime = dinnerEndMinutes;
  }

  // 确保开始时间不晚于结束时间
  if (effectiveStartTime >= effectiveEndTime) {
    return 0;
  }

  // 计算总工作时间（分钟）
  let totalMinutes = effectiveEndTime - effectiveStartTime;

  // 扣除午休时间（如果午休在工作时间内）
  if (effectiveStartTime <= lunchStartMinutes && effectiveEndTime >= lunchEndMinutes) {
    totalMinutes -= (lunchEndMinutes - lunchStartMinutes);
  } else if (effectiveStartTime < lunchEndMinutes && effectiveEndTime > lunchStartMinutes) {
    // 部分覆盖午休时间
    const overlapStart = Math.max(effectiveStartTime, lunchStartMinutes);
    const overlapEnd = Math.min(effectiveEndTime, lunchEndMinutes);
    totalMinutes -= (overlapEnd - overlapStart);
  }

  // 扣除晚餐时间（如果晚餐在工作时间内）
  if (effectiveStartTime <= dinnerStartMinutes && effectiveEndTime >= dinnerEndMinutes) {
    totalMinutes -= (dinnerEndMinutes - dinnerStartMinutes);
  } else if (effectiveStartTime < dinnerEndMinutes && effectiveEndTime > dinnerStartMinutes) {
    // 部分覆盖晚餐时间
    const overlapStart = Math.max(effectiveStartTime, dinnerStartMinutes);
    const overlapEnd = Math.min(effectiveEndTime, dinnerEndMinutes);
    totalMinutes -= (overlapEnd - overlapStart);
  }

  // 如果扣除午休和晚餐后时间为负，返回0
  if (totalMinutes <= 0) {
    return 0;
  }

  // 转换为小时并保留两位小数
  const hours = totalMinutes / 60;
  return Math.round(hours * 100) / 100;
}

// 应用班次预设值到表单
function applyShiftPreset(mode) {
  const preset = shiftPresets[mode] || shiftPresets.flexibleF;
  document.getElementById('coreStartTime').value = preset.coreStartTime;
  document.getElementById('coreEndTime').value = preset.coreEndTime;
  document.getElementById('lunchBreakStart').value = preset.lunchBreakStart;
  document.getElementById('lunchBreakEnd').value = preset.lunchBreakEnd;
  document.getElementById('dinnerBreakStart').value = preset.dinnerBreakStart;
  document.getElementById('dinnerBreakEnd').value = preset.dinnerBreakEnd;

  // 更新二级标题
  const sectionTitle = document.querySelector('#settingsModal .modal-body > div[style*="font-weight:600"]');
  if (sectionTitle) {
    sectionTitle.textContent = mode === 'flexibleF' ? '弹性F班' : '标准班';
  }
}

// 计算工作时间（小时）
function calculateWorkHours(firstClick, lastClick) {
  if (!firstClick || !lastClick) return 0;
  const hours = (lastClick - firstClick) / (1000 * 60 * 60);
  return Math.round(hours * 100) / 100;
}

// 渲染日历
async function renderCalendar(date) {
  const year = date.getFullYear();
  const month = date.getMonth();

  document.getElementById('monthYear').textContent = `${year}年 ${month + 1}月`;

  // 获取当年的节假日数据
  const holidayData = await fetchHolidays(year);

  const calendarGrid = document.getElementById('calendarGrid');
  calendarGrid.innerHTML = '';

  // 添加表头（周一为第一列）
  const days = ['一', '二', '三', '四', '五', '六', '日', '周总计'];
  days.forEach(day => {
    const headerCell = document.createElement('div');
    headerCell.classList.add('calendar-cell', 'day-header');
    headerCell.textContent = day;
    calendarGrid.appendChild(headerCell);
  });

  // 获取当月第一天的星期，转换为周一为第一列：Sun(0)→6, Mon(1)→0, ..., Sat(6)→5
  const firstDayMondayBased = (new Date(year, month, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  
  let monthlyTotal = 0;
  let monthlyLeaveHours = 0;
  let monthlyOvertimeHours = 0;
  let weekendOvertimeHours = 0;
  let statutoryWorkDays = 0; // 工作日天数：有数据（打卡或请假）的法定工作日数
  let workdayWorkHours = 0;  // 法定工作日工时（有请假时取打卡与核心时间的交集）
  let weeklyTotal = 0;
  let dayCounter = 1;

  // 填充日历网格
  for (let i = 0; i < 6; i++) { // 最多6行
    if (dayCounter > daysInMonth) break;

    for (let j = 0; j < 7; j++) {
      if (i === 0 && j < firstDayMondayBased) {
        const emptyCell = document.createElement('div');
        emptyCell.classList.add('calendar-cell');
        calendarGrid.appendChild(emptyCell);
      } else if (dayCounter <= daysInMonth) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(dayCounter).padStart(2, '0')}`;
        const dayData = workTimeData[dateStr];
        const hours = dayData ? calculateFlexibleWorkHours(dayData.firstClick, dayData.lastClick) : 0;
        const hasDinnerTime = dayData && hasDinnerPeriod(dayData.firstClick, dayData.lastClick);
        
        // 累计请假小时数
        if (dayData && dayData.leaveHours) {
          monthlyLeaveHours += dayData.leaveHours;
        }

        // 累计加班小时数
        if (dayData && dayData.overtimeHours) {
          monthlyOvertimeHours += dayData.overtimeHours;
        }
        
        // 统计有数据（有打卡或请假）的法定工作日数
        const dayOfWeek = new Date(year, month, dayCounter).getDay();
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
        const dayHoliday = holidayData[dateStr];
        const isStatutoryWorkday = (!isWeekend && !(dayHoliday && dayHoliday.isOffDay === true))
          || (isWeekend && dayHoliday && dayHoliday.isOffDay === false);
        const hasAttendance = hours > 0 || (dayData && dayData.leaveHours > 0);
        if (isStatutoryWorkday && hasAttendance) {
          statutoryWorkDays++;
          // 累计法定工作日工时（有请假时 calculateFlexibleWorkHours 已自动取8:00-17:30与打卡时间的交集）
          if (hours > 0) {
            workdayWorkHours += hours;
          }
        }
        
        // 检查是否是节假日
        const isHolidayDay = isHoliday(year, month + 1, dayCounter, holidayData);
        
        const dayCell = document.createElement('div');
        dayCell.classList.add('calendar-cell');
        
        // 创建单元格内容，移除编辑按钮
        const cellContent = document.createElement('div');
        cellContent.classList.add('cell-content');
        
        const dateDisplay = document.createElement('div');
        dateDisplay.classList.add('date-display');
        dateDisplay.textContent = dayCounter;
        
        const hoursDisplay = document.createElement('div');
        hoursDisplay.classList.add('hours-display');
        // 法定节假日只显示加班工时
        const displayHours = isHolidayDay
          ? (dayData && dayData.overtimeHours ? dayData.overtimeHours : 0)
          : hours;
        hoursDisplay.textContent = `${displayHours.toFixed(2)}h`;

        // 如果有晚餐时间，添加特殊样式
        if (hasDinnerTime) {
          dayCell.classList.add('dinner-time');
        }

        cellContent.appendChild(dateDisplay);
        cellContent.appendChild(hoursDisplay);
        dayCell.appendChild(cellContent);
        
        // 添加点击事件到整个单元格
        dayCell.addEventListener('click', function() {
          showEditModal(dateStr);
        });
        
        // 检查是否是今天
        const today = getTodayString();
        if (dateStr === today) {
          dayCell.classList.add('today');
          dateDisplay.classList.add('today-circle');
        }
        
        // 累计假日加班工时（节假日/周末填写的加班小时数之和）
        if (dayData && dayData.overtimeHours > 0 && (isWeekend || isHolidayDay)) {
          weekendOvertimeHours += dayData.overtimeHours;
        }
        
        // 检查该日期在节假日API中的状态
        const dateStr2 = `${year}-${String(month + 1).padStart(2, '0')}-${String(dayCounter).padStart(2, '0')}`;
        const holidayInfo = holidayData[dateStr2];
        
        // 标红逻辑：
        // 1. 如果是节假日（isOffDay=true），标红
        // 2. 如果是周末且没有节假日信息，标红
        // 3. 如果是周末但节假日API标记为isOffDay=false（调休补班），不标红
        if (isHolidayDay) {
          dayCell.classList.add('holiday');
        } else if (isWeekend && (!holidayInfo || holidayInfo.isOffDay !== false)) {
          dayCell.classList.add('weekend');
        }
        
        // 有加班记录 → 绿圈，有请假记录 → 红圈
        if (dayData && dayData.overtimeHours > 0) {
          dateDisplay.classList.add('overtime-circle');
        }
        if (dayData && dayData.leaveHours > 0) {
          dateDisplay.classList.add('leave-circle');
        }
        
        calendarGrid.appendChild(dayCell);

        weeklyTotal += hours;
        monthlyTotal += hours;
        dayCounter++;
      } else {
        const emptyCell = document.createElement('div');
        emptyCell.classList.add('calendar-cell');
        calendarGrid.appendChild(emptyCell);
      }
    }
    // 添加周总计
    const weekTotalCell = document.createElement('div');
    weekTotalCell.classList.add('calendar-cell', 'week-total');
    weekTotalCell.textContent = `${weeklyTotal.toFixed(2)}h`;
    calendarGrid.appendChild(weekTotalCell);
    weeklyTotal = 0;
  }

  // 更新汇总信息
  document.getElementById('monthlyTotalHours').textContent = workdayWorkHours.toFixed(2);
  document.getElementById('workDays').textContent = statutoryWorkDays;
  document.getElementById('avgHours').textContent = statutoryWorkDays > 0 ? (workdayWorkHours / statutoryWorkDays).toFixed(2) : '0.00';
  document.getElementById('totalLeaveHours').textContent = monthlyLeaveHours.toFixed(2);
  
  // 工作日加班工时 = 工作日工时 + 所有请假工时 - 法定工作日×8
  const overtime = workdayWorkHours + monthlyLeaveHours - statutoryWorkDays * 8;
  document.getElementById('overtimeHours').textContent = overtime.toFixed(2);
  
  // 假日加班工时
  document.getElementById('weekendOvertimeHours').textContent = weekendOvertimeHours.toFixed(1);
  
  // 加班等效比 = 月加班工时 / 假日加班工时
  const ratioEl = document.getElementById('overtimeRatio');
  if (weekendOvertimeHours <= 0 || overtime <= 0) {
    ratioEl.textContent = 'NA';
    ratioEl.style.color = '';
  } else {
    const ratio = overtime / weekendOvertimeHours;
    ratioEl.textContent = ratio.toFixed(1);
    ratioEl.style.color = ratio < 0.5 ? 'red' : '';
  }
}

// 将时间戳转换为 HH:mm 格式
function formatTime(timestamp) {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

// 显示编辑模态框
function showEditModal(dateStr) {
  currentlyEditingDate = dateStr;
  const dayData = workTimeData[dateStr];

  // 将日期字符串转换为更友好的格式
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
  const weekday = weekdays[date.getDay()];
  const formattedDate = `${year}年${month}月${day}日（${weekday})`;

  modalDate.value = formattedDate;
  startTimeInput.value = dayData ? formatTime(dayData.firstClick) : '';
  endTimeInput.value = dayData ? formatTime(dayData.lastClick) : '';
  overtimeHoursInput.value = dayData && dayData.overtimeHours != null ? dayData.overtimeHours : 0;
  leaveHoursInput.value = dayData && dayData.leaveHours != null ? dayData.leaveHours : 0;

  modal.style.display = "block";
}

// 隐藏编辑模态框
function hideEditModal() {
  modal.style.display = "none";
  currentlyEditingDate = null;
}

// 保存手动输入的时间
async function saveManualTime() {
  if (!currentlyEditingDate) return;

  const [year, month, day] = currentlyEditingDate.split('-').map(Number);

  const startTime = startTimeInput.value;
  const endTime = endTimeInput.value;

  let firstClickTs = null;
  let lastClickTs = null;

  if (startTime) {
    const [startHour, startMinute] = startTime.split(':').map(Number);
    firstClickTs = new Date(year, month - 1, day, startHour, startMinute).getTime();
  }

  if (endTime) {
    const [endHour, endMinute] = endTime.split(':').map(Number);
    lastClickTs = new Date(year, month - 1, day, endHour, endMinute).getTime();
  }

  // 如果只有一个时间，则另一个时间也设为一样，以记录单个时间点
  if (firstClickTs && !lastClickTs) lastClickTs = firstClickTs;
  if (!firstClickTs && lastClickTs) firstClickTs = lastClickTs;

  if (firstClickTs && lastClickTs) {
      workTimeData[currentlyEditingDate] = {
        firstClick: firstClickTs,
        lastClick: lastClickTs
      };
  } else {
      // 如果两个时间都为空，则删除当天的记录
      delete workTimeData[currentlyEditingDate];
  }

  // 加班小时数
  const overtimeVal = parseFloat(overtimeHoursInput.value);
  if (overtimeVal > 0) {
    if (!workTimeData[currentlyEditingDate]) {
      workTimeData[currentlyEditingDate] = { firstClick: null, lastClick: null };
    }
    workTimeData[currentlyEditingDate].overtimeHours = overtimeVal;
  } else if (workTimeData[currentlyEditingDate]) {
    delete workTimeData[currentlyEditingDate].overtimeHours;
    if (workTimeData[currentlyEditingDate].firstClick === null &&
        workTimeData[currentlyEditingDate].lastClick === null &&
        Object.keys(workTimeData[currentlyEditingDate]).length === 0) {
      delete workTimeData[currentlyEditingDate];
    }
  }

  // 请假小时数
  const leaveVal = parseFloat(leaveHoursInput.value);
  if (leaveVal > 0) {
    if (!workTimeData[currentlyEditingDate]) {
      // 只有请假无打卡，也创建一条记录
      workTimeData[currentlyEditingDate] = { firstClick: null, lastClick: null };
    }
    workTimeData[currentlyEditingDate].leaveHours = leaveVal;
  } else if (workTimeData[currentlyEditingDate]) {
    delete workTimeData[currentlyEditingDate].leaveHours;
    // 如果只有请假字段且已被清空，且打卡也为空，则删除整条记录
    if (workTimeData[currentlyEditingDate].firstClick === null &&
        workTimeData[currentlyEditingDate].lastClick === null &&
        Object.keys(workTimeData[currentlyEditingDate]).length === 0) {
      delete workTimeData[currentlyEditingDate];
    }
  }

  try {
    await saveData();
    await renderCalendar(currentDisplayDate);
    hideEditModal();
    showToast('数据保存成功');
  } catch (error) {
    console.error('保存数据失败:', error);
    showToast('保存失败：' + error.message);
  }
}

// 导出数据到Excel（CSV格式）
function exportToExcel() {
    // 准备CSV内容
    const headers = ['日期', '开始时间', '结束时间', '工作时长(小时)', '加班小时数', '请假小时数'];
    let csvContent = '\uFEFF' + headers.join(',') + '\n'; // 添加BOM标记确保UTF-8编码

    // 将数据按日期排序
    const sortedDates = Object.keys(workTimeData).sort();

    // 添加每一天的数据
    sortedDates.forEach(date => {
        const dayData = workTimeData[date];
        const startTime = new Date(dayData.firstClick);
        const endTime = new Date(dayData.lastClick);
        const hours = calculateFlexibleWorkHours(dayData.firstClick, dayData.lastClick);

        const row = [
            date,
            formatTime(dayData.firstClick),
            formatTime(dayData.lastClick),
            hours.toFixed(2),
            dayData.overtimeHours ? dayData.overtimeHours.toFixed(1) : '0.0',
            dayData.leaveHours ? dayData.leaveHours.toFixed(1) : '0.0'
        ];

        csvContent += row.join(',') + '\n';
    });

    // 创建Blob对象，明确指定UTF-8编码
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);

    // 创建下载链接并触发下载
    const link = document.createElement('a');
    const fileName = `工作时间记录_${new Date().toISOString().split('T')[0]}.csv`;
    
    link.setAttribute('href', url);
    link.setAttribute('download', fileName);
    link.style.display = 'none';
    
    document.body.appendChild(link);
    link.click();
    
    // 清理
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
}

// 初始化和事件监听
document.addEventListener('DOMContentLoaded', () => {
  // 初始化模态框相关的DOM元素
  modal = document.getElementById('editModal');
  closeModal = document.querySelector('.close-button');
  saveTime = document.getElementById('saveTime');
  cancelEdit = document.getElementById('cancelEdit');
  modalDate = document.getElementById('modalDate');
  startTimeInput = document.getElementById('startTime');
  endTimeInput = document.getElementById('endTime');
  leaveHoursInput = document.getElementById('leaveHours');
  overtimeHoursInput = document.getElementById('editOvertimeHours');

  // 设置模态框相关的DOM元素
  const settingsModal = document.getElementById('settingsModal');
  const closeSettingsButton = settingsModal.querySelector('.close-button');
  const cancelSettingsButton = document.getElementById('cancelSettings');
  const saveSettingsButton = document.getElementById('saveSettings');

  // 加载数据
  loadData();

  // 初始化设置表单
  const shiftMode = workSettings.shiftMode || 'flexibleF';
  document.getElementById('shiftModeSelect').value = shiftMode;
  applyShiftPreset(shiftMode);
  document.title = '1'; // no-op, keep for flow

  // 班次选择切换时应用预设
  document.getElementById('shiftModeSelect').addEventListener('change', function() {
    applyShiftPreset(this.value);
  });

  // 导入按钮事件
  document.getElementById('importButton').addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv';
    input.style.display = 'none';

    input.addEventListener('change', async () => {
      if (!input.files.length) return;

      const file = input.files[0];
      const reader = new FileReader();

      reader.onload = async (e) => {
        let csv = e.target.result;
        
        // 移除BOM标记（如果存在）
        if (csv.charCodeAt(0) === 0xFEFF) {
          csv = csv.slice(1);
        }
        
        const rows = csv.split('\n').slice(1); // 跳过表头
        const totalRows = rows.filter(r => r.trim()).length;

        if (totalRows === 0) {
          showToast('CSV 文件中没有数据行');
          return;
        }

        // 显示进度遮罩
        showImportProgress(0, totalRows, '');

        // 清空现有数据
        workTimeData = {};

        let successCount = 0;
        let skipCount = 0;
        let currentRow = 0;
        const skipReasons = {};
        let earliestDate = null;
        let latestDate = null;

        for (const row of rows) {
          if (!row.trim()) continue;

          currentRow++;
          showImportProgress(currentRow, totalRows, `正在处理第 ${currentRow}/${totalRows} 行...`);

          // 更安全的CSV解析，处理可能的引号
          const columns = row.split(',').map(col => col.replace(/^"|"$/g, '').trim());
          
          if (columns.length < 4) {
            skipCount++;
            skipReasons['列数不足'] = (skipReasons['列数不足'] || 0) + 1;
            continue;
          }
          
          const [date, startTime, endTime, hours, overtime, leave] = columns;

          // 统一日期格式：支持 2026/5/4 或 2026-5-4 → 转为 YYYY-MM-DD（补零）
          const parts = date.replace(/\//g, '-').split('-');
          const normalizedDate = `${parts[0]}-${String(Number(parts[1])).padStart(2,'0')}-${String(Number(parts[2])).padStart(2,'0')}`;

          // 验证日期格式
          if (!/^\d{4}-\d{1,2}-\d{1,2}$/.test(normalizedDate)) {
            skipCount++;
            skipReasons['无效日期格式'] = (skipReasons['无效日期格式'] || 0) + 1;
            continue;
          }

          const [year, month, day] = normalizedDate.split('-').map(Number);

          // 解析加班和请假小时数
          const overtimeHours = parseFloat(overtime) || 0;
          const leaveHours = parseFloat(leave) || 0;

          if (startTime && endTime && /^\d{1,2}:\d{2}$/.test(startTime) && /^\d{1,2}:\d{2}$/.test(endTime)) {
            // 有完整开始/结束时间
            try {
              const [startHour, startMinute] = startTime.split(':').map(Number);
              const [endHour, endMinute] = endTime.split(':').map(Number);

              // 验证数值范围
              if (startHour < 0 || startHour > 23 || startMinute < 0 || startMinute > 59 ||
                  endHour < 0 || endHour > 23 || endMinute < 0 || endMinute > 59) {
                skipCount++;
                skipReasons['无效时间值'] = (skipReasons['无效时间值'] || 0) + 1;
                continue;
              }

              const firstClickTs = new Date(year, month - 1, day, startHour, startMinute).getTime();
              const lastClickTs = new Date(year, month - 1, day, endHour, endMinute).getTime();

              if (isNaN(firstClickTs) || isNaN(lastClickTs)) {
                skipCount++;
                skipReasons['无效时间戳'] = (skipReasons['无效时间戳'] || 0) + 1;
                continue;
              }

              workTimeData[normalizedDate] = {
                firstClick: firstClickTs,
                lastClick: lastClickTs,
                overtimeHours: overtimeHours || undefined,
                leaveHours: leaveHours || undefined
              };
              successCount++;
              // 记录日期范围
              if (!earliestDate || normalizedDate < earliestDate) earliestDate = normalizedDate;
              if (!latestDate || normalizedDate > latestDate) latestDate = normalizedDate;
            } catch (error) {
              skipCount++;
              skipReasons['解析异常'] = (skipReasons['解析异常'] || 0) + 1;
            }
          } else {
            // 没有开始/结束时间（只有请假或加班数据）
            if (overtimeHours > 0 || leaveHours > 0) {
              workTimeData[normalizedDate] = {
                firstClick: null,
                lastClick: null,
                overtimeHours: overtimeHours || undefined,
                leaveHours: leaveHours || undefined
              };
              successCount++;
              // 记录日期范围
              if (!earliestDate || normalizedDate < earliestDate) earliestDate = normalizedDate;
              if (!latestDate || normalizedDate > latestDate) latestDate = normalizedDate;
            } else {
              skipCount++;
              skipReasons['无有效数据（无时间、无加班、无请假）'] = (skipReasons['无有效数据（无时间、无加班、无请假）'] || 0) + 1;
            }
          }
        }

        hideImportProgress();

        // 保存并刷新
        await saveData();
        renderCalendar(currentDisplayDate);

        // 显示导入结果
        const monthNames = ['一月','二月','三月','四月','五月','六月','七月','八月','九月','十月','十一月','十二月'];
        let resultMsg = '';
        if (successCount > 0) {
          const [ey, em, ed] = earliestDate.split('-').map(Number);
          const [ly, lm, ld] = latestDate.split('-').map(Number);
          resultMsg += `<b>✅ 成功导入：${successCount} 条记录</b><br>`;
          resultMsg += `📅 日期范围：${ey}年${em}月${ed}日 ~ ${ly}年${lm}月${ld}日<br>`;
          resultMsg += `<br>`;
        }
        if (skipCount > 0) {
          resultMsg += `⚠️ 跳过 ${skipCount} 条记录：<br>`;
          for (const [reason, count] of Object.entries(skipReasons)) {
            resultMsg += `&nbsp;&nbsp;• ${reason}：${count} 条<br>`;
          }
        }
        if (successCount === 0) {
          document.getElementById('importResultIcon').textContent = '❌';
          document.getElementById('importResultTitle').textContent = '导入失败';
          showImportResult(resultMsg || '没有导入任何记录，请检查 CSV 文件格式。');
        } else if (skipCount > 0) {
          document.getElementById('importResultIcon').textContent = '⚠️';
          document.getElementById('importResultTitle').textContent = '导入完成（部分跳过）';
          showImportResult(resultMsg);
        } else {
          document.getElementById('importResultIcon').textContent = '✅';
          document.getElementById('importResultTitle').textContent = '导入成功';
          showImportResult(resultMsg);
        }
      };

      // 明确指定使用UTF-8编码读取文件
      reader.readAsText(file, 'UTF-8');
    });

    document.body.appendChild(input);
    input.click();
    document.body.removeChild(input);
  });

  document.getElementById('exportButton').addEventListener('click', () => {
    const exportConfirmModal = document.getElementById('exportConfirmModal');
    exportConfirmModal.style.display = 'block';
  });

  document.getElementById('exportConfirmCancel').addEventListener('click', () => {
    document.getElementById('exportConfirmModal').style.display = 'none';
  });

  document.getElementById('exportConfirmOk').addEventListener('click', () => {
    document.getElementById('exportConfirmModal').style.display = 'none';
    exportToExcel();
  });

  // 点击确认弹窗外部关闭
  window.addEventListener('click', (event) => {
    const modal = document.getElementById('exportConfirmModal');
    if (event.target === modal) {
      modal.style.display = 'none';
    }
  });

  document.getElementById('settingsButton').addEventListener('click', () => {
    settingsModal.style.display = 'block';
  });

  // 设置模态框事件
  closeSettingsButton.addEventListener('click', () => {
    settingsModal.style.display = 'none';
  });

  cancelSettingsButton.addEventListener('click', () => {
    settingsModal.style.display = 'none';
  });

  saveSettingsButton.addEventListener('click', () => {
    // 保存设置
    workSettings.shiftMode = document.getElementById('shiftModeSelect').value;
    workSettings.coreStartTime = document.getElementById('coreStartTime').value;
    workSettings.coreEndTime = document.getElementById('coreEndTime').value;
    workSettings.lunchBreakStart = document.getElementById('lunchBreakStart').value;
    workSettings.lunchBreakEnd = document.getElementById('lunchBreakEnd').value;
    workSettings.dinnerBreakStart = document.getElementById('dinnerBreakStart').value;
    workSettings.dinnerBreakEnd = document.getElementById('dinnerBreakEnd').value;

    saveData();
    renderCalendar(currentDisplayDate);
    settingsModal.style.display = 'none';

    showToast('设置已保存');
  });

  // 点击模态框外部关闭
  window.addEventListener('click', (event) => {
    if (event.target === settingsModal) {
      settingsModal.style.display = 'none';
    }
  });

  document.getElementById('prevMonth').addEventListener('click', () => {
    currentDisplayDate.setMonth(currentDisplayDate.getMonth() - 1);
    renderCalendar(currentDisplayDate);
  });

  document.getElementById('nextMonth').addEventListener('click', () => {
    currentDisplayDate.setMonth(currentDisplayDate.getMonth() + 1);
    renderCalendar(currentDisplayDate);
  });

  // 模态框事件
  closeModal.addEventListener('click', hideEditModal);
  cancelEdit.addEventListener('click', hideEditModal);
  saveTime.addEventListener('click', saveManualTime);
  window.addEventListener('click', (event) => {
    if (event.target === modal) {
      hideEditModal();
    }
  });
});


// 节假日数据缓存
let holidayCache = {};

// 获取指定年份的节假日数据
async function fetchHolidays(year) {
  // 如果缓存中已有该年份数据，直接返回
  if (holidayCache[year]) {
    return holidayCache[year];
  }

  try {
    const response = await fetch(`https://timor.tech/api/holiday/year/${year}`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const result = await response.json();
    if (result.code !== 0 || !result.holiday) {
      throw new Error('API 返回数据格式异常');
    }
    
    // 转换格式：{"MM-DD": {...}} → {"YYYY-MM-DD": {isOffDay, name}}
    const data = {};
    for (const [mmdd, info] of Object.entries(result.holiday)) {
      const dateStr = `${year}-${mmdd}`;
      data[dateStr] = {
        isOffDay: info.holiday === true,
        name: info.name || ''
      };
    }
    
    // 缓存数据
    holidayCache[year] = data;
    return data;
  } catch (error) {
    console.warn(`获取${year}年节假日数据失败:`, error);
    return {};
  }
}

// 检查指定日期是否为节假日
function isHoliday(year, month, day, holidayData) {
  const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const holiday = holidayData[dateStr];

  // 返回是否为休息日（放假日）
  return holiday && holiday.isOffDay === true;
}

// 检查记录的时间是否包含晚餐时间
function hasDinnerPeriod(firstClick, lastClick) {
  if (!firstClick || !lastClick) return false;

  const firstDate = new Date(firstClick);
  const lastDate = new Date(lastClick);

  const firstTimeMinutes = firstDate.getHours() * 60 + firstDate.getMinutes();
  const lastTimeMinutes = lastDate.getHours() * 60 + lastDate.getMinutes();

  // 晚餐时间（从设置读取）
  const dinnerStartMinutes = timeToMinutes(workSettings.dinnerBreakStart);
  const dinnerEndMinutes = timeToMinutes(workSettings.dinnerBreakEnd);

  // 检查工作时间是否包含晚餐时间段
  return (firstTimeMinutes < dinnerEndMinutes && lastTimeMinutes > dinnerStartMinutes);
}

let globalStarEffectEnabled = true;

// 修改全局点击事件
document.addEventListener('click', function(event) {
  if (!globalStarEffectEnabled) return;
  
  const clickedElement = event.target;
  const isModal = clickedElement.closest('.modal');
  const isInteractive = clickedElement.tagName === 'BUTTON' || clickedElement.closest('button');
  
  if (!isModal && !isInteractive) {
    createGlobalStarEffect(event);
  }
});

// 导入进度提示
function showImportProgress(current, total, text) {
  const overlay = document.getElementById('importProgressOverlay');
  const bar = document.getElementById('importProgressBar');
  const progressText = document.getElementById('importProgressText');
  if (!overlay || !bar || !progressText) return;
  overlay.style.display = 'flex';
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;
  bar.style.width = pct + '%';
  if (current === 0) {
    progressText.textContent = `共 ${total} 行数据，准备导入...`;
  } else {
    progressText.textContent = text || `正在处理第 ${current}/${total} 行...`;
  }
}

function hideImportProgress() {
  const overlay = document.getElementById('importProgressOverlay');
  if (overlay) overlay.style.display = 'none';
}

// 导入结果弹窗
function showImportResult(message) {
  const modal = document.getElementById('importResultModal');
  const msgDiv = document.getElementById('importResultMessage');
  if (!modal || !msgDiv) return;
  msgDiv.innerHTML = message;
  modal.style.display = 'block';
}

// 导入结果弹窗确定按钮
document.addEventListener('DOMContentLoaded', () => {
  const okBtn = document.getElementById('importResultOk');
  if (okBtn) {
    okBtn.addEventListener('click', () => {
      document.getElementById('importResultModal').style.display = 'none';
    });
  }
});

// 简单的提示信息函数
function showToast(message) {
  const toast = document.createElement('div');
  toast.textContent = message;
  toast.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: rgba(0,0,0,0.8);
    color: white;
    padding: 8px 12px;
    border-radius: 4px;
    font-size: 12px;
    z-index: 10000;
    opacity: 0;
    transition: opacity 0.3s;
  `;
  
  document.body.appendChild(toast);
  
  setTimeout(() => toast.style.opacity = '1', 10);
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => document.body.removeChild(toast), 300);
  }, 2000);
}