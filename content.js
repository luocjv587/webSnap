console.log('WebSnap content script loaded');

let sidebar = null;
let isInitialized = false;

// 初始化侧边栏
function initSidebar() {
  if (isInitialized) return;
  
  // 创建侧边栏容器
  sidebar = document.createElement('div');
  sidebar.id = 'websnap-sidebar';
  sidebar.className = 'websnap-sidebar hidden';
  
  // 创建侧边栏内容
  sidebar.innerHTML = `
    <div class="websnap-sidebar-header">
      <h3>📋 历史记录</h3>
      <div class="websnap-header-buttons">
        <button class="websnap-minimize-btn" id="websnap-minimize-sidebar" title="最小化">
          <img src="${chrome.runtime.getURL('icons/icon128.png')}" alt="WebSnap" class="websnap-minimize-icon" />
        </button>
        <button class="websnap-close-btn" id="websnap-close-sidebar" title="关闭">×</button>
      </div>
    </div>
    <div class="websnap-sidebar-content" id="websnap-history-list">
      <div class="websnap-loading">加载中...</div>
    </div>
  `;
  
  // 添加到页面
  document.body.appendChild(sidebar);
  
  // 绑定关闭按钮事件
  const closeBtn = sidebar.querySelector('#websnap-close-sidebar');
  closeBtn.addEventListener('click', hideSidebar);
  
  // 绑定最小化按钮事件
  const minimizeBtn = sidebar.querySelector('#websnap-minimize-sidebar');
  minimizeBtn.addEventListener('click', handleMinimizeClick);
  
  // 绑定历史记录标题点击事件
  const historyTitle = sidebar.querySelector('h3');
  historyTitle.addEventListener('click', () => {
    chrome.runtime.sendMessage({action: 'openHistoryPage'});
  });
  historyTitle.style.cursor = 'pointer';
  
  isInitialized = true;
  console.log('WebSnap sidebar initialized');
}

// 显示侧边栏
function showSidebar() {
  if (!isInitialized) {
    initSidebar();
  }
  
  sidebar.classList.remove('hidden');
  document.body.classList.add('websnap-sidebar-open');
  
  // 加载历史记录
  loadHistoryList();
  
  console.log('WebSnap sidebar shown');
}

// 隐藏侧边栏
function hideSidebar() {
  if (sidebar) {
    sidebar.classList.add('hidden');
    sidebar.classList.remove('minimized');
    document.body.classList.remove('websnap-sidebar-open');
    
    console.log('WebSnap sidebar hidden');
  }
}

// 拖动相关变量
let isDragging = false;
let dragOffset = { x: 0, y: 0 };
let hasDragged = false;

// 处理最小化按钮点击事件
function handleMinimizeClick(e) {
  // 如果刚刚进行了拖拽，则不触发点击事件
  if (hasDragged) {
    hasDragged = false;
    return;
  }
  toggleMinimize();
}

// 切换最小化状态
function toggleMinimize() {
  if (sidebar) {
    const isMinimized = sidebar.classList.contains('minimized');
    const minimizeBtn = sidebar.querySelector('#websnap-minimize-sidebar');
    
    if (isMinimized) {
      // 恢复
      sidebar.classList.remove('minimized');
      document.body.classList.add('websnap-sidebar-open');
      // 重置位置到固定右边
      sidebar.style.top = '';
      sidebar.style.right = '';
      sidebar.style.left = '';
      sidebar.style.bottom = '';
      sidebar.style.transform = '';
      minimizeBtn.title = '最小化';
      // 移除拖动事件
      removeDragEvents();
      console.log('WebSnap sidebar restored');
    } else {
      // 最小化
      sidebar.classList.add('minimized');
      document.body.classList.remove('websnap-sidebar-open');
      minimizeBtn.title = '恢复';
      // 添加拖动事件
      addDragEvents();
      console.log('WebSnap sidebar minimized');
    }
  }
}

// 添加拖动事件
function addDragEvents() {
  sidebar.addEventListener('mousedown', handleMouseDown);
}

// 移除拖动事件
function removeDragEvents() {
  sidebar.removeEventListener('mousedown', handleMouseDown);
  document.removeEventListener('mousemove', handleMouseMove);
  document.removeEventListener('mouseup', handleMouseUp);
}

// 鼠标按下事件
function handleMouseDown(e) {
  if (!sidebar.classList.contains('minimized')) return;
  
  isDragging = true;
  hasDragged = false;
  const rect = sidebar.getBoundingClientRect();
  dragOffset.x = e.clientX - rect.left;
  dragOffset.y = e.clientY - rect.top;
  
  // 禁用过渡效果以避免拖动延迟
  sidebar.style.transition = 'none';
  
  document.addEventListener('mousemove', handleMouseMove);
  document.addEventListener('mouseup', handleMouseUp);
  
  e.preventDefault();
}

// 鼠标移动事件
function handleMouseMove(e) {
  if (!isDragging) return;
  
  hasDragged = true;
  const x = e.clientX - dragOffset.x;
  const y = e.clientY - dragOffset.y;
  
  // 限制在视窗范围内
  const maxX = window.innerWidth - 50;
  const maxY = window.innerHeight - 50;
  
  const constrainedX = Math.max(0, Math.min(x, maxX));
  const constrainedY = Math.max(0, Math.min(y, maxY));
  
  sidebar.style.left = constrainedX + 'px';
  sidebar.style.top = constrainedY + 'px';
  sidebar.style.right = 'auto';
  
  e.preventDefault();
}

// 鼠标松开事件
function handleMouseUp(e) {
  isDragging = false;
  // 重新启用过渡效果
  sidebar.style.transition = '';
  document.removeEventListener('mousemove', handleMouseMove);
  document.removeEventListener('mouseup', handleMouseUp);
  
  // 延迟重置拖拽标志，确保点击事件能正确检测
  setTimeout(() => {
    hasDragged = false;
  }, 100);
}



// 加载历史记录列表
// 存储当前显示的历史记录，用于比较是否需要更新
let currentHistoryData = null;
// 防抖定时器，避免频繁刷新
let refreshDebounceTimer = null;

async function loadHistoryList(forceRefresh = false) {
  const historyContainer = document.getElementById('websnap-history-list');
  
  try {
    // 获取unpin列表
    const unpinResult = await chrome.storage.local.get(['unpinList']);
    const unpinList = unpinResult.unpinList || [];
    
    // 通过background script获取历史记录
    chrome.runtime.sendMessage({ action: 'getHistory' }, (response) => {
      if (response && response.success) {
        // 过滤掉已取消固定的项目
        const pinnedHistory = response.history.filter(item => !unpinList.includes(item.id));
        
        // 检查数据是否有变化，避免不必要的DOM更新
        if (!forceRefresh && currentHistoryData && 
            JSON.stringify(currentHistoryData) === JSON.stringify(pinnedHistory)) {
          console.log('历史记录数据无变化，跳过更新');
          return;
        }
        
        currentHistoryData = pinnedHistory;
        displayHistoryListSmooth(pinnedHistory);
      } else {
        historyContainer.innerHTML = '<div class="websnap-error">加载历史记录失败</div>';
      }
    });
  } catch (error) {
    console.error('加载历史记录失败:', error);
    historyContainer.innerHTML = '<div class="websnap-error">加载历史记录失败</div>';
  }
}

// 显示历史记录列表
// 平滑更新历史记录列表，避免页面闪烁
function displayHistoryListSmooth(history) {
  const historyContainer = document.getElementById('websnap-history-list');
  
  if (!history || history.length === 0) {
    // 使用淡出效果更新空状态
    updateContainerContent(historyContainer, '<div class="websnap-empty">暂无历史记录</div>');
    return;
  }
  
  const historyHTML = history.map(item => `
    <div class="websnap-history-item" data-url="${item.url}" data-id="${item.id}">
      <div class="websnap-history-content">
        <div class="websnap-history-title">${item.title || '无标题'}</div>
      </div>
      <button class="websnap-unpin-btn" data-id="${item.id}" title="取消固定">📌</button>
    </div>
  `).join('');
  
  // 使用平滑更新
  updateContainerContent(historyContainer, historyHTML, () => {
    bindHistoryEvents(historyContainer);
  });
}

// 平滑更新容器内容
function updateContainerContent(container, newHTML, callback) {
  // 添加淡出效果
  container.style.opacity = '0.7';
  container.style.transition = 'opacity 0.15s ease';
  
  // 延迟更新内容，创建平滑过渡效果
  setTimeout(() => {
    container.innerHTML = newHTML;
    
    // 执行回调（如绑定事件）
    if (callback) {
      callback();
    }
    
    // 淡入效果
    container.style.opacity = '1';
    
    // 清理过渡样式
    setTimeout(() => {
      container.style.transition = '';
    }, 150);
  }, 75);
}

// 绑定历史记录事件
function bindHistoryEvents(historyContainer) {
  // 绑定点击事件
  const historyItems = historyContainer.querySelectorAll('.websnap-history-item');
  historyItems.forEach(item => {
    const content = item.querySelector('.websnap-history-content');
    content.addEventListener('click', () => {
      // 打开对应的网页URL
      const url = item.dataset.url;
      if (url) {
        window.open(url, '_blank');
      }
    });
  });
  
  // 绑定unpin按钮事件
  const unpinBtns = historyContainer.querySelectorAll('.websnap-unpin-btn');
  unpinBtns.forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const itemId = btn.dataset.id;
      await unpinHistoryItem(itemId);
      // 强制刷新历史记录
      loadHistoryList(true);
    });
  });
}

// 保持原有的displayHistoryList函数以兼容其他调用
function displayHistoryList(history) {
  displayHistoryListSmooth(history);
}

// 取消固定历史记录项
async function unpinHistoryItem(itemId) {
  try {
    // 获取当前的unpin列表
    const result = await chrome.storage.local.get(['unpinList']);
    const unpinList = result.unpinList || [];
    
    // 添加到unpin列表（如果不存在）
    if (!unpinList.includes(itemId)) {
      unpinList.push(itemId);
      await chrome.storage.local.set({ unpinList: unpinList });
      console.log('已取消固定:', itemId);
    }
  } catch (error) {
    console.error('取消固定失败:', error);
  }
}

// 获取类型文本
function getTypeText(type) {
  switch (type) {
    case 'full': return '长截图';
    case 'area': return '区域截图';
    default: return '普通截图';
  }
}

// 格式化日期
function formatDate(timestamp) {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now - date;
  
  if (diff < 60000) { // 1分钟内
    return '刚刚';
  } else if (diff < 3600000) { // 1小时内
    return Math.floor(diff / 60000) + '分钟前';
  } else if (diff < 86400000) { // 1天内
    return Math.floor(diff / 3600000) + '小时前';
  } else {
    return date.toLocaleDateString('zh-CN', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }
}

// 监听来自popup的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Content script received message:', request);
  
  switch (request.action) {
    case 'ping':
      sendResponse({ success: true, message: 'pong' });
      break;
      
    case 'showSidebar':
      showSidebar();
      sendResponse({ success: true });
      break;
      
    case 'hideSidebar':
      hideSidebar();
      sendResponse({ success: true });
      break;
      
    case 'refreshSidebar':
      // 检查侧边栏状态并刷新数据
      checkAndRefreshSidebar();
      sendResponse({ success: true });
      break;
      
    default:
      sendResponse({ success: false, error: 'Unknown action' });
  }
  
  return true; // 保持消息通道开放
});

// 页面加载完成后检查是否需要显示侧边栏
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', checkInitialSidebarState);
} else {
  checkInitialSidebarState();
}

function checkInitialSidebarState() {
  // 直接从storage检查全局侧边栏状态
  chrome.storage.local.get(['sidebar_global_state'], (result) => {
    if (chrome.runtime.lastError) {
      console.log('无法读取侧边栏状态');
      return;
    }
    if (result.sidebar_global_state) {
      showSidebar();
    }
  });
}

// 检查侧边栏状态并刷新数据（带防抖）
function checkAndRefreshSidebar() {
  // 清除之前的防抖定时器
  if (refreshDebounceTimer) {
    clearTimeout(refreshDebounceTimer);
  }
  
  // 设置防抖延迟，避免频繁切换tab时过度刷新
  refreshDebounceTimer = setTimeout(() => {
    chrome.storage.local.get(['sidebar_global_state'], (result) => {
      if (chrome.runtime.lastError) {
        console.log('无法读取侧边栏状态');
        return;
      }
      
      if (result.sidebar_global_state) {
        // 如果全局状态是显示，确保侧边栏显示并刷新数据
        if (!sidebar || sidebar.classList.contains('hidden')) {
          showSidebar();
          console.log('标签页切换：显示侧边栏');
        } else {
          // 侧边栏已显示，平滑刷新历史记录（不强制刷新，让系统判断是否需要更新）
          loadHistoryList(false);
          console.log('标签页切换：平滑刷新侧边栏历史记录');
        }
      } else {
        // 如果全局状态是隐藏，确保侧边栏隐藏
        if (sidebar && !sidebar.classList.contains('hidden')) {
          hideSidebar();
          console.log('标签页切换：隐藏侧边栏');
        }
      }
    });
  }, 200); // 200ms防抖延迟
}

console.log('WebSnap content script setup complete');