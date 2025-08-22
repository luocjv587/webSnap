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
      <button class="websnap-close-btn" id="websnap-close-sidebar">×</button>
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
    document.body.classList.remove('websnap-sidebar-open');
    

    
    console.log('WebSnap sidebar hidden');
  }
}



// 加载历史记录列表
async function loadHistoryList() {
  const historyContainer = document.getElementById('websnap-history-list');
  
  try {
    // 通过background script获取历史记录
    chrome.runtime.sendMessage({ action: 'getHistory' }, (response) => {
      if (response && response.success) {
        displayHistoryList(response.history);
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
function displayHistoryList(history) {
  const historyContainer = document.getElementById('websnap-history-list');
  
  if (!history || history.length === 0) {
    historyContainer.innerHTML = '<div class="websnap-empty">暂无历史记录</div>';
    return;
  }
  
  const historyHTML = history.map(item => `
    <div class="websnap-history-item" data-url="${item.url}">
      <div class="websnap-history-title">${item.title || '无标题'}</div>
    </div>
  `).join('');
  
  historyContainer.innerHTML = historyHTML;
  
  // 绑定点击事件
  const historyItems = historyContainer.querySelectorAll('.websnap-history-item');
  historyItems.forEach(item => {
    item.addEventListener('click', () => {
      const url = item.dataset.url;
      if (url && url !== window.location.href) {
        window.open(url, '_blank');
      }
    });
  });
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
      // 如果侧边栏已显示，重新加载历史记录
      if (sidebar && !sidebar.classList.contains('hidden')) {
        loadHistoryList();
        console.log('侧边栏历史记录已刷新');
      }
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

console.log('WebSnap content script setup complete');